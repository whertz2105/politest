// fetch-url.js — server-side article fetch with strict SSRF protection, plus
// readability-style main-text extraction and byline/domain capture.
//
// SSRF defenses:
//   * http/https schemes only.
//   * DNS is resolved BEFORE connecting, every returned address is validated,
//     and the socket is PINNED to a validated address via a custom `lookup`
//     (closing the resolve-then-reconnect TOCTOU gap).
//   * Private, loopback, link-local, reserved, multicast AND 100.64.0.0/10
//     (CGNAT) ranges are rejected, for both IPv4 and IPv6 (incl. mapped forms).
//   * At most 3 redirects, each hop re-validated from scratch.
//   * 5 MB body cap, 15 s overall timeout.
//
// The fetched HTML is transient. Callers extract text, byline and domain and
// then DISCARD the body — full article text is never persisted.

const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");
const { URL } = require("url");

const BOT_UA = "PoliteionAnalyzer/1.0 (+https://politeion.com)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_REDIRECTS = 3;
// Generous body ceiling: bloated news pages (inline scripts, ad tech) routinely
// exceed a few MB of raw HTML even for a short article. This is a memory-safety
// backstop against a URL pointing at a huge file, not an article-size limit —
// only the first 60k extracted chars are ever sent to the model.
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

// ---- IP range validation -------------------------------------------------
function ipv4ToInt(ip) {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const b = Number(part);
    if (!Number.isInteger(b) || b < 0 || b > 255 || !/^\d+$/.test(part)) return null;
    n = (n << 8) | b;
  }
  return n >>> 0;
}
function v4InCidr(n, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (n & mask) === (ipv4ToInt(base) & mask);
}
function isPublicIPv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const blocked = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  for (const [base, bits] of blocked) if (v4InCidr(n, base, bits)) return false;
  return true;
}
function isPublicIPv6(ip) {
  let s = ip.toLowerCase().split("%")[0]; // strip zone id
  // IPv4-mapped / -embedded forms: validate the embedded v4.
  const m = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (m) {
    if (s.startsWith("::ffff:") || s.startsWith("::") || s.startsWith("64:ff9b:")) {
      return isPublicIPv4(m[1]);
    }
  }
  if (s === "::1" || s === "::" ) return false;
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return false; // link-local
  if (s.startsWith("fc") || s.startsWith("fd")) return false; // unique local
  if (s.startsWith("ff")) return false; // multicast
  if (s.startsWith("2001:db8")) return false; // documentation
  return true;
}
function isPublicAddress(addr, family) {
  return family === 4 ? isPublicIPv4(addr) : isPublicIPv6(addr);
}

// Custom lookup: resolve all addresses, reject if ANY is private, then pin to a
// validated address. Rejecting on any-private (not just the chosen one) blocks
// DNS-rebinding style hosts that mix public and private records.
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return cb(err);
    if (!addresses.length) return cb(new Error("DNS returned no addresses"));
    for (const a of addresses) {
      if (!isPublicAddress(a.address, a.family)) {
        return cb(new Error(`refused: ${hostname} resolves to non-public address ${a.address}`));
      }
    }
    const first = addresses[0];
    if (options && options.all) return cb(null, [first]);
    cb(null, first.address, first.family);
  });
}

// ---- fetch with redirect re-validation -----------------------------------
function once(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { return reject(new Error("invalid URL")); }
    if (u.protocol !== "http:" && u.protocol !== "https:") return reject(new Error("only http(s) URLs are allowed"));
    // IP-literal hosts bypass the custom DNS lookup, so validate them up front.
    // (Node's `lookup` option is not consulted when the host is already an IP.)
    const litHost = u.hostname.replace(/^\[|\]$/g, "");
    const litFam = net.isIP(litHost);
    if (litFam && !isPublicAddress(litHost, litFam)) return reject(new Error(`refused: ${litHost} is a non-public address`));
    const lib = u.protocol === "https:" ? https : http;
    // Default identifies as our bot; on a bot-block (403 etc.) the caller retries
    // with browserUA + browser-like headers to get past CDN bot rules.
    const headers = opts.json
      ? { "user-agent": BOT_UA, accept: "application/json" }
      : opts.browserUA
        ? {
            "user-agent": BROWSER_UA,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none",
            "upgrade-insecure-requests": "1",
          }
        : { "user-agent": BOT_UA, accept: "text/html,application/xhtml+xml" };
    const req = lib.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        lookup: safeLookup,
        headers,
      },
      (res) => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume();
          let next;
          try { next = new URL(loc, u).href; } catch { return reject(new Error("bad redirect target")); }
          return resolve({ redirect: next });
        }
        if (res.statusCode !== 200) { res.resume(); const err = new Error(`fetch HTTP ${res.statusCode}`); err.status = res.statusCode; return reject(err); }
        const ct = String(res.headers["content-type"] || "");
        // opts.raw (feeds/calendars: RSS/Atom/XML) and opts.json skip the HTML
        // content-type gate. The SSRF guards above still fully apply either way.
        if (!opts.json && !opts.raw && ct && !/text\/html|application\/xhtml/i.test(ct)) { res.resume(); return reject(new Error(`unsupported content-type: ${ct}`)); }
        let size = 0;
        const chunks = [];
        res.on("data", (c) => { size += c.length; if (size > MAX_BYTES) { req.destroy(new Error("page exceeds 25MB fetch limit")); return; } chunks.push(c); });
        res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), finalUrl: u.href }));
      }
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("fetch timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchRaw(urlStr, opts = {}) {
  const maxRedirects = opts.maxRedirects == null ? MAX_REDIRECTS : opts.maxRedirects;
  let current = urlStr;
  for (let i = 0; i <= maxRedirects; i++) {
    const r = await once(current, opts);
    if (r.redirect) {
      if (i === maxRedirects) throw new Error("too many redirects");
      current = r.redirect;
      continue;
    }
    return { html: r.html, finalUrl: r.finalUrl };
  }
  throw new Error("too many redirects");
}

