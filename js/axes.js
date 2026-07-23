// axes.js — SINGLE SOURCE OF TRUTH for DecaCompass.
// Everything (scoring, charts, archetypes, data page, audit tool) derives axis
// keys, order, labels and pole meanings from here. Do not duplicate this list.

// The whole app is renamed by changing this one constant.
export const APP_NAME = "DecaCompass";
export const APP_TAGLINE = "An 18-axis political compass.";

// Total questions in the full test (used for the "N / TOTAL" progress readout).
// This is a display hint only; scoring never assumes a fixed count.
export const FULL_TEST_SIZE = 250;
export const QUICK_TEST_SIZE = 100;

// 18 axes. `key` is the stable identifier used everywhere (JSON weights,
// URL encoding order, storage). `pos`/`neg` describe the two poles; a POSITIVE
// axis score always leans toward `posLabel`, a NEGATIVE score toward `negLabel`.
// The ORDER of this array is significant: it fixes the byte order used by the
// shareable-results URL encoder. Never reorder without bumping the encode version.
export const AXES = [
  { key: "mkt",   label: "Economy",        posLabel: "Free market",           negLabel: "State-directed",       description: "Whether the economy should be organised by markets or directed by the state." },
  { key: "wel",   label: "Welfare",        posLabel: "Minimal safety net",    negLabel: "Expansive welfare",    description: "How large and generous the social safety net should be." },
  { key: "trd",   label: "Trade",          posLabel: "Protectionist",         negLabel: "Free trade",           description: "Whether trade should be shielded by barriers or opened across borders." },
  { key: "soc",   label: "Culture",        posLabel: "Traditional",           negLabel: "Progressive",          description: "Whether social norms should preserve tradition or advance progressive change." },
  { key: "rel",   label: "Religion",       posLabel: "Religious public life", negLabel: "Secular",              description: "The role of religion in public life and governance." },
  { key: "auth",  label: "Authority",      posLabel: "State authority",       negLabel: "Individual liberty",   description: "Whether the state may compel behaviour or must defer to individual liberty." },
  { key: "sec",   label: "Security",       posLabel: "Surveillance/security", negLabel: "Privacy",              description: "The trade-off between collective security and individual privacy." },
  { key: "spe",   label: "Speech",         posLabel: "Regulated speech",      negLabel: "Speech-absolutist",    description: "Whether speech may be restricted for other goods or protected near-absolutely." },
  { key: "jus",   label: "Justice",        posLabel: "Punitive",              negLabel: "Rehabilitative",       description: "Whether criminal justice should punish or rehabilitate." },
  { key: "dem",   label: "Governance",     posLabel: "Restricted governance", negLabel: "Popular sovereignty",  description: "Whether governance should be restricted/guarded or driven by popular majorities." },
  { key: "trust", label: "Trust",          posLabel: "Institutional trust",   negLabel: "Institutional distrust", description: "How much trust is placed in established institutions." },
  { key: "meth",  label: "Method",         posLabel: "Radical change",        negLabel: "Incrementalist",       description: "Whether change should be radical/rapid or gradual/incremental." },
  { key: "fed",   label: "Federalism",     posLabel: "Federal centralization", negLabel: "State/local",         description: "Whether power should centralise federally or devolve to state and local levels." },
  { key: "natl",  label: "Nation",         posLabel: "Nationalist",           negLabel: "Globalist",            description: "Whether national identity/sovereignty or global integration takes priority." },
  { key: "imm",   label: "Immigration",    posLabel: "Restrictionist",        negLabel: "Open immigration",     description: "Whether immigration should be restricted or opened." },
  { key: "fp",    label: "Foreign policy", posLabel: "Interventionist",       negLabel: "Restraint",            description: "Whether foreign policy should intervene abroad or exercise restraint." },
  { key: "tech",  label: "Technology",     posLabel: "Techno-optimist",       negLabel: "Precautionary",        description: "Whether new technology should be embraced or approached with precaution." },
  { key: "env",   label: "Environment",    posLabel: "Growth priority",       negLabel: "Environmental priority", description: "Whether economic growth or environmental protection takes priority." },
];

// Fixed key order — the canonical iteration/encoding order. Length 18.
export const AXIS_KEYS = AXES.map((a) => a.key);

const _byKey = new Map(AXES.map((a) => [a.key, a]));

export function axisByKey(key) {
  return _byKey.get(key);
}

export function isAxisKey(key) {
  return _byKey.has(key);
}

// Human label for a key, falling back to the raw key.
export function axisLabel(key) {
  const a = _byKey.get(key);
  return a ? a.label : key;
}
