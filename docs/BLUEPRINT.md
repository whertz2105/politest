# Politeion — Complete Reconstruction Blueprint

This document specifies **every aspect** of the Politeion website as it exists now,
in enough detail to rebuild an identical system from an empty directory. It is
descriptive of the current code, not aspirational. Where a value or formula matters
it is written out exactly. The one thing deliberately withheld is the *contents* of
the Analyzer's proprietary scoring prompt (`data/analyzer_system_prompt.md`); its
role, interface, and output contract are fully specified so the rest reproduces.

Companion docs: `docs/HANDOFF.md` (onboarding + gotchas), `deploy/RUNBOOK.md` (ops).

---

## 0. What Politeion is

Two products in one codebase, sharing one 22-axis political model:

1. **The compass self-test.** A user answers a bank of statements; the app scores
   them on 22 independent political axes (−100..+100 each), matches them to
   ideological archetypes and historical figures, draws 2D/3D charts, and compares
   them anonymously against everyone else who took it. Repeated, sharper runs refine
   a signed-in user's position via inverse-variance meta-analysis (the "shrinking
   dot", §5.8 / §14.3).
2. **The Analyzer.** Paste a URL or article text; a language model scores the
   *stance of the article* (its framing, not its subject) on the same 22 axes with a
   verbatim quote behind every score, plus a traditional left↔right placement, and
   aggregates results per writer and per source into a "most biased" leaderboard and
   monthly **drift** charts (§14.9).
3. **The Daily Brief.** One neutral page per day — yesterday's news clustered from
   wire sources + today's expected events — where every item is machine-certified for
   *no detectable stance* by the Analyzer before it can be published, with the
   receipts on the page (§16.9 / §14.13).

Plus **accounts** (email+password) that save test results and unlock an admin role
for the Analyzer's operator tools and the Daily Brief review/publish surface.

**Live at** `https://politeion.com`.

---

## 1. Hard technology constraints

These are non-negotiable architectural rules; the whole system is built to honor them.

- **No build step.** Plain HTML + vanilla JavaScript **ES modules**. No bundler, no
  transpiler, no JSX, no TypeScript. Files are served as-authored.
- **No npm dependencies anywhere.** The backend uses only the Node standard library
  (`http`, `https`, `fs`, `path`, `crypto`, `dns`, `net`, `url`, `node:sqlite`). The
  frontend loads exactly **one** external asset: Three.js r128 from cdnjs, and only
  on the 3D page.
- **Files kept under ~500 lines**; split when they grow.
- **No secrets in the repo.** No keys, `.env`, or DB files are committed. `store/`
  and env files are gitignored.
- **Single sources of truth.** The 22 axes live in exactly one file (`js/axes.js`);
  the left↔right composite in exactly one file (`js/leftright.js`), shared by front
  and back end. Nothing hardcodes the axis count.
- **Article bodies are never persisted** by the Analyzer. Only scores, metadata, and
  ≤25-word evidence quotes are stored.
- **The scoring prompt is proprietary** and is never served to any client.

Runtime: **Node 22.5+** is required for the accounts feature (needs `node:sqlite`);
on older Node the app still runs with accounts auto-disabled. A static web server
(Caddy in production) serves the HTML/CSS/JS from disk; a loopback Node process on
`127.0.0.1:3200` serves every `/api/*` route.

---

## 2. Repository layout

```
index.html            Landing: pick answer style + length, start/resume/top-up
test.html             The test runner (classic 5-button or precision slider)
results.html          Full results: 22 bars, archetypes, figures, crowd, charts
explore3d.html        Three.js cube explorer (3 axes at a time)
data.html             Data & methodology — sub-tabs: Analyzer | Test
questions.html        The full question bank (categories only; no weights)
analyze.html          Analyzer input + live stats + "most biased" leaderboard
article.html          One article analysis (by id)
profile.html          Writer or source aggregate profile
login.html            Sign in / create account
account.html          Account details + saved results + admin note

server.js             stdlib HTTP server: static fallback + /api dispatch

brief.html            Daily Brief (public): one neutral, self-certified page per day

js/                   Frontend ES modules (also imported by tools/audit.js)
  axes.js             SINGLE SOURCE OF TRUTH: 22 axes, labels, poles, app name
  leftright.js        SINGLE SOURCE OF TRUTH: US left↔right composite
  scoring.js          Validation, scoring, mode selection, attention, consistency,
                      bootstrap bands, bank signature, item fingerprints, top-up
  precision.js        Precision composite ("shrinking dot"): inverse-variance
                      meta-analysis across saved runs + drift guard (re-exported
                      by scoring.js)
  app.js              Shared shell/nav/theme, question loader, seeded shuffle,
                      progress persistence, shareable-vector codec, helpers
  archetypes.js       Salience-weighted RMS archetype matcher
  archetypes-data.js  Installed archetype vectors (mirror of data/archetypes.json)
  figures.js          Historical-figure validation + nearest matching
  charts2d.js         Inline-SVG bar readout, quadrant charts, number line,
                      tooltips, fullscreen modal, SVG→PNG export
  charts3d.js         Three.js cube explorer + vendored orbit controller
  analyzer-ui.js      Renders article/profile views + left↔right bars

analyzer/             Analyzer backend (CommonJS)
  routes.js           HTTP surface (/api/analyze, /api/analysis/:id, trends, etc.)
  analyze.js          Serial worker queue, rate limit, dedupe, pipeline
  provider.js         Anthropic Messages API over raw https; prompt caching
  fetch-url.js        SSRF-hardened fetch + readability extraction + byline;
                      exports fetchText (raw feed/calendar fetch, same guards)
  validate.js         Evidence-substring check, axis-count/±100 caps, injection
  store.js            JSONL analyses store + writer/source aggregation + ranking
                      + timeSeries (monthly drift buckets)
  budget.js           Token/usage logging, monthly spend + hard cap, per-kind split
  rubric.js           Loads the private prompt, content hash, RUBRIC_VERSION

brief/                Daily Brief backend (CommonJS)
  draft.js            Drafting pipeline: fetch → cluster → draft → self-certify →
                      assemble Today → save as a DRAFT (never auto-publishes)
  cluster.js          Title-token clustering (a story needs ≥2 outlets); no model
  sources.js          Dependency-free RSS/Atom parsing + feed collection
  certify.js          The self-certification loop (injectable, unit-testable)
  store.js            briefs.jsonl store + item-schema validation + RSS 2.0 feed
  routes.js           /api/brief/* (public + admin) and /feed.xml

auth/                 Accounts backend (CommonJS)
  db.js               node:sqlite schema (users, sessions, subscriptions,
                      api_keys, test_results); lazy require
  users.js            scrypt hashing, register/login, sessions, admin seed, results
  routes.js           /api/auth/* + currentUser(req) / isAdminSession(req)

tools/
  audit.js            DEPLOY GATE: per-axis health + unit tests + calibration
  calibrate.js        Reference-outlet mkt-ordering assertion (no live calls)
  set-role.js         Promote/demote an account (CLI, direct on the DB)
  centroids.js        Reporting: mean vector per self-chosen crowd label
  itemstats.js        Reporting: per-item psychometrics from crowd answers
  brief-draft.js      CLI/timer entry point: draft one Daily Brief (never publishes)

data/
  analyzer_system_prompt.md   PROPRIETARY scoring prompt (never served)
  rubric_summary.md           Public methodology summary (served at /api/rubric)
  brief_system_prompt.md      Daily Brief drafting prompt (BRIEF_VERSION v1)
  brief_sources.json          Public feed/calendar config for the Daily Brief
  questions.json              Question bank (403 items = 400 numbered + 3 checks)
  archetypes.json             28 ideological archetypes (22-axis vector + salience)
  figures.json                24 historical figures (22-axis vectors)

css/style.css         The entire design system + every component's styles

deploy/
  politest.service            systemd unit (API)
  politest-brief.service       systemd oneshot (draft the Daily Brief)
  politest-brief.timer         daily 10:00 UTC trigger for the draft
  politeion.com.Caddyfile      production Caddy config (+ older variants)
  RUNBOOK.md                   step-by-step ops

store/                (gitignored, created at runtime on the droplet)
  results.jsonl               crowd test results
  analyses.jsonl              article analyses
  analyzer-usage.jsonl        token/spend log
  politeion.db (+ -wal/-shm)  accounts SQLite
  briefs.jsonl                Daily Brief drafts + published editions
  feed.xml                    generated RSS (served at /feed.xml)
```

Total application code is ~7,200 lines. Nothing else is required.

---

## 3. Design system (`css/style.css`)

A single stylesheet, ~570 lines, "civic academia" aesthetic: institutional
navy/lapis + citation gold, ink-on-parchment. **Theme-aware** via a
`data-theme="dark|light"` attribute on `<html>`, defaulting to dark.

### 3.1 Tokens (CSS custom properties on `:root`)

Fonts:
- `--serif`: `ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif` (headings, wordmark, question text).
- `--font`: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (body).
- `--mono`: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace` (numbers, code).

Dark palette: `--bg #16130d`, `--bg-elev #1e1a12`, `--bg-elev2s #272218`,
`--bg-elev3 #322b1f`, `--fg #efe8d9`, `--fg-dim #b8ab93`, `--fg-faint #877c67`,
`--border #352e21`, `--border-strong #4a4130`, `--gold #cba43f`,
`--accent #6f9bde` (lapis), `--pos #e0925f` (terracotta, positive pole),
`--neg #6f9bde` (lapis, negative pole), `--good #7cc194`, `--warn #d9b45c`,
`--bad #db786e`, `--ring` = 60% accent mix.

