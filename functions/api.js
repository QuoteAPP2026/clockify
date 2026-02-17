import { Hono } from "hono";

const app = new Hono();

function json(c, obj, status = 200) {
  return c.json(obj, status);
}

function bad(c, msg, status = 400) {
  return json(c, { ok: false, error: msg }, status);
}

function getShopIdFromPath(c) {
  // Expect /shop/a or /shop/b (front-end uses this)
  const shop = c.req.query("shop");
  if (shop === "a" || shop === "b") return shop;
  return null;
}

function normalisePin(pin) {
  return String(pin || "").replace(/\s+/g, "");
}

function isValidPin(pin) {
  return /^\d{4,8}$/.test(pin);
}

function toISO(dt) {
  return new Date(dt).toISOString();
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---- Admin auth (simple signed cookie) ----
async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/g, "");
}

async function verify(value, signature, secret) {
  const expected = await sign(value, secret);
  return timingSafeEqual(expected, signature);
}

function getCookie(c, name) {
  const cookie = c.req.header("Cookie") || "";
  const parts = cookie.split(";").map(s => s.trim());
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

function setCookie(c, name, value, opts = {}) {
  const bits = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (opts.maxAge) bits.push(`Max-Age=${opts.maxAge}`);
  // Pages is always https on pages.dev, so Safe to set Secure.
  bits.push("Secure");
  c.header("Set-Cookie", bits.join("; "));
}

async function requireAdmin(c) {
  const secret = c.env.ADMIN_PASSWORD;
  if (!secret) return { ok: false, error: "ADMIN_PASSWORD not set on Cloudflare" };

  const raw = getCookie(c, "admin");
  if (!raw) return { ok: false, error: "Not signed in" };

  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return { ok: false, error: "Invalid session" };

  const valid = await verify(payload, sig, secret);
  if (!valid) return { ok: false, error: "Invalid session" };

  const [tsStr] = atob(payload).split("|");
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return { ok: false, error: "Invalid session" };

  // 7 days session
  const ageMs = Date.now() - ts;
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return { ok: false, error: "Session expired" };

  return { ok: true };
}

// ---- Helpers: hours calc ----
function weekStartISO(d = new Date()) {
  // Monday 00:00:00 local-ish (we treat as UTC for simplicity)
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  dt.setUTCDate(dt.getUTCDate() + diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}

function weekEndISO(startIso) {
  const dt = new Date(startIso);
  dt.setUTCDate(dt.getUTCDate() + 7);
  return dt.toISOString();
}

function msToHours(ms) {
  return Math.round((ms / 3600000) * 100) / 100; // 2dp
}

function pairPunches(punches) {
  // punches sorted ascending by ts
  const pairs = [];
  let openIn = null;
  for (const p of punches) {
    if (p.type === "IN") {
      openIn = p;
    } else if (p.type === "OUT") {
      if (openIn) {
        pairs.push({ in: openIn, out: p });
        openIn = null;
      }
    }
  }
  return { pairs, openIn };
}

// ---- Routes ----

// Health check
app.get("/api/health", (c) => json(c, { ok: true }));

// Staff tablet: submit PIN + IN/OUT
app.post("/api/punch", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pin = normalisePin(body.pin);
  const action = body.action; // "IN" | "OUT"
  const shop = body.shop;

  if (shop !== "a" && shop !== "b") return bad(c, "Invalid shop");
  if (action !== "IN" && action !== "OUT") return bad(c, "Invalid action");
  if (!isValidPin(pin)) return bad(c, "PIN must be 4–8 digits");

  // Load active staff and match by hashing (small staff count, safe)
  const staffRows = await c.env.DB.prepare(
    "SELECT id, name, pin_salt, pin_hash FROM staff WHERE is_active=1"
  ).all();

  let staff = null;
  for (const s of staffRows.results || []) {
    const hash = await sha256Hex(`${pin}:${s.pin_salt}`);
    if (timingSafeEqual(hash, s.pin_hash)) {
      staff = { id: s.id, name: s.name };
      break;
    }
  }
  if (!staff) return bad(c, "Invalid PIN", 401);

  // Prevent double IN/OUT
  const last = await c.env.DB.prepare(
    "SELECT type, ts FROM punches WHERE staff_id=? ORDER BY ts DESC, id DESC LIMIT 1"
  ).bind(staff.id).first();

  if (last?.type === action) {
    return bad(c, `You are already clocked ${action === "IN" ? "in" : "out"}.`);
  }

  // If trying to OUT without any IN ever, block.
  if (!last && action === "OUT") return bad(c, "No clock-in found yet.");

  await c.env.DB.prepare(
    "INSERT INTO punches (staff_id, shop_id, type, ts) VALUES (?,?,?,datetime('now'))"
  ).bind(staff.id, shop, action).run();

  return json(c, {
    ok: true,
    staff: staff.name,
    action,
    shop,
    at: toISO(new Date())
  });
});

// Admin: login
app.post("/api/admin/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pass = String(body.password || "");
  const secret = c.env.ADMIN_PASSWORD;

  if (!secret) return bad(c, "ADMIN_PASSWORD not set on Cloudflare", 500);
  if (!timingSafeEqual(pass, secret)) return bad(c, "Wrong password", 401);

  const payload = btoa(`${Date.now()}|admin`);
  const sig = await sign(payload, secret);
  setCookie(c, "admin", `${payload}.${sig}`, { maxAge: 7 * 24 * 60 * 60 });

  return json(c, { ok: true });
});

// Admin: logout
app.post("/api/admin/logout", async (c) => {
  setCookie(c, "admin", "x", { maxAge: 0 });
  return json(c, { ok: true });
});

