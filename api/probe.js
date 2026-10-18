/* TEMPORARY diagnostic: which Terminal49 endpoints answer for this key. Read-only. Remove after use.
   ?imo=a,b,c  -> look up each vessel      ?q=text -> run /search */
const BASE = "https://api.terminal49.com/v2";
module.exports = async (req, res) => {
  const key = process.env.TERMINAL49_API_KEY;
  const url = new URL(req.url, "http://x");
  const out = [];
  const H = { Authorization: `Token ${key}`, Accept: "application/vnd.api+json" };
  async function tryCall(label, path) {
    try {
      const r = await fetch(BASE + path, { headers: H });
      const text = await r.text();
      out.push({ label, status: r.status, body: text.slice(0, 600) });
    } catch (e) { out.push({ label, status: "ERR", body: String(e.message || e) }); }
  }
  const imos = (url.searchParams.get("imo") || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const imo of imos) await tryCall("vessel " + imo, "/vessels/" + encodeURIComponent(imo));
  const q = url.searchParams.get("q");
  if (q) await tryCall("search " + q, "/search?query=" + encodeURIComponent(q));
  if (!imos.length && !q) await tryCall("me", "/me");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ hasKey: !!key, results: out }, null, 1));
};
