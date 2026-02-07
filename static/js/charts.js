/* ===================================================================
   charts.js — Chart.js wrapper helpers for Pinchy Dashboard
   =================================================================== */

// Shared Chart.js defaults
Chart.defaults.color = '#9aa0a6';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#161822';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };

// Keep track of chart instances so we can destroy before re-creating
const _chartInstances = {};

function _destroyChart(id) {
  if (_chartInstances[id]) {
    _chartInstances[id].destroy();
    delete _chartInstances[id];
  }
}

/**
 * Create a donut/ring chart.
 * @param {string} canvasId - ID of the <canvas> element
 * @param {Object} opts
 * @param {number[]} opts.data - Array of values
 * @param {string[]} opts.labels - Array of labels
 * @param {string[]} opts.colors - Array of background colors
 * @param {string} [opts.centerText] - Text to show in center
 */
function createDonutChart(canvasId, opts) {
  _destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const centerText = opts.centerText || '';

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: opts.labels,
      datasets: [{
        data: opts.data,
        backgroundColor: opts.colors,
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return `${ctx.label}: ${ctx.parsed.toLocaleString()}`;
            }
          }
        }
      },
    },
    plugins: centerText ? [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { width, height, top, left } } = chart;
        ctx.save();
        ctx.font = "800 1.4rem 'Inter', sans-serif";
        ctx.fillStyle = '#e8eaed';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(centerText, left + width / 2, top + height / 2);
        ctx.restore();
      }
    }] : [],
  });

  _chartInstances[canvasId] = chart;
  return chart;
}

/**
 * Create a line chart.
 * @param {string} canvasId
 * @param {Object} opts
 * @param {string[]} opts.labels
 * @param {number[]} opts.data
 * @param {string} [opts.color] - Line color
 * @param {string} [opts.fillColor] - Gradient fill
 * @param {string} [opts.yPrefix] - Prefix for y-axis labels (e.g. "$")
 */
function createLineChart(canvasId, opts) {
  _destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const color = opts.color || '#48dbfb';
  const ctx = canvas.getContext('2d');

  // Gradient fill
  let gradient;
  try {
    gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 200);
    gradient.addColorStop(0, opts.fillColor || 'rgba(72, 219, 251, 0.2)');
    gradient.addColorStop(1, 'rgba(72, 219, 251, 0)');
  } catch {
    gradient = 'rgba(72, 219, 251, 0.1)';
  }

  const prefix = opts.yPrefix || '';

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: opts.labels,
      datasets: [{
        data: opts.data,
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointBorderColor: '#161822',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            font: { size: 11 },
            callback: (v) => prefix + v.toFixed(2),
          },
          beginAtZero: true,
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${prefix}${ctx.parsed.y.toFixed(2)}`,
          }
        }
      }
    }
  });

  _chartInstances[canvasId] = chart;
  return chart;
}

/**
 * Create a bar chart.
 * @param {string} canvasId
 * @param {Object} opts
 * @param {string[]} opts.labels
 * @param {number[]} opts.data
 * @param {string} [opts.color]
 * @param {string} [opts.yPrefix]
 */
function createBarChart(canvasId, opts) {
  _destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const color = opts.color || '#48dbfb';
  const prefix = opts.yPrefix || '';

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: opts.labels,
      datasets: [{
        data: opts.data,
        backgroundColor: color,
        borderRadius: 4,
        borderSkipped: false,
        maxBarThickness: 40,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            font: { size: 11 },
            callback: (v) => prefix + Number(v).toFixed(2),
          },
          beginAtZero: true,
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${prefix}${ctx.parsed.y.toFixed(2)}`,
          }
        }
      }
    }
  });

  _chartInstances[canvasId] = chart;
  return chart;
}

/**
 * Destroy all active charts (call when switching views).
 */
function destroyAllCharts() {
  Object.keys(_chartInstances).forEach(_destroyChart);
}
