// sources.js — feed parsing + collection for the Daily Brief. RSS/Atom are parsed
// with a dependency-free regex reader (no XML lib). All fetching is delegated to
// the caller's fetch function (analyzer/fetch-url.fetchText, the SSRF-hardened
// path) — this module never opens a socket itself. Per-source failures degrade
// gracefully: a dead feed is warned and skipped, never fatal.

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'").replace(/&#x27;/gi, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
function firstTag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

// Parse an RSS 2.0 or Atom feed into [{ title, link }]. Robust to the common
// shapes; anything it can't read yields no items rather than throwing.
function parseRss(xml) {
  const out = [];
  const items = String(xml || "").match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of items) {
    const title = firstTag(it, "title");
    let link = firstTag(it, "link");
    if (!link) { const m = it.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    if (title) out.push({ title, link });
  }
  if (out.length) return out;
  const entries = String(xml || "").match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const e of entries) {
    const title = firstTag(e, "title");
    let link = "";
    const m = e.match(/<link[^>]*href=["']([^"']+)["']/i);
    if (m) link = m[1];
    if (title) out.push({ title, link });
  }
  return out;
}

// Fetch every "yesterday" feed and flatten into candidate items for clustering.
// fetchText(url) -> Promise<string>. warn(msg) is optional.
async function collectYesterday(config, fetchText, warn) {
  const out = [];
  for (const feed of (config && config.yesterday) || []) {
    try {
      const xml = await fetchText(feed.rss);
      const items = parseRss(xml).slice(0, feed.max || 12);
      for (const it of items) if (it.title) out.push({ source: feed.name, title: it.title, url: it.link || null });
    } catch (e) { if (warn) warn(`feed "${feed.name}" skipped: ${e.message}`); }
  }
  return out;
}

module.exports = { parseRss, collectYesterday, decode };
