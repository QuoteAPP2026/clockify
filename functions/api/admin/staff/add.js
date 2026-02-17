import { requireAdmin } from "../../../_lib/admin.js";

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  const auth = await requireAdmin(request, env);
  if (auth instanceof Response) return auth;

  let body = null;
  try { body = await request.json(); } catch (_) {}

  const name = (body?.name || "").trim();
  const pinRaw = (body?.pin || "").toString().trim();
  const shop_id = body?.shop_id || body?.shop || body?.shopId; // tolerate variants

  if (!name || !pinRaw || !shop_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing name, pin, or shop_id" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // Keep PIN as string (preserves leading zeros). Basic validation.
  if (!/^[0-9]{3,8}$/.test(pinRaw)) {
    return new Response(JSON.stringify({ ok: false, error: "PIN must be 3–8 digits" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // Prevent duplicate PIN within same shop (common expectation)
  const existing = await env.DB
    .prepare("SELECT id FROM staff WHERE shop_id = ? AND pin = ? LIMIT 1;")
    .bind(shop_id, pinRaw)
    .first();

  if (existing?.id) {
    return new Response(JSON.stringify({ ok: false, error: "PIN already in use for this shop" }), {
      status: 409,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const now = Date.now();

  // Insert with a tolerant column set (works whether you have created_at or not)
  // Try with created_at first, fall back if the column doesn't exist.
  try {
    const ins = await env.DB
      .prepare("INSERT INTO staff (name, pin, shop_id, created_at) VALUES (?, ?, ?, ?);")
      .bind(name, pinRaw, shop_id, now)
      .run();

    return new Response(JSON.stringify({ ok: true, id: ins.meta?.last_row_id }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    // fallback insert
    const ins = await env.DB
      .prepare("INSERT INTO staff (name, pin, shop_id) VALUES (?, ?, ?);")
      .bind(name, pinRaw, shop_id)
      .run();

    return new Response(JSON.stringify({ ok: true, id: ins.meta?.last_row_id }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
