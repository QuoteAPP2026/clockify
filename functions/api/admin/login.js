import { json } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const pass = body?.password;

    if (!pass) return json({ ok:false, error:"Missing password" }, 400);
    if (pass !== env.ADMIN_PASSWORD) return json({ ok:false, error:"Wrong password" }, 401);

    const token = crypto.randomUUID();
    const now = Date.now();
    const ttlMs = 1000 * 60 * 60 * 24 * 14; // 14 days
    const expires = now + ttlMs;

    await env.DB
      .prepare("INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)")
      .bind(token, now, expires)
      .run();

    const maxAge = Math.floor(ttlMs / 1000);
    return json(
      { ok:true },
      200,
      { "set-cookie": `admin_session=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax` }
    );
  } catch (e) {
    return json({ ok:false, error:"Login failed", detail:String(e?.message || e) }, 500);
  }
}
