import { createAdminSession } from "../../_lib/admin.js";

export async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;

    let body = null;
    try { body = await request.json(); } catch (_) {}
    const pass = body?.password;

    if (!pass) {
      return new Response(JSON.stringify({ ok:false, error:"Missing password" }), {
        status: 400,
        headers: { "content-type":"application/json; charset=utf-8" },
      });
    }

    if (pass !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ ok:false, error:"Wrong password" }), {
        status: 401,
        headers: { "content-type":"application/json; charset=utf-8" },
      });
    }

    const { cookie } = await createAdminSession(env);

    return new Response(JSON.stringify({ ok:true }), {
      headers: {
        "content-type":"application/json; charset=utf-8",
        "set-cookie": cookie,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:"Login failed", detail:String(e?.message || e) }), {
      status: 500,
      headers: { "content-type":"application/json; charset=utf-8" },
    });
  }
}