Light palette (`:root[data-theme="light"]`): `--bg #f4efe4` (parchment),
`--bg-elev #fffdf6`, `--fg #211b12` (ink), `--gold #9a6b12`,
`--accent #1e3a5f` (navy), `--pos #a8502a`, `--neg #1e3a5f`, etc.

Spacing scale `--s1..--s7`: `0.25/0.5/0.75/1/1.5/2/3 rem`.
Font sizes `--fs-xs..--fs-xl`: `0.75/0.875/1/1.0625/1.4/1.9 rem`.
Radii: `--radius-sm 6px`, `--radius 10px`, `--radius-lg 14px`, `--radius-pill 999px`.
Three shadow levels, `--maxw 1060px`, transition timings `--t-fast 120ms`, `--t 190ms`,
`--ease cubic-bezier(.36,.03,.2,1)`.

### 3.2 Core components (all defined here)

- **Reset**: `box-sizing: border-box`, zero margins, `line-height 1.6`, focus-visible
  ring, `::selection` gold tint.
- **Sticky header** `[data-shell]`: blurred translucent bar with a gold hairline
  (`box-shadow: inset 0 2px 0 gold`). `.site-header` flex row; `.brand` wordmark
  (uppercase, letter-spaced); `.site-nav a` pill links, active link marked with
  `box-shadow: inset 0 -2px 0 gold` via `[aria-current="page"]`; `.theme-toggle`
  square button.
- **Buttons** `button, .btn`: min-height 44px (touch target), 6px radius,
  `--bg-elev` fill, gold hover border. `.btn-primary` = accent fill. `.btn-row` flex
  wrap.
- **Cards** `.card`: elevated surface, 1px border, 10px radius, shadow-1.
- **Hero** (landing): centered, `clamp()` display type, `.rule-orn` gold rule with a
  ◆ ornament, `.feature-grid` auto-fit card grid.
- **Segmented pickers** `.mode-picker` / `.mode-opt`: used for answer-style, length,
  and tab selectors; `.active` gets accent border + inset ring.
- **Test UI**: `.test-stage`, `.progress` + `.progress-bar > i` (gold→accent
  gradient fill), `.q-text` (serif, `clamp`, `text-wrap: balance`), `.answers button`
  list, `.slider-wrap` (precision slider with floating `.slider-readout` bubble,
  custom range thumb, tick labels).
- **Bar readout** `.bar-readout` / `.bar-row`: three-column track
  `minmax(70px,1fr) 3fr minmax(70px,1fr)` (neg pole | SVG bar | pos pole), score
  colored by sign, `.uncertain`/`.awaiting` dimmed, confidence-interval whiskers.
- **Charts**: `.chart-gallery` auto-fit grid; `.chart-card` with `.chart-expand`
  hover button; `.quad-*` quadrant tints (`q-tl/tr/bl/br`), `.you-dot/.you-halo`,
  `.arch-dot`, `.cloud-dot`, `.fig-dot`, `.pole-lbl`; `.chart-tip` fixed tooltip;
  `.chart-modal*` fullscreen lightbox (fills the screen under 560px).
- **Number line** `.axis-line` / `.axl-*` for single-axis archetype positions.
- **Pickers/selects**: custom dropdown arrow via layered gradients.
- **Archetype panel** `.arch-*`, tier chips `.tier.Strong/.Moderate/.Weak/.None`
  colored good/accent/warn/dim.
- **Data table** `.table-scroll` + `table.data` (sticky sortable headers, zebra
  rows), `.summary-grid`/`.summary-cell`, inline `.tag.approx/.warn`.
- **Validity banners** `.banner-bad/warn/ok/info` (left border 4px, tinted bg).
- **3D** `#three-mount` (70vh), `.legend`, `.controls-3d`.
- **Toast** `.toast` fixed bottom-center.
- **Analyzer** block: `.analyze-card`, `.fld`/`.fld-row` inputs, `.stats-line`
  (mono), `.disclaimer` (gold left-border quote), `.analysis-head`,
  `.genre-chip.genre-{report,analysis,opinion,mixed}` + `.caution`, `.notice*`,
  `.axrow*` (evidence-forward axis rows with quote blockquotes),
  `.neutral-summary`, left↔right barline `.lr*` (a horizontal
  blue→neutral→red gradient track with a marker), `.lr-mini` (compact list-row
  version), `.article-card`/`.article-list`, `.lb-*` leaderboard rows (two-line),
  `.split*` resizable two-pane layout.
- **Sub-tabs** `.subtabs`/`.subtab` (Data page Analyzer/Test), `.wchip` category
  chips (deliberately no weight/direction), reduced-motion + narrow-screen media
  queries.

Every visual element in the app is stylable from this one file; there are no
inline `<style>` blocks except tiny layout tweaks in HTML `style=""` attributes.

---

## 4. The axis system — `js/axes.js` (single source of truth)

Pure data, no logic depends on the *count* of axes. Exports:

- `APP_NAME = "Politeion"` — renaming the whole app is changing this one constant.
- `APP_TAGLINE = "A political compass in twenty-two dimensions."`
- `FULL_TEST_SIZE = 400`, `QUICK_TEST_SIZE = 116` (display hints only).
- `AXES` — the ordered array of 22 axis objects. **Order is canonical** and fixes the
  byte order of the shareable-vector encoder; never reorder without bumping
  `ENCODE_VERSION`. A **positive** score always leans toward `posLabel`, negative
  toward `negLabel`.

The 22 axes, in order (`key` — label — positive pole / negative pole):

| # | key | label | + pole (posLabel) | − pole (negLabel) |
|---|-----|-------|-------|-------|
| 1 | `mkt` | Economy | Free market | State-directed |
| 2 | `wel` | Welfare | Minimal safety net | Expansive welfare |
| 3 | `trd` | Trade | Protectionist | Free trade |
| 4 | `soc` | Culture | Traditional | Progressive |
| 5 | `rel` | Religion | Religious public life | Secular |
| 6 | `auth_pat` | Paternalism | Paternalist | Personal autonomy |
| 7 | `auth_pw` | State power | Strong state power | Limited state power |
| 8 | `sec` | Security | Surveillance/security | Privacy |
| 9 | `spe` | Speech | Regulated speech | Speech-absolutist |
| 10 | `jus` | Justice | Punitive | Rehabilitative |
| 11 | `dem_fr` | Franchise | Restricted franchise | Universal franchise |
| 12 | `dem_tc` | Who decides | Technocratic delegation | Popular decision |
| 13 | `trust_pol` | Political trust | Trusts political class & media | Distrusts political class & media |
| 14 | `trust_sys` | System trust | Trusts administration & elections | Distrusts administration & elections |
| 15 | `meth_scope` | Change scope | Sweeping change | Status-quo preserving |
| 16 | `meth_means` | Means | Extraordinary means | Lawful process only |
| 17 | `fed` | Federalism | Federal centralization | State/local |
| 18 | `natl` | Nation | Nationalist | Globalist |
| 19 | `imm` | Immigration | Restrictionist | Open immigration |
| 20 | `fp` | Foreign policy | Interventionist | Restraint |
| 21 | `tech` | Technology | Techno-optimist | Precautionary |
| 22 | `env` | Environment | Growth priority | Environmental priority |

Each axis object also carries a `description` (one sentence) and — assigned in a loop
from a `SHORT` map — `posShort`/`negShort` (≤14-char labels for tight chart gutters,
e.g. `dem_fr` → `["Limited vote","Universal vote"]`).

