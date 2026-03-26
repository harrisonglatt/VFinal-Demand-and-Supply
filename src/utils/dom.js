// ─── DOM / HTML Utilities ─────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html

/**
 * Create a chip (badge) HTML string.
 * @param {string} cls - CSS class for the chip
 * @param {string} txt - Display text
 * @returns {string} HTML string
 */
export function chip(cls, txt) {
  return `<span class="ch ${cls}">${txt}</span>`;
}

/**
 * Return a risk-flag chip based on the flag string.
 * @param {string} f - Risk flag text (e.g. "OOS", "Watch")
 * @returns {string} Chip HTML
 */
export function riskChip(f) {
  f = f || '';
  if (f.includes('OOS')) return chip('cr', '\u{1F534} OOS');
  if (f.includes('Watch')) return chip('cy2', '\u{1F7E1} Watch');
  return chip('cg', '\u2705 OK');
}

/**
 * Populate a <select> element with unique sorted values.
 * Preserves the first <option> (e.g. "All") already in the DOM.
 * @param {string} id  - DOM id of the select element
 * @param {Array} vals - Values to populate
 */
export function fillSel(id, vals) {
  const el = document.getElementById(id);
  if (!el) return;
  const first = el.options[0];
  el.innerHTML = '';
  el.appendChild(first);
  [...new Set(vals.filter(Boolean))]
    .sort()
    .forEach((v) => {
      const o = document.createElement('option');
      o.value = o.text = v;
      el.appendChild(o);
    });
}

/**
 * Generate a KPI card HTML block.
 * @param {string} ic    - Icon (emoji or HTML)
 * @param {string} lbl   - Label text
 * @param {string} css   - Inline CSS custom-property overrides
 * @param {string|number} val - Main display value
 * @param {string} delta - Delta / change text
 * @param {string} dcls  - CSS class for the delta (e.g. 'cg', 'cr')
 * @param {string} sub   - Sub-label text
 * @returns {string} HTML string
 */
export function kpiCard(ic, lbl, css, val, delta, dcls, sub) {
  return `<div class="kc" style="${css}">
    <div class="ki">${ic}</div><div class="kl">${lbl}</div>
    <div class="kv${typeof val === 'string' && val.length > 8 ? ' sm' : ''}">${val}</div>
    <div class="kd ${dcls}">${delta}</div>
    <div class="ks">${sub}</div></div>`;
}
