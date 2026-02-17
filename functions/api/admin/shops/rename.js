import { requireAdmin } from "../../../_lib/admin.js";

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  let body = null;
  try {
    body = await request.json();
  } catch (_) {}

  const id = body?.id;
  const name = body?.name;

  if (!id || !name) {
    return new Response(JSON.stringify({ ok: false, error: "Missing id or name" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  await env.DB.prepare("UPDATE shops SET name = ? WHERE id = ?;").bind(name, id).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

