// provider.js — inference provider adapter. Reads configuration from the
// environment (injected by systemd EnvironmentFile /etc/politeion/analyzer.env);
// NOTHING is hardcoded — the model string in particular always comes from env.
//
//   PROVIDER          anthropic | openai_compatible   (default: anthropic)
//   MODEL             e.g. claude-haiku-4-5            (required)
//   ANTHROPIC_API_KEY the provisioned key              (never logged, never returned)
//   API_KEY           generic key for openai_compatible
//   BASE_URL          override the API host            (optional)
//
// Inference is Anthropic API only. No model runs on the droplet; no personal
// hardware is contacted. The Anthropic path uses prompt caching: the system
// block (the full rubric) carries cache_control:{type:"ephemeral"} and is
// byte-identical on every request, so repeat requests bill the ~10% cache-read
// rate on the large system prefix.

const https = require("https");
const { URL } = require("url");

const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 2000;
const TEMPERATURE = 0;

function config() {
  const provider = (process.env.PROVIDER || "anthropic").trim().toLowerCase();
  const model = (process.env.MODEL || "").trim();
  return {
    provider,
    model,
    baseUrl: (process.env.BASE_URL || "").trim(),
    anthropicKey: process.env.ANTHROPIC_API_KEY || process.env.API_KEY || "",
    genericKey: process.env.API_KEY || process.env.OPENAI_API_KEY || "",
  };
}

// Human-readable readiness check without exposing the key.
function status() {
  const c = config();
  const hasKey = c.provider === "anthropic" ? !!c.anthropicKey : !!c.genericKey;
  return { provider: c.provider, model: c.model || null, hasKey, configured: !!c.model && hasKey };
}

function postJson(urlStr, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = Buffer.from(JSON.stringify(bodyObj), "utf8");
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: { ...headers, "content-length": payload.length },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { data += c; if (data.length > 4 * 1024 * 1024) req.destroy(new Error("response too large")); });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error("model request timed out")));
    req.on("error", reject);
    req.end(payload);
  });
}

// Call the model with a cached system prompt and a single user message.
// Returns { text, usage:{input,output,cacheRead,cacheCreation}, stopReason, model }.
async function callModel({ system, user }) {
  const c = config();
  if (!c.model) throw new Error("MODEL not configured");

  if (c.provider === "anthropic") {
    if (!c.anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");
    const url = (c.baseUrl || "https://api.anthropic.com") + "/v1/messages";
    const headers = {
      "content-type": "application/json",
      "x-api-key": c.anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
    // Newer models (Opus 4.7/4.8, Sonnet 5, Fable/Mythos) reject sampling params
    // like `temperature` with a 400; older ones (Haiku 4.5, Sonnet 4.6, Opus 4.6
    // and earlier) accept them and benefit from temperature:0 for stable scoring.
    const rejectsSampling = /(opus-4-[78]|sonnet-5|fable|mythos)/i.test(c.model);
    // This is a structured JSON-extraction task, so disable extended thinking:
    // on models where thinking is on by default (Sonnet 5, Opus 4.x) the thinking
    // tokens count against max_tokens and truncate the JSON on longer articles
    // (the "invalid JSON after a repair attempt" error). Fable/Mythos always think
    // and reject {type:"disabled"} — omit it there.
    const canDisableThinking = !/(fable|mythos)/i.test(c.model);
    const build = ({ temp, noThink } = {}) => {
      const b = {
        model: c.model,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      };
      if (temp) b.temperature = TEMPERATURE;
      if (noThink) b.thinking = { type: "disabled" };
      return b;
    };
    let { status: code, body } = await postJson(url, headers, build({ temp: !rejectsSampling, noThink: canDisableThinking }));
    // Self-heal: if the model rejects a sampling/thinking param, retry with a bare body.
    if (code === 400 && /temperature|thinking/i.test(body)) {
      ({ status: code, body } = await postJson(url, headers, build({})));
    }
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new Error(`model HTTP ${code}: non-JSON response`); }
    if (code !== 200 || parsed.type === "error") {
      const msg = parsed && parsed.error ? `${parsed.error.type}: ${parsed.error.message}` : `HTTP ${code}`;
      throw new Error(`model error ${msg}`);
    }
    const text = Array.isArray(parsed.content)
      ? parsed.content.filter((b) => b.type === "text").map((b) => b.text).join("")
      : "";
    const u = parsed.usage || {};
    return {
      text,
      usage: {
        input: u.input_tokens || 0,
        output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        cacheCreation: u.cache_creation_input_tokens || 0,
      },
      stopReason: parsed.stop_reason || null,
      model: parsed.model || c.model,
    };
  }

  if (c.provider === "openai_compatible") {
    // Adapter shell for a future OpenAI-compatible endpoint. The Anthropic path
    // is the one implemented and used now; wire this up (chat/completions,
    // Authorization: Bearer, prompt_tokens/completion_tokens usage) if/when a
    // second provider is provisioned. It is intentionally inert until then.
    throw new Error("PROVIDER=openai_compatible is not implemented; set PROVIDER=anthropic");
  }

  throw new Error(`unknown PROVIDER '${c.provider}'`);
}

module.exports = { callModel, status, config, MAX_TOKENS, TEMPERATURE };
