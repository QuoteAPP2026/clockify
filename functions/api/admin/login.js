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

export async function onRequest(context) {
  const { request, env } = context;

  // Allow preflight if your browser ever sends it
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const supplied = (body?.password ?? "").toString();
  const expected = (env.ADMIN_PASSWORD ?? "").toString();

  if (!expected) return json({ ok: false, error: "ADMIN_PASSWORD not set" }, 500);
  if (supplied !== expected) return json({ ok: false, error: "Invalid password" }, 401);

  const token = crypto.randomUUID();
  const maxAgeSeconds = 60 * 60 * 24 * 14; // 14 days
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

  try {
    await env.DB.prepare(
      "INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)"
    ).bind(token, expiresAt).run();
  } catch {
    return json({ ok: false, error: "DB error creating session" }, 500);
  }

  const cookie =
    `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;

  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