Also exported:
- `AXIS_KEYS` = `AXES.map(a => a.key)` (canonical iteration/encoding order).
- **Legacy migration**: `LEGACY_AXIS_MAP = { auth: "auth_pw", dem: "dem_fr",
  trust: "trust_pol", meth: "meth_scope" }`. v2 split four previously-fused axes into
  eight; a v1 bank/vector maps its fused keys to the **primary** split axis, leaving
  the sibling (`auth_pat`, `dem_tc`, `trust_sys`, `meth_means`) empty ("awaiting
  items"). Helpers: `LEGACY_KEYS`, `legacyToNew(key)`, `isLegacyKey(key)`.
- Lookups: `axisByKey(key)`, `isAxisKey(key)`, `axisLabel(key)`.

---

## 5. Scoring engine — `js/scoring.js`

The heart of the test. All answers are unified to an integer **0..100** (both answer
styles). Pure functions, no DOM. Imported identically by the frontend and by
`tools/audit.js`, so app and tests can never drift.

### 5.1 Answer encoding

- **Classic 5-button** maps to 0/25/50/75/100 (`CLASSIC_MAP`, `CLASSIC_ANSWERS`).
  Strongly Disagree=0 … Neutral=50 … Strongly Agree=100.
- **Precision slider** yields the raw 0..100 directly.
- Legacy −2..+2 answers migrate via `LEGACY_ANSWER_MAP`
  (`-2→0,-1→25,0→50,1→75,2→100`), `migrateAnswerValue(v)`.

### 5.2 Score formula

For each answer `s`, the multiplier is `a = (s − 50) / 50 ∈ [−1, +1]`. For each axis
`k`:

```
raw[k]   = Σ over served scorable items of (a · weight_k)
max[k]   = Σ |weight_k|            (maximum attainable |raw|, since |a| ≤ 1)
score[k] = clamp( round1( 100 · raw[k] / max[k] ), −100, +100 )   // one decimal
```

If `max[k]` is 0 the score is 0. This is why an axis with mixed keying can't be
maxed: e.g. items `mkt:+2` and `mkt:−1` both answered 100 give
`100·(2−1)/(2+1) = 33.3`, never ±100. `computeScores(answers, served)` returns
`{ vector, raw, max, counts, answered }`. Attention items are excluded from scoring.

Question weights are integers in **−2..+2**. Only the axis identity is public; the
weights, severity, and pairing are treated as proprietary (see §7, §17).

### 5.3 Question-file migration + validation

- `migrateQuestions(raw)` → `{ questions, bankVersion: 1|2, approximatedAxes }`.
  Remaps legacy fused axis keys before validation. Presence of any legacy key marks
  the bank v1.
- `validateQuestions(raw)` → `{ questions, errors, warnings }`. Enforces: array
  shape; integer unique `id`; non-empty `text`; `type` is absent or `"attention"`;
  attention items need `expect` ∈ {0,100}; scorable items need a non-empty `axes`
  object with known keys and integer weights in −2..+2 (0 warns "no effect"); optional
  `core` (boolean), `sev` ∈ {1,2,3}, `anchor` (boolean), `pair` (non-empty string).
  Also checks consistency-pair integrity: each `pair` id must have exactly two items
  sharing exactly one axis in **opposite** polarity.

### 5.4 Length modes and question selection

`MODE_SIZES = { quick: 100, normal: 250, deep: Infinity }`. `normalizeMode` maps the
legacy `"full"`→`"deep"` and defaults unknown to `"normal"`.

`selectQuestionSet(questions, target)` builds a **deterministic, balanced** subset of
`target` *numbered* questions (attention checks ride on top and are never counted
against the target). Algorithm:

1. Split off attention items; if numbered count ≤ target, return everything.
2. **Anchors first**: every item with `anchor: true` is pre-selected and counts
   toward `target`. Anchors fix where an axis's scale tops out; every mode must serve
   them, or a short mode's scale would top out on answering *consistently* rather than
   holding the extreme position (this is exactly the bug where a 15%-franchise
   epistocrat could outscore a monarchist on Franchise).
3. Build a partner map so consistency **pairs stay whole**.
4. Per **primary axis** (the axis with the largest |weight|), bucket the remaining
   (non-anchor) items into positive- and negative-keyed lists, each ordered by
   severity-then-id (`orderBySevThenId` interleaves the three severity rungs), then
   `zip` them so +/− alternate. If anchors already skewed an axis toward one pole,
   the bucket **leads with the opposite pole** to compensate.
5. Round-robin across axes (in `AXIS_KEYS` order), taking one item per axis per pass,
   pulling partners along, until `target` is reached.

`questionsForMode(questions, mode)` returns the served set (deep = everything,
attention checks included). Result: quick ≈ 100 numbered + all attention checks,
normal ≈ 250 + checks, deep = 400 + checks. Selection is stable (no randomness) so
every taker in a mode answers the same set.

### 5.5 Attention & consistency

- `computeAttention(answers, questions)`: an attention item passes if
  `|answer − expect| ≤ 15`. `failed` when `failures ≥ 2`. A failed run is excluded
  from the crowd dataset.
- `computeConsistency(answers, questions)`: for each pair, expected
  `answer_a ≈ 100 − answer_b`; error `= |a − (100−b)|`. Reports per-pair error,
  per-axis mean error + `axisWarn` (mean > 25), `overallPct = round(100 − meanErr)`,
  and — crucially — `failedPairs`/`failRate` where a pair "fails" at error > 40. A
  **high fail rate across many pairs signals answer↔question misalignment (a bug),
  not opinion**; the results page uses `failRate > 0.4` with `count ≥ 3` to withhold
  results entirely.

### 5.6 Bootstrap confidence bands

`bootstrapConfidence(answers, served, {iters=200, seed})`: per axis, resample its
answered contributions with replacement `iters` times against the fixed served
denominator, take the 2.5th/97.5th percentiles → `{ lo, hi, spansZero }`. A band
that spans zero marks an axis whose sign isn't reliably determined ("leans"). Uses a
seeded `mulberry32` PRNG, so bands are **deterministic under a fixed seed**.

### 5.7 Bank signature & item fingerprints (resume/top-up safety)

- `bankSignature(questions)` — FNV-1a over `id|axes|type|expect|pair` of every item,
  sorted by id. Stored with an in-progress session. On resume, if the stored
  signature ≠ the current bank's, the test **refuses to resume** (ids can be reused
  across bank edits while the underlying question changed — merging positionally
  would mis-score).
- `itemFingerprint(q)` / `itemFingerprints(questions)` — FNV-1a per item over
  `id|text|axes|type|expect`. A finished run stores these next to its answers so a
  later top-up knows which stored answers still mean what they meant.
- `reusableAnswers(run, questions)` — the subset of a finished run's answers still
  safe to merge: an answer carries over only if its item fingerprint is unchanged.
  For runs finished **before** fingerprints existed, one documented rule handles the
  known edit: drop the reused ids `[398,399,400]` (they were attention checks, now
  real questions), keep 1–397.
- `pendingQuestions(answers, served)` — numbered served items with no answer (never
  attention checks). This is "what a returning taker must answer."
- `scoreRun(answers, served, {seed, iters})` — the single scoring path
  (`{ vector, counts, attention, consistency, bands, precision }`), used by both
  finishing a test and merging a top-up so they can't diverge.

### 5.8 Precision composite — "the shrinking dot" (`js/precision.js`)

Repeated, sharper runs (Precision > Classic answers, Deep > Quick lengths) *tighten*
a user's measured position. Split into its own module (meta-analysis across runs,
distinct from single-run scoring) and re-exported from `scoring.js` so importers are
unaffected.

- `precisionFromBands(bands, counts)` → per-axis `{ count, sigma }` where
  `sigma = |hi − lo|/2` (half the 95% bootstrap band). Part of `scoreRun`'s output;
  persisted with every saved run.
- `combineRuns(runs)` → `{ vector, sigma, perAxis, runsUsed }`. Inverse-variance
  meta-analysis per axis:
  `score* = Σ(sᵢ/σᵢ²) / Σ(1/σᵢ²)`, `σ* = sqrt(1 / Σ(1/σᵢ²))`.
  Every `σᵢ` is floored at **`SIGMA_FLOOR = 3.0`** so one lucky tight band can't
  dominate; a run saved with no precision block is **legacy** and contributes at
  **`LEGACY_SIGMA = 25`**.
- **Drift guard** ("you are not your past self"): per axis, runs are ordered by date;
  the latest *epoch* is built newest→oldest, admitting a run only while it stays
  within `σᵢ+σⱼ` of every already-admitted run. The first violator is a drift
  boundary — older runs are excluded and the axis is marked
  `{ drifted:true, from, to, since }`. Only the epoch is averaged.

Consumed by the results page's "Refined position" (§14.3) and by the quadrant halo
(§10). Audited with hand-computed inverse-variance, σ-floor, drift-epoch, and
legacy-σ fixtures.

---

## 6. Question bank — `data/questions.json`

A flat JSON array of item objects. **403 items**: 400 numbered (ids 1–400) + 3
attention checks (ids 901–903, kept out of the numbered range so the bank reads as a
clean 1–400).

Numbered item shape:
```json
{ "id": 1, "text": "Prices for most goods … set by markets …",
  "axes": { "mkt": 2 }, "sev": 2, "core": true, "pair": "P01" }
```
- `axes`: map of axis key → integer weight (−2..+2). One or more axes.
- `sev` (1|2|3): severity/prominence tier, used only for spread in selection.
- `core` (bool): part of the quick-mode core subset (116 marked).
- `pair` (string): consistency-pair id; exactly two items per pair, opposite polarity
  on one shared axis. 10 pairs.
- `anchor` (bool): served in every mode; currently exactly **one** anchor (id 400,
  the Franchise ceiling item).

Attention item shape:
```json
{ "id": 901, "text": "…select Completely disagree…", "type": "attention", "expect": 0 }
```

The bank spans all 22 axes; `tools/audit.js` enforces ≥12 items/axis, keying balance
≤65%, and core coverage per axis. **Only the axis identity is exposed publicly**
(the questions page shows category chips with no weight/direction).

---

## 7. Shareable-vector codec — `js/app.js`

Results are shared as a URL fragment `#r=<base64url>`. `ENCODE_VERSION = 2`.

- `encodeVector(vector)`: a `Uint8Array` of `1 + AXIS_KEYS.length` bytes — byte 0 is
  the version, then one **signed** byte per axis (score rounded, clamped −100..+100),
  in `AXIS_KEYS` order → base64url (`+`→`-`, `/`→`_`, strip `=`).
- `decodeVector(str)`: reverses it; returns `null` unless the version matches and the
  length is exactly `1 + AXIS_KEYS.length`. So old v1 (18-axis) links never silently
  misread — they simply don't decode.
- `vectorFromHash()` reads `#r=…`; `loadAccountResultIntoHash()` auto-populates the
  hash from a signed-in user's most recent saved result if none is present.

---

## 8. Archetypes — `js/archetypes.js` + `data/archetypes.json`

