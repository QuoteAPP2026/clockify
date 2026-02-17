import { requireAdmin, json } from "../../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status);

    const body = await request.json();
    const id = body?.id;
    const ts = body?.ts;       // expect "YYYY-MM-DD HH:MM:SS" or ISO
    const type = body?.type;   // "in" / "out" etc
    const note = body?.note ?? null;

    if (id === undefined || id === null) return json({ ok:false, error:"Missing id" }, 400);
    if (!ts || !type) return json({ ok:false, error:"Missing ts or type" }, 400);

    // Normalise ts to "YYYY-MM-DD HH:MM:SS"
    let d = null;
    if (typeof ts === "string" && ts.includes("T")) d = new Date(ts);
    else d = new Date(ts.replace(" ", "T") + "Z");

    if (isNaN(d.getTime())) return json({ ok:false, error:"Invalid ts" }, 400);

    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth()+1).padStart(2,"0");
    const dd = String(d.getUTCDate()).padStart(2,"0");
    const HH = String(d.getUTCHours()).padStart(2,"0");
    const MM = String(d.getUTCMinutes()).padStart(2,"0");
    const SS = String(d.getUTCSeconds()).padStart(2,"0");
    const tsSql = `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`;

    await env.DB.prepare(
      "UPDATE punches SET ts = ?, type = ?, note = ?, edited = 1, edited_at = datetime('now') WHERE id = ?;"
    ).bind(tsSql, String(type), note, id).run();

    return json({ ok:true });
  } catch (e) {
    return json({ ok:false, error:"Punch edit failed", detail:String(e?.message || e) }, 500);
  }
}
