import { destroyAdminSession } from "../../_lib/admin.js";

export async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;
    const cookie = await destroyAdminSession(request, env);

    return new Response(JSON.stringify({ ok:true }), {
      headers: {
        "content-type":"application/json; charset=utf-8",
        "set-cookie": cookie,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:"Logout failed", detail:String(e?.message || e) }), {
      status: 500,
      headers: { "content-type":"application/json; charset=utf-8" },
    });
  }
}
