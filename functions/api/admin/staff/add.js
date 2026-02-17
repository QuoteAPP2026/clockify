import { requireAdmin, json } from "../../../_lib/auth.js";

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return toHex(digest);
}

function makeSalt() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return toHex(b);
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status);

    let body = null;
    try { body = await request.json(); } catch (_) {}

    const name = (body?.name || "").toString().trim();
    const pin = (body?.pin ?? "").toString().trim();

    if (!name || !pin) return json({ ok:false, error:"Missing name or pin" }, 400);
    if (!/^[0-9]{3,8}$/.test(pin)) return json({ ok:false, error:"PIN must be 3–8 digits" }, 400);

    // Schema-driven: staff table uses pin_salt + pin_hash
    const salt = makeSalt();
    const hash = await sha256Hex(`${salt}:${pin}`);

    const ins = await env.DB.prepare(
      "INSERT INTO staff (name, pin_salt, pin_hash, is_active) VALUES (?, ?, ?, 1);"
    ).bind(name, salt, hash).run();

    return json({ ok:true, id: ins.meta?.last_row_id });
  } catch (e) {
    return json({ ok:false, error:"Staff add failed", detail:String(e?.message || e) }, 500);
  }
}
