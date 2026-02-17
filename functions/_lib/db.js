export function getDB(env) {
  // Cloudflare Pages bindings are case-sensitive.
  // We standardise on env.DB.
  const db = env?.DB || env?.db;
  if (!db) throw new Error("DB binding missing (expected env.DB)");
  return db;
}
