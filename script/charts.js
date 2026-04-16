/* ==============================================================
   TRADSUL FINANCE — Dashboard Charts Module
   Vanilla JS · Chart.js 4.x

   Scoped inside an IIFE to avoid global collisions with
   processos.js (which also declares const API_BASE, etc.).
   Functions needed by HTML onclick handlers are exposed
   explicitly via window.* assignments.
   ============================================================== */
;(function () {
'use strict';

const DASH_API_BASE = 'http://localhost:3000';

// ─── Chart Instances (stored so we can .destroy() before re-render) ───
let chartHorasProduzidas = null;
let chartHorasCobraveis  = null;
let chartSeguradoras     = null;
let chartFaturadoPeriodo = null;

// ─── Toggle State for Horas Cobráveis ───
let currentCobraveisView = 'seguradora';
let currentCobraveisDataSeguradora = [];
let currentCobraveisDataOperacao = [];

// ─── Dashboard loaded flag ───
let dashboardLoaded = false;

// ─── Multi-select state ───
const multiSelectState = {
  operacao:   { selected: new Set(), options: [] },
  seguradora: { selected: new Set(), options: [] },
  perito:     { selected: new Set(), options: [] },
};

// ─── All multi-select names (used by closeAll, clearAll, etc.) ───
const MS_NAMES = ['operacao', 'seguradora', 'perito'];

// ─── Color Palette ───
const COLORS = {
  blue:    { bg: 'rgba(59, 130, 246, 0.75)',  border: '#3b82f6' },
  emerald: { bg: 'rgba(16, 185, 129, 0.75)',  border: '#10b981' },
  amber:   { bg: 'rgba(245, 158, 11, 0.75)',  border: '#f59e0b' },
  violet:  { bg: 'rgba(139, 92, 246, 0.75)',   border: '#8b5cf6' },
  rose:    { bg: 'rgba(244, 63, 94, 0.75)',    border: '#f43f5e' },
  cyan:    { bg: 'rgba(6, 182, 212, 0.75)',    border: '#06b6d4' },
  indigo:  { bg: 'rgba(99, 102, 241, 0.75)',   border: '#6366f1' },
  lime:    { bg: 'rgba(132, 204, 22, 0.75)',   border: '#84cc16' },
  fuchsia: { bg: 'rgba(217, 70, 239, 0.75)',   border: '#d946ef' },
  orange:  { bg: 'rgba(249, 115, 22, 0.75)',   border: '#f97316' },
};

const PALETTE_BG     = Object.values(COLORS).map(c => c.bg);
const PALETTE_BORDER = Object.values(COLORS).map(c => c.border);

// "Outros" uses a neutral grey so it doesn't compete with named slices
const OUTROS_BG     = 'rgba(148, 163, 184, 0.55)';
const OUTROS_BORDER = '#94a3b8';

// ─── Chart.js Global Defaults ───
function setChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size   = 12;
  Chart.defaults.color        = '#64748b';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding       = 16;
  Chart.defaults.plugins.tooltip.backgroundColor     = '#1e293b';
  Chart.defaults.plugins.tooltip.titleColor          = '#f1f5f9';
  Chart.defaults.plugins.tooltip.bodyColor           = '#cbd5e1';
  Chart.defaults.plugins.tooltip.padding             = 12;
  Chart.defaults.plugins.tooltip.cornerRadius        = 8;
  Chart.defaults.plugins.tooltip.displayColors       = true;
  Chart.defaults.responsive    = true;
  Chart.defaults.maintainAspectRatio = false;
}

/* ==============================================================
   1. VIEW NAVIGATION
   ============================================================== */

/**
 * Toggles between the "processos" and "dashboard" views.
 */
function switchView(view) {
  const viewProcessos  = document.getElementById('view-processos');
  const viewDashboard  = document.getElementById('view-dashboard');
  const tabProcessos   = document.getElementById('tab-processos');
  const tabDashboard   = document.getElementById('tab-dashboard');

  if (view === 'dashboard') {
    viewProcessos.classList.add('hidden');
    viewDashboard.classList.remove('hidden');
    tabProcessos.classList.remove('nav-tab--active');
    tabDashboard.classList.add('nav-tab--active');

    if (!dashboardLoaded) {
      initDateDefaults();
      loadFilterOptions();
      loadDashboardData();
      dashboardLoaded = true;
    }
  } else {
    viewDashboard.classList.add('hidden');
    viewProcessos.classList.remove('hidden');
    tabDashboard.classList.remove('nav-tab--active');
    tabProcessos.classList.add('nav-tab--active');
  }
}

/**
 * Sets date inputs to sensible defaults:
 * "De" → 1st of current month, "Até" → today.
 */
function initDateDefaults() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');

  const deEl  = document.getElementById('dash-filter-de');
  const ateEl = document.getElementById('dash-filter-ate');

  if (deEl  && !deEl.value)  deEl.value  = `${y}-${m}-01`;
  if (ateEl && !ateEl.value) ateEl.value = `${y}-${m}-${d}`;
}

