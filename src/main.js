// ─── Main Entry Point ─────────────────────────────────────────────────
// Boots the app: loads styles, initializes Chart.js, sets up navigation,
// wires event delegation, and lazy-initializes pages on first visit.

import './styles/index.css';
import { Chart, registerables } from 'chart.js';
import { initChartDefaults } from './utils/charts.js';
import { pgInited } from './utils/state.js';

// Register all Chart.js components
Chart.register(...registerables);
window.Chart = Chart;

// Apply LS brand chart defaults
initChartDefaults();

// ─── Page module registry (lazy-loaded on first navigation) ──────────
const pageModules = {
  exec:       () => import('./pages/executive.js'),
  overview:   () => import('./pages/overview.js'),
  demand:     () => import('./pages/demand-plan.js'),
  avf:        () => import('./pages/actuals-vs-forecast.js'),
  daily:      () => import('./pages/daily.js'),
  inventory:  () => import('./pages/inventory.js'),
  shipment:   () => import('./pages/shipment.js'),
  pofc:       () => import('./pages/po-forecast.js'),
  promo:      () => import('./pages/promo.js'),
  launch:     () => import('./pages/launch.js'),
  historical: () => import('./pages/historical.js'),
  scenario:   () => import('./pages/scenario.js'),
  endcap:     () => import('./pages/endcap.js'),
  assumptions:() => import('./pages/assumptions.js'),
  guide:      () => import('./pages/guide.js'),
  fcastver:   () => import('./pages/forecast-versions.js'),
  backtest:   () => import('./pages/backtest.js'),
  modellearn: () => import('./pages/model-learning.js'),
  addsku:     () => import('./pages/add-sku.js'),
  riskos:     () => import('./pages/risk-os.js'),
  actuals:    () => import('./pages/actuals-tracking.js'),
};

// Init function names per page (convention: each module exports an init*)
const pageInitFns = {
  exec:       'initEXEC',
  overview:   'initOV',
  demand:     'initDP',
  avf:        'initAVF',
  daily:      'initDP2',
  inventory:  'initINV',
  shipment:   'initSHIP',
  pofc:       'initPOFC',
  promo:      'initPROMO',
  launch:     'initLAUNCH',
  historical: 'initHIST',
  scenario:   'initSCEN',
  endcap:     'initENDCAP',
  assumptions:'initASSUMP',
  guide:      'initGUIDE',
  fcastver:   'initFCASTVER',
  backtest:   'initBACKTEST',
  modellearn: 'initMODELLEARN',
  addsku:     'initADDSKU',
  riskos:     'initRISKOS',
  actuals:    'initACTUALS',
};

// Cache of loaded modules
const loadedModules = {};

// ─── Navigation ──────────────────────────────────────────────────────
let currentPage = 'exec';

async function nav(elOrId, id) {
  // Support both nav('pageId') and nav(element, 'pageId') calling conventions
  let pageId, clickedEl;
  if (typeof elOrId === 'string') {
    pageId = elOrId;
  } else {
    pageId = id;
    clickedEl = elOrId;
  }

  // Hide all pages, show target
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('pg-' + pageId);
  if (pg) pg.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.nav-it').forEach(n => n.classList.remove('active'));
  if (clickedEl) {
    clickedEl.classList.add('active');
  }

  currentPage = pageId;

  // Lazy-load and init page module on first visit
  if (!pgInited[pageId] && pageModules[pageId]) {
    try {
      if (!loadedModules[pageId]) {
        loadedModules[pageId] = await pageModules[pageId]();
      }
      const mod = loadedModules[pageId];
      const initFn = pageInitFns[pageId];

      // Register all exported functions on window for cross-page calls
      for (const [key, val] of Object.entries(mod)) {
        if (typeof val === 'function') {
          window[key] = val;
        }
      }

      if (initFn && typeof mod[initFn] === 'function') {
        mod[initFn]();
        pgInited[pageId] = true;
      }
    } catch (err) {
      console.error(`Failed to init page "${pageId}":`, err);
    }
  }
}

// Expose nav globally for any remaining inline handlers
window.nav = nav;

// ─── Event Delegation ────────────────────────────────────────────────
function setupEventDelegation() {
  // Sidebar navigation
  document.querySelectorAll('.nav-it[data-page]').forEach(el => {
    el.addEventListener('click', () => nav(el.dataset.page));
  });

  // Generic data-action buttons (scenario toggles, view toggles, etc.)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const scenario = btn.dataset.scenario;
    const view = btn.dataset.view;
    const unit = btn.dataset.unit;
    const filter = btn.dataset.filter;

    // Ensure the page module is loaded
    const pageEl = btn.closest('.pg');
    if (pageEl) {
      const pageId = pageEl.id.replace('pg-', '');
      if (!loadedModules[pageId] && pageModules[pageId]) {
        loadedModules[pageId] = await pageModules[pageId]();
        const mod = loadedModules[pageId];
        for (const [key, val] of Object.entries(mod)) {
          if (typeof val === 'function') window[key] = val;
        }
      }
    }

    // Call the action function with appropriate args
    const fn = window[action];
    if (typeof fn === 'function') {
      if (scenario !== undefined) fn(scenario, btn);
      else if (view !== undefined) fn(view, btn);
      else if (unit !== undefined) fn(unit, btn);
      else if (filter !== undefined) fn(btn, filter);
      else fn(btn);
    }
  });

  // Select/input change/input events
  document.addEventListener('change', (e) => {
    const el = e.target;
    const action = el.dataset.change;
    if (action && typeof window[action] === 'function') {
      window[action]();
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    const action = el.dataset.input;
    if (action && typeof window[action] === 'function') {
      window[action]();
    }
  });
}

// ─── Boot ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupEventDelegation();

  // Init the default page (Executive Summary)
  nav('exec');
});
