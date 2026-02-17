import { requireAdmin } from "../../../_lib/admin.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ ok: false, error: "Not signed in" }, 401);

  const { DB } = auth;
  const body = await request.json().catch(() => ({}));

  const name = (body?.name || "").trim();
  const pin = String(body?.pin || "").trim();

  if (!name) return json({ ok: false, error: "Name required" }, 400);
  if (!/^\d{4,8}$/.test(pin)) return json({ ok: false, error: "PIN must be 4–8 digits" }, 400);

  // Prevent duplicates
  const existing = await DB.prepare("SELECT id FROM staff WHERE pin = ? LIMIT 1").bind(pin).first();
  if (existing) return json({ ok: false, error: "PIN already in use" }, 409);

  await DB.prepare(
    "INSERT INTO staff (name, pin, active) VALUES (?, ?, 1)"
  ).bind(name, pin).run();

  return json({ ok: true });
}
