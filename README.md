# Privacy Analytics (Deno Deploy edition)

A small, self-hosted pageview tracker built to replace Plausible.io for
**esthersimsstudio.co.uk** - same idea (no cookies, no cross-site tracking,
nothing sold to anyone), but you run it and own the data.

This version targets **Deno Deploy** instead of Render, specifically so
there's a real, durable free tier: no card required to stay free, no
spin-down that drops events, and no separate database service to pay for
- Deno KV (a built-in key-value database) comes with the platform. Zero
  external npm/JSR dependencies either way - just the Deno runtime's own
  APIs (`Deno.serve`, `Deno.openKv`, Web Crypto).

## How it protects visitors' privacy

- **No cookies, no localStorage, no device fingerprinting.** The tracker
  script (`public/tracker.js`) sends only the page URL and the referrer -
  the same information every website already receives on a normal page
  load.
- **Raw IP addresses are never stored.** On the server, an incoming IP is
  used for one instant, in memory, to compute a one-way hash together with
  the user agent and a random value that changes every day (`lib/hash.js`).
  That hash is what gets saved, as `visitor_hash` - not the IP itself.
- **Yesterday's hashes become unrecomputable.** The daily random salt is
  deleted once it's more than ~2 days old (cleaned up opportunistically
  whenever a new day's salt is created - Deploy doesn't guarantee a
  long-lived background timer between requests, so this avoids relying on
  one). Even with full access to the database, nobody - including you -
  can turn a visitor_hash back into an IP, or prove the same person
  visited on two different days.
- **No third parties.** Events go straight from the visitor's browser to
  your own Deno Deploy project. Nothing is shared with an ad network, a
  data broker, or anyone else.
- **Query strings are stripped** before a page path is stored (only
  `utm_source` / `utm_medium` / `utm_campaign` are pulled out first) so
  something like `?email=...` in a URL never ends up in your analytics.

This is the same general approach Plausible, Fathom, and similar
"privacy-first" analytics tools use and publicly document - there's
nothing proprietary about the technique.

> I'm not a lawyer, and this isn't legal advice: tools built this way
> (no cookies, no persistent identifiers, nothing that identifies an
> individual) are commonly treated as not requiring a cookie-consent
> banner under UK/EU rules, in the same category as Plausible - but if
> GDPR/PECR compliance for Esther's site needs to be watertight, it's
> worth a second opinion from someone qualified.

## What you get (roughly Plausible-equivalent)

Pageviews and unique visitors over time, top pages, top referrers
(direct/social/search etc.), device/browser/OS breakdown, and UTM
campaign tracking - all on one dashboard at `/dashboard`.

**Countries are not filled in by default** - there's no free, private,
zero-dependency way to turn an IP into a country on Deno Deploy the way
Cloudflare's `CF-IPCountry` header does it for you, and adding a live
IP-geolocation API would mean sending visitor IPs to a fourth party. The
"Countries" panel will just show "Unknown" until/unless you want to add
one later (see *Extending it later* below).

## What's deliberately left out (for now)

Bounce rate, session/visit duration, and real-time "who's on the site
right now" aren't implemented - a single pageview beacon doesn't carry
enough information for those without adding more tracking. They could be
added later if you want them.

## Project layout

```
main.js              Entry point - Deno.serve, routing, CORS, auth
lib/kv.js             Opens the shared Deno KV handle
lib/hash.js           Daily-rotating-salt visitor hashing
lib/events.js         Reading/writing pageview events in KV
lib/stats.js          In-memory aggregation for the dashboard
lib/ua.js             Bot filtering + device/browser/OS parsing
public/tracker.js     The ~1KB script you embed in Webflow
public/dashboard.html Token-gated dashboard (charts, no external requests)
deno.json             Local dev tasks
```

## Running it locally

```bash
cp .env.example .env
export $(cat .env | xargs)
deno task dev     # http://localhost:8000, auto-restarts on changes
```

Visit `http://localhost:8000/dashboard`, enter your `ADMIN_TOKEN`, and
you'll see an empty (but working) dashboard. Send yourself a test event:

