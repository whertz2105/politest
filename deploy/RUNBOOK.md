# Deploy runbook — Politeion at `politest.profileher.com`

Politeion is a **static frontend + a tiny Node API**. The pages/JS/CSS/JSON are
served directly by Caddy; a small standard-library Node service (`server.js`, no npm
dependencies) runs on loopback `:3200` and powers the **crowd-comparison** feature
(storing each completed result and reporting how a result compares to everyone). This
matches the handoff's Node-service pattern (systemd unit + Caddy reverse-proxy), but
only the `/api/*` paths hit Node — everything else is static.

Nothing here touches ProfileHer. We **add** one subdomain, **append** one Caddy block,
and add one systemd unit named `politest`. We use port **3200** (free per the handoff);
ProfileHer's 3000/3100 are untouched.

Quick facts:
- Droplet: `134.122.115.115`, apps in `/opt/<name>`, service user `profileher`, Node 20 present
- Our path: **`/opt/politest`** · service **`politest`** · loopback port **3200**
- Crowd data (durable): **`/opt/politest/store/results.jsonl`** (append-only; gitignored; survives restarts)
- Caddy config: `/etc/caddy/Caddyfile` (append-only) · reload `sudo systemctl reload caddy`

Privacy note: completed results are stored **anonymously** — only the 18 axis scores, no
names, accounts, or PII. The landing page discloses this.

---

## Step 1 — GitHub repo — DONE
`github.com/whertz2105/politest` exists and the code is pushed (branch `main`). The
droplet's read-only deploy key can clone org repos; if cloning fails on permissions,
make the repo public or add a deploy key (handoff §4c).

## Step 2 — DNS (owner, in Cloudflare)
Add an **A record**: `politest` → `134.122.115.115`.
Plain request/response app (the API is short JSON calls, no streaming), so **orange
cloud (proxied) is fine**. The Caddy block sends `Cache-Control: no-cache` on app files;
if a deploy ever looks stale, purge the Cloudflare cache.

## Step 3 — Get the code on the droplet (owner)
```bash
sudo git clone git@github.com:whertz2105/politest.git /opt/politest
sudo mkdir -p /opt/politest/store                      # durable crowd store lives here
sudo chown -R profileher:profileher /opt/politest
```
No `npm install` — the API uses only the Node standard library.

## Step 4 — Install & start the API service (owner)
```bash
sudo cp /opt/politest/deploy/politest.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now politest
journalctl -u politest -f          # expect: "Politeion API on http://127.0.0.1:3200"
curl -s http://127.0.0.1:3200/api/stats     # {"count":0} before anyone has taken it
```

## Step 5 — Add the Caddy route (owner)
```bash
sudo bash -c 'cat /opt/politest/deploy/politest.Caddyfile >> /etc/caddy/Caddyfile'
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```
⚠️ **Append only.** Never edit or remove the existing `profileher.com`,
`www.profileher.com`, or `staging.profileher.com` blocks.

## Step 6 — Verify
```bash
curl -I https://politest.profileher.com                      # HTTP/2 200 (static)
curl -s https://politest.profileher.com/api/stats            # {"count":N}
```
Then open `https://politest.profileher.com`, take the test, and on the results page open
**Compare** → toggle **Historical figures** / **Everyone who took this test**. Also
click through the 3D explorer and data page.

## Step 7 — Future deploys (owner)
```bash
cd /opt/politest && git pull && sudo systemctl restart politest
```
Static changes don't strictly need the restart, but restarting picks up any `server.js`
change and is harmless. **The crowd store in `/opt/politest/store/` is gitignored and is
NOT touched by `git pull` or the restart — it persists across deploys.**

## Step 8 — Serve at `politeion.profileher.com` (owner)
The app rebranded to **Politeion**. To front it on a matching hostname (reusing the same
`/opt/politest` files, `:3200` API, and crowd store — no second deployment):

1. **Cloudflare:** add an **A record** `politeion` → `134.122.115.115` (orange cloud is fine).
2. **Caddy:** append the new block and reload:
   ```bash
   cd /opt/politest && git pull      # gets deploy/politeion.Caddyfile
   sudo bash -c 'cat /opt/politest/deploy/politeion.Caddyfile >> /etc/caddy/Caddyfile'
   sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   sudo systemctl reload caddy
   curl -I https://politeion.profileher.com      # HTTP/2 200 once DNS + cert settle
   ```
