// Same privacy design as the Node version, adapted to Deno KV for storage:
//
//   visitor_hash = sha256(todays_random_salt + ip + user_agent + site)
//
// - The raw IP is used only for one instant, in memory, to compute this
//   hash. It is never written anywhere.
// - The salt is a random value generated fresh for each UTC day and kept
//   only in KV under ["salts", day]. Once a day is more than ~2 days old,
//   its salt is deleted (pruned opportunistically whenever a new salt is
//   created, since Deno Deploy doesn't guarantee a long-lived background
//   timer between requests) - so even yesterday's visitor_hash values can
//   never be recomputed back to an IP, and the same person visiting on two
//   different days gets two unrelated hashes.

import { kv } from './kv.js';

export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pruneOldSalts(currentDay) {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const entries = kv.list({ prefix: ['salts'] });
  for await (const entry of entries) {
    const day = entry.key[1];
    if (day < cutoff) {
      await kv.delete(entry.key);
    }
  }
}

async function getOrCreateSalt(day) {
  const key = ['salts', day];
  const existing = await kv.get(key);
  if (existing.value) return existing.value;

  const salt = randomSalt();
  const res = await kv.atomic().check({ key, versionstamp: null }).set(key, salt).commit();
  // Fire-and-forget cleanup of stale salts; never blocks the response.
  pruneOldSalts(day).catch(() => {});
  if (res.ok) return salt;

  const winner = await kv.get(key);
  return winner.value || salt;
}

export async function visitorHash({ ip, userAgent, site, day }) {
  const salt = await getOrCreateSalt(day);
  return sha256Hex(`${salt}|${ip}|${userAgent}|${site}`);
}
