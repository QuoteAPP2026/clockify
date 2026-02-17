export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (!body?.password) {
      return new Response(JSON.stringify({ ok:false, error:"Missing password" }), {
        status:400,
        headers:{ "content-type":"application/json" }
      });
    }

    if (body.password !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ ok:false, error:"Wrong password" }), {
        status:401,
        headers:{ "content-type":"application/json" }
      });
    }

    const token = crypto.randomUUID();
    const now = Date.now();
    const expires = now + (1000 * 60 * 60 * 24 * 14);

    await env.DB
      .prepare("INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)")
      .bind(token, now, expires)
      .run();

    return new Response(JSON.stringify({ ok:true }), {
      headers:{
        "content-type":"application/json",
        "set-cookie": `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e.message) }), {
      status:500,
      headers:{ "content-type":"application/json" }
    });
  }
}
