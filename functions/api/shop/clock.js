import { json } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const staff_id = body?.staff_id;
    const shop_id = String(body?.shop_id || body?.shop || "").trim();
    let type = String(body?.type || "").trim().toUpperCase(); // "IN" or "OUT"
    const note = body?.note ?? null;

    if (!staff_id || !shop_id || !type) return json({ ok:false, error:"Missing staff_id/shop_id/type" }, 400);
    if (!["IN","OUT"].includes(type)) return json({ ok:false, error:"type must be IN or OUT" }, 400);

    const ins = await env.DB.prepare(
      "INSERT INTO punches (staff_id, shop_id, type, note) VALUES (?, ?, ?, ?);"
    ).bind(staff_id, shop_id, type, note).run();

    return json({ ok:true, id: ins.meta?.last_row_id });
  } catch (e) {
    return json({ ok:false, error:"Clock failed", detail:String(e?.message || e) }, 500);
  }
}
