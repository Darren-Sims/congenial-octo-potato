import { kv } from './kv.js';

// Key shape: ["events", site, day, randomId] -> event record.
// Keys sort lexicographically component-by-component, and "YYYY-MM-DD" day
// strings sort correctly as plain strings, so a range query bounded by
// `since` reads only the days that matter instead of the whole history.
export async function insertEvent(site, day, record) {
  const id = crypto.randomUUID();
  await kv.set(['events', site, day, id], record);
}

export async function listEventsSince(site, sinceDay) {
  const events = [];
  const iter = kv.list({ start: ['events', site, sinceDay], end: ['events', site, '￿'] });
  for await (const entry of iter) events.push(entry.value);
  return events;
}