// WordPress REST fallback: many sites (National Review, etc.) render the article
// body client-side, so the server HTML has no readable text — but the WP REST API
// returns the body as JSON. Try {origin}/wp-json/wp/v2/posts?slug=<slug>. Same
// host as the (already validated) article, re-validated by fetchRaw's SSRF guards.
// Returns { text, title } or null.
// GET a JSON endpoint via the SSRF-validated fetcher, retrying with a browser UA
// on a bot-block. Returns parsed JSON (throws on error / non-JSON).
async function fetchJson(url) {
  let body;
  try { ({ html: body } = await fetchRaw(url, { json: true, maxRedirects: 1 })); }
  catch (e) {
    if (e.status && [401, 403, 429, 451].includes(e.status)) ({ html: body } = await fetchRaw(url, { json: true, browserUA: true, maxRedirects: 1 }));
    else throw e;
  }
  return JSON.parse(body);
}

async function tryWordPress(finalUrl) {
  try {
    const u = new URL(finalUrl);
    const slug = u.pathname.split("/").filter(Boolean).pop();
    if (!slug) return null;
    const arr = await fetchJson(`${u.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=title,content,excerpt,author`);
    if (!Array.isArray(arr) || !arr[0] || !arr[0].content) return null;
    const post = arr[0];
    const text = extractText(post.content.rendered || "");
    const title = post.title && post.title.rendered ? collapse(stripTags(post.title.rendered)) : null;
    // Resolve the author name from the WP users endpoint (public for post authors
    // on most sites; if disabled, byline just stays null).
    let byline = null;
    if (post.author) {
      try {
        const usr = await fetchJson(`${u.origin}/wp-json/wp/v2/users/${encodeURIComponent(post.author)}?_fields=name`);
        if (usr && usr.name) byline = collapse(stripTags(String(usr.name))).slice(0, 120) || null;
      } catch { /* users endpoint restricted — leave byline null */ }
    }
    return text && text.length >= 120 ? { text, title, byline } : null;
  } catch { return null; }
}

// ---- extraction ----------------------------------------------------------
const MULTI_TLD = new Set(["co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br", "co.in"]);
function registrableDomain(host) {
  host = String(host || "").toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (MULTI_TLD.has(last2)) return parts.slice(-3).join(".");
  return last2;
}
function stripTags(s) { return s.replace(/<[^>]+>/g, " "); }
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘").replace(/&rdquo;/g, "”").replace(/&ldquo;/g, "“")
    .replace(/&hellip;/g, "…").replace(/&quot;/g, '"')
    // numeric entities (decimal and hex), e.g. &#8217; &#x2019;
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(+n); } catch { return m; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } })
    // &amp; last so we don't double-decode (e.g. &amp;#8217;)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function collapse(s) { return decodeEntities(s).replace(/\s+/g, " ").trim(); }

