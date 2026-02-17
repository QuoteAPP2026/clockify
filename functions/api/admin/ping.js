export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    route: "/api/admin/ping",
    ts: new Date().toISOString()
  }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
