// Single shared Deno KV handle. On Deno Deploy this transparently opens
// the project's managed, durable KV database - no separate database
// service to provision. Locally it opens (or creates) a file next to this
// project so `deno task dev` works without any setup.
export const kv = await Deno.openKv(Deno.env.get('KV_PATH') || undefined);