// Admin: list shops
app.get("/api/admin/shops", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const rows = await c.env.DB.prepare("SELECT id, name FROM shops ORDER BY id").all();
  return json(c, { ok: true, shops: rows.results || [] });
});

// Admin: rename shop
app.post("/api/admin/shops/rename", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const body = await c.req.json().catch(() => ({}));
  const id = body.id;
  const name = String(body.name || "").trim();
  if (id !== "a" && id !== "b") return bad(c, "Invalid shop");
  if (!name) return bad(c, "Name required");

  await c.env.DB.prepare("UPDATE shops SET name=? WHERE id=?").bind(name, id).run();
  return json(c, { ok: true });
});

// Admin: staff list
app.get("/api/admin/staff", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const rows = await c.env.DB.prepare(
    "SELECT id, name, is_active, created_at FROM staff ORDER BY name"
  ).all();

  return json(c, { ok: true, staff: rows.results || [] });
});

// Admin: add staff
app.post("/api/admin/staff/add", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const pin = normalisePin(body.pin);

  if (!name) return bad(c, "Name required");
  if (!isValidPin(pin)) return bad(c, "PIN must be 4–8 digits");

  const salt = randomSalt();
  const hash = await sha256Hex(`${pin}:${salt}`);

  await c.env.DB.prepare(
    "INSERT INTO staff (name, pin_salt, pin_hash) VALUES (?,?,?)"
  ).bind(name, salt, hash).run();

  return json(c, { ok: true });
});

// Admin: toggle staff active
app.post("/api/admin/staff/toggle", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) return bad(c, "Invalid id");

  await c.env.DB.prepare(
    "UPDATE staff SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id=?"
  ).bind(id).run();

  return json(c, { ok: true });
});

// Admin: reset staff PIN
app.post("/api/admin/staff/reset-pin", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  const pin = normalisePin(body.pin);

  if (!Number.isFinite(id)) return bad(c, "Invalid id");
  if (!isValidPin(pin)) return bad(c, "PIN must be 4–8 digits");

  const salt = randomSalt();
  const hash = await sha256Hex(`${pin}:${salt}`);

  await c.env.DB.prepare(
    "UPDATE staff SET pin_salt=?, pin_hash=? WHERE id=?"
  ).bind(salt, hash, id).run();

  return json(c, { ok: true });
});

// Admin: weekly report (Mon–Sun), per staff and per shop
app.get("/api/admin/report/weekly", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const start = c.req.query("start") || weekStartISO(new Date());
  const end = weekEndISO(start);

  // Pull punches for the week
  const punches = await c.env.DB.prepare(
    `SELECT p.id, p.staff_id, p.shop_id, p.type, p.ts, s.name as staff_name
     FROM punches p
     JOIN staff s ON s.id = p.staff_id
     WHERE p.ts >= ? AND p.ts < ?
     ORDER BY p.staff_id, p.ts, p.id`
  ).bind(start, end).all();

  // Group by staff
  const byStaff = new Map();
  for (const r of punches.results || []) {
    if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, { staff_id: r.staff_id, staff_name: r.staff_name, punches: [] });
    byStaff.get(r.staff_id).punches.push({ id: r.id, shop_id: r.shop_id, type: r.type, ts: r.ts });
  }

  const rows = [];
  for (const entry of byStaff.values()) {
    const sorted = entry.punches.sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);
    const { pairs, openIn } = pairPunches(sorted);

    let totalMs = 0;
    const details = [];
    for (const pr of pairs) {
      const inT = new Date(pr.in.ts).getTime();
      const outT = new Date(pr.out.ts).getTime();
      const ms = Math.max(0, outT - inT);
      totalMs += ms;
      details.push({ in: pr.in.ts, out: pr.out.ts, shop: pr.in.shop_id, hours: msToHours(ms) });
    }

    rows.push({
      staff_id: entry.staff_id,
      staff_name: entry.staff_name,
      hours: msToHours(totalMs),
      open_shift: openIn ? { in: openIn.ts, shop: openIn.shop_id } : null,
      details
    });
  }

  // Also totals by shop
  const totalsByShop = { a: 0, b: 0 };
  for (const r of rows) {
    for (const d of r.details) {
      totalsByShop[d.shop] += d.hours;
    }
  }

  return json(c, { ok: true, start, end, rows, totalsByShop });
});

// Admin: list punches (for editing)
app.get("/api/admin/punches", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const limit = Math.min(500, Number(c.req.query("limit") || 200));
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.staff_id, s.name as staff_name, p.shop_id, p.type, p.ts, p.note, p.edited, p.edited_at
     FROM punches p
     JOIN staff s ON s.id = p.staff_id
     ORDER BY p.ts DESC, p.id DESC
     LIMIT ?`
  ).bind(limit).all();

  return json(c, { ok: true, punches: rows.results || [] });
});

// Admin: edit a punch timestamp / note
app.post("/api/admin/punches/edit", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return bad(c, auth.error, 401);

  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  const ts = String(body.ts || "").trim(); // ISO string expected
  const note = String(body.note || "").trim();

  if (!Number.isFinite(id)) return bad(c, "Invalid id");
  const d = new Date(ts);
  if (isNaN(d.getTime())) return bad(c, "Invalid timestamp (use ISO format)");

  await c.env.DB.prepare(
    "UPDATE punches SET ts=?, note=?, edited=1, edited_at=datetime('now') WHERE id=?"
  ).bind(d.toISOString(), note, id).run();

  return json(c, { ok: true });
});

export default app;