window.switchView = switchView;

window.toggleCobraveisView = function(view) {
  if (currentCobraveisView === view) return;
  currentCobraveisView = view;
  
  const btnSeg = document.getElementById('btn-view-seguradora');
  const btnOp = document.getElementById('btn-view-operacao');
  
  if (btnSeg && btnOp) {
    if (view === 'seguradora') {
      btnSeg.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btnSeg.classList.remove('bg-transparent', 'text-slate-500', 'hover:text-slate-700');
      
      btnOp.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btnOp.classList.add('bg-transparent', 'text-slate-500', 'hover:text-slate-700');
    } else {
      btnOp.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btnOp.classList.remove('bg-transparent', 'text-slate-500', 'hover:text-slate-700');
      
      btnSeg.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btnSeg.classList.add('bg-transparent', 'text-slate-500', 'hover:text-slate-700');
    }
  }
  
  renderHorasCobraveis();
};

/* ==============================================================
   2. MULTI-SELECT DROPDOWN COMPONENT
   ============================================================== */

function toggleMultiSelect(name) {
  const dropdown = document.getElementById(`ms-${name}-dropdown`);
  const trigger  = document.getElementById(`ms-${name}-trigger`);
  if (!dropdown) return;

  const isOpen = !dropdown.classList.contains('hidden');
  closeAllMultiSelects();

  if (!isOpen) {
    dropdown.classList.remove('hidden');
    trigger?.classList.add('ms-trigger--open');
    const searchInput = dropdown.querySelector('.ms-search');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
      filterMultiSelectOptions(name, '');
    }
  }
  updateMultiSelectLabel(name);
}

function applyMultiSelect(name) {
  closeAllMultiSelects();
  updateMultiSelectLabel(name);
  if (dashboardLoaded) loadDashboardData();
}

function closeAllMultiSelects() {
  MS_NAMES.forEach(name => {
    const dd = document.getElementById(`ms-${name}-dropdown`);
    const tr = document.getElementById(`ms-${name}-trigger`);
    dd?.classList.add('hidden');
    tr?.classList.remove('ms-trigger--open');
  });
}

function populateMultiSelect(name, options) {
  const st    = multiSelectState[name];
  st.options  = options;
  st.selected = new Set();
  renderMultiSelectOptions(name);
  updateMultiSelectLabel(name);
}

function renderMultiSelectOptions(name, filter = '') {
  const container = document.getElementById(`ms-${name}-options`);
  const st        = multiSelectState[name];
  if (!container) return;

  const filtered = filter
    ? st.options.filter(o => o.toLowerCase().includes(filter.toLowerCase()))
    : st.options;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="ms-empty">Nenhum resultado</div>';
    return;
  }

  container.innerHTML = filtered.map(opt => {
    const checked = st.selected.has(opt) ? 'checked' : '';
    const safeId  = `ms-${name}-opt-${opt.replace(/\s+/g, '_')}`;
    const safeVal = opt.replace(/'/g, "\\'");
    return `
      <label class="ms-option" for="${safeId}">
        <input type="checkbox" id="${safeId}" value="${opt}" ${checked}
          onchange="handleMultiSelectChange('${name}', '${safeVal}', this.checked)" />
        <span class="ms-option-check"></span>
        <span class="ms-option-text">${opt}</span>
      </label>`;
  }).join('');
}

function handleMultiSelectChange(name, value, isChecked) {
  const st = multiSelectState[name];
  if (isChecked) st.selected.add(value);
  else           st.selected.delete(value);
  updateMultiSelectLabel(name);
}

