/* Vercel serverless function: GET /api/boxes
   Reads the containers tracked in the Terminal49 account and returns them in the
   shape index.html expects for its real-data layer. The API key never reaches the browser.
   Set TERMINAL49_API_KEY in the Vercel project's environment variables. */

const BASE = "https://api.terminal49.com/v2";
const PAGE_SIZE = 50;
const MAX_PAGES = 2; // up to 100 boxes, matching the simulated roster

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/* One Terminal49 container (+ its included shipment and terminal) -> one plain record for the page. */
function mapContainer(c, included) {
  const a = c.attributes || {};
  const rel = c.relationships || {};
  const shipRef = rel.shipment && rel.shipment.data;
  const ship = shipRef ? included.get("shipment:" + shipRef.id) : null;
  const s = ship ? ship.attributes || {} : null;
  const termRef = rel.pod_terminal && rel.pod_terminal.data;
  const term = termRef ? included.get("terminal:" + termRef.id) : null;
  const holds = Array.isArray(a.holds_at_pod_terminal) ? a.holds_at_pod_terminal : [];
  const fees = Array.isArray(a.fees_at_pod_terminal) ? a.fees_at_pod_terminal : [];
  // Terminal49's own guidance: sum line items, skip the overlapping "total" row.
  const feesTotal = fees
    .filter(f => f && f.type !== "total" && typeof f.amount === "number")
    .reduce((sum, f) => sum + f.amount, 0);
  return {
    t49Id: c.id,
    number: a.number || null,
    equipmentType: a.equipment_type || null,
    equipmentLength: a.equipment_length || null,
    equipmentHeight: a.equipment_height || null,
    weightLbs: typeof a.weight_in_lbs === "number" ? a.weight_in_lbs : null,
    sealNumber: a.seal_number || null,
    currentStatus: a.current_status || null,
    holds: holds.filter(Boolean).map(h => ({ name: h.name || "other", status: h.status || "hold", description: h.description || null })),
    fees: fees.filter(Boolean).map(f => ({ type: f.type || "other", amount: typeof f.amount === "number" ? f.amount : null, currency: f.currency_code || "USD" })),
    feesTotal,
    pickupLfd: a.pickup_lfd || null,
    availabilityKnown: a.availability_known === true,
    availableForPickup: a.available_for_pickup === true,
    locationAtTerminal: a.location_at_pod_terminal || null,
    pickupAppointmentAt: a.pickup_appointment_at || null,
    terminalCheckedAt: a.terminal_checked_at || null,
    podTimezone: a.pod_timezone || null,
    podArrivedAt: a.pod_arrived_at || null,
    podDischargedAt: a.pod_discharged_at || null,
    podFullOutAt: a.pod_full_out_at || null,
    emptyTerminatedAt: a.empty_terminated_at || null,
    shipment: s ? {
      t49Id: ship.id,
      bol: s.bill_of_lading_number || null,
      scac: s.shipping_line_scac || null,
      carrier: s.shipping_line_name || null,
      carrierShort: s.shipping_line_short_name || null,
      pol: s.port_of_lading_name || null, polCode: s.port_of_lading_locode || null,
      pod: s.port_of_discharge_name || null, podCode: s.port_of_discharge_locode || null,
      destination: s.destination_name || null,
      vessel: s.pod_vessel_name || null, imo: s.pod_vessel_imo || null, voyage: s.pod_voyage_number || null,
      polEtd: s.pol_etd_at || null, polAtd: s.pol_atd_at || null,
      podEta: s.pod_eta_at || null, podAta: s.pod_ata_at || null,
      lineCheckedAt: s.line_tracking_last_succeeded_at || null
    } : null,
    terminal: term ? { name: (term.attributes && term.attributes.name) || null, firms: (term.attributes && term.attributes.firms_code) || null } : null
  };
}

async function fetchAll(key) {
  const included = new Map();
  const boxes = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/containers?include=shipment,pod_terminal&page[number]=${page}&page[size]=${PAGE_SIZE}`;
    const r = await fetch(url, { headers: { Authorization: `Token ${key}`, Accept: "application/vnd.api+json" } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const err = new Error(`Terminal49 returned HTTP ${r.status}`);
      err.status = r.status; err.detail = text.slice(0, 300);
      throw err;
    }
    const j = await r.json();
    for (const inc of j.included || []) included.set(inc.type + ":" + inc.id, inc);
    for (const c of j.data || []) boxes.push(mapContainer(c, included));
    const more = j.links && j.links.next && (j.data || []).length === PAGE_SIZE;
    if (!more) break;
  }
  return boxes;
}

module.exports = async (req, res) => {
  if (req.method && req.method !== "GET") return send(res, 405, { error: "GET only" });
  const key = process.env.TERMINAL49_API_KEY;
  if (!key) return send(res, 500, { error: "TERMINAL49_API_KEY is not set on the server" });
  try {
    const boxes = await fetchAll(key);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return send(res, 200, { source: "terminal49", fetchedAt: new Date().toISOString(), count: boxes.length, boxes });
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? e.status : e.status === 429 ? 429 : 502;
    const hint = e.status === 401 ? "The key is missing, wrong, or on the free plan (free keys cannot read containers; a trial or paid plan is needed)."
      : e.status === 403 ? "This endpoint is not enabled for the account."
      : e.status === 429 ? "Rate limited by Terminal49; try again shortly."
      : "Could not reach Terminal49.";
    return send(res, status, { error: e.message || String(e), hint, detail: e.detail || null });
  }
};
module.exports.mapContainer = mapContainer;
