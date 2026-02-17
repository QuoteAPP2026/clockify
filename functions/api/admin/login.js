function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function utcSqlite(dt = new Date()) {
  // "YYYY-MM-DD HH:MM:SS" (UTC) — compares correctly with datetime('now')
  return dt.toISOString().slice(0, 19).replace("T", " ");
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = (body?.password || "").toString();

    if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "ADMIN_PASSWORD not set" }, 500);
    if (password !== env.ADMIN_PASSWORD) return json({ ok: false, error: "Invalid password" }, 401);

    if (!env.DB) return json({ ok: false, error: "DB binding missing" }, 500);

    const token = crypto.randomUUID();
    const expiresAt = utcSqlite(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)); // 30 days

    await env.DB
      .prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)")
      .bind(token, expiresAt)
      .run();

    const cookie = `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;

    return json({ ok: true }, 200, { "Set-Cookie": cookie });
  } catch (e) {
    return json({ ok: false, error: "DB error creating session", details: String(e) }, 500);
  }
}