```bash
curl -X POST http://localhost:8000/api/event \
  -H "Origin: https://esthersimsstudio.co.uk" \
  -H "User-Agent: Mozilla/5.0 Chrome/128" \
  -d '{"u":"https://esthersimsstudio.co.uk/portfolio","r":"https://www.google.com/"}'
```

## Deploying to Deno Deploy

Deno's dashboard/CLI details can shift over time, so treat this as the
shape of it and confirm exact steps against [deno.com/deploy](https://deno.com/deploy)
when you get there:

1. Push this folder to a GitHub repo (private is fine).
2. In the Deno Deploy dashboard, create a new project and connect that
   repo, with `main.js` as the entrypoint. Deploy will build/deploy
   automatically on every push to your default branch.
3. In the project's environment variable settings, set:
   - `ADMIN_TOKEN` - a long random secret. Generate one with:
     ```bash
     deno eval "console.log(crypto.randomUUID() + crypto.randomUUID())"
     ```
   - `ALLOWED_ORIGINS` = `esthersimsstudio.co.uk`
   - `DEFAULT_SITE` = `esthersimsstudio.co.uk`
   - Leave `KV_PATH` unset - Deploy provisions a managed KV database for
     the project automatically; `Deno.openKv()` with no argument (which
     is what happens when `KV_PATH` isn't set) uses it.
4. Deploy gives you a URL like `esther-sims-analytics.deno.dev`. The free
   tier supports up to 5 custom domains too, if you'd rather use something
   like `analytics.esthersimsstudio.co.uk` (just a CNAME in your DNS, no
   Cloudflare or other proxy involved).

If you'd rather deploy from your own machine instead of connecting
GitHub, the `deployctl` CLI does the same thing:

```bash
deno install -Arf jsr:@deno/deployctl
deployctl deploy --project=esther-sims-analytics main.js
```

### On the free tier

At the time this was written, Deno Deploy's free tier includes 1M
requests/month, 20GiB of egress, and 1GB of KV storage - all comfortably
more than a single low-traffic portfolio site will ever use, with no
card required to stay on it. Worth a quick check of
[deno.com/deploy/pricing](https://deno.com/deploy/pricing) before you
commit, in case terms have changed since.

Unlike a spun-down free container, Deploy's model doesn't have a
multi-second cold start that would cause dropped pageview beacons - each
request runs in a lightweight isolate that starts near-instantly.

## Adding the tracker to Webflow

1. Open `public/tracker.js` and replace `REPLACE_WITH_YOUR_ANALYTICS_DOMAIN`
   with your deployed domain (e.g. `esther-sims-analytics.deno.dev` or
   `analytics.esthersimsstudio.co.uk`).
2. In Webflow: **Site Settings -> Custom Code -> Footer Code** (this makes
   it site-wide, not per-page), paste the whole script wrapped in
   `<script>...</script>` tags.
3. Publish the site.
4. Remove the old Plausible `<script>` tag from the same place, and cancel
   the Plausible subscription/site once you've confirmed events are
   coming through.

## Viewing your stats

`https://<your-analytics-domain>/dashboard` - enter the `ADMIN_TOKEN` once;
it's remembered in that browser via localStorage. Change the date range
with the dropdown top-right; there's a light/dark toggle next to it.

## Extending it later

Ideas that would slot in cleanly if you want them down the line:

- **Countries**, privately and with no live third-party calls: bundle a
  static IP-to-country database (e.g. MaxMind's free GeoLite2-Country
  file) with the deploy and look up each request's IP against it locally
  - no network call per request, no fourth party involved. Left out for
    now since it needs a one-time free MaxMind account/license key to
    obtain the file, and you hadn't asked for country data specifically.
- Session duration/bounce rate (needs a second beacon on page unload).
- A "currently online" count (needs a lightweight heartbeat + short TTL
  in KV).
- Tracking `darrensims.co.uk` too - the schema already keys everything by
  `site`, so just add its domain to `ALLOWED_ORIGINS` and pass
  `?site=darrensims.co.uk` on the dashboard URL.
- If you ever wanted to run this on your own machine instead of any cloud
  host, the exact same code runs unchanged with `deno task start` -
  no rewrite needed, since it was written against Deno's own runtime APIs
  rather than anything Deploy-specific.
