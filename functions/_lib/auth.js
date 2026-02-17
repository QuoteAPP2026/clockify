export function getCookie(req, name) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}

export async function requireAdmin(request, env) {
  const token = getCookie(request, "admin_session");
  if (!token) return { ok:false, status:401, error:"Missing admin session" };

  const row = await env.DB
    .prepare("SELECT token, expires_at FROM admin_sessions WHERE token = ? LIMIT 1;")
    .bind(token)
    .first();

  if (!row?.token) return { ok:false, status:401, error:"Invalid admin session" };

  const exp = Number(row.expires_at);
  if (!exp || Number.isNaN(exp) || exp < Date.now()) {
    return { ok:false, status:401, error:"Admin session expired" };
  }

  return { ok:true, token };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
