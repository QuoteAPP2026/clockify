function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const token = getCookie(request, "admin_session");
  if (!token) return json({ ok: true, authed: false }, 200);

  const row = await env.DB.prepare(
    "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1"
  ).bind(token).first();

  return json({ ok: true, authed: !!row }, 200);
}
