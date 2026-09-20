import { listEventsSince } from './events.js';

function daysAgoUTC(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Small helper: group `rows` by `keyFn(row)`, counting pageviews and
// distinct visitor_hash values per group, then sort by pageviews desc.
function rank(rows, keyFn, limit) {
  const groups = new Map(); // key -> { pageviews, visitors: Set }
  for (const r of rows) {
    const key = keyFn(r);
    if (key === undefined) continue;
    let g = groups.get(key);
    if (!g) {
      g = { pageviews: 0, visitors: new Set() };
      groups.set(key, g);
    }
    g.pageviews += 1;
    g.visitors.add(r.visitor_hash);
  }
  const out = [...groups.entries()]
    .map(([key, g]) => ({ key, pageviews: g.pageviews, visitors: g.visitors.size }))
    .sort((a, b) => b.pageviews - a.pageviews);
  return limit ? out.slice(0, limit) : out;
}

export async function getStats(site, rangeDays) {
  const since = daysAgoUTC(rangeDays - 1);
  const rows = await listEventsSince(site, since);

  const totals = {
    pageviews: rows.length,
    visitors: new Set(rows.map((r) => r.visitor_hash)).size,
  };

  const byDayMap = new Map();
  for (const r of rows) {
    let d = byDayMap.get(r.day);
    if (!d) {
      d = { day: r.day, pageviews: 0, visitors: new Set() };
      byDayMap.set(r.day, d);
    }
    d.pageviews += 1;
    d.visitors.add(r.visitor_hash);
  }
  const byDay = [...byDayMap.values()]
    .map((d) => ({ day: d.day, pageviews: d.pageviews, visitors: d.visitors.size }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const topPages = rank(rows, (r) => r.path, 20).map((x) => ({
    path: x.key,
    pageviews: x.pageviews,
    visitors: x.visitors,
  }));

  const topReferrers = rank(rows, (r) => r.referrer_domain || 'Direct / None', 20).map((x) => ({
    referrer_domain: x.key,
    pageviews: x.pageviews,
    visitors: x.visitors,
  }));

  const devices = rank(rows, (r) => r.device).map((x) => ({ device: x.key, pageviews: x.pageviews }));
  const browsers = rank(rows, (r) => r.browser, 10).map((x) => ({ browser: x.key, pageviews: x.pageviews }));
  const os = rank(rows, (r) => r.os, 10).map((x) => ({ os: x.key, pageviews: x.pageviews }));
  const countries = rank(rows, (r) => r.country || 'Unknown', 20).map((x) => ({
    country: x.key,
    pageviews: x.pageviews,
  }));

  const campaignRows = rows.filter((r) => r.utm_source);
  const campaigns = rank(campaignRows, (r) => [r.utm_source, r.utm_medium, r.utm_campaign].join('\u0000'), 20).map(
    (x) => {
      const [utm_source, utm_medium, utm_campaign] = x.key.split('\u0000');
      return { utm_source, utm_medium: utm_medium || null, utm_campaign: utm_campaign || null, pageviews: x.pageviews };
    }
  );

  return { site, rangeDays, since, totals, byDay, topPages, topReferrers, devices, browsers, os, countries, campaigns };
}
