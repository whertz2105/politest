// axes.js — SINGLE SOURCE OF TRUTH for DecaCompass.
// Everything (scoring, charts, 3D dropdowns, matcher, data page, figures graph)
// derives axis keys, order, labels and pole meanings from here. Pure data — no
// logic depends on the *number* of axes, so growing the bank is a data edit only.

// The whole app is renamed by changing this one constant.
export const APP_NAME = "DecaCompass";
export const APP_TAGLINE = "A 22-axis political compass.";

// Display hints only; scoring never assumes a fixed count.
export const FULL_TEST_SIZE = 250;
export const QUICK_TEST_SIZE = 100;

// 22 axes. `key` is the stable identifier used everywhere (JSON weights, URL
// encoding order, storage). A POSITIVE score always leans toward `posLabel`, a
// NEGATIVE score toward `negLabel`. The ORDER fixes the byte order of the
// shareable-results encoder — never reorder without bumping ENCODE_VERSION.
//
// v2 splits four previously-fused axes into eight finer ones:
//   auth  -> auth_pat (private conduct) + auth_pw (state power)
//   dem   -> dem_fr (who may vote)      + dem_tc (who decides)
//   trust -> trust_pol (political class) + trust_sys (administrative machinery)
//   meth  -> meth_scope (what changes)  + meth_means (how it may change)
export const AXES = [
  { key: "mkt",         label: "Economy",        posLabel: "Free market",             negLabel: "State-directed",           description: "Whether the economy should be organised by markets or directed by the state." },
  { key: "wel",         label: "Welfare",        posLabel: "Minimal safety net",      negLabel: "Expansive welfare",        description: "How large and generous the social safety net should be." },
  { key: "trd",         label: "Trade",          posLabel: "Protectionist",           negLabel: "Free trade",               description: "Whether trade should be shielded by barriers or opened across borders." },
  { key: "soc",         label: "Culture",        posLabel: "Traditional",             negLabel: "Progressive",              description: "Whether social norms should preserve tradition or advance progressive change." },
  { key: "rel",         label: "Religion",       posLabel: "Religious public life",   negLabel: "Secular",                  description: "The role of religion in public life and governance." },
  { key: "auth_pat",    label: "Paternalism",    posLabel: "Paternalist",             negLabel: "Personal autonomy",        description: "Private conduct — mandates, seatbelt-style law: whether the state may direct personal behaviour or must defer to the individual." },
  { key: "auth_pw",     label: "State power",    posLabel: "Strong state power",      negLabel: "Limited state power",      description: "Emergency powers, executive reach, bans and compelled compliance." },
  { key: "sec",         label: "Security",       posLabel: "Surveillance/security",   negLabel: "Privacy",                  description: "The trade-off between collective security and individual privacy." },
  { key: "spe",         label: "Speech",         posLabel: "Regulated speech",        negLabel: "Speech-absolutist",        description: "Whether speech may be restricted for other goods or protected near-absolutely." },
  { key: "jus",         label: "Justice",        posLabel: "Punitive",                negLabel: "Rehabilitative",           description: "Whether criminal justice should punish or rehabilitate." },
  { key: "dem_fr",      label: "Franchise",      posLabel: "Restricted franchise",    negLabel: "Universal franchise",      description: "Who may vote." },
  { key: "dem_tc",      label: "Who decides",    posLabel: "Technocratic delegation", negLabel: "Popular decision",         description: "Whether experts should be delegated decisions or the public should decide." },
  { key: "trust_pol",   label: "Political trust", posLabel: "Trusts political class & media", negLabel: "Distrusts political class & media", description: "Trust in politicians and the press." },
  { key: "trust_sys",   label: "System trust",   posLabel: "Trusts administration & elections", negLabel: "Distrusts administration & elections", description: "Trust in the administrative machinery, elections and official statistics." },
  { key: "meth_scope",  label: "Change scope",   posLabel: "Sweeping change",         negLabel: "Status-quo preserving",    description: "How much should change." },
  { key: "meth_means",  label: "Means",          posLabel: "Extraordinary means",     negLabel: "Lawful process only",      description: "Whether extraordinary means are acceptable or change must go through lawful process." },
  { key: "fed",         label: "Federalism",     posLabel: "Federal centralization",  negLabel: "State/local",              description: "Whether power should centralise federally or devolve to state and local levels." },
  { key: "natl",        label: "Nation",         posLabel: "Nationalist",             negLabel: "Globalist",                description: "Whether national identity/sovereignty or global integration takes priority." },
  { key: "imm",         label: "Immigration",    posLabel: "Restrictionist",          negLabel: "Open immigration",         description: "Whether immigration should be restricted or opened." },
  { key: "fp",          label: "Foreign policy", posLabel: "Interventionist",         negLabel: "Restraint",                description: "Whether foreign policy should intervene abroad or exercise restraint." },
  { key: "tech",        label: "Technology",     posLabel: "Techno-optimist",         negLabel: "Precautionary",            description: "Whether new technology should be embraced or approached with precaution." },
  { key: "env",         label: "Environment",    posLabel: "Growth priority",         negLabel: "Environmental priority",   description: "Whether economic growth or environmental protection takes priority." },
];

// Fixed key order — canonical iteration/encoding order.
export const AXIS_KEYS = AXES.map((a) => a.key);

// Legacy (v1) fused keys → their primary v2 split axis. Used to migrate an old
// questions.json, old archetype specs, and old stored crowd vectors. The SIBLING
// split axis (auth_pat, dem_tc, trust_sys, meth_means) is left unpopulated for v1
// data — it renders as "awaiting items" until a v2 bank fills it.
export const LEGACY_AXIS_MAP = { auth: "auth_pw", dem: "dem_fr", trust: "trust_pol", meth: "meth_scope" };
export const LEGACY_KEYS = Object.keys(LEGACY_AXIS_MAP);

export function legacyToNew(key) {
  return LEGACY_AXIS_MAP[key] || key;
}
export function isLegacyKey(key) {
  return Object.prototype.hasOwnProperty.call(LEGACY_AXIS_MAP, key);
}

const _byKey = new Map(AXES.map((a) => [a.key, a]));

export function axisByKey(key) { return _byKey.get(key); }
export function isAxisKey(key) { return _byKey.has(key); }
export function axisLabel(key) {
  const a = _byKey.get(key);
  return a ? a.label : key;
}
