# Politeion — Handoff for a new Claude Code instance

Read this first. It captures what the project is, how it's built, how it deploys,
and the non-obvious rules and gotchas. Pair it with `deploy/RUNBOOK.md` (ops steps).

---

## 1. What this is

**Politeion** (live at **https://politeion.com**) is two things in one codebase:

1. **A 22-axis political compass** — a self-test (`test.html`) that scores the
   user on 22 independent axes, with results (`results.html`), a 3D explorer
   (`explore3d.html`), archetype/figure matching, and an anonymous crowd
   comparison.
2. **The Analyzer** (`analyze.html`) — paste a URL or article text and get a
   22-axis **stance** profile of the *article*, its *writer*, and its *source*,
   plus a traditional left↔right placement. Backed by the Anthropic API.

Plus **accounts** (`login.html` / `account.html`) — email+password login,
saved test results, and an admin role that unlocks the Analyzer's operator tools.

It is a **static frontend + a tiny Node backend**. Caddy serves the HTML/CSS/JS
directly; a stdlib-only Node service (`server.js`, loopback `:3200`) powers all
`/api/*` routes.

---

## 2. Hard constraints (do not break these)

- **No build step.** Plain HTML + vanilla JS **ES modules**. No bundler, no JSX.
- **No npm dependencies.** Backend is **Node standard library only**
  (`http`, `fs`, `crypto`, `node:sqlite`, `https`, `dns`, `net`). Frontend loads
  **Three.js from cdnjs** for the 3D view only — nothing else external.
- **Keep files under ~500 lines.** Split when needed.
- **Never commit secrets.** No keys, no `.env`, no DB files. `store/` and env
  files are gitignored. (An admin password once leaked into history — see §9.)
- **Read a file before editing it.** Match surrounding style/idiom.
- **The Analyzer's scoring prompt is proprietary IP** — see §8. Never serve it.
- **`node:sqlite` needs Node 22.5+** — see §6/§9.

---

## 3. Architecture & file map

```
server.js                 stdlib HTTP server; static fallback + dispatch to:
  auth/routes.js          → /api/auth/*
  analyzer/routes.js      → /api/analyze, /api/analysis/:id, /api/writer,
                            /api/source, /api/analyzer/stats, /api/rubric
  (crowd, inline)         → /api/results, /api/label, /api/compare, /api/stats

js/  (frontend ES modules, also imported by tools/audit.js so app & tests can't drift)
  axes.js                 SINGLE SOURCE OF TRUTH: 22 axes (key/label/poles), APP_NAME
  leftright.js            SINGLE SOURCE OF TRUTH: US left↔right composite (weights +
                          leftRightScore + lrLabel). Imported by frontend AND backend
                          (server.js passes leftRightScore into the analyzer store).
  scoring.js              test scoring, modes, attention/consistency, bootstrap bands
  archetypes.js/-data.js  salience-weighted RMS archetype matcher
  figures.js              historical-figure nearest matching
  charts2d.js             inline-SVG bar readout, quadrant charts, tooltips, modal
  charts3d.js             Three.js 3D explorer
  app.js                  shell/nav, theme, progress, shareable-vector codec,
                          loadAccountResultIntoHash()
  analyzer-ui.js          renders article/profile pages + left↔right bars + mini bars

analyzer/  (backend, CommonJS)
  rubric.js               loads data/analyzer_system_prompt.md (the private prompt),
                          content hash, RUBRIC_VERSION (currently "v3"); exposes
                          rubricSummary() (public methodology) — NOT the prompt
  provider.js             Anthropic Messages API over raw https. Model from env,
                          never hardcoded. Prompt caching (rubric in a cache_control
                          system block). Disables thinking + gates temperature by
                          model (see §9). max_tokens 2000, 60s timeout.
  fetch-url.js            SSRF-hardened fetch + readability extraction + byline/domain.
                          Browser-UA retry on 403; WordPress REST fallback for
                          client-rendered/blocked pages.
  validate.js             evidence-substring check, >8 axes, ±100, injection flag
  store.js                JSONL store of analyses; article/writer/source aggregation;
                          URL dedupe; recent list; rankSources/rankWriters (leaderboard)
  budget.js               token/usage logging; monthly spend vs cap
  analyze.js              serial worker queue; per-IP rate limit; dedupe; parse-retry;
                          force re-run (admin, replaces in place)
  routes.js               HTTP surface; isAdmin (admin session OR ANALYZER_ADMIN_KEY)

auth/  (backend, CommonJS)
  db.js                   node:sqlite schema (users, sessions, subscriptions,
                          api_keys, test_results). Lazy require so it can't crash
                          the server on old Node.
  users.js                scrypt hashing, register/login, sessions, admin seed,
                          saved results
  routes.js               /api/auth/* (register/login/logout/me, results, subscription);
                          currentUser(req), isAdminSession(req)

tools/
  audit.js                DEPLOY GATE — per-axis health + unit tests + calibration.
                          Exits nonzero on any flag. Run before deploying.
  calibrate.js            asserts stored reference-outlet mkt ordering (Jacobin <
                          Nation < NYT < WSJ < Nat Review < Reason); wired into audit
  set-role.js             promote/demote an account: node tools/set-role.js <email> admin
  centroids.js/itemstats.js  reporting only

data/
  analyzer_system_prompt.md   PROPRIETARY scoring rubric (v-hashed; NEVER served)
  rubric_summary.md           PUBLIC methodology summary (served at /api/rubric)
  questions.json              400 numbered questions (v2, 22 axes) + 3 attention
                              checks (ids 901–903, never numbered; served on top
                              of every mode's target, so quick = 100 + 3)
  archetypes.json, figures.json

deploy/  RUNBOOK.md (ops), politest.service (systemd), *.Caddyfile
store/   (gitignored, on droplet) results.jsonl, analyses.jsonl, analyzer-usage.jsonl,
         politeion.db (+ -wal/-shm)
```

---

## 4. Subsystem notes

**Compass axes** live in `js/axes.js` — 22 keys, positive pole first. Everything
derives from it; growing/renaming axes is a data edit there.

**Left↔right composite** (`js/leftright.js`) maps partisan-coded axes to a single
−100..+100 score (+ = right). It is the **one source** shared by front and back;
the article bar, the profile bar, the recent mini-bars, and the leaderboard all use
it. A **source/writer's** lean is the **mean of its articles' individual leans**
(computed over each article's full axis set), NOT a recompute from thresholded
aggregate axes — that fix is why MSNBC reads far-left, not centrist. Straight
reports (no detected lean) are excluded from the mean.

**Analyzer pipeline** (`analyzer/analyze.js`): dedupe by URL (no tokens) → SSRF
fetch/extract (body transient) → budget gate → one model call with the cached
rubric → parse (one repair retry) → validate → log usage → persist scores +
metadata + evidence quotes (≤25 words). **Article bodies are never stored.**
Abuse controls: 5 submissions/hr per IP, global queue cap 50, single serial worker.
Admin (session or `ANALYZER_ADMIN_KEY` header) bypasses the rate limit and can
**force re-run** (replaces the analysis in place, same id).

**Fetch fallbacks** (`analyzer/fetch-url.js`): default bot UA → on 403/401/429/451
retry as a browser → if still blocked or client-rendered, try the site's
**WordPress REST API** (`/wp-json/wp/v2/posts?slug=…`, author via `/users/{id}`).
This rescues National Review, NewsNation, and most WordPress news sites.

**Accounts**: SQLite via `node:sqlite`. Passwords scrypt-hashed. Sessions = httpOnly
cookie. Admin is a normal row seeded once from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env.
An **admin session unlocks the Analyzer operator tools** via cookie. If `node:sqlite`
is unavailable (old Node), accounts **degrade gracefully** and the rest of the app
keeps running.

---

## 5. Runtime config (env, injected via systemd EnvironmentFile)

`/etc/politeion/analyzer.env` on the droplet (root:root 0600 — never in git):
```
ANTHROPIC_API_KEY=...          # the model key
PROVIDER=anthropic
MODEL=claude-sonnet-5          # model comes from env, NEVER hardcoded
MONTHLY_BUDGET_USD=15          # hard cap; jobs refused past it
ADMIN_EMAIL=admin              # first-boot admin seed (optional after seeded)
ADMIN_PASSWORD=...             # first-boot only; remove after seeding
ANALYZER_ADMIN_KEY=...         # optional header/URL admin bypass (?admin=KEY)
```
`politest.service` also sets `HOST/PORT/STORE_FILE/ANALYSES_FILE/USAGE_FILE/AUTH_DB`
(all under `/opt/politest/store`). Provider adapter reads `PROVIDER/MODEL/API_KEY/
BASE_URL`; the Anthropic path is the one implemented.

---

## 6. Deployment

- **Droplet:** `134.122.115.115`, app at `/opt/politest`, service `politest`,
  loopback `:3200`, behind **Caddy** (TLS via Let's Encrypt). Domain `politeion.com`
  is **grey-cloud (DNS-only)** in Cloudflare so Caddy's ACME works.
- **Git flow:** pushes go to `github.com:whertz2105/politest` `main` (this dev env
  has write access). The **droplet has a read-only deploy key** and cannot push.
- **Deploy:** on the droplet, `cd /opt/politest && git pull && sudo systemctl
  restart politest`. Static-only changes need just `git pull` (Caddy serves from
  disk; hard-refresh for cached JS/CSS). Unit-file changes need
  `sudo cp deploy/politest.service /etc/systemd/system/ && sudo systemctl
  daemon-reload` first. Full steps in `deploy/RUNBOOK.md` (Steps 1–11).
- **Node 22.5+ required for accounts** (`node:sqlite`). If the droplet is on Node
  20, accounts are auto-disabled (analyzer still works); upgrade per RUNBOOK Step 11.
- **You (Claude) cannot reach the droplet.** The user runs deploy commands. Give
  them exact commands and verification curls.
- Durable stores under `/opt/politest/store/` are gitignored and survive `git pull`
  and restarts — never delete them.

---

## 7. Testing & verification

- **`node tools/audit.js`** — the deploy gate. Must pass (exits nonzero on any
  flag). Includes the calibration check.
- **`node tools/calibrate.js`** — reference-outlet mkt ordering (no live fetches).
- **Syntax:** `node --check <file>` for backend; for a page's inline module, extract
  the `<script type="module">` and `node --check` it.
- **Frontend imports:** `node --input-type=module -e 'await import(pathToFileURL(...))'`
  works because the ES modules don't touch the DOM at import time.
- There is a **scratchpad pipeline test** (stubs `provider.callModel`, exercises the
  full analyze pipeline, dedupe, force re-run, budget, aggregation) that has been
  kept in the session scratch dir, not the repo — recreate it if you need it.
- **Visual checks:** the user's Chrome can reach `politeion.com` via the
  `claude-in-chrome` MCP tools. Two browsers are usually connected (Windows +
  Linux) — you must ask which to use, then `select_browser`, `tabs_context_mcp`,
  `navigate`, `computer screenshot`. You **cannot** see local/droplet-only changes
  until deployed.

---

## 8. Security-critical invariants

- **Rubric is IP.** `data/analyzer_system_prompt.md` is the private scoring prompt.
  `/api/rubric` and the Data page serve **only** `data/rubric_summary.md` (the
  public methodology) + the version. Never return the prompt or its hash publicly.
- **Article bodies are transient** — only scores, metadata, rubric hash, and
  evidence quotes (≤25 words) are persisted; never the full text.
- **SSRF:** `fetch-url.js` resolves DNS first and pins to the validated IP, rejects
  private/reserved/link-local **and 100.64.0.0/10 (CGNAT)** and IP-literals, http(s)
  only, ≤3 re-validated redirects, 25 MB / 15 s caps. Keep every fetch path (incl.
  the WP fallback) behind these guards.
- **Passwords** are scrypt-hashed with per-user salt; never logged or returned.
- **Operator detail is admin-gated** — model, token usage, spend, hashes appear in
  `/api/analyzer/stats` and `/api/analysis/:id` only for an admin (session or key).

---

## 9. Known issues / gotchas / open items

- **Node version:** `node:sqlite` = Node 22.5+. On older Node the app runs but
  accounts are disabled (`[auth] accounts DISABLED` in the journal).
- **Model-specific request shaping (`provider.js`):** newer models (Sonnet 5,
  Opus 4.7/4.8, Fable/Mythos) **reject `temperature`** (400) — sent only to older
  models. Thinking is **disabled** (`{type:"disabled"}`) for this JSON-extraction
  task on models that allow it (omitted for Fable/Mythos), because default adaptive
  thinking ate the `max_tokens` budget and truncated the JSON ("invalid JSON after a
  repair attempt", frequent on long Fox articles). There's a self-heal that retries
  with a bare body on a 400 mentioning temperature/thinking.
- **Rubric/MODEL change = recalibration event.** Editing the prompt or `MODEL`
  changes the content hash meaning; bump `RUBRIC_VERSION` in `analyzer/rubric.js`
  and rerun `tools/calibrate.js`. Currently **v3** (added the "hostile coverage is
  opposition, not endorsement" rule and the required `neutral_summary` field).
- **Leaked secret in git history:** the admin password was committed once
  (`51aae6e`), removed from HEAD (`700eab6`). A `git filter-branch` scrub was
  prepared but a force-push is blocked in this env and the droplet key is read-only.
  Advice given: **rotate** the admin password (real fix) and optionally rewrite
  history from a write-access clone. Treat that specific password as compromised.
- **Canonical-domain quirk:** syndicated articles can canonical to a partner domain
  (a NewsNation article resolved to `wfla.com`). Sources group by the canonical
  registrable domain — usually correct, occasionally surprising.
- **Byline coverage:** writer profiles only group when a byline is captured. Some
  sites (NewsNation) fully lock down their WP `/users` endpoint, so those bylines
  come only from the article HTML (the 200 path), not the block-fallback path.
- **Subscriptions/paid API access are scaffolded only** (DB tables +
  account-page placeholder) — not built.
- **bfcache buttons:** Back/forward can restore a page with a disabled button;
  `pageshow` handlers re-enable the Analyze and re-run buttons — keep that pattern
  if you add async-disabled buttons.

---

## 10. Working conventions

- **The two `CLAUDE.md` files are ruflo auto-generated noise** (swarm/MCP/hooks
  boilerplate). The real workflow is: read → edit directly → `node tools/audit.js`
  → commit → push. Ignore the ruflo MCP/agent instructions unless the user asks.
- **Commit style:** imperative subject, wrapped body explaining the *why*. **Do
  NOT add a `Co-Authored-By` trailer** (project rule; no `attribution.commit` set).
- **Always** run the sensitive-file guard before committing
  (`git diff --cached --name-only | grep -iE 'store/|analyzer\.env|secret|\.db'`).
- Push to `origin main`. Transient GitHub 5xx/auth blips happen — retry.

---

## 11. Where things stand (most recent work)

Recent commits (newest first) reworked the Analyze page and fixed analyzer
robustness: Data-page cleanup (methodology vs question bank, collapsed questions
table, markdown fixes); disable-thinking JSON fix; the "most biased" outlet/author
**leaderboard** + side-by-side resizable split with two-row source-tagged recent
cards; **source/writer lean = mean of article leans**; WordPress fallbacks (403 +
client-rendered) and browser-UA retry; byline via WP users API; accounts (login,
SQLite, saved results, admin CLI, graceful no-sqlite degrade); and the left↔right
bar work. See `git log` for the full sequence.

**If you're picking up cold:** confirm the droplet's Node version and whether the
latest `main` is deployed (`git pull` + `systemctl restart politest`), then verify
`https://politeion.com/api/analyzer/stats` returns JSON and the Analyze/Data pages
render. Ask the user before any outward-facing action (deploy, force-push, sending).
