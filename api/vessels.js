/* Vercel serverless function: GET /api/vessels
   Live AIS positions for the ships this shift's boxes are booked on, from Terminal49's
   vessel API (GET /v2/vessels/{imo}), plus the account record from GET /v2/me.
   Both answer on the free plan. Set TERMINAL49_API_KEY in the Vercel environment. */

const BASE = "https://api.terminal49.com/v2";

/* One or more real vessels per carrier prefix used on the board. IMO numbers verified against Terminal49. */
const FLEET = [
  { imo: "9456783", scac: "MAEU", carrier: "Maersk" },
  { imo: "9619907", scac: "MAEU", carrier: "Maersk" },
  { imo: "9321483", scac: "MAEU", carrier: "Maersk" },
  { imo: "9632179", scac: "MAEU", carrier: "Maersk" },
  { imo: "9784271", scac: "MAEU", carrier: "Maersk" },
  { imo: "9929429", scac: "MSCU", carrier: "MSC" },
  { imo: "9839430", scac: "MSCU", carrier: "MSC" },
  { imo: "9703291", scac: "MSCU", carrier: "MSC" },
  { imo: "9706891", scac: "CMAU", carrier: "CMA CGM" },
  { imo: "9839179", scac: "CMAU", carrier: "CMA CGM" },
  { imo: "9454436", scac: "CMAU", carrier: "CMA CGM" },
  { imo: "9540118", scac: "HLXU", carrier: "Hapag-Lloyd" },
  { imo: "9501332", scac: "HLXU", carrier: "Hapag-Lloyd" },
  { imo: "9708849", scac: "HLXU", carrier: "Hapag-Lloyd" },
  { imo: "9776171", scac: "OOLU", carrier: "OOCL" },
  { imo: "9811000", scac: "EGLU", carrier: "Evergreen" },
  { imo: "9893890", scac: "EGLU", carrier: "Evergreen" },
  { imo: "9806079", scac: "ONEU", carrier: "Ocean Network Express" },
  { imo: "9795610", scac: "COSU", carrier: "COSCO" },
  { imo: "9704611", scac: "YMLU", carrier: "Yang Ming" },
  { imo: "9704623", scac: "YMLU", carrier: "Yang Ming" },
  { imo: "9863297", scac: "HMMU", carrier: "HMM" }
];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function get(key, path) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Token ${key}`, Accept: "application/vnd.api+json" } });
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { ok: r.ok, status: r.status, json };
}

function num(v) { const n = typeof v === "string" ? parseFloat(v) : v; return typeof n === "number" && isFinite(n) ? n : null; }

function mapVessel(entry, r) {
  const d = r && r.ok && r.json && r.json.data;
  if (!d || !d.attributes) return null;
  const a = d.attributes;
  return {
    imo: String(a.imo || entry.imo), name: a.name || null, mmsi: a.mmsi || null,
    scac: entry.scac, carrier: entry.carrier,
    lat: num(a.latitude), lon: num(a.longitude),
    speedKn: num(a.nautical_speed_knots), headingDeg: num(a.navigational_heading_degrees),
    positionAt: a.position_timestamp || null
  };
}

function mapAccount(r) {
  if (!r || !r.ok || !r.json) return null;
  const acct = (r.json.included || []).find(x => x && x.type === "account");
  const a = acct && acct.attributes ? acct.attributes : {};
  const cred = r.json.data && r.json.data.attributes ? r.json.data.attributes : {};
  return {
    company: a.company_name || null, plan: a.plan || null,
    slots: a.tracking_slots && typeof a.tracking_slots === "object" ? a.tracking_slots : null,
    keyName: cred.name || null
  };
}

module.exports = async (req, res) => {
  if (req.method && req.method !== "GET") return send(res, 405, { error: "GET only" });
  const key = process.env.TERMINAL49_API_KEY;
  if (!key) return send(res, 500, { error: "TERMINAL49_API_KEY is not set on the server" });
  try {
    const [me, ...rs] = await Promise.all([get(key, "/me"), ...FLEET.map(f => get(key, "/vessels/" + f.imo))]);
    if (me.status === 401) return send(res, 401, { error: "Terminal49 returned HTTP 401", hint: "The API key is missing or wrong." });
    const vessels = rs.map((r, i) => mapVessel(FLEET[i], r)).filter(v => v && v.lat != null && v.lon != null);
    if (!vessels.length) return send(res, 502, { error: "No vessel answered", hint: "Terminal49 vessel lookups failed for every IMO." , statuses: rs.map(r => r.status) });
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return send(res, 200, { source: "terminal49", fetchedAt: new Date().toISOString(), account: mapAccount(me), vessels });
  } catch (e) {
    return send(res, 502, { error: e.message || String(e), hint: "Could not reach Terminal49." });
  }
};
