// ─── Chart.js Utilities ───────────────────────────────────────────────
// Extracted from LS-Target-Demand-Intelligence.html
// Requires Chart.js to be loaded globally or imported before use.

/**
 * Apply Little Spoon brand defaults to Chart.js global config.
 * Call once after Chart.js is loaded.
 */
export function initChartDefaults() {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.font.family = "'Roboto',sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#7b97c8';
  Chart.defaults.borderColor = 'rgba(30,48,84,0.5)';

  Chart.defaults.plugins.legend.labels.font = {
    family: "'Roboto',sans-serif",
    size: 11,
    weight: '500',
  };
  Chart.defaults.plugins.tooltip.titleFont = {
    family: "'Roboto',sans-serif",
    size: 12,
    weight: '700',
  };
  Chart.defaults.plugins.tooltip.bodyFont = {
    family: "'Roboto',sans-serif",
    size: 11,
  };
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(13,22,38,0.95)';
  Chart.defaults.plugins.tooltip.borderColor = '#00E3CD';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;

  Chart.defaults.scale.grid.color = 'rgba(30,45,80,.4)';
  Chart.defaults.scale.grid.lineWidth = 1;
}

/**
 * Destroy a Chart instance if it exists.
 * @param {Chart|null} chartInstance
 */
export function destroyChart(chartInstance) {
  if (chartInstance && typeof chartInstance.destroy === 'function') {
    chartInstance.destroy();
  }
}

/**
 * Create a styled line chart.
 * @param {string} id        - Canvas element id
 * @param {string[]} labels  - X-axis labels
 * @param {Array<{label:string, data:number[], bc:string, bg?:string, dash?:number[]}>} datasets
 * @returns {Chart} The Chart.js instance
 */
export function mkLine(id, labels, datasets) {
  const ds = datasets.map((d) => ({
    label: d.label,
    data: d.data,
    borderColor: d.bc,
    backgroundColor: d.bg || d.bc + '18',
    fill: !!d.bg,
    tension: 0.4,
    pointRadius: 3,
    pointBackgroundColor: d.bc,
    borderWidth: 2,
    borderDash: d.dash || [],
    spanGaps: false,
  }));

  return new Chart(document.getElementById(id), {
    type: 'line',
    data: { labels, datasets: ds },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { color: '#7b97c8', font: { size: 11 } },
        },
      },
      scales: {
        x: { ticks: { color: '#44608a', font: { size: 10 } } },
        y: {
          ticks: {
            color: '#44608a',
            font: { size: 10 },
            callback: (v) =>
              v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v,
          },
        },
      },
    },
  });
}
