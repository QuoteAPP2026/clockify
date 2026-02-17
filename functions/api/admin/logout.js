function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function getCookie(req, name) {
  const cookie = req.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, "admin_session");

  try {
    if (token) {
      await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
    }
  } catch (_) {}

  const clear = "admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  return json({ ok: true }, 200, { "Set-Cookie": clear });
}
