import { visitorHash, todayUTC } from './lib/hash.js';
import { isBot, deviceType, browserName, osName } from './lib/ua.js';
import { insertEvent } from './lib/events.js';
import { getStats } from './lib/stats.js';

const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') || '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_SITE = Deno.env.get('DEFAULT_SITE') || 'esthersimsstudio.co.uk';

if (!ADMIN_TOKEN) {
  console.warn(
    '[warn] ADMIN_TOKEN is not set - the dashboard and stats API are unprotected. Set it before deploying.'
  );
}

const ALLOWED_SITES = ALLOWED_ORIGINS.map((o) => o.replace(/^https?:\/\//, '').replace(/^www\./, ''));

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.endsWith(`://${allowed}`));
}

function siteAllowed(site) {
  if (ALLOWED_SITES.length === 0) return true;
  return ALLOWED_SITES.includes(site);
}

function corsHeaders(req) {
  const headers = new Headers();
  const origin = req.headers.get('origin');
  if (originAllowed(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return headers;
}

function json(status, obj, extraHeaders) {
  const headers = extraHeaders || new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(obj), { status, headers });
}

function getClientIp(req, info) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return info?.remoteAddr?.hostname || 'unknown';
}

function checkAdminAuth(req, url) {
  if (!ADMIN_TOKEN) return true;
  const header = req.headers.get('authorization');
  if (header && header === `Bearer ${ADMIN_TOKEN}`) return true;
  if (url.searchParams.get('token') === ADMIN_TOKEN) return true;
  return false;
}

function safeHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function handleEvent(req, info) {
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > 8192) return json(413, { error: 'payload too large' });

  let raw;
  try {
    raw = await req.text();
  } catch {
    return json(400, { error: 'could not read body' });
  }
  if (raw.length > 8192) return json(413, { error: 'payload too large' });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const ua = req.headers.get('user-agent') || '';
  if (isBot(ua)) return json(202, { ok: true });

  const pageUrl = typeof payload.u === 'string' ? payload.u : '';
  let pathname = '/';
  let utm_source = null;
  let utm_medium = null;
  let utm_campaign = null;
  let site = DEFAULT_SITE;
  try {
    const parsed = new URL(pageUrl);
    pathname = parsed.pathname || '/';
    utm_source = parsed.searchParams.get('utm_source');
    utm_medium = parsed.searchParams.get('utm_medium');
    utm_campaign = parsed.searchParams.get('utm_campaign');
    site = parsed.hostname.replace(/^www\./, '') || DEFAULT_SITE;
  } catch {
    // keep defaults
  }

  if (!siteAllowed(site)) return json(202, { ok: true });

  const referrerRaw = typeof payload.r === 'string' ? payload.r : '';
  const referrerHost = referrerRaw ? safeHostname(referrerRaw) : null;
  const referrer_domain = referrerHost && referrerHost !== site ? referrerHost : null;

  const country = req.headers.get('cf-ipcountry') || null; // only if fronted by Cloudflare
  const ip = getClientIp(req, info);
  const day = todayUTC();
  const hash = await visitorHash({ ip, userAgent: ua, site, day });

  await insertEvent(site, day, {
    ts: Date.now(),
    day,
    path: pathname,
    referrer_domain,
    utm_source,
    utm_medium,
    utm_campaign,
    country,
    device: deviceType(ua),
    browser: browserName(ua),
    os: osName(ua),
    visitor_hash: hash,
  });

  return json(202, { ok: true });
}

async function handleStats(req, url) {
  if (!checkAdminAuth(req, url)) return json(401, { error: 'unauthorized' });
  const site = url.searchParams.get('site') || DEFAULT_SITE;
  const rangeDays = Math.min(365, Math.max(1, parseInt(url.searchParams.get('range') || '30', 10) || 30));
  return json(200, await getStats(site, rangeDays));
}

const trackerJs = await Deno.readTextFile(new URL('./public/tracker.js', import.meta.url));
const dashboardHtml = await Deno.readTextFile(new URL('./public/dashboard.html', import.meta.url));

Deno.serve(async (req, info) => {
  const url = new URL(req.url);
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (req.method === 'POST' && url.pathname === '/api/event') {
    const res = await handleEvent(req, info);
    cors.forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    const res = await handleStats(req, url);
    cors.forEach((v, k) => res.headers.set(k, v));
    return res;
  }

  if (req.method === 'GET' && url.pathname === '/js/script.js') {
    return new Response(trackerJs, {
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  if (req.method === 'GET' && (url.pathname === '/dashboard' || url.pathname === '/dashboard/')) {
    return new Response(dashboardHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(200, { ok: true, time: new Date().toISOString() });
  }

  return json(404, { error: 'not found' });
});