function updateMultiSelectLabel(name) {
  const label = document.getElementById(`ms-${name}-label`);
  const st    = multiSelectState[name];
  if (!label) return;

  const count = st.selected.size;
  if (count === 0) {
    label.textContent = name === 'perito' ? 'Todos' : 'Todas';
    label.classList.remove('ms-trigger-label--active');
  } else if (count === 1) {
    label.textContent = [...st.selected][0];
    label.classList.add('ms-trigger-label--active');
  } else {
    label.textContent = `${count} selecionados`;
    label.classList.add('ms-trigger-label--active');
  }
}

function clearMultiSelect(name) {
  multiSelectState[name].selected = new Set();
  renderMultiSelectOptions(name);
  updateMultiSelectLabel(name);
}

function filterMultiSelectOptions(name, text) {
  renderMultiSelectOptions(name, text);
}

function getMultiSelectValues(name) {
  return [...multiSelectState[name].selected];
}

// Expose globally
window.toggleMultiSelect        = toggleMultiSelect;
window.applyMultiSelect         = applyMultiSelect;
window.filterMultiSelectOptions = filterMultiSelectOptions;
window.handleMultiSelectChange  = handleMultiSelectChange;
window.clearMultiSelect         = clearMultiSelect;

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  const isInsideMs = e.target.closest('[id^="ms-"][id$="-wrapper"]');
  if (!isInsideMs) closeAllMultiSelects();
});

/* ==============================================================
   3. FETCH FILTER OPTIONS
   ============================================================== */

/**
 * Fetch the available filter options from the API.
 * Expected: { operacoes: [], seguradoras: [], peritos: [] }
 */
