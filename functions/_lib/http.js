export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function getCookie(req, name) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : null;
}
