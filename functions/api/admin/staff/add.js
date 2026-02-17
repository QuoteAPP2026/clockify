export async function onRequestPost({ request, env }) {
  try {
    // auth
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/admin_session=([^;]+)/);
    if (!match) {
      return new Response(JSON.stringify({ ok:false, error:"Missing admin session" }), {
        status:401, headers:{ "content-type":"application/json" }
      });
    }

    const token = match[1];
    const now = Date.now();
    const sess = await env.DB
      .prepare("SELECT token, expires_at FROM admin_sessions WHERE token = ? LIMIT 1;")
      .bind(token)
      .first();

    if (!sess?.token) {
      return new Response(JSON.stringify({ ok:false, error:"Invalid admin session" }), {
        status:401, headers:{ "content-type":"application/json" }
      });
    }

    // expires_at may be number or string
    let exp = 0;
    if (typeof sess.expires_at === "number") exp = sess.expires_at;
    else if (typeof sess.expires_at === "string") exp = Date.parse(sess.expires_at);
    if (!exp || Number.isNaN(exp) || exp < now) {
      return new Response(JSON.stringify({ ok:false, error:"Admin session expired" }), {
        status:401, headers:{ "content-type":"application/json" }
      });
    }

    // body
    let body = null;
    try { body = await request.json(); } catch (_) {}
    const name = (body?.name || "").toString().trim();
    const pin = (body?.pin ?? "").toString().trim();

    // accept any shop key, and default to "a" if missing
    const shop =
      (body?.shop_id ?? body?.shopId ?? body?.shop ?? body?.shopid ?? "").toString().trim() || "a";

    if (!name || !pin) {
      return new Response(JSON.stringify({ ok:false, error:"Missing name or pin" }), {
        status:400, headers:{ "content-type":"application/json" }
      });
    }

    if (!/^[0-9]{3,8}$/.test(pin)) {
      return new Response(JSON.stringify({ ok:false, error:"PIN must be 3–8 digits" }), {
        status:400, headers:{ "content-type":"application/json" }
      });
    }

    // detect staff columns
    const info = await env.DB.prepare("PRAGMA table_info(staff);").all();
    const cols = new Set((info.results || []).map(r => r.name));

    const payload = {
      name,
      pin,
      shop_id: shop,
      shop: shop,
      created_at: now,
      active: 1,
    };

    const row = {};
    for (const [k,v] of Object.entries(payload)) if (cols.has(k)) row[k] = v;

    const keys = Object.keys(row);
    if (keys.length < 2) {
      return new Response(JSON.stringify({ ok:false, error:"staff table not compatible", cols:[...cols] }), {
        status:500, headers:{ "content-type":"application/json" }
      });
    }

    const placeholders = keys.map(()=>"?").join(",");
    const values = keys.map(k=>row[k]);

    const ins = await env.DB
      .prepare(`INSERT INTO staff (${keys.join(",")}) VALUES (${placeholders});`)
      .bind(...values)
      .run();

    return new Response(JSON.stringify({ ok:true, id: ins.meta?.last_row_id, shop }), {
      headers:{ "content-type":"application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e?.message || e) }), {
      status:500, headers:{ "content-type":"application/json" }
    });
  }
}
