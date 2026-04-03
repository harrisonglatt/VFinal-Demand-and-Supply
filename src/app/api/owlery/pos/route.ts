// ─── Owlery PO API Route ──────────────────────────────────────────────
// CRITICAL: This route is the supply data backbone. It feeds:
//   - PO Tracker (delivery schedule, load status, shipped revenue)
//   - Inventory Intel (inbound on-order for WOC calculations)
//   - Shipment Plan (actual vs planned shipment comparison)
//   - Executive Summary (PO coverage, order alignment)
//
// Current state: Uses /loads/search endpoint (returns loads, not orders).
// The actual Target sales orders live in Owlery's orders system (visible
// at owlery.ai/dashboard/orders) but aren't exposed via the external API.
//
// TODO: When Travis enables the orders endpoint:
//   1. Add /orders/search or /orders?type=sales&tradingPartner=Target call
//   2. Transform order items into OwleryPOLine[] (same shape as loads)
//   3. Reference numbers are formatted as "10001801175-0551" (PO-DC)
//   4. Orders have 2,274+ entries across all Target DCs
//   5. Delivery dates extend to May 2026 (Fruit Puzzlers, etc.)
//
// Owlery API docs: https://owleryai.docs.apiary.io/
// Base URL: https://api.owlery.ai/api/ext/v1
// Auth: Bearer token via Authorization header
//
// Auto-refresh: Page polls this route every 5 minutes.
// Cache: no-store headers ensure fresh data on each request.

import { NextRequest, NextResponse } from 'next/server';
import type { OwleryPOLine } from '@/data/types';
import { buildOwleryPOData, resolveFromCaseCode } from '@/lib/owlery/transform';
import { MOCK_PO_LINES } from '@/lib/owlery/mock-pos';

const OWLERY_BASE = 'https://api.owlery.ai/api/ext/v1';
const OWLERY_API_KEY = process.env.OWLERY_API_KEY ?? '';

// When the orders API is enabled, set this env var to activate order fetching
const OWLERY_ORDERS_ENABLED = process.env.OWLERY_ORDERS_ENABLED === 'true';

