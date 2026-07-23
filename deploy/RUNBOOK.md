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

---

## The API (for reference)
- `POST /api/results` `{vector, mode, bank, items}` — store a shared completed result. → `{ok, id, count}`
- `POST /api/label` `{id, label}` — attach an optional self-chosen archetype label to a submitted result.
- `POST /api/compare` `{vector, bank}` — read-only: `{count, percentiles, sample, axisOrder}` for the crowd graph, **per bank version** (v1/v2 never mixed). Does not store.
- `GET  /api/stats` — `{count, byBank}`.

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
