import { requireAdmin, json } from "../../../_lib/auth.js";

function parseTs(ts) {
  // ts from sqlite: "YYYY-MM-DD HH:MM:SS"
  if (!ts) return null;
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status);

    const url = new URL(request.url);
    let start = url.searchParams.get("start"); // accepts YYYY-MM-DD or DD/MM/YYYY
    if (!start) {
      return json({ ok:false, error:"Missing start date" }, 400);
    }

    // Convert DD/MM/YYYY -> YYYY-MM-DD if needed
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(start)) {
      const [dd, mm, yyyy] = start.split("/");
      start = `${yyyy}-${mm}-${dd}`;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return json({ ok:false, error:"Invalid start date format (use YYYY-MM-DD or DD/MM/YYYY)" }, 400);
    }

    // Window: start 00:00:00 -> +7 days
    const startSql = `${start} 00:00:00`;
    const endDate = new Date(start + "T00:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const endSql = `${ymd(endDate)} 00:00:00`;

    // Load staff (id/name)
    const staffRes = await env.DB.prepare(
      "SELECT id, name FROM staff WHERE is_active = 1 ORDER BY name ASC;"
    ).all();
    const staff = staffRes.results || [];
    const staffById = new Map(staff.map(s => [String(s.id), s]));

    // Load punches in the window
    const punchRes = await env.DB.prepare(
      "SELECT id, staff_id, shop_id, type, ts, note, edited, edited_at FROM punches WHERE ts >= ? AND ts < ? ORDER BY staff_id ASC, ts ASC;"
    ).bind(startSql, endSql).all();

    const punches = punchRes.results || [];

    // Pair IN/OUT per staff
    const openIn = new Map(); // key: staff_id -> Date
    const byStaffDayMinutes = new Map(); // staff_id -> Map(day->minutes)
    const totalByStaff = new Map();

    for (const p of punches) {
      const sid = String(p.staff_id);
      const t = parseTs(p.ts);
      if (!t) continue;

      const type = String(p.type || "").toLowerCase();
      const isIn = type.includes("in");
      const isOut = type.includes("out");

      if (isIn) {
        openIn.set(sid, t);
        continue;
      }

      if (isOut) {
        const startT = openIn.get(sid);
        if (!startT) continue;

        let mins = Math.floor((t.getTime() - startT.getTime()) / 60000);
        if (mins < 0) mins = 0;
        if (mins > 24 * 60) mins = 24 * 60; // safety clamp

        const dayKey = ymd(startT);

        if (!byStaffDayMinutes.has(sid)) byStaffDayMinutes.set(sid, new Map());
        const m = byStaffDayMinutes.get(sid);
        m.set(dayKey, (m.get(dayKey) || 0) + mins);

        totalByStaff.set(sid, (totalByStaff.get(sid) || 0) + mins);
        openIn.delete(sid);
      }
    }

    // Build day list for UI
    const days = [];
    const d0 = new Date(start + "T00:00:00Z");
    for (let i = 0; i < 7; i++) {
      const di = new Date(d0);
      di.setUTCDate(di.getUTCDate() + i);
      days.push(ymd(di));
    }

    // Build rows (include staff with 0 mins too)
    const rows = [];
    for (const s of staff) {
      const sid = String(s.id);
      const dayMap = byStaffDayMinutes.get(sid) || new Map();
      const by_day = {};
      for (const day of days) by_day[day] = dayMap.get(day) || 0;

      rows.push({
        staff_id: s.id,
        name: s.name,
        by_day_minutes: by_day,
        total_minutes: totalByStaff.get(sid) || 0
      });
    }

    return json({
      ok: true,
      start,
      end: ymd(endDate),
      days,
      rows
    });

  } catch (e) {
    return json({ ok:false, error:"Weekly report failed", detail:String(e?.message || e) }, 500);
  }
}
