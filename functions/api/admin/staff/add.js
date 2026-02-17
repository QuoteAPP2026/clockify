import { requireAdmin, json } from "../../../_lib/auth.js";

async function getCols(db, table) {
  const r = await db.prepare(`PRAGMA table_info(${table});`).all();
  return new Set((r.results || []).map(x => String(x.name)));
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status);

    let body = null;
    try { body = await request.json(); } catch (_) {}

    const name = (body?.name || "").toString().trim();
    const pin = (body?.pin ?? "").toString().trim();
    const shop =
      (body?.shop_id ?? body?.shopId ?? body?.shop ?? "").toString().trim() || "a";

    if (!name || !pin) return json({ ok:false, error:"Missing name or pin" }, 400);
    if (!/^[0-9]{3,8}$/.test(pin)) return json({ ok:false, error:"PIN must be 3–8 digits" }, 400);

    const cols = await getCols(env.DB, "staff");
    const now = Date.now();

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
    if (keys.length < 2) return json({ ok:false, error:"staff table not compatible", cols:[...cols] }, 500);

    const placeholders = keys.map(()=>"?").join(",");
    const values = keys.map(k=>row[k]);

    const ins = await env.DB
      .prepare(`INSERT INTO staff (${keys.join(",")}) VALUES (${placeholders});`)
      .bind(...values)
      .run();

    return json({ ok:true, id: ins.meta?.last_row_id, shop });
  } catch (e) {
    return json({ ok:false, error:"Staff add failed", detail:String(e?.message || e) }, 500);
  }
}
