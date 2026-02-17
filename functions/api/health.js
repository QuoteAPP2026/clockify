export async function onRequest() {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
