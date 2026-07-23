# Deploy runbook — DecaCompass at `politest.profileher.com`

DecaCompass is a **static** site (HTML/CSS/JS/JSON + Three.js from cdnjs). There is
**no Node process, no systemd unit, and no loopback port** — Caddy serves the files
directly. This is simpler than the generic handoff template, which assumes a Node app.

Nothing here touches ProfileHer. We only **add** one subdomain and **append** one
Caddy block. Ports 3000/3100/3200 are irrelevant to us — we use none.

Quick facts:
- Droplet: `134.122.115.115`, apps in `/opt/<name>`, service user `profileher`
- Our path on the droplet: **`/opt/politest`**
- Our hostname: **`politest.profileher.com`**
- Caddy config: `/etc/caddy/Caddyfile` (append-only) · reload with `sudo systemctl reload caddy`

---

## Division of labor
- **Claude (done):** app code + `deploy/politest.Caddyfile` + this runbook, all in the repo.
- **Owner (you):** create the GitHub repo, add the Cloudflare DNS record, run the droplet
  commands below. Claude cannot SSH to the droplet, edit Cloudflare, or create the repo.

---

## Step 1 — GitHub repo — DONE
`github.com/whertz2105/politest` exists and the code is pushed (branch `main`). The
droplet's existing read-only deploy key can clone org repos; if cloning fails with a
permissions error, either make the repo public or add a deploy key (see the handoff §4c).

## Step 2 — DNS (owner, in Cloudflare)
Add an **A record**: `politest` → `134.122.115.115`.

DecaCompass is a plain request/response static site (no SSE/WebSockets), so **orange
cloud (proxied) is fine** — you get Cloudflare caching + DDoS protection for free. The
Caddy block sends `Cache-Control: no-cache` on the app files so deploys aren't masked by
stale caches; if you ever still see an old version after a deploy, purge the Cloudflare
cache (or toggle Development Mode briefly).

## Step 3 — Get the code on the droplet (owner)
```bash
sudo git clone git@github.com:whertz2105/politest.git /opt/politest
sudo chown -R profileher:profileher /opt/politest
```
No `npm install` — there are no dependencies. Directories are world-readable (755/644)
after clone, so the Caddy user can serve them.

## Step 4 — Add the Caddy route (owner)
```bash
sudo bash -c 'cat /opt/politest/deploy/politest.Caddyfile >> /etc/caddy/Caddyfile'
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```
⚠️ **Append only.** Never edit or remove the existing `profileher.com`,
`www.profileher.com`, or `staging.profileher.com` blocks.

## Step 5 — Verify
```bash
curl -I https://politest.profileher.com            # expect: HTTP/2 200
curl -sI https://politest.profileher.com/data/questions.json | grep -i cache-control
```
The HTTPS cert issues automatically once DNS resolves to the droplet (ports 80/443 are
already open). First load may take a few seconds while Caddy fetches the cert.

Then open `https://politest.profileher.com` in a browser and confirm: the landing page,
the test flow, results (bars + charts + archetype match), the 3D explorer, and the data
page all work.

## Step 6 — Future deploys (owner)
```bash
cd /opt/politest && git pull            # that's it — static files, no restart needed
```
(If Cloudflare shows a stale version, purge its cache.)

---

## Optional: path-based instead of a subdomain (`profileher.com/politest`)
Not recommended (the app uses root-relative loading that assumes it owns its host), but
possible. Inside the existing `profileher.com { … }` block, **before** ProfileHer's
handler, add:
```
handle_path /politest/* {
	root * /opt/politest
	file_server
}
```
DecaCompass links between pages with relative URLs (`test.html`, `css/style.css`, …), so
`handle_path` (which strips the prefix) mostly works — but a bare `/politest` with no
trailing slash won't resolve relative assets correctly, and shared `#r=` links must carry
the `/politest/` path. The subdomain avoids all of this. **Prefer the subdomain.**

## Rename note
The public app name is the constant `APP_NAME` in `js/axes.js` (currently "DecaCompass").
The subdomain slug `politest` and the app name are independent — changing one doesn't
require changing the other.
