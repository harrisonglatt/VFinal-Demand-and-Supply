// ─── PO Generator ────────────────────────────────────────────────────────────
// Builds Purchase Order data from supply-plan recommendations and generates
// branded PDF documents matching the Little Spoon PO template.

import jsPDF from 'jspdf';
import type { PORecommendation, SupplySku, ContractManufacturer } from './engine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface POLineItem {
  itemDescription: string;   // e.g. "G20 Organic Whole Milk - LS-IF001\n400g Litho Can\nCase = 6 x 400g units,\nCase quantity = 17,000 cases"
  qty: number;               // units
  rate: number;              // unit price
  amount: number;            // qty × rate
  caseCode: string;
  cases: number;
}

export interface PurchaseOrder {
  poNumber: string;
  date: string;              // MM/DD/YYYY
  vendor: {
    name: string;
    contactName: string;
    contactEmail: string;
  };
  shipTo: string;            // e.g. "FOB Sacramento, CA"
  shipDate: string;          // MM/DD/YY
  lineItems: POLineItem[];
  subtotal: number;
  total: number;
  signatureDataUrl?: string; // PNG data URL from signature pad
  signedDate?: string;       // date string when signed
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let poCounter = 7562; // starting after the sample PO number

export function generatePONumber(): string {
  poCounter += 1;
  return `PO-${String(poCounter).padStart(5, '0')}`;
}

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  // If the date contains a year (ISO format or MM/DD/YYYY), parse and reformat
  if (dateStr.includes('-') || /\d{4}/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    }
  }
  // Short dates like "May 17" — pass through as-is
  return dateStr;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Build PO from recommendations ──────────────────────────────────────────