/**
 * Transform an Owlery load search result into our OwleryPOLine shape.
 * Owlery's /loads/search returns loads with stops, items, and reference numbers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function owleryLoadToLines(load: any): OwleryPOLine[] {
  const lines: OwleryPOLine[] = [];

  // Extract PO number from reference numbers
  const refs = load.referenceNumbers ?? load.references ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poRef = refs.find((r: any) => r.type === 'PO');
  const poNumber = poRef?.value ?? load.loadNumber ?? 'UNKNOWN';

  // Extract delivery info from last stop (dropoff)
  const stops = load.stops ?? [];
  const dropoff = stops.length > 0 ? stops[stops.length - 1] : null;
  const deliveryDate = dropoff?.appointment?.start
    ? new Date(dropoff.appointment.start).toISOString().slice(0, 10)
    : '';
  const dcName = dropoff?.facility?.name ?? dropoff?.address?.city ?? '';

  // Ship date from first stop (pickup)
  const pickup = stops.length > 0 ? stops[0] : null;
  const shipDate = pickup?.appointment?.start
    ? new Date(pickup.appointment.start).toISOString().slice(0, 10)
    : '';

  // Map load status to our status type
  const statusMap: Record<string, OwleryPOLine['status']> = {
    Open: 'open',
    Planned: 'planned',
    Quoted: 'quoted',
    Tendered: 'tendered',
    InTransit: 'inProgress',
    InProgress: 'inProgress',
    Delivered: 'closed',
    Cancelled: 'cancelled',
  };
  const status = statusMap[load.status] ?? 'open';

  // Extract items
  const items = load.items ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of items) {
    const qty = item.quantity ?? 0;
    const uom = item.quantityUnitOfMeasure ?? 'Case';
    const isCases = uom === 'Case' || uom === 'Carton';
    const unitsPerCase = item.innerPackQuantity ?? item.unitsPerCase ?? 1;

    // Resolve DPCI, product name, category, and units_per_case from the case code (LS-X...)
    const caseCode = item.sku ?? item.itemNumber ?? '';
    const resolved = resolveFromCaseCode(
      caseCode,
      item.customerItemNumber ?? caseCode,
      item.description ?? item.name ?? '',
      item.category ?? '',
      unitsPerCase,
    );
    const upc = resolved.units_per_case;
    const cases = isCases ? qty : Math.ceil(qty / upc);

    lines.push({
      po_number: poNumber,
      sku: caseCode,
      dpci: resolved.dpci,
      product_name: resolved.product_name,
      category: resolved.category,
      cases,
      units_per_case: upc,
      total_units: cases * upc,
      delivery_date: deliveryDate,
      ship_date: shipDate,
      status,
      carrier: load.carrier?.name ?? '',
      load_number: load.loadNumber ?? '',
      destination_dc: dcName,
      mode: load.mode ?? 'FTL',
    });
  }

  return lines;
}

/**
 * Fetch orders from Owlery's orders endpoint (when enabled).
 * This is the primary data source — orders contain all Target sales orders
 * with line-level SKU, quantity, delivery dates, and DC information.
 *
 * Activate by setting OWLERY_ORDERS_ENABLED=true in .env
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOwleryOrders(): Promise<OwleryPOLine[]> {
  // TODO: Replace with actual orders endpoint when Travis enables it
  // Expected endpoint: POST /api/ext/v1/orders/search or GET /api/ext/v1/orders
  // Expected filters: type=sales, tradingPartner=Target
  // Expected response: array of order objects with items[]

  const endpoints = [
    // Try orders/search first (preferred)
    { url: `${OWLERY_BASE}/orders/search`, method: 'POST', body: JSON.stringify({ type: 'sales', tradingPartner: 'Target' }) },
    // Fallback: try GET with query params
    { url: `${OWLERY_BASE}/orders?type=sales&limit=500`, method: 'GET', body: undefined },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Authorization': `Bearer ${OWLERY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: ep.body,
      });

      if (!res.ok) continue; // Try next endpoint

      const result = await res.json();
      const orders = result.orders ?? result.data ?? result ?? [];
      const ordersArr = Array.isArray(orders) ? orders : [orders];

      if (ordersArr.length === 0) continue;

      // Transform orders into PO lines
      const allLines: OwleryPOLine[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const order of ordersArr) {
        if (!order) continue;

        // Filter: only Target sales orders
        const customer = (order.customer?.name ?? order.tradingPartner ?? '').toLowerCase();
        const orderType = (order.type ?? order.orderType ?? '').toLowerCase();
        if (!customer.includes('target')) continue;
        if (orderType && !orderType.includes('sales') && !orderType.includes('so')) continue;

        // Extract order reference
        const refs = order.referenceNumbers ?? order.references ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poRef = refs.find((r: any) => r.type === 'Order' || r.type === 'PO');
        const poNumber = poRef?.value ?? order.orderNumber ?? 'UNKNOWN';

        // Extract dates from stops
        const stops = order.stops ?? [];
        const dropoff = stops.length > 0 ? stops[stops.length - 1] : null;
        const deliveryDate = dropoff?.appointment?.start
          ? new Date(dropoff.appointment.start).toISOString().slice(0, 10)
          : order.deliveryDate ?? '';
        const pickup = stops.length > 0 ? stops[0] : null;
        const shipDate = pickup?.appointment?.start
          ? new Date(pickup.appointment.start).toISOString().slice(0, 10)
          : order.shipDate ?? '';
        const dcName = dropoff?.facility?.name ?? order.customer?.name ?? '';

        // Map status
        const statusMap: Record<string, OwleryPOLine['status']> = {
          open: 'open', Open: 'open', planned: 'planned', Planned: 'planned',
          quoted: 'quoted', Quoted: 'quoted', tendered: 'tendered', Tendered: 'tendered',
          inProgress: 'inProgress', InProgress: 'inProgress', InTransit: 'inProgress',
          closed: 'closed', Delivered: 'closed', Cancelled: 'cancelled', cancelled: 'cancelled',
        };
        const status = statusMap[order.status] ?? 'open';

        // Process items
        const items = order.items ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of items) {
          const qty = item.quantity ?? item.orderedQuantity ?? 0;
          const caseCode = item.sku ?? item.itemNumber ?? '';
          const resolved = resolveFromCaseCode(
            caseCode,
            item.customerItemNumber ?? caseCode,
            item.description ?? item.name ?? '',
            item.category ?? '',
            item.unitsPerCase ?? 1,
          );

          allLines.push({
            po_number: poNumber,
            sku: caseCode,
            dpci: resolved.dpci,
            product_name: resolved.product_name,
            category: resolved.category,
            cases: qty,
            units_per_case: resolved.units_per_case,
            total_units: qty * resolved.units_per_case,
            delivery_date: deliveryDate,
            ship_date: shipDate,
            status,
            carrier: order.carrier?.name ?? '',
            load_number: order.loadNumber ?? '',
            destination_dc: dcName,
            mode: order.mode ?? 'FTL',
          });
        }
      }

      if (allLines.length > 0) return allLines;
    } catch {
      continue; // Try next endpoint
    }
  }

  return []; // No orders found via any endpoint
}

export async function GET(req: NextRequest) {
  // ── If no API key, return mock data ──────────────────────────────
  if (!OWLERY_API_KEY) {
    const data = buildOwleryPOData(MOCK_PO_LINES);
    return NextResponse.json(
      { ...data, source: 'Mock (set OWLERY_API_KEY to use live data)' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── Step 1: Try orders endpoint first (when enabled) ──────────────
  if (OWLERY_ORDERS_ENABLED) {
    try {
      const orderLines = await fetchOwleryOrders();
      if (orderLines.length > 0) {
        const data = buildOwleryPOData(orderLines);
        return NextResponse.json(
          { ...data, source: `Owlery Orders API (${orderLines.length} lines)` },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
    } catch (err) {
      console.error('Owlery orders fetch failed, falling back to loads:', err);
    }
  }

  // ── Call Owlery /loads/search for PO-referenced loads ────────────
  try {
    const poNumbers = req.nextUrl.searchParams.getAll('po');

    // If no specific POs requested, search with common prefixes
    const searchRefs = poNumbers.length > 0
      ? poNumbers
      : ['PO-'];  // Broad search — Owlery matches partial reference numbers

    const res = await fetch(`${OWLERY_BASE}/loads/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OWLERY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ referenceNumbers: searchRefs }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Owlery API error: ${res.status} ${res.statusText}`, errText);
      // Fall back to mock on error
      const data = buildOwleryPOData(MOCK_PO_LINES);
      return NextResponse.json(
        { ...data, source: `Owlery API error (${res.status}) — showing mock data` },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = await res.json();
    const loads = result.loads ?? result.data ?? result ?? [];
    const loadsArr = Array.isArray(loads) ? loads : [loads];

    // Filter: only loads where trading partner is Target and type is Sales Order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredLoads = loadsArr.filter((load: any) => {
      if (!load) return false;

      // Check trading partner = Target (in stops, parties, or customer fields)
      const refs = load.referenceNumbers ?? load.references ?? [];
      const stops = load.stops ?? [];
      const parties = load.parties ?? [];

      const isTarget =
        // Check destination facility name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stops.some((s: any) => {
          const name = (s.facility?.name ?? s.name ?? s.address?.city ?? '').toLowerCase();
          return name.includes('target');
        }) ||
        // Check trading partner in parties
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parties.some((p: any) => {
          const name = (p.name ?? p.companyName ?? '').toLowerCase();
          return name.includes('target');
        }) ||
        // Check customer/tradingPartner fields on the load itself
        (load.customer?.name ?? load.tradingPartner ?? load.consignee ?? '').toLowerCase().includes('target') ||
        // Check reference numbers for Target references
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        refs.some((r: any) => (r.value ?? '').toLowerCase().includes('target'));

      // Check order type = Sales Order
      const isSalesOrder =
        (load.type ?? load.orderType ?? '').toLowerCase().includes('sales') ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        refs.some((r: any) =>
          (r.type ?? '').toLowerCase().includes('sales') ||
          ((r.type ?? '').toLowerCase() === 'order_type' && (r.value ?? '').toLowerCase().includes('sales')),
        ) ||
        // If no explicit type field, accept loads that have PO references
        // (in many TMS systems, PO-referenced loads to retailers are sales orders)
        (!load.type && !load.orderType && refs.some((r: any) => (r.type ?? '') === 'PO'));

      return isTarget && isSalesOrder;
    });

    // If no matching loads after filtering, fall back to mock data
    if (filteredLoads.length === 0) {
      const data = buildOwleryPOData(MOCK_PO_LINES);
      const totalLoads = loadsArr.filter(Boolean).length;
      return NextResponse.json(
        { ...data, source: `Owlery connected (${totalLoads} loads found, 0 matched Target Sales Orders) — showing mock data` },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Transform filtered loads into PO lines
    const allLines: OwleryPOLine[] = filteredLoads.flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (load: any) => owleryLoadToLines(load),
    );

    const data = buildOwleryPOData(allLines);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Owlery fetch failed:', err);
    const data = buildOwleryPOData(MOCK_PO_LINES);
    return NextResponse.json(
      { ...data, source: 'Owlery API unreachable — showing mock data' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