`politest.profileher.com` keeps working; both hostnames serve the same app. (To retire the
old name later, just delete its block from the Caddyfile and reload — optional.)

## Step 9 — Primary domain: `politeion.com` (supersedes Step 8)
Serve the app on its own domain and redirect the old hostnames to it. Same root
(`/opt/politest`), same API (`127.0.0.1:3200`), same store — routing only. **Do not
touch `/opt/politest/store/`.**

1. **DNS (Cloudflare, in the politeion.com zone).** Add both as **DNS-only (grey cloud)** —
   proxied/orange breaks Caddy's HTTP-01 cert challenge:
   - `A  @    → 134.122.115.115`
   - `A  www  → 134.122.115.115`
2. **Caddyfile.** First get to a known-good config, then swap the blocks:
   ```bash
   cd /opt/politest && git pull
   sudo caddy validate --config /etc/caddy/Caddyfile     # clean up any orphaned (old cyberstudy) blocks first
   ```
   Edit `/etc/caddy/Caddyfile`: **delete** the old `politeion.profileher.com` and
   `politest.profileher.com` serving blocks, then paste the contents of
   `deploy/politeion.com.Caddyfile` (apex serving block + `www`→apex redirect +
   old-subdomains→apex redirect). Leave the `profileher.com` / `www` / `staging`
   blocks untouched. Then:
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
3. **Verify (certs issue once DNS resolves + :80/:443 are open):**
   ```bash
   curl -I https://politeion.com                 # 200, valid cert
   curl -I https://www.politeion.com             # 301 -> https://politeion.com/
   curl -I https://politeion.profileher.com      # 301 -> https://politeion.com/
   curl -s https://politeion.com/api/stats       # {"count":N,...} — same store
   ```
   Shared `#r=…` links survive the 301 automatically — the fragment never reaches the
   server; the browser re-appends it after the redirect. No server-side fragment handling.

Bonus: because `politeion.com` is grey-cloud (Caddy serves directly, no Cloudflare
proxy), the origin `Cache-Control: no-cache` headers now actually reach the browser —
so the stale-`.js`-after-deploy problem disappears on the apex domain (no cache purge needed).

## Step 10 — The Analyzer (article → 22-axis stance profile)

The Analyzer adds server-side article analysis via the Anthropic API. It is part of
the same `server.js` process and the same static site — no second service, no npm
deps. Inference is **Anthropic API only**: no model runs on the droplet and no
personal hardware is contacted.

1. **Secret/config file (already provisioned).** `/etc/politeion/analyzer.env`,
   `root:root 0600`, holding:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   PROVIDER=anthropic
   MODEL=claude-haiku-4-5
   MONTHLY_BUDGET_USD=25
   ```
   The **model is never hardcoded** — it comes from `MODEL`. The key never enters
   the repo, the app process, or any client response.
2. **Wire it into the unit and restart.** The updated `politest.service` reads the
   env file via `EnvironmentFile=-/etc/politeion/analyzer.env` (systemd, as root,
   injects the vars *before* dropping to `User=profileher`, so the 0600 root file
   need not be readable by the app user):
   ```bash
   cd /opt/politest && git pull
   sudo cp /opt/politest/deploy/politest.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl restart politest
   journalctl -u politest -n 20     # confirm it started
   ```
3. **Verify:**
   ```bash
   curl -s https://politeion.com/api/analyzer/stats   # provider.configured:true, model, month spend vs cap
   curl -s https://politeion.com/api/rubric | head -c 80   # published rubric + hash
   ```
   Then open `https://politeion.com/analyze.html`, paste a known op-ed URL, and
   confirm the analysis page shows a genre, per-axis scores each with a verbatim
   quote, and links to the writer/source profiles.

**Durable stores (gitignored, survive deploys — never touched by `git pull`):**
- `/opt/politest/store/analyses.jsonl` — one analysis per line: scores, metadata,
  rubric hash, evidence quotes (≤25 words). **Article bodies are never stored.**
- `/opt/politest/store/analyzer-usage.jsonl` — per-analysis token usage + est. cost.

