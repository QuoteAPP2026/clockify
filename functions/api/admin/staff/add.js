import { requireAdmin } from "../../../_lib/admin.js";

async function getCols(db, table) {
  const r = await db.prepare(`PRAGMA table_info(${table});`).all();
  const set = new Set();
  for (const row of (r.results || [])) if (row?.name) set.add(String(row.name));
  return set;
}

function pick(cols, obj) {
  const out = {};
  for (const [k,v] of Object.entries(obj)) if (cols.has(k) && v !== undefined) out[k] = v;
  return out;
}

export async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;

    const auth = await requireAdmin(request, env);
    if (auth instanceof Response) return auth;

    let body = null;
    try { body = await request.json(); } catch (_) {}

    const name = (body?.name || "").trim();
    const pin = (body?.pin ?? "").toString().trim();
    const shop = (body?.shop_id || body?.shop || body?.shopId || "").toString().trim();

    if (!name || !pin || !shop) {
      return new Response(JSON.stringify({ ok:false, error:"Missing name, pin, or shop_id" }), {
        status: 400,
        headers: { "content-type":"application/json; charset=utf-8" },
      });
    }

    if (!/^[0-9]{3,8}$/.test(pin)) {
      return new Response(JSON.stringify({ ok:false, error:"PIN must be 3–8 digits" }), {
        status: 400,
        headers: { "content-type":"application/json; charset=utf-8" },
      });
    }

    const cols = await getCols(env.DB, "staff");

    // map to whatever your schema uses
    const payload = {
      name,
      pin,
      shop_id: shop,
      shop: shop,
      created_at: Date.now(),
      active: 1,
    };

    const row = pick(cols, payload);
    const keys = Object.keys(row);

    if (keys.length < 2) {
      return new Response(JSON.stringify({ ok:false, error:"staff table columns not compatible", cols:[...cols] }), {
        status: 500,
        headers: { "content-type":"application/json; charset=utf-8" },
      });
    }

    const placeholders = keys.map(()=>"?").join(",");
    const values = keys.map(k=>row[k]);

    const ins = await env.DB
      .prepare(`INSERT INTO staff (${keys.join(",")}) VALUES (${placeholders});`)
      .bind(...values)
      .run();

    return new Response(JSON.stringify({ ok:true, id: ins.meta?.last_row_id }), {
      headers: { "content-type":"application/json; charset=utf-8" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:"Staff add failed", detail:String(e?.message || e) }), {
      status: 500,
      headers: { "content-type":"application/json; charset=utf-8" },
    });
  }
}
