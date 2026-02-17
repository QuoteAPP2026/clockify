function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const token = getCookie(request, "admin_session");
  if (token) {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
  }

  // Expire cookie
  const cookie = "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
