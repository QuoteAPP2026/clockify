import { json } from "../../_lib/http.js";
import { hashPin } from "../../_lib/pin.js";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const shop_id = String(body?.shop_id || body?.shop || "").trim();
    const pin = String(body?.pin || "").trim();

    if (!shop_id || !pin) return json({ ok:false, error:"Missing shop_id or pin" }, 400);

    const staffRes = await env.DB.prepare(
      "SELECT id, name, pin_salt, pin_hash FROM staff WHERE is_active=1;"
    ).all();

    for (const s of (staffRes.results || [])) {
      const h = await hashPin(s.pin_salt, pin);
      if (h === s.pin_hash) return json({ ok:true, staff:{ id:s.id, name:s.name } });
    }

    return json({ ok:false, error:"PIN not recognised" }, 401);
  } catch (e) {
    return json({ ok:false, error:"PIN check failed", detail:String(e?.message || e) }, 500);
  }
}