**28 archetypes**, each a full 22-axis `vector` (−100..+100) plus a per-axis
`salience` (0..1, how defining that axis is). Names: Progressive, Social Democrat,
Democratic Socialist, Revolutionary Socialist, Liberal (US), Neoliberal, Libertarian,
Paleolibertarian, Anarcho-Capitalist, Conservative (US), Paleoconservative,
Neoconservative, Religious Traditionalist, Christian Democrat, Corporatist,
Monarchist, Reactionary, National Populist, Left-Populist, Technocrat, Centrist,
Communitarian, Isolationist Nationalist, Authoritarian Statist, Green,
Civil-Libertarian, Developmentalist, Anarchist.

`data/archetypes.json` is the source; `js/archetypes-data.js` is a byte-identical
**mirror** exported as `ARCHETYPE_DATA` (there is no generator script — edit both,
and the audit verifies the two agree). `archetypes.js` normalizes each entry against
`AXIS_KEYS` (missing axis → vector 0, salience `BASELINE_SALIENCE = 0.10`).

**Matcher** (`matchArchetypes(userVec)`): salience-weighted **root-mean-square**
distance → similarity %:
```
rms = sqrt( Σ salience_k · (user_k − arch_k)²  /  Σ salience_k )   // 0..200
similarity = 100 · (1 − rms/200)
```
RMS (vs mean-abs) makes a few large disagreements cost more, so strong outlier
positions can't be diluted by many near-zero agreements. Returns every archetype
sorted by similarity, each with a **tier** and top disagreements.

**Tier** (`tierFor`): `≥85` Strong, `≥70` Moderate, `≥55` Weak, else None — with a
guard: a Strong match is **capped to Moderate** if the profile differs by >40 on any
axis the archetype *strongly defines* (salience ≥ 0.5). You can't be a "Strong X"
while contradicting a core X axis.

`topDisagreements(userVec, arch, n=3)`: the n largest raw per-axis differences.
`singleAxisMatch(userVec, axisKey)`: every archetype's position on one axis + its
distance, sorted — explicitly *not* an ideology match (drives the number line).

The whole matcher exists to prevent one specific failure: "distrust + restricted
governance" must not read as populism just because it shares distrust. The audit
asserts this with fixtures.

---

## 9. Historical figures — `js/figures.js` + `data/figures.json`

**24 figures**, each `{ name, era, blurb, vector }` over the same 22 axes (−100..100).
Names span Mao, Stalin, Hitler, Lenin, Churchill, FDR, Lincoln, Washington,
Jefferson, T. Roosevelt, Eisenhower, JFK, Nixon, Reagan, Thatcher, Bismarck,
Napoleon, Franco, Salazar, Atatürk, de Gaulle, Lee Kuan Yew, Gandhi, MLK.

`validateFigures(raw)` validates like the question bank (unique names, known axes,
range). `figureProximity(userVec, figureV)` is plain (unweighted) similarity
`100·(1 − meanAbsDiff/200)`; `nearestFigures(userVec, figures, n=5)` ranks them.

---

## 10. 2D charts — `js/charts2d.js`

All inline SVG, no dependencies.

- **`renderBarReadout(container, vector, opts)`** — the 22-row horizontal bar
  readout. Each row: axis label, optional tags (`v1 approx`, `⚠ reliability`),
  count or crowd percentile, signed score (or "leans …" / "centered" when the
  confidence band spans zero), and an SVG bar from center with optional CI whiskers.
  `opts` carries `counts, bands, consistency, percentiles, approximated`.
- **`quadrantSVG(vector, xKey, yKey, opts)`** — a quadrant scatter. All four pole
  labels derive from `axes.js` at render time; one shared 4%-inner-padded scale maps
  −100..+100 for every marker. Layers: quadrant tints, crowd cloud dots, archetype
  dots, figure dots (only the most extreme figure per quadrant gets a label, with
  center-anchored placement and optional vertical nudge), the user "You" dot with a
  halo. Rotated y-axis pole labels live in the SVG (`transform="rotate(-90…)"`), so
  they survive PNG export. Short-label fallback when the full label won't fit
  (measured via a canvas `measureText`, with a length-estimate headless fallback).
  **σ halo** ("the shrinking dot"): when `opts.sigma` (a per-axis σ map) is present,
  the "You" halo radius scales with the mean σ of the two plotted axes (σ 3 → r≈7
  tight, σ 25 → r≈22 soft) and the dot tooltip shows `±σ`. Wired from the single
  run's bands on the results gallery/compare charts (§14.3).
- **`lineChartSVG(series, opts)`** — one shared time-series renderer (outlet/writer
  drift, §14.9). `series` = `[{ name, color, unit?, points:[{label, value}] }]`; x is
  the union of bucket labels (categorical), y is −100..+100 with a zero line; a
  polyline + hover dots per metric (`.dot[data-name]`, reusing `attachTooltips`),
  pole labels from `axes.js`, plus `lineChartCard`/`wireLineChart` with the same
  expand-modal + PNG export.
- **`axisLineSVG(userVec, axisKey, archetypes, labelNames)`** — single-axis number
  line: every archetype's tick + the user's marker.
- **Interactivity**: `attachTooltips(container)` wires hover/tap tooltips on any
  `.dot[data-name]` (idempotent per node). `openChartModal({title, render, filename})`
  re-renders the chart large in a fullscreen lightbox with a **Download PNG** button.
- **`quadrantCard`/`wireQuadrant`** paint a quadrant into a `<figure>` with an expand
  affordance and click-to-zoom.
- **`downloadSvgAsPng(svgEl, filename, scale=2)`** — clones the SVG, inlines computed
  styles onto every node, serializes to a data URI, rasterizes via an `Image` onto a
  canvas filled with the page bg color, and triggers a download.
- **`runChartDevAssertions()`** (`?devcharts` or tests) — verifies pole labels match
  `axes.js` and that every score in [−100,100] maps inside the plot rect.

---

## 11. 3D explorer — `js/charts3d.js`

Uses the global `THREE` (r128 from cdnjs). cdnjs does not host OrbitControls, so a
minimal **`Orbit`** controller is vendored: spherical camera (radius/theta/phi),
pointer drag to rotate, shift/right-drag to pan, wheel to zoom, autorotate, and
`getState`/`setState` for shareable camera positions.

`createExplorer(mount, { vector, archetypes, trio, camera, showLabels })` builds a
scene: a −100..100 wireframe cube, three mid-plane grids, three colored axis lines
through the origin, billboarded pole labels rebuilt on axis change, a glowing "You"
marker (core + halo + label), and one hue-spread dot per archetype (labels default
off — 28 names would pile up; the legend identifies colors). Raycasting drives hover
tooltips (shared `#chart-tip` element). Returns an API: `setTrio`, `setArchVisible`,
`setAllArch`, `setLabelsVisible`, `setAutorotate`, camera get/set + `onCameraChange`,
`legend()`, `resize`, `dispose`. `isWebGLAvailable()` gates a 2D quadrant fallback.

---

## 12. Left↔right composite — `js/leftright.js`

Single source of truth, shared by frontend and backend (server hands the function to
the Analyzer store). Signed per-axis methodology weight — `+` means the axis's
positive pole is US-**right**-coded, `−` means positive pole is US-**left**-coded,
magnitude is how load-bearing it is:

```
LR_WEIGHTS = {
  mkt:1, wel:1, soc:1, imm:1, env:0.9, rel:0.8, jus:0.8, natl:0.8,
  dem_fr:0.6, sec:0.5, fp:0.3,     // right-coded positive pole
  spe:-0.7, fed:-0.6,              // left-coded positive pole
}
```
Axes not listed have weight 0 and never move the needle.

`leftRightScore(axesMap)` where `axesMap` is `{ key: {score, confidence?} }`:
```
num = Σ score · sign(w) · |w| · conf
den = Σ |w| · 100 · conf
x   = den ? clamp(round(100·num/den), −100, +100) : 0     // + = right
return { x, hasSignal: den > 0 }
```
`lrLabel(x)`: <8 Centrist, <25 Center-left/right, <50 Left/Right-leaning, else
Strongly left/right.

---

## 13. Shared frontend shell — `js/app.js`

- **Theme**: `applyStoredTheme()` reads `localStorage["dc_theme"]` (default dark),
  sets `data-theme`; `toggleTheme()` flips and persists.
- **Header/nav**: `NAV` = Home, Test, Results, 3D, Analyze, Brief, Data, Account.
  `initShell(activeHref)` renders the sticky header into `<div data-shell>`, injects
  a dependency-free inline-SVG compass favicon, marks the active link, wires the
  theme toggle. Every page calls `initShell(...)`.
- **Question loading**: `loadQuestionData()` fetches `data/questions.json` (cached in
  memory), migrates, validates, returns `{ raw, questions, errors, warnings,
  bankVersion, approximatedAxes }`.
- **Seeded shuffle**: `makeSeed()` (crypto if available), `mulberry32`,
  `shuffleWithSeed(array, seed)` — stable Fisher–Yates so a question order is
  reproducible from a seed.
- **Progress persistence**: `PROGRESS_KEY = "dc_progress_v2"` (+ legacy v1 key for
  one-time migration). `saveProgress/loadProgress/clearProgress`.
- **Vector codec** (§7).
- **Helpers**: `escapeHtml`, `clamp`, `loadAccountResultIntoHash`, `vectorFromHash`.

localStorage keys used across the app: `dc_theme`, `dc_progress_v2`, `dc_mode`
(length), `dc_answer_mode`, `dc_last_result`, `dc_share`, `dc_submitted`,
`dc_analyzer_admin`, `dc_analyze_split`.

