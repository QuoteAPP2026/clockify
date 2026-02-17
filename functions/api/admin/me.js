function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getCookie(req, name) {
  const cookie = req.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function onRequestGet({ request, env }) {
  try {
    const token = getCookie(request, "admin_session");
    if (!token) return json({ ok: true, authed: false });

    const row = await env.DB
      .prepare("SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1")
      .bind(token)
      .first();

    return json({ ok: true, authed: !!row });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}
