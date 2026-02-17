import { requireAdmin, json } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status);

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "120", 10) || 120, 500);

    const res = await env.DB.prepare(
      `SELECT p.id, p.staff_id, p.shop_id, p.type, p.ts, p.note, p.edited, p.edited_at,
              s.name AS staff_name
       FROM punches p
       LEFT JOIN staff s ON s.id = p.staff_id
       ORDER BY p.ts DESC
       LIMIT ?;`
    ).bind(limit).all();

    return json({ ok:true, punches: res.results || [] });
  } catch (e) {
    return json({ ok:false, error:"Punches fetch failed", detail:String(e?.message || e) }, 500);
  }
}