**Budget cap.** Once the month's estimated spend reaches `MONTHLY_BUDGET_USD`, new
jobs are refused with "monthly analysis budget reached" (the stats line warns at
80%). Unset ⇒ no cap.

**Abuse controls (built in):** 5 submissions/hour per IP, global queue cap 50, a
single serial worker, anonymous submissions, results public by URL, and URL-level
dedupe (re-submitting a URL returns the stored analysis, spending no tokens).

**SSRF.** URL fetches resolve DNS first and refuse private/reserved/link-local and
`100.64.0.0/10` (CGNAT) addresses — IP-literal hosts included — allow http(s) only,
re-validate every redirect (max 3), cap the body at 25 MB (memory-safety backstop,
not an article-size limit), and time out at 15 s.

### Recalibration (rubric v1 → vN, or a MODEL change)
The rubric is `data/analyzer_system_prompt.md`, installed verbatim as **v1**; its
sha256 is stamped into every stored analysis. **Any edit to that file, or a change
to `MODEL`, is a recalibration event:** bump `RUBRIC_VERSION` in
`analyzer/rubric.js`, `git pull` on the droplet, restart, and rerun the calibration
harness. Old analyses keep their old stamp, so mixed-version data is always
distinguishable.
```bash
node tools/calibrate.js     # asserts stored reference-outlet mkt ordering; also runs inside tools/audit.js
```

---

## The API (for reference)
- `POST /api/results` `{vector, mode, bank, items}` — store a shared completed result. → `{ok, id, count}`
- `POST /api/label` `{id, label}` — attach an optional self-chosen archetype label to a submitted result.
- `POST /api/compare` `{vector, bank}` — read-only: `{count, percentiles, sample, axisOrder}` for the crowd graph, **per bank version** (v1/v2 never mixed). Does not store.
- `GET  /api/stats` — `{count, byBank}`.

Analyzer endpoints:
- `POST /api/analyze` `{url}` | `{text, byline?, outlet?, title?}` — queue an analysis (or return an existing one for a duplicate URL). → `{ok, id, existing}`. Errors: 429 rate limit, 503 queue full / budget reached.
- `GET  /api/analysis/:id` — a stored analysis (public by id).
- `GET  /api/writer?key=<name|domain>` / `GET /api/source?domain=<domain>` — aggregate profiles (axes reported at ≥3 articles; flagged analyses excluded).
- `GET  /api/analyzer/stats` — `{provider, rubric, month, counts, queue, recent}` (drives the stats line).
- `GET  /api/rubric` — the published rubric text + hash (rendered on the Data page).

Sharing is **opt-out** (on by default; a checkbox on the results page turns it off) and
stores only the 22 scores, answer mode, bank version, and anonymous per-item answers — no
PII, no IP, no timestamps. Runs that fail the attention checks are never shared. Users can
clear their local results (browser-only) from the results page; already-submitted anonymous
data is retained server-side and cannot be individually removed.

## Reporting tools (run on the droplet as needed; reporting only, never mutate data)
- `node tools/audit.js` — deploy gate (per-axis health + unit tests); exits nonzero on any flag.
- `node tools/itemstats.js` — per-item n / mean / sd / corrected item-total correlation; flags `r<0.15` at `n≥100` as pruning candidates.
- `node tools/centroids.js` — mean vector per self-chosen label, for future archetype recalibration.

If the API is ever down, the site still works: the test, results, figures comparison,
charts, and 3D all function; only the "Everyone" toggle shows an "unavailable" note.

## Historical figures
Reference points live in `data/figures.json` (schema `{ "name", "vector": { axisKey: score }, "note"? }`;
scores −100..100; missing axes default 0). The file currently holds **placeholder**
figures (flagged `"placeholder": true`) — replace their vectors with your own points and
`git pull` on the droplet. No restart needed (it's a static file).

## Optional: path-based instead of a subdomain (`profileher.com/politest`)
Not recommended (root-relative asset loading + the `#r=` share links assume the app owns
its host). Prefer the subdomain. If you must, see the handoff §7 and also route
`/politest/api/*` to `127.0.0.1:3200`.

## Rename note
Public app name = `APP_NAME` in `js/axes.js` ("Politeion"). The subdomain slug
`politest`, the service name, and the app name are independent.
