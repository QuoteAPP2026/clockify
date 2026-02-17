import { getDB } from "./db.js";

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function requireAdmin(request, env) {
  const DB = getDB(env);
  const token = getCookie(request, "admin_session");
  if (!token) return { ok: false };

  const row = await DB.prepare(
    "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1"
  ).bind(token).first();

  if (!row) return { ok: false };
  return { ok: true, DB };
}