---

## 14. Frontend pages

Every page: `<!DOCTYPE html>` with `data-theme="dark"`, viewport meta, the one
stylesheet, a `<div data-shell></div>` mount, a `<main class="wrap">`, and a single
`<script type="module">`. Public pages carry canonical + OG/Twitter meta;
internal pages (article, profile, login, account, questions implicitly) set
`robots: noindex`.

### 14.1 `index.html` — landing
Hero with two segmented pickers: **answer style** (Classic/Precision → `dc_answer_mode`)
and **length** (Quick 100 / Normal 250 / Deep 400 → `dc_mode`). Buttons: Take the
test, Resume (shown with progress `answered/total` if a session exists), a **top-up**
button (shown, loaded lazily after paint, when a finished run has questions added
since — links `test.html?topup=1`), and "Questions & methodology" → `data.html#test`.
A four-card feature grid explains the model and the anonymous-by-default crowd policy.

### 14.2 `test.html` — the runner
Loads the bank, computes `currentSig = bankSignature(all)`. Reads `dc_mode` /
`dc_answer_mode`. Boot logic:
- `?topup=1` → load the finished run from `dc_last_result`; carry over
  `reusableAnswers`, serve only `pendingQuestions`; if none, show "already up to
  date"; if no run, show "no earlier test on this device."
- `?fresh=1` → start fresh.
- Else: if a stored session's `bankSig` differs from current → **refuse to resume**
  ("the question set has changed", restart). If valid, resume. Else start fresh.

