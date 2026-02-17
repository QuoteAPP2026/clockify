import { requireAdmin } from "../../_lib/admin.js";

export async function onRequestGet(ctx) {
  const { request, env } = ctx;

  // Admin auth (cookie admin_session checked in admin_sessions table)
  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  // Return shops as JSON
  const res = await env.DB.prepare("SELECT * FROM shops ORDER BY id ASC;").all();
  return new Response(JSON.stringify({ ok: true, shops: res.results || [] }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