async function loadFilterOptions() {
  try {
    const res = await fetch(`${DASH_API_BASE}/api/charts/filters`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    
    if (Array.isArray(data.operacoes))   populateMultiSelect('operacao',   data.operacoes);
    if (Array.isArray(data.seguradoras)) populateMultiSelect('seguradora', data.seguradoras);
    if (Array.isArray(data.peritos))     populateMultiSelect('perito',     data.peritos);
  } catch (err) {
    console.error('[Dashboard] Falha ao carregar filtros:', err);
  }
}

/* ==============================================================
   4. FETCH DASHBOARD DATA
   ============================================================== */

/**
 * Build query string: data_inicio, data_fim, operacao[], seguradora[], perito[]
 */
function buildDashboardQueryString() {
  const params = new URLSearchParams();

  const de  = document.getElementById('dash-filter-de')?.value;
  const ate = document.getElementById('dash-filter-ate')?.value;

  if (de)  params.set('data_inicio', de);
  if (ate) params.set('data_fim', ate);

  getMultiSelectValues('operacao').forEach(v   => params.append('operacao', v));
  getMultiSelectValues('seguradora').forEach(v => params.append('seguradora', v));
  getMultiSelectValues('perito').forEach(v     => params.append('perito', v));

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadDashboardData() {
  try {
    const qs  = buildDashboardQueryString();
    const res = await fetch(`${DASH_API_BASE}/api/charts/dashboard${qs}`);
   
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    console.log(data.cards)
    populateCards(data.cards);
    renderAllCharts(data.graficos);
  } catch (err) {
    console.error('[Dashboard] Falha ao carregar dados:', err);
    showDashboardToast('Erro ao carregar dados do dashboard.', 'error');
  }
}

/* ==============================================================
   5. POPULATE KPI CARDS
   ============================================================== */

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatHours(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function populateCards(cards) {
  if (!cards) return;
  animateValue('card-total-horas',     cards.total_horas,     formatHours);
  animateValue('card-horas-cobradas',  cards.horas_cobradas,  formatHours);
  animateValue('card-horas-cobraveis', cards.horas_cobraveis, formatHours);
}

function animateValue(elementId, targetValue, formatter) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const target   = Number(targetValue) || 0;
  const duration = 800;
  const steps    = 30;
  const stepTime = duration / steps;
  let current    = 0;
  let step       = 0;

  const timer = setInterval(() => {
    step++;
    const progress = 1 - Math.pow(1 - step / steps, 2);
    current = target * progress;
    el.textContent = formatter(current);
    if (step >= steps) {
      clearInterval(timer);
      el.textContent = formatter(target);
    }
  }, stepTime);
}

/* ==============================================================
   6. TOP-N + "OUTROS" HELPER
   ============================================================== */

/**
 * Groups an array of objects into the top N items by a numeric value,
 * summing all remaining items into a single "Outros" entry.
 *
 * @param {Object[]} data      - Array of data objects
 * @param {string}   labelKey  - Key to use as the label (e.g. 'seguradora')
 * @param {string}   valueKey  - Key to use as the numeric value (e.g. 'total_horas')
 * @param {number}   topN      - How many top items to keep (default: 7)
 * @returns {Object[]}         - Array with at most topN + 1 items (last is "Outros")
 */
function groupTopN(data, labelKey, valueKey, topN = 7) {
  if (!data || data.length === 0) return [];

  // Aggregate by label (handles duplicates)
  const aggregated = {};
  data.forEach(item => {
    const label = item[labelKey] || 'Desconhecido';
    const value = Number(item[valueKey]) || 0;
    aggregated[label] = (aggregated[label] || 0) + value;
  });

  // Sort descending by value
  const sorted = Object.entries(aggregated)
    .map(([label, value]) => ({ [labelKey]: label, [valueKey]: value }))
    .sort((a, b) => b[valueKey] - a[valueKey]);

  if (sorted.length <= topN) return sorted;

  const top    = sorted.slice(0, topN);
  const rest   = sorted.slice(topN);
  const outrosValue = rest.reduce((sum, item) => sum + item[valueKey], 0);

  if (outrosValue > 0) {
    top.push({ [labelKey]: 'Outros', [valueKey]: outrosValue });
  }

  return top;
}

/* ==============================================================
   7. RENDER CHARTS
   ============================================================== */

function renderAllCharts(graficos) {
  if (!graficos) return;
  setChartDefaults();

  currentCobraveisDataSeguradora = graficos.horasCobraveisSeguradora || [];
  currentCobraveisDataOperacao   = graficos.horasCobraveisOperacao || [];

  renderHorasProduzidas(graficos.horasProduzidas      || []);
  renderHorasCobraveis();
  renderPizzaSeguradoras(graficos.pizzaSeguradoras     || []);
  renderFaturadoPeriodo(graficos.barrasFaturadoPeriodo || []);
}

function destroyChart(chartInstance) {
  if (chartInstance) chartInstance.destroy();
  return null;
}

/**
 * Assigns palette colours, using a neutral grey for the "Outros" bucket.
 */
function getColors(items, labelKey) {
  return items.map((item, idx) => {
    if (item[labelKey] === 'Outros') return { bg: OUTROS_BG, border: OUTROS_BORDER };
    return { bg: PALETTE_BG[idx % PALETTE_BG.length], border: PALETTE_BORDER[idx % PALETTE_BORDER.length] };
  });
}

/* ── Chart 1: Horas Produzidas — Horizontal Bar (Top N peritos) ── */
function renderHorasProduzidas(data) {
  chartHorasProduzidas = destroyChart(chartHorasProduzidas);

  // Aggregate all hours per perito (ignore month dimension for the bar)
  const grouped = groupTopN(data, 'regulador_prestador', 'total_horas', 7);

  const labels = grouped.map(d => d.regulador_prestador);
  const values = grouped.map(d => d.total_horas);
  const colors = getColors(grouped, 'regulador_prestador');

  const ctx = document.getElementById('chart-horas-produzidas').getContext('2d');
  chartHorasProduzidas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Horas',
        data: values,
        backgroundColor: colors.map(c => c.bg),
        borderColor:     colors.map(c => c.border),
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',          // ← horizontal bars
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatHours(ctx.parsed.x)}h`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => `${v}h` },
          grid: { color: 'rgba(148,163,184,0.1)' },
        },
        y: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            // Truncate long perito names in the axis
            callback: function (value) {
              const lbl = this.getLabelForValue(value);
              return lbl.length > 22 ? lbl.slice(0, 20) + '…' : lbl;
            },
          },
        },
      },
    },
  });
}

/* ── Chart 2: Horas Cobráveis — Horizontal Bar with composite labels ── */
function renderHorasCobraveis() {
  chartHorasCobraveis = destroyChart(chartHorasCobraveis);

  const data = currentCobraveisView === 'seguradora' 
    ? currentCobraveisDataSeguradora 
    : currentCobraveisDataOperacao;

  const labelKey = currentCobraveisView === 'seguradora' ? 'seguradora' : 'operacao';

  const enriched = data.map(d => ({
    label: d[labelKey] || 'Outros',
    total_horas: Number(d.total_horas) || 0,
  }));

  const grouped = groupTopN(enriched, 'label', 'total_horas', 7);

  const labels = grouped.map(d => d.label);
  const values = grouped.map(d => d.total_horas);
  const colors = getColors(grouped, 'label');

  const ctx = document.getElementById('chart-horas-cobraveis').getContext('2d');
  chartHorasCobraveis = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Horas Cobráveis',
        data: values,
        backgroundColor: colors.map(c => c.bg),
        borderColor:     colors.map(c => c.border),
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatHours(ctx.parsed.x)}h`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: v => `${v}h` },
          grid: { color: 'rgba(148,163,184,0.1)' },
        },
        y: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            callback: function (value) {
              const lbl = this.getLabelForValue(value);
              return lbl.length > 28 ? lbl.slice(0, 26) + '…' : lbl;
            },
          },
        },
      },
    },
  });
}

