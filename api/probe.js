/* TEMPORARY diagnostic: which Terminal49 endpoints answer for this key. Read-only unless ?create=1. Remove after use. */
const BASE = "https://api.terminal49.com/v2";
module.exports = async (req, res) => {
  const key = process.env.TERMINAL49_API_KEY;
  const url = new URL(req.url, "http://x");
  const out = [];
  const H = { Authorization: `Token ${key}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" };
  async function tryCall(label, path, init) {
    try {
      const r = await fetch(BASE + path, { ...init, headers: H });
      const text = await r.text();
      out.push({ label, status: r.status, body: text.slice(0, 1200) });
    } catch (e) { out.push({ label, status: "ERR", body: String(e.message || e) }); }
  }
  await tryCall("me", "/me");
  await tryCall("shipping_lines", "/shipping_lines");
  await tryCall("port USLAX", "/ports/USLAX");
  await tryCall("metro USLAX", "/metro_areas/USLAX");
  await tryCall("vessel 9456783", "/vessels/9456783");
  await tryCall("tracking_requests", "/tracking_requests?page[size]=5");
  await tryCall("search", "/search?query=MSKU");
  await tryCall("trade_intel meta", "/trade_intel/meta");
  await tryCall("containers", "/containers?page[size]=1");
  await tryCall("shipments", "/shipments?page[size]=1");
  await tryCall("webhooks", "/webhooks");
  await tryCall("webhook_events", "/webhook_events");
  await tryCall("infer MSKU4821937", "/tracking_requests/infer_number", { method: "POST", body: JSON.stringify({ number: "MSKU4821937" }) });
  if (url.searchParams.get("create") === "1") {
    await tryCall("create TEST-TR-SUCCEEDED", "/tracking_requests", { method: "POST", body: JSON.stringify({ data: { type: "tracking_request", attributes: { request_type: "bill_of_lading", request_number: "TEST-TR-SUCCEEDED", scac: "TEST" } } }) });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ hasKey: !!key, results: out }, null, 1));
};