export function buildPOFromRecommendations(
  recs: PORecommendation[],
  skus: SupplySku[],
  cm: ContractManufacturer,
  overrides?: {
    poNumber?: string;
    date?: string;
    shipTo?: string;
    shipDate?: string;
  },
): PurchaseOrder {
  const skuMap = new Map(skus.map(s => [s.dpci, s]));

  const lineItems: POLineItem[] = recs.map(rec => {
    const sku = skuMap.get(rec.dpci);
    const unitsPerCase = sku?.unitsPerCase ?? 1;
    const unitPrice = sku?.unitPrice ?? 0;

    const descLines = [
      `${rec.name} - ${rec.caseCode}`,
      `Case = ${unitsPerCase} units`,
      `Case quantity = ${fmtNum(rec.recommendedCases)} cases`,
    ];

    return {
      itemDescription: descLines.join('\n'),
      qty: rec.recommendedUnits,
      rate: unitPrice,
      amount: Math.round(rec.recommendedUnits * unitPrice * 100) / 100,
      caseCode: rec.caseCode,
      cases: rec.recommendedCases,
    };
  });

  const subtotal = lineItems.reduce((a, li) => a + li.amount, 0);

  // Earliest ship date from selected recs
  const earliestShip = recs.reduce((earliest, r) => {
    if (!earliest || r.shipDate < earliest) return r.shipDate;
    return earliest;
  }, '' as string);

  return {
    poNumber: overrides?.poNumber ?? generatePONumber(),
    date: overrides?.date ?? formatDate(new Date()),
    vendor: {
      name: cm.name,
      contactName: cm.contactName ?? '',
      contactEmail: cm.contactEmail ?? '',
    },
    shipTo: overrides?.shipTo ?? `FOB ${cm.location}`,
    shipDate: overrides?.shipDate ?? formatDateShort(earliestShip),
    lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(subtotal * 100) / 100,
  };
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

const TEAL = [0, 227, 205] as const;      // #00E3CD
const DARK = [30, 41, 59] as const;        // #1e293b
const GRAY = [100, 116, 139] as const;     // #64748b
const LIGHT_GRAY = [226, 232, 240] as const; // #e2e8f0

const TERMS_TEXT = `All Purchase Orders made by Little Spoon, Inc. (the "Company") are expressly limited to your acceptance of the Company's terms and conditions. These terms and conditions shall govern any transaction arising out of any Purchase Order ("PO") made by the Company, regardless of printed terms, conditions or provisions contained in responses thereto or documents giving rise thereto. You are hereby notified, in advance, that the Company expressly rejects any and all additional, different or inconsistent terms or conditions proposed in an invoice and/or other documents. Acceptance of this PO, including these terms and conditions, may occur in any reasonable manner, including without limitation issuing an invoice or shipping products to the Company. Payment terms begin upon the Company's possession/receipt of product. Please do not ship 'back ordered' product. One invoice per PO is permitted. Please request a new PO for product not shipped.`;

export function generatePOPdf(po: PurchaseOrder): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9; // letter width mm
  const margin = 18;
  const rightEdge = W - margin;
  let y = margin;

  // ── Company Header ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text('Little Spoon, Inc.', margin, y);

  // Logo text (right side, teal script)
  doc.setFontSize(26);
  doc.setTextColor(...TEAL);
  doc.text('little spoon', rightEdge, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  y += 5;
  doc.text('31 Bond Street, 4th Floor', margin, y);
  y += 4;
  doc.text('NY', margin, y);
  y += 4;
  doc.text('888.878.7807', margin, y);

  // ── "Purchase Order" title ───────────────────────────────────────────────
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...TEAL);
  doc.text('Purchase Order', margin, y);

  // ── Teal divider ─────────────────────────────────────────────────────────
  y += 4;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.line(margin, y, rightEdge, y);

  // ── Vendor / Ship To / PO metadata ─────────────────────────────────────
  y += 8;
  const col1 = margin;
  const col2 = margin + 55;
  const col3 = rightEdge - 55;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('VENDOR', col1, y);
  doc.text('SHIP TO', col2, y);
  doc.text('P.O. NO.', col3, y);
  doc.setFont('helvetica', 'bold');
  doc.text(po.poNumber, rightEdge, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);

  // Vendor name (may wrap)
  const vendorLines = doc.splitTextToSize(po.vendor.name, 50);
  doc.text(vendorLines, col1, y);

  doc.text(po.shipTo, col2, y);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('DATE', col3, y);
  doc.setFont('helvetica', 'bold');
  doc.text(po.date, rightEdge, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`SHIP DATE ${po.shipDate}`, col2, y);

  // ── Line items table ────────────────────────────────────────────────────
  y += 12;

  // Table header
  doc.setFillColor(...TEAL);
  doc.rect(margin, y - 4, rightEdge - margin, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);

  const colItem = margin + 2;
  const colQty = margin + 105;
  const colRate = margin + 130;
  const colAmount = rightEdge - 2;

  doc.text('ITEM', colItem, y);
  doc.text('QTY', colQty, y, { align: 'right' });
  doc.text('RATE', colRate, y, { align: 'right' });
  doc.text('AMOUNT', colAmount, y, { align: 'right' });

  y += 6;

  // Table rows
  doc.setTextColor(...DARK);
  for (const li of po.lineItems) {
    const lines = li.itemDescription.split('\n');
    const rowHeight = lines.length * 4 + 4;

    // Check page break
    if (y + rowHeight > 260) {
      doc.addPage();
      y = margin;
    }

    // Alternating row bg
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y - 3.5, rightEdge - margin, rowHeight, 'F');

    // Item description lines
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(lines[0] || '', colItem, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (let i = 1; i < lines.length; i++) {
      y += 4;
      doc.text(lines[i], colItem, y);
    }

    // Qty, Rate, Amount (vertically centered on first line)
    const numY = y - (lines.length - 1) * 4;
    doc.setFontSize(9);
    doc.text(fmtNum(li.qty), colQty, numY, { align: 'right' });
    doc.text(fmtMoney(li.rate), colRate, numY, { align: 'right' });
    doc.text(fmtMoney(li.amount), colAmount, numY, { align: 'right' });

    y += 8;
  }

  // ── Terms + Totals section ──────────────────────────────────────────────
  y += 4;

  // Light border above
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.line(margin, y, rightEdge, y);
  y += 6;

  const termsX = margin;
  const termsW = 100;
  const totalsX = margin + 110;

  // Check if we need a new page for terms + totals
  if (y > 220) {
    doc.addPage();
    y = margin;
  }

  // Terms text (left side)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  const termsLines = doc.splitTextToSize(TERMS_TEXT, termsW);
  doc.text(termsLines, termsX, y);

  // Subtotal / Total (right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  doc.text('SUBTOTAL', totalsX, y);
  doc.text(fmtMoney(po.subtotal), colAmount, y, { align: 'right' });

  y += 6;
  doc.text('TOTAL', totalsX, y);
  doc.text(`USD ${fmtMoney(po.total)}`, colAmount, y, { align: 'right' });

  // ── Signature lines ─────────────────────────────────────────────────────
  const sigY = Math.max(y + 20, 240);

  if (sigY > 260) {
    doc.addPage();
    const newSigY = margin + 20;
    drawSignatureLines(doc, margin, rightEdge, newSigY, po.signatureDataUrl, po.signedDate);
  } else {
    drawSignatureLines(doc, margin, rightEdge, sigY, po.signatureDataUrl, po.signedDate);
  }

  return doc;
}

function drawSignatureLines(
  doc: jsPDF, margin: number, rightEdge: number, y: number,
  signatureDataUrl?: string, signedDate?: string,
) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  doc.text('Approved By', margin, y);
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.3);
  doc.line(margin + 30, y, rightEdge, y);

  // Embed signature image if provided
  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, 'PNG', margin + 32, y - 12, 50, 12);
    } catch { /* ignore image errors */ }
  }

  y += 14;
  doc.text('Date', margin, y);
  doc.line(margin + 30, y, rightEdge, y);

  // Print signed date if provided
  if (signedDate) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(signedDate, margin + 32, y - 1);
  }
}

// ─── Download helper ─────────────────────────────────────────────────────────

export function downloadPO(po: PurchaseOrder): void {
  const pdf = generatePOPdf(po);
  pdf.save(`Little_Spoon_${po.poNumber}_${po.vendor.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

// ─── PO PDF as base64 (for email attachment) ─────────────────────────────────

export function getPOPdfBase64(po: PurchaseOrder): string {
  const pdf = generatePOPdf(po);
  return pdf.output('datauristring');
}