/* ── Chart 3: Distribuição por Seguradora (Doughnut — Top N) ──── */
function renderPizzaSeguradoras(data) {
  chartSeguradoras = destroyChart(chartSeguradoras);

  const grouped = groupTopN(data, 'seguradora', 'total_horas', 7);

  const labels = grouped.map(d => d.seguradora);
  const values = grouped.map(d => d.total_horas);
  const colors = getColors(grouped, 'seguradora');

  const ctx = document.getElementById('chart-seguradoras').getContext('2d');
  chartSeguradoras = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c.bg),
        borderColor:     colors.map(c => c.border),
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: '55%',
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, padding: 14 },
        },
        tooltip: {
          callbacks: {
            label: (tooltipCtx) => {
              const total = tooltipCtx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((tooltipCtx.parsed / total) * 100).toFixed(1);
              return ` ${tooltipCtx.label}: ${formatHours(tooltipCtx.parsed)}h (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ── Chart 4: Faturado por Período (Bar) ──────────────────────── */
function renderFaturadoPeriodo(data) {
  chartFaturadoPeriodo = destroyChart(chartFaturadoPeriodo);

  const meses  = data.map(d => d.mes).sort();
  const values = meses.map(m => {
    const match = data.find(d => d.mes === m);
    return match ? Number(match.total_horas) : 0;
  });

  const ctx = document.getElementById('chart-faturado-periodo').getContext('2d');
  chartFaturadoPeriodo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: formatMonthLabels(meses),
      datasets: [{
        label: 'Horas Faturadas',
        data: values,
        backgroundColor: createGradient(ctx, '#8b5cf6', '#6366f1'),
        borderColor: '#7c3aed',
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => ` ${formatHours(context.parsed.y)}h`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: v => `${v}h` },
          grid: { color: 'rgba(148,163,184,0.1)' },
        },
      },
    },
  });
}

/* ==============================================================
   8. HELPERS
   ============================================================== */

function formatMonthLabels(months) {
  const SHORT_MONTHS = [
    'Jan','Fev','Mar','Abr','Mai','Jun',
    'Jul','Ago','Set','Out','Nov','Dez'
  ];
  return months.map(m => {
    const [year, month] = m.split('-');
    const idx = parseInt(month, 10) - 1;
    return `${SHORT_MONTHS[idx] || month}/${year?.slice(2)}`;
  });
}

function createGradient(ctx, colorTop, colorBottom) {
  const canvas   = ctx.canvas || ctx;
  const gradient = (ctx.chart?.ctx || ctx).createLinearGradient(0, 0, 0, canvas.height || 300);
  gradient.addColorStop(0, colorTop);
  gradient.addColorStop(1, colorBottom);
  return gradient;
}

function showDashboardToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className   = 'toast';

  if (type === 'error')   toast.classList.add('toast-error');
  if (type === 'success') toast.classList.add('toast-success');
  if (type === 'warn')    toast.classList.add('toast-warn');

  toast.classList.remove('hidden');

  clearTimeout(window._dashToastTimer);
  window._dashToastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

/* ==============================================================
   9. EVENT LISTENERS
   ============================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const btnFiltrar = document.getElementById('btn-dash-filtrar');
  if (btnFiltrar) {
    btnFiltrar.addEventListener('click', () => loadDashboardData());
  }

  const btnLimpar = document.getElementById('btn-dash-limpar');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      const deInput  = document.getElementById('dash-filter-de');
      const ateInput = document.getElementById('dash-filter-ate');

      if (deInput)  deInput.value  = '';
      if (ateInput) ateInput.value = '';

      MS_NAMES.forEach(n => clearMultiSelect(n));

      loadDashboardData();
    });
  }

  ['dash-filter-de', 'dash-filter-ate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (dashboardLoaded) loadDashboardData();
      });
    }
  });
});

})(); // end IIFE