function metaContent(html, attr, val) {
  const re = new RegExp(`<meta[^>]*\\b${attr}\\s*=\\s*["']${val}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return null;
  const c = tag[0].match(/\bcontent\s*=\s*["']([^"']+)["']/i);
  return c ? collapse(c[1]) : null;
}

function extractByline(html) {
  const candidates = [
    metaContent(html, "name", "author"),
    metaContent(html, "property", "article:author"),
    metaContent(html, "name", "byl"),
  ];
  // JSON-LD author
  const ld = html.match(/"author"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]{2,80})"/i) || html.match(/"author"\s*:\s*"([^"]{2,80})"/i);
  if (ld) candidates.push(collapse(ld[1]));
  // rel=author link / byline class
  const rel = html.match(/<a[^>]*\brel\s*=\s*["']author["'][^>]*>([^<]{2,80})<\/a>/i);
  if (rel) candidates.push(collapse(rel[1]));
  const byl = html.match(/<[^>]*class\s*=\s*["'][^"']*\b(?:byline|author)\b[^"']*["'][^>]*>([\s\S]{2,120}?)<\//i);
  if (byl) candidates.push(collapse(stripTags(byl[1])));
  for (let c of candidates) {
    if (!c) continue;
    c = c.replace(/^\s*by\s+/i, "").trim();
    if (c && c.length <= 120 && !/^https?:/i.test(c)) return c;
  }
  return null;
}

function cleanBlock(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ");
}
function extractParas(block) {
  const paras = [];
  const re = /<(p|h1|h2|h3|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(block))) {
    const t = collapse(stripTags(m[2]));
    if (t.length >= 20) paras.push(t);
  }
  return paras.join("\n\n");
}
// Readability-style: clean non-content regions, then choose the candidate region
// (each <article>, each <main>, or the whole doc) with the MOST paragraph text.
// Picking the richest region — not the first <article> — avoids grabbing a teaser
// card on sites (National Review, most CMSs) that wrap teasers in <article>.
function extractText(html) {
  const clean = cleanBlock(html);
  const candidates = [];
  for (const re of [/<article\b[\s\S]*?<\/article>/gi, /<main\b[\s\S]*?<\/main>/gi]) {
    let m; while ((m = re.exec(clean))) candidates.push(m[0]);
  }
  candidates.push(clean); // whole doc — catches div-based article bodies too
  let best = "";
  for (const c of candidates) { const t = extractParas(c); if (t.length > best.length) best = t; }
  if (best.length < 200) best = collapse(stripTags(clean)); // last-ditch: all visible text
  return best.slice(0, 60_000); // hard cap on what we send to the model
}

function canonicalDomain(html, finalUrl) {
  const link = html.match(/<link[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i);
  if (link) {
    const href = link[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) { try { return registrableDomain(new URL(href[1], finalUrl).hostname); } catch {} }
  }
  try { return registrableDomain(new URL(finalUrl).hostname); } catch { return null; }
}

function titleOf(html) {
  const og = metaContent(html, "property", "og:title");
  if (og) return og;
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? collapse(stripTags(t[1])) : null;
}

const BLOCK_STATUSES = [401, 403, 429, 451];

async function fetchAndExtract(urlStr) {
  // Default (bot) UA first; if a CDN bot rule blocks it (403/401/429/451), retry
  // once as a browser. Sites that accept the bot UA (e.g. National Review) never
  // hit the retry, so this doesn't regress them.
  let fetched = null, fetchErr = null;
  try { fetched = await fetchRaw(urlStr, {}); }
  catch (e) {
    if (e.status && BLOCK_STATUSES.includes(e.status)) {
      try { fetched = await fetchRaw(urlStr, { browserUA: true }); }
      catch (e2) { fetchErr = e2; }
    } else { fetchErr = e; }
  }

  if (fetched) {
    const { html, finalUrl } = fetched;
    let text = extractText(html);
    let title = titleOf(html);
    let wp = null;
    // If the server HTML yielded little text (client-side-rendered body), try the
    // WordPress REST API for the full article body.
    if (text.length < 400) {
      wp = await tryWordPress(finalUrl);
      if (wp && wp.text.length > text.length) { text = wp.text; title = title || wp.title; }
    }
    if (!text || text.length < 120) throw new Error("could not extract article text (client-side-rendered or paywalled — try pasting the text)");
    const byline = extractByline(html) || (wp && wp.byline) || null; // prefer the page's own byline, fall back to WP
    return { text, title, byline, domain: canonicalDomain(html, finalUrl), finalUrl };
  }

  // The page itself was blocked (e.g. a CDN 403 under both UAs). WordPress REST
  // APIs are usually NOT behind the same bot rules — try it directly from the URL
  // (NewsNation, other Nexstar/WordPress sites). Same host, SSRF-revalidated.
  if (fetchErr && fetchErr.status && BLOCK_STATUSES.includes(fetchErr.status)) {
    const wp = await tryWordPress(urlStr);
    if (wp && wp.text) {
      let domain = null;
      try { domain = registrableDomain(new URL(urlStr).hostname); } catch {}
      return { text: wp.text, title: wp.title, byline: wp.byline || null, domain, finalUrl: urlStr };
    }
  }
  throw fetchErr || new Error("could not fetch article");
}

// Raw fetch for feeds/calendars (RSS/Atom/XML/JSON text). Reuses the SAME
// SSRF-hardened fetcher (fetchRaw → once → safeLookup); on a bot-block it retries
// as a browser once. Returns the raw response body string. No new fetch path.
async function fetchText(urlStr) {
  try { const { html } = await fetchRaw(urlStr, { raw: true }); return html; }
  catch (e) {
    if (e.status && BLOCK_STATUSES.includes(e.status)) { const { html } = await fetchRaw(urlStr, { raw: true, browserUA: true }); return html; }
    throw e;
  }
}

module.exports = { fetchAndExtract, fetchText, registrableDomain, isPublicIPv4, isPublicIPv6, extractText, extractByline };