`startFresh` serves `questionsForMode`, seed-shuffles the ids into `order`, builds a
numbering map (attention checks get **no number** — the counter reads "Attention
check"). Renders either the classic 5-button grid (keyboard 1–5) or the precision
slider (arrows ±1, PgUp/PgDn ±10, Home/End, typed value, Enter=Next, with an
engaged-state gate so an untouched slider doesn't auto-record). Back/Restart nav
(Restart hidden in top-up mode). `record(v)` stores the answer, advances, persists
(top-up sessions are **not** persisted, so they never clobber an in-progress full
test). On completion, `finish()` merges (top-up: base answers + new; normal: just
answers), calls `scoreRun`, encodes the vector, writes `dc_last_result` (including
`bankSig` + `itemFp`), and navigates to `results.html#r=<enc>`. bfcache `pageshow`
re-enables buttons. The earlier run's attention verdict carries over on a top-up.

### 14.3 `results.html` — the payoff
`resolveVector()` reads `#r=` and/or `dc_last_result` (ignoring pre-v2 formats),
distinguishing the user's **own** run (full validity detail) from a shared link.
Integrity canary: `consistency.count ≥ 3 && failRate > 0.4` → withhold results with a
restart prompt. Otherwise renders:
- Action row: copy share link, Explore in 3D (carries the hash), Retake, Save to my
  account / Sign in to save (if accounts available), Clear my results (local only),
  run metadata.
- **Top-up banner** if `pendingQuestions` > 0.
- **Refined position** (signed-in users with ≥2 saved runs): fetches
  `/api/auth/results`, calls `combineRuns` (§5.8), and renders a composite bar
  readout with σ* bands *above* the single-run readout, drifted axes badged "moved
  since &lt;date&gt;" old→new, and a "Sharpen your position" CTA
  (`index.html?len=deep&style=precision`, which preselects the pickers) when the mean
  band exceeds ±12. The single run's own bands drive the quadrant σ halo (§10).
- Validity banners (attention/consistency/v1-approx).
- The 22-axis bar readout with bands, consistency warnings, and crowd percentiles.
- Closest archetypes (handles "between two within 3 points", "no strong match", and
  a normal top match, plus five runners-up) + a single-axis details `<details>`.
- **Compare** toggle: Historical figures (nearest 6, quadrant with figure dots) vs
  Everyone (crowd cloud + percentiles, gated to firm up at n≥30).
- **Contribute** (own runs only): **opt-out** crowd sharing — shared by default
  unless `dc_share === "off"`; failed-attention runs are never shared; a self-label
  picker posts to `/api/label`.
- Charts: six default quadrant pairings (`DEFAULT_PAIRS`) + a build-your-own picker.

`hashchange` reloads the page.

### 14.4 `explore3d.html`
Loads Three.js from cdnjs. Reads `#r=<vec>&ax=k,k,k&cam=…`. Axis trio selects (no
duplicates), five presets (Power/Identity/Economy/Culture war/Future), autorotate +
labels toggles, per-archetype legend checkboxes, "Copy view link" (serializes vector
+ trio + camera into the hash). WebGL-absent → 2D quadrant fallback with a pair
picker.

### 14.5 `data.html` — Data & methodology
Two hash-addressable sub-tabs (`#analyzer` default / `#test`):
- **Analyzer**: fetches `/api/rubric` and renders the returned markdown via a small
  inline markdown→HTML converter (headings, GitHub tables, lists, bold/italic/code).
  Shows an "unavailable" line if the API is down.
- **Test**: explains the 22-axis method, shows the validation readout and per-axis
  coverage (item counts, keyed +/− balance, core counts — no weights), and links to
  the question bank. Attention checks are counted separately from numbered questions.

### 14.6 `questions.html` — the bank
Not in the nav (reached only from the Data → Test tab; calls `initShell("data.html")`
so the Data nav item stays lit). A sortable, filterable table: **ID · Question ·
Categories affected**. Each category is a plain `.wchip` chip — **no weight, no
direction, no severity, no pair** (all proprietary). Attention checks are hidden.

### 14.7 `analyze.html` — the Analyzer
Two input tabs: By URL (fetched server-side) or Paste text (+ optional byline/outlet/
title). Submits to `POST /api/analyze`; on success navigates to
`article.html#id=<id>`. **Admin mode**: visiting `?admin=KEY` stores the key in
localStorage (`dc_analyzer_admin`, stripped from the URL) and sends it as
`x-analyzer-admin`; an admin **account** (cookie session, checked via
`/api/auth/me`) also unlocks it. Admin mode exposes a "Force a fresh scan" checkbox
and, in the stats line, operator detail (spend/tokens/model/queue). A live stats line
+ a scrollable "Recently analyzed" list (source-tagged two-row cards with mini
left↔right bars) + a **"Most biased" leaderboard** (top outlets and authors by
distance from center). A resizable split (even / 80-20 / 20-80, persisted in
`dc_analyze_split`).

### 14.8 `article.html` — one analysis
Fetches `/api/analysis/<id>`, renders via `analyzer-ui.renderArticle`. Admin sees a
"Re-run fresh scan" button (`force: true`; replaces in place, same id). `hashchange`
reloads.

### 14.9 `profile.html` — writer/source aggregate
Reads `#writer=<key>` or `#source=<domain>`, fetches `/api/writer` or `/api/source`,
renders via `analyzer-ui.renderProfile`. Then fetches `/api/{writer,source}-trend`;
if the subject has **≥2 qualifying monthly buckets**, appends a **Trend** section
(`analyzer-ui.renderTrend`): the left↔right drift line, an axis picker, a genre filter
(All/report/analysis/opinion), and a per-month genre-mix strip — with the composition
caveat spelled out ("composition shifts can look like position shifts"). The
within-genre series is the honest one.

### 14.10 `login.html`
Tabbed Sign in / Create account. Posts `/api/auth/login` or `/api/auth/register`
(full_name, email, password, birth_year). On success redirects to `?next=` or
`account.html`. Enter-to-submit.

### 14.11 `account.html`
Fetches `/api/auth/me`; redirects to login if signed out; shows details table, saved
results (with per-result Remove → `DELETE /api/auth/results/:id`), a subscription
scaffold placeholder, and Sign out. For `role === "admin"`: an admin note **and the
Daily Brief review surface** — lists all briefs (`/api/brief/admin/list`); each item
is editable inline (edit forces re-certification: `edit` marks it uncertified,
`recertify` re-runs the neutrality check), and **Approve & publish** is enabled only
when every item is certified (`approve` publishes + writes `feed.xml`).

### 14.12 `analyzer-ui.js` (shared renderer)
`renderArticle(el, rec)`: genre chip + caution, title, writer/source links, url,
summary, neutral summary ("What the article says"), flag banners (injection /
generic caution / paywalled / non-political / satire), the standing `DISCLAIMER`,
the left↔right barline, up to 3 mini quadrant charts of the strongest axes, and
evidence-forward `axisRow`s (pole, signed score, confidence %, unverified/extreme
tags, the ≤25-word quote). `renderProfile(el, prof)`: aggregate vector bars (axes
below the 3-article threshold render "awaiting"), the source/writer left↔right (mean
of article leans), and the article list. `renderTrend(el, trend)` (§14.9) builds the
drift chart + genre-mix strip and re-renders in place on control changes.
`miniLeftRightBar`, `renderLeftRightBar`, `hashParams` helpers.

### 14.13 `brief.html` — the Daily Brief (public)
In the nav. Reads `?date=` (or the latest), fetches `/api/brief?date=` /
`/api/brief/latest`. Renders: dateline, **Yesterday** items (headline, 40–80-word
summary, ≤30-word "why it matters", source links, and a **"✓ no detectable stance"
receipt** linking the item's certification analysis at `article.html#id=`), the
**Today** section (expected events from the calendars), a **certification footer**
("All N items scored no detectable stance under rubric vX"), and dated archive links.
Carries OG meta, an RSS `<link rel="alternate" href="/feed.xml">`, and a print
stylesheet (`@media print`) — it's meant to be read.

---

## 15. Backend server — `server.js`

A single stdlib `http` server. Config from env: `HOST` (default `127.0.0.1`),
`PORT` (3200), `STORE_FILE`. On start it dynamically imports `js/axes.js` (for
`AXIS_KEYS`, `LEGACY_AXIS_MAP`) and `js/leftright.js`, initializes auth + analyzer +
brief routes (handing the LR function to the analyzer store), loads the crowd store,
and listens.

Request dispatch order: `OPTIONS` → CORS 204; then `authRoutes.handle` (owns
`/api/auth/*`); then `analyzerRoutes.handle`; then `briefRoutes.handle` (owns
`/api/brief/*` and `/feed.xml`); then the crowd endpoints; then any other `/api/*` →
404 JSON; then static file serving for GET.

**Crowd endpoints** (records store only anonymous data — 22 scores, answer mode,
bank version, per-item answers, optional self-label; **no names, IPs, or timestamps**;
v1 and v2 clouds are never mixed):
- `GET  /api/stats` → `{ count, byBank:{v1,v2} }`.
- `POST /api/results { vector, mode, bank, items }` → append a record, return
  `{ ok, id, count }`. Vector coerced to 22 clamped ints; items coerced (≤400 keys,
  0..100).
- `POST /api/label { id, label }` → set a record's label (≤60 chars), rewrite store.
- `POST /api/compare { vector, bank }` → `{ count, percentiles, sample, axisOrder,
  bank }`. Percentile per axis = `round(100·(less + equal/2)/n)`. Sample is capped at
  `SAMPLE_CAP = 2000` via striding.

**Storage**: append-only JSONL at `STORE_FILE`, loaded into an in-memory array on
boot. Legacy 18-axis array records migrate to the v2 22-axis shape (bank 1) via
`OLD_ORDER` + `LEGACY_MAP`.

**Static fallback**: maps a small MIME table; normalizes the path and refuses
anything escaping `ROOT` (path-traversal guard); serves with `Cache-Control:
no-cache`. `MAX_BODY = 32KB` for crowd bodies. (In production Caddy serves static
files directly; this fallback is for standalone/local runs.)

---

## 16. Analyzer subsystem (`analyzer/`)

### 16.1 `routes.js` — HTTP surface (mounted under `/api`)
- `GET  /api/rubric` → `{ summary }` (the **public** methodology only; never the
  prompt or its hash).
- `GET  /api/analyzer/stats` → public: `{ month:{month,analyses}, counts, recent,
  leaderboard:{sources,writers,minArticles} }`. **Admin** additionally gets
  `provider` status, `rubric:{version, sha256-short}`, full month spend, and queue
  depth.
- `GET  /api/analysis/:id` → the stored analysis with operator provenance stripped
  (model, full hash, usage, raw injection field removed; keeps `rubric.version`).
- `GET  /api/writer?key=…`, `GET /api/source?domain=…` → aggregate profiles.
- `GET  /api/source-trend?domain=…`, `GET /api/writer-trend?key=…` → `{ trend }`
  (monthly drift buckets; §16.6). Public — aggregate means/counts only.
- `POST /api/analyze { url } | { text, byline?, outlet?, title? }` → enqueues a job;
  returns `{ ok, id, existing }`. Errors map to codes: rate→429, queue→503,
  budget→503, else 400.

**Admin** = a matched `x-analyzer-admin: ANALYZER_ADMIN_KEY` header **or** an admin
cookie session (`auth/routes.isAdminSession`). Admin bypasses the per-IP rate limit
and may `force` a fresh re-scan. `MAX_BODY = 200KB` (articles are larger than crowd
bodies). `submit` also accepts an internal `kind` (budget tag: `analyzer`|`brief`)
and `origin` (stored on the analysis; `brief` for self-certification calls) — threaded
to `budget.record` and `store.addAnalysis`.

### 16.2 `analyze.js` — pipeline + abuse controls
Constants: rate limit **5 submissions/hour per IP**, global **queue cap 50**, a
**single serial worker** (one model call at a time), `MAX_TEXT_CHARS = 60000`.

`submit({ip,url,text,meta,admin,force})`:
1. URL **dedupe** first (cheap, no tokens, not rate-limited) unless `force`: a URL
   already analyzed returns the stored analysis immediately.
2. Rate check (skipped for admin), queue-cap check, enqueue, pump.

`runJob(job)`:
1. URL jobs → `fetchUrl.fetchAndExtract` (transient body, byline, canonical domain);
   text jobs → sliced text + coerced meta (outlet → registrable domain).
2. **Budget gate**: if the month's estimated spend has hit the cap, throw
   `code:"budget"`.
3. One model call with the cached rubric system prompt; on JSON parse failure, **one
   repair retry** (a terser user message demanding strict JSON), accumulating usage;
   then fail visibly. JSON is extracted by brace-matching (`extractJson`) — the first
   balanced `{…}` object, string/escape aware.
4. `validateAnalysis` (§16.5).
5. `budget.record` usage (even on ultimate parse failure).
6. `store.addAnalysis` — persists scores + metadata + evidence + rubric stamp +
   usage. A forced re-run of an existing URL passes `replaceId` so it updates **in
   place** (same id, no duplicate row).

### 16.3 `provider.js` — Anthropic adapter
Config strictly from env: `PROVIDER` (default anthropic), `MODEL` (required, never
hardcoded), `ANTHROPIC_API_KEY`/`API_KEY`, optional `BASE_URL`. `callModel({system,
user})` POSTs to `/v1/messages` over raw `https` with:
- `anthropic-version: 2023-06-01`, `max_tokens: 2000`, 60s timeout, 4MB response cap.
- **Prompt caching**: the system block is `[{type:"text", text:system,
  cache_control:{type:"ephemeral"}}]` and byte-identical every call, so repeat
  requests bill the ~10% cache-read rate on the large rubric prefix.
- **Model-specific request shaping**: newer models (`opus-4-[78]`, `sonnet-5`,
  `fable`, `mythos`) reject `temperature` → it's sent only to older models
  (`temperature: 0` for stable scoring). Extended thinking is **disabled**
  (`thinking:{type:"disabled"}`) for this JSON-extraction task on models that allow
  it (omitted for Fable/Mythos which always think and reject the field) — default
  adaptive thinking ate `max_tokens` and truncated JSON on long articles. A
  **self-heal** retries with a bare body if a 400 mentions temperature/thinking.
- Returns `{ text, usage:{input,output,cacheRead,cacheCreation}, stopReason, model }`.
- `openai_compatible` path is a deliberately-inert stub.
- `status()` reports readiness without exposing the key.

### 16.4 `fetch-url.js` — SSRF-hardened fetch + extraction
**SSRF defenses**: http/https only; DNS resolved **before** connecting, every
returned address validated, socket **pinned** to a validated address via a custom
`lookup` (closes the resolve-then-reconnect TOCTOU gap); rejects if **any** resolved
address is non-public (blocks DNS-rebinding); IP-literal hosts validated up front.
Blocked ranges (v4): `0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12,
192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24,
203.0.113/24, 224/4, 240/4`; (v6): loopback, link-local `fe8/9/a/b`, ULA `fc/fd`,
multicast `ff`, documentation `2001:db8`, and IPv4-mapped/embedded forms validated as
their embedded v4. At most **3 redirects**, each re-validated; **25 MB** body cap,
**15 s** timeout.

**UA strategy**: default bot UA (`PoliteionAnalyzer/1.0`); on a bot-block
(401/403/429/451) retry once as a browser UA with browser-like headers.

**Extraction** (`extractText`): strip script/style/nav/header/footer/aside/form/
figure, then pick the candidate region (each `<article>`, each `<main>`, or the whole
doc) with the **most** paragraph text (`<p|h1|h2|h3|li|blockquote>` ≥20 chars),
capped at 60k chars. Byline via meta (`author`, `article:author`, `byl`), JSON-LD,
`rel=author`, or byline/author class. `canonicalDomain` prefers `<link
rel=canonical>` → registrable domain (`registrableDomain` handles multi-part TLDs
like `co.uk`). Title via `og:title` or `<title>`.

**WordPress REST fallback**: if server HTML yields <400 chars (client-rendered) or
the page is blocked, try `{origin}/wp-json/wp/v2/posts?slug=…` for the body and
`…/users/{id}` for the author name (all via the same SSRF-validated fetcher). This
rescues National Review, NewsNation, and most WordPress news sites. Entities are
decoded and whitespace collapsed throughout.

### 16.5 `validate.js` — output sanity checks
`validateAnalysis(parsed, articleText, axisKeys)`. Cleans and validates the model
JSON; a **flagged** analysis still renders (caution badge) but is **excluded from
writer/source aggregates**. Triggers:
- (a) an evidence quote not a verbatim substring of the article (after NFKC + quote/
  dash normalization),
- (b) more than **8** scored axes,
- (c) any score exactly **±100** (the rubric forbids the extremes),
- (d) invalid JSON after the repair retry (handled by the caller).

Per axis it keeps `{score (rounded, clamped ±100), confidence (0..1), evidence,
evidenceOk, extreme}`. Genre ∈ {report, analysis, opinion, mixed}. Model-supplied
flags filtered to `{injection_attempt, paywalled_fragment, non_political,
satire_suspected}`; `injection_attempt` sets `injection`. Evidence quotes are also
capped at **25 words**. Output: `{ analysis:{genre, stance_detected, axes,
neutral_summary, summary, flags}, flagged, injection, reasons, axisCount }`.

### 16.6 `store.js` — analyses store + aggregation
Append-only JSONL. Persists **only** scores, metadata (url, title, byline→`writer`,
domain→`source`, genre, stance_detected), rubric stamp, ≤25-word evidence quotes,
`neutral_summary`, `summary`, flags, and usage — **never the article body**. Ids are
random 6-byte hex. Dedupe by normalized URL (drop fragment + tracking params,
lowercase host). A re-run persists a fresh line with the **same id**; `load` replays
oldest→newest so the latest wins (no duplicate row).

Aggregation levels: **article** (by id), **writer** (normalized byline + registrable
domain), **source** (registrable domain). Aggregate axes = per-axis mean + n,
reported only when ≥ `MIN_ARTICLES = 3` analyses contributed; **flagged analyses are
excluded from every aggregate**. A source/writer's left↔right is the **mean of each
non-flagged article's own left↔right** (over its full axis set; articles with no
detected lean excluded) — not a recompute from thresholded aggregate axes. That is
why MSNBC reads far-left rather than centrist. `rankSources`/`rankWriters` order by
distance of that mean from center (the leaderboard). `recentList(limit)`, `counts()`.
Analyses tagged `origin: "brief"` (internal Daily-Brief self-certification) are
**excluded** from `recentList`/`counts` (they carry no source/writer so they're
already absent from aggregates/leaderboards) while remaining fetchable by id as
receipts. `timeSeries(kind, key)` (§Part A drift) buckets non-flagged analyses by
month using each analysis's stored date — a bucket renders only at ≥3 — and returns
both an all-genre series and per-genre series; each bucket carries `{ period, n,
byGenre, lr (mean), axes:{key:{mean,n}} }`.

### 16.7 `budget.js` — usage + spend cap
Per-analysis usage logged to JSONL. Pricing $/1M tokens by model-id prefix
(`claude-haiku-4-5` 1.0/5.0, `claude-sonnet` 3.0/15.0, `claude-opus` 5.0/25.0; env
overridable), cache-read ×0.1, cache-creation ×1.25. `MONTHLY_BUDGET_USD` is a **hard
cap** enforced *before* a job runs. `record(usage, model, kind)` tags each entry
`kind` (`analyzer`|`brief`). `monthStats()` reports month, analyses, tokens, a
per-kind `byKind` breakdown, `costUsd`, `capUsd`, `pctOfCap`, `warn` (≥80%),
`exhausted`. `overBudget()` gates both the analyzer pipeline and brief drafting.

### 16.8 `rubric.js` — the private prompt
Loads `data/analyzer_system_prompt.md` (**proprietary**, ~73 lines; never served),
computes its SHA-256, exposes `RUBRIC_VERSION` (currently **"v3"** — v2 added the
required `neutral_summary` field; v3 added the "hostile coverage is opposition, not
endorsement" rule). `rubricText()` (inference/hash only), `rubricSummary()` (the
public `data/rubric_summary.md`, with a safe fallback that never leaks the prompt),
`rubricStamp(model)` = `{version, sha256, model}` stored on each analysis. **Editing
the prompt or changing MODEL is a recalibration event**: bump `RUBRIC_VERSION` and
rerun `tools/calibrate.js`.

**Output contract the prompt must satisfy** (from `validate.js` + `rubric_summary.md`):
strict JSON `{ genre, stance_detected, summary, neutral_summary, axes:{ key:{score
(−99..99), confidence (0..1), evidence (verbatim ≤25-word quote)} }, flags:[…] }`,
scoring the **stance of the piece** (not its subject), ≤8 axes, no ±100, every scored
axis carrying a real quote, quoted voices counted only through the article's framing.

### 16.9 Daily Brief subsystem (`brief/`)

One self-certified neutral page per day. Drafting is automated (CLI + systemd timer);
**publication is always a human approval**. No new inference or fetch paths — it
reuses `provider.callModel`, the SSRF fetcher, and the analyzer pipeline.

- **`cluster.js`** — `clusterStories(candidates, {minOutlets=2, minShared=2})`. Pure.
  Greedy single-link clustering on meaningful title tokens (lowercased, stopwords and
  <3-char tokens dropped); a cluster is *selected* only when it spans ≥2 distinct
  outlets. No model call. Returns `{ clusters, selected }`.
- **`sources.js`** — `parseRss(xml)` (dependency-free RSS 2.0 / Atom reader) and
  `collectYesterday(config, fetchText, warn)` which pulls each `yesterday` feed via
  the injected fetcher and flattens to `{ source, title, url }` candidates. A dead
  feed is warned and skipped, never fatal.
- **`certify.js`** — the self-certification loop. `isNeutral(a)` = stance not detected
  **and** no flags. `certifyItem(item, { certify, rewrite, maxRewrites=1 })`: certify
  the text; if not neutral, rewrite once with the failing axes+evidence fed back; a
  second failure returns `needsHuman`. Injected callbacks ⇒ unit-testable without a
  model.
- **`store.js`** — `briefs.jsonl` upsert store (rewritten wholesale — low volume),
  `validateItem` (headline ≤90 chars, summary 40–80 words, why ≤30 words, links
  non-empty http(s)), and `feedXml(list, {origin})` (escaped, well-formed RSS 2.0).
  `publicBrief` strips token usage + the review queue. `writeFeed(dir)` writes
  `feed.xml` into the **writable store dir** (the web root is read-only under the
  hardening) — served by the app at `/feed.xml`.
- **`draft.js`** — the pipeline. `draft({date, config, log})`: budget gate → fetch →
  cluster → for each of ≤10 selected stories, `draftOne` (one `provider.callModel`
  with `data/brief_system_prompt.md`, `BRIEF_VERSION` **v1**, → validated
  `{headline, summary, why_it_matters, links}`) → `certifyItem` (whose `certify` runs
  the item text through `analyze.submit({admin:true, kind:"brief", origin:"brief"})`
  and reads the resulting analysis) → certified items vs a `review` queue → assemble
  `Today` mechanically from the calendars → **save as `status:"draft"`** (never
  published). `recertify(brief)` re-checks edited items (no rewrite) for the admin
  approve flow. Every model call is budget-tagged `brief`; a hit cap aborts cleanly.
- **`routes.js`** — public `GET /api/brief/latest`, `GET /api/brief?date=` (usage
  stripped, review hidden) and `GET /feed.xml`; admin (same gate as the Analyzer)
  `GET /api/brief/admin/list`, `POST /api/brief/admin/{edit,recertify,approve}`.
  `edit` marks an item uncertified; `approve` requires **all** items certified, then
  publishes and rewrites `feed.xml`.

**Output contract for `brief_system_prompt.md`** (enforced downstream by the
certification pass): strict JSON `{ headline ≤90 chars, summary 40–80 words,
why_it_matters ≤30 words, links:[urls] }`; synthesize from multiple sources in
original wording; no verbatim source sentences; no judgment adjectives; attribute
contested claims; never adopt one outlet's framing. It is reviewed/versioned like the
rubric.

---

## 17. Accounts subsystem (`auth/`)

### 17.1 `db.js` — schema (node:sqlite, lazy-required)
`node:sqlite` `DatabaseSync`, WAL mode, foreign keys on. `require` is lazy so an old
Node without `node:sqlite` doesn't crash the whole server. Tables:
- **users** `(id PK, email UNIQUE, full_name, birth_year, password_hash, role
  DEFAULT 'user', subscription_tier DEFAULT 'free', subscription_status DEFAULT
  'inactive', subscription_updated_at, created_at)`.
- **sessions** `(token PK, user_id FK, created_at, expires_at)`.
- **subscriptions** and **api_keys** — scaffolded for a future paid tier (not wired
  to any payment provider; api_keys stores only a key hash).
- **test_results** `(id PK, user_id FK, enc, vector JSON, bank_version, answer_mode,
  test_mode, label, precision JSON NULL, created_at, UNIQUE(user_id, enc))`. The
  `precision` column (per-axis `{count, sigma}` for the composite, §5.8) is added by a
  lazy `ALTER TABLE` on boot, guarded by a `PRAGMA table_info` check — an existing DB
  upgrades in place and old rows stay NULL (treated as legacy, σ=25).
- Indexes on each `user_id`.

### 17.2 `users.js` — operations
- **Passwords**: scrypt (`N=16384, r=8, p=1, keylen=64`), per-user 16-byte salt,
  stored as `scrypt$N$r$p$saltHex$hashHex`; verified with `timingSafeEqual`. Never
  logged or returned.
- Registration validation: name 2–120 chars, valid email ≤200, password 8–200,
  birth year 1900–`CURRENT_YEAR (2026)`.
- `publicUser(row)` never leaks `password_hash`.
- Sessions: 32-byte hex token, **30-day TTL**, expiry checked and swept on read.
- `seedAdmin()`: creates one admin row from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env on
  first boot only (so the literal password never lives in the repo).
- Saved results: `saveResult` is idempotent per `(user, enc)`; `listResults`,
  `deleteResult`.

### 17.3 `routes.js` — `/api/auth/*`
`init()` **never throws** — if the DB can't open, accounts are disabled and
`/api/auth/*` returns clean JSON (503, but `/me` returns `{user:null,
accounts_available:false}` so pages don't error). Sessions are an **httpOnly cookie
`pol_session`** (SameSite=Lax, Secure unless `COOKIE_INSECURE=1`); user profiles are
cached in memory ~30s. Endpoints: `register`, `login` (rate-limited 10/15min per IP),
`logout`, `GET me`, `GET subscription` (scaffold), `GET/POST results`, `DELETE
results/:id`. Exposes `currentUser(req)` and `isAdminSession(req)` for the Analyzer.

---

## 18. Tooling (`tools/`)

- **`audit.js`** — the **deploy gate**. Imports the same ES modules the browser uses.
  Loads/validates the bank; prints a per-axis health table and **fails** (nonzero
  exit) on any: validation error, axis <12 items, keying imbalance >65%, an axis
  absent from the core subset. Runs archetype fixtures (distrust+restricted ≠
  populism; Strong-tier cap; libertarian/centrist/national-populist matches), scoring
  fixtures (all-50→0, keying signature, classic map, legacy migration, consistency,
  bootstrap determinism, attention exclusion), the **top-up merge safety** fixtures
  (pending excludes attention; changed/reused ids dropped not merged; scoreRun agrees
  with computeScores), the **precision composite** fixtures (inverse-variance,
  σ-floor 3.0, drift epoch, legacy σ=25), the **drift bucketing** fixture (n≥3
  omission + genre-mix + mean + lr), the **Daily Brief** fixtures (clustering,
  rewrite→pass / persistent→park, item schema, feed.xml well-formed + escaped), mode
  sizing (quick 100 / normal 250 / deep 400 numbered + 3 unnumbered checks each; every
  mode serves all anchors), nation coverage, and the calibration check. Run before
  every deploy.
- **`calibrate.js`** — asserts, from **stored analyses only** (no live calls), that
  reference outlets' mean `mkt` scores hold the expected ascending order
  (Jacobin < The Nation < NYT < WSJ < National Review < Reason) within a 3-point
  tolerance. Wired into the audit.
- **`set-role.js`** — `node tools/set-role.js <email> admin|user` (or `--list`),
  operates directly on the SQLite DB. Note the ~30s server profile cache.
- **`centroids.js`** — reporting: mean 22-axis vector per self-chosen crowd label
  (for future archetype recalibration). Never mutates.
- **`itemstats.js`** — reporting: per-item n/mean/sd + item-total correlation, flags
  weak items (r<0.15 at n≥100) as pruning candidates. Never mutates.
- **`brief-draft.js`** — CLI/timer entry point: inits the analyzer pipeline + brief
  store, then drafts **one** Daily Brief for a date (default today, UTC). Only ever
  writes a **draft**; never publishes. Exit 0 on success or a clean budget abort.

---

## 19. Deployment

- **Droplet** `134.122.115.115`, app at `/opt/politest`, systemd service `politest`,
  Node process on loopback `127.0.0.1:3200`, behind **Caddy** (auto-TLS via Let's
  Encrypt). Domain `politeion.com` is **grey-cloud (DNS-only)** in Cloudflare so
  Caddy's HTTP-01 ACME challenge works.
- **`deploy/politest.service`** (systemd): `Type=simple`, runs `node server.js` as an
  unprivileged user, sets `HOST/PORT/STORE_FILE/ANALYSES_FILE/USAGE_FILE/AUTH_DB`
  under `/opt/politest/store`, reads secrets from `EnvironmentFile=-/etc/politeion/
  analyzer.env` (root:root 0600 — systemd injects then drops privileges, so the app
  never reads the file). Hardening: `NoNewPrivileges`, `ProtectSystem=strict`,
  `ProtectHome`, `PrivateTmp`, `ReadWritePaths=/opt/politest/store`, restart on
  failure.
- **`deploy/politeion.com.Caddyfile`**: `politeion.com` serves `/opt/politest`
  statically (`file_server`, zstd/gzip), reverse-proxies `path /api/* /feed.xml` to
  `127.0.0.1:3200`, and sets `Cache-Control: no-cache` on `*.html/js/css/json`.
  `www` and the old hostnames 301-redirect to the apex (the `#r=…` fragment survives
  the redirect client-side).
- **Daily Brief units**: `deploy/politest-brief.service` (oneshot, runs
  `node tools/brief-draft.js` as the same user, same EnvironmentFile, same hardening
  incl. `ReadWritePaths=/opt/politest/store`) + `deploy/politest-brief.timer`
  (`OnCalendar=*-*-* 10:00:00 UTC`, `Persistent=true`). Drafting **never** publishes;
  `feed.xml` is written into the writable store dir and served by the app at
  `/feed.xml`.
- **Env** (`/etc/politeion/analyzer.env`): `ANTHROPIC_API_KEY`, `PROVIDER=anthropic`,
  `MODEL` (e.g. `claude-sonnet-5`), `MONTHLY_BUDGET_USD`, first-boot `ADMIN_EMAIL`/
  `ADMIN_PASSWORD`, optional `ANALYZER_ADMIN_KEY`. Optional `FEED_ORIGIN` (defaults
  `https://politeion.com`).
- **Deploy**: `cd /opt/politest && git pull && sudo systemctl restart politest`.
  Static-only changes need just `git pull` (Caddy serves from disk; hard-refresh for
  cached JS/CSS). The droplet has a **read-only** deploy key (can't push). Durable
  `store/` survives pulls and restarts.
- Full step-by-step: `deploy/RUNBOOK.md` (Steps 1–12, including the Node 22.5+ upgrade
  for accounts, the recalibration procedure, and the Daily Brief setup).

---

## 20. Security invariants (must hold in any rebuild)

1. **Rubric is IP.** `data/analyzer_system_prompt.md` and its hash are never returned
   to any client. `/api/rubric` and the Data page serve only `rubric_summary.md` +
   version.
2. **Article bodies are transient.** Only scores, metadata, rubric stamp, and ≤25-word
   evidence quotes persist.
3. **SSRF.** Every outbound fetch (including the WordPress fallback) resolves DNS
   first, validates and pins to a public IP, rejects private/reserved/link-local/
   CGNAT and IP-literals, allows http(s) only, ≤3 re-validated redirects, 25MB/15s
   caps.
4. **Passwords** scrypt-hashed with per-user salt; never logged or returned;
   `timingSafeEqual` comparison.
5. **Operator detail is admin-gated** — model, token usage, spend, hashes appear in
   `/api/analyzer/stats` and `/api/analysis/:id` only for an admin (cookie session or
   `ANALYZER_ADMIN_KEY` header).
6. **Question weights are proprietary** — the public questions page shows category
   chips only (no weight, direction, severity, or pair). (Note: `questions.json` is
   still fetched client-side for scoring, so the weights are technically retrievable
   from that file; moving scoring server-side would be required to fully hide them.)
7. **No secrets in git.** `store/`, `.env*`, `*.log`, `.claude*` are gitignored.
8. **Crowd data is anonymous** — 22 scores + mode + bank + per-item answers + optional
   self-label; no names, IPs, or timestamps; v1/v2 clouds never mixed.
9. **Daily Brief never auto-publishes** — drafting produces a `draft`; a human admin
   approves each edition. Certification analyses (`origin:"brief"`) are internal
   receipts, excluded from public analyzer lists. `feed.xml` is written into the
   writable `store/` (never the read-only web root) and served by the app. The brief
   drafting prompt (`brief_system_prompt.md`, `BRIEF_VERSION`) is reviewed/versioned
   like the rubric. No source article bodies persist (same transient rule).

---

## 21. Suggested build order (from empty directory)

1. `js/axes.js` (the model) → `js/leftright.js`.
2. `css/style.css` tokens + shell; `js/app.js` shell/theme/loader/codec.
3. `data/questions.json` + `js/scoring.js`; stand up `index.html` + `test.html` +
   `results.html` with local-only scoring (no backend yet).
4. `js/charts2d.js` (bar readout + quadrant) → wire into results.
5. `js/archetypes.js` + `data/archetypes.json` (+ mirror) and `js/figures.js` +
   `data/figures.json`; add archetype/figure sections to results.
6. `js/charts3d.js` + `explore3d.html`.
7. `server.js` crowd endpoints + JSONL store; wire results' crowd compare + contribute.
8. `tools/audit.js` as the gate; keep it green from here on.
9. Analyzer: `rubric.js` (+ the private prompt & public summary) → `provider.js` →
   `fetch-url.js` → `validate.js` → `store.js` → `budget.js` → `analyze.js` →
   `routes.js`; then `analyze.html` / `article.html` / `profile.html` /
   `analyzer-ui.js` and `data.html` / `questions.html`.
10. Accounts: `auth/db.js` → `users.js` → `routes.js`; then `login.html` /
    `account.html` and the results-page save flow.
11. Drift (Part A): `store.timeSeries` + trend routes → `charts2d.lineChartSVG` →
    `analyzer-ui.renderTrend` in `profile.html`.
12. Precision composite (Part B): `js/precision.js` (`combineRuns`) + `precision`
    column + `results.html` "Refined position" + the σ halo.
13. Daily Brief (Part C): `brief/{cluster,sources,certify,store,draft,routes}.js` +
    `brief_system_prompt.md` + `brief_sources.json` → `brief.html` + the
    `account.html` admin surface → `tools/brief-draft.js` + the systemd timer.
14. Deploy: systemd units (API + brief timer), Caddyfile, env file, DNS; `RUNBOOK.md`.

Every step keeps `node tools/audit.js` passing and honors §1 and §20.
