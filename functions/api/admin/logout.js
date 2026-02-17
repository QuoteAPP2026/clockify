export async function onRequestPost({ request, env }) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/admin_session=([^;]+)/);
    if (match) {
      await env.DB
        .prepare("DELETE FROM admin_sessions WHERE token = ?")
        .bind(match[1])
        .run();
    }

    return new Response(JSON.stringify({ ok:true }), {
      headers:{
        "content-type":"application/json",
        "set-cookie":"admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e.message) }), {
      status:500,
      headers:{ "content-type":"application/json" }
    });
  }
}
