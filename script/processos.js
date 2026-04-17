/**
 * processos.js
 * TRADSUL FINANCE — Painel de Processos Financeiros
 *
 * Responsibilities:
 *  - Fetch filter options from /api/opcoes-filtros on load
 *  - Fetch and render process table from /api/processos
 *  - Handle pagination (meta object)
 *  - Live autocomplete for "N. Tradsul" and "Segurado" inputs
 *  - Build filter query string from active form values
 *  - Inline editing: STATUS BH (select) and OBS (text input) via PATCH
 */

'use strict';

/* ============================================================
   CONFIGURATION
   ============================================================ */
const API_BASE = 'http://localhost:3000/api';
 const PER_PAGE = 50;
//const API_BASE = 'https://painelprocessosfinanceirobackend.onrender.com/api';
//const PER_PAGE = 50;


/* ============================================================
   STATE
   ============================================================ */
const state = {
  currentPage: 1,
  totalPages: 1,
  totalRecords: 0,
  isLoading: false,
  activeFilters: {},
};

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const dom = {
  // Filter inputs
  inputCodigo: document.getElementById('input-codigo'),
  inputSegurado: document.getElementById('input-segurado'),
  selectSeguradora: document.getElementById('select-seguradora'),
  selectSituacao: document.getElementById('select-situacao'),
  selectOperacao: document.getElementById('select-operacao'),
  selectStatusBH: document.getElementById('select-status-bh'),
  selectAlertaBH: document.getElementById('select-alerta-bh'),

  // Autocomplete containers
  autocompleteCodigo: document.getElementById('autocomplete-codigo'),
  autocompleteSegurado: document.getElementById('autocomplete-segurado'),

  // Actions
  btnBuscar: document.getElementById('btn-buscar'),
  btnLimpar: document.getElementById('btn-limpar'),

  // Table
  tableBody: document.getElementById('table-body'),
  loadingIndicator: document.getElementById('loading-indicator'),
  totalRecordsBadge: document.getElementById('total-records-badge'),

  // Pagination
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  pageNumbers: document.getElementById('page-numbers'),
  paginationInfo: document.getElementById('pagination-info'),

  // Modal Gerar BH
  modalGerarBH: document.getElementById('modal-gerar-bh'),
  formGerarBH: document.getElementById('form-gerar-bh'),
  modalProcesso: document.getElementById('modal-processo'),
  modalDtInicial: document.getElementById('modal-dt-inicial'),
  modalDtFinal: document.getElementById('modal-dt-final'),
  btnCancelarBH: document.getElementById('btn-cancelar-bh'),
  btnSubmitBH: document.getElementById('btn-submit-bh'),
};

/* ============================================================
   UTILITIES
   ============================================================ */

/**
 * Debounce: wraps a function so it only fires after `delay` ms of silence.
 * @param {Function} fn
 * @param {number} delay - milliseconds
 */
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warn'} type
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

/**
 * Build a query string from a plain object, skipping empty values.
 * @param {Record<string, string|number>} params
 */
function buildQueryString(params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

/**
 * Generic fetch wrapper with error handling.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function apiFetch(url) {
  const token = localStorage.getItem('authToken');
  const response = await fetch(url, {
    headers: { 
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
  });

  if (response.status === 401) {
    if (typeof window.logout === 'function') window.logout();
    else window.location.replace('index.html');
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Erro desconhecido');
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  return response.json();
}

/* ============================================================
   BADGE HELPERS
   ============================================================ */

/** STATUS BH dropdown options (inline select) */
const STATUS_BH_OPTIONS = [
  { value: '', label: 'Nenhum' },
  { value: 'ok', label: 'OK' },
  { value: 'revisado', label: 'REVISADO' },

];

/**
 * Map a SITUAÇÃO string to its CSS badge class.
 * Exact-match on the three canonical values, with lowercase fallback.
 * @param {string|null} situacao
 */
function situacaoBadgeClass(situacao) {
  if (!situacao) return 'badge-default';
  const s = situacao.toUpperCase().trim();
  if (s === 'EM ABERTO') return 'badge-em-aberto';
  if (s === 'CONCLUÍDO TECNICAMENTE' || s === 'CONCLUIDO TECNICAMENTE') return 'badge-concluido-tec';
  if (s === 'CONCLUÍDO FINANCEIRAMENTE' || s === 'CONCLUIDO FINANCEIRAMENTE') return 'badge-concluido-fin';
  // Keep existing fallbacks for others
  const map = {
    'ENCERRADO FINANCEIRAMENTE': 'badge-encerrado-fin',
    'CONCLUÍDO': 'badge-concluido',
    'CONCLUIDO': 'badge-concluido',
    'CANCELADO': 'badge-cancelado',
    'PENDENTE': 'badge-pendente',
    'SUSPENSO': 'badge-suspenso',
  };
  return map[s] ?? 'badge-default';
}

/**
 * Map an ALERTA BH / ALERTA COBRANÇA string to its CSS badge class.
 * Exact-match first; fallback to keyword scan.
 * @param {string|null} alerta
 */
function alertaBadgeClass(alerta) {
  if (!alerta) return 'badge-default';
  const s = alerta.toUpperCase().trim();
  if (s === 'NAO GERAR' || s === 'NÃO GERAR') return 'badge-nao-gerar';
  if (s === 'GERAR BH') return 'badge-gerar-bh';
  if (s === 'COBRANÇA IMEDIATA' || s === 'COBRANCA IMEDIATA') return 'badge-cobranca-imediata';
  if (s === 'NO PRAZO') return 'badge-no-prazo';
  // Keep existing fallbacks for others
  if (s.includes('OK') || s.includes('NORMAL')) return 'badge-alerta-ok';
  if (s.includes('AVISO') || s.includes('ATEN')) return 'badge-alerta-aviso';
  if (s.includes('CRÍT') || s.includes('CRITIC')) return 'badge-alerta-critico';
  return 'badge-default';
}

/**
 * Render a pill badge element as HTML string.
 * @param {string|null} value
 * @param {string} cssClass
 */
function renderBadge(value, cssClass) {
  const label = value ?? '—';
  return `<span class="badge ${cssClass}">${label}</span>`;
}

/* ============================================================
   FILTER OPTIONS — /api/opcoes-filtros
   ============================================================ */

/**
 * Populate a <select> element with option items.
 * Always keeps the first option (Todas / Todos) intact.
 * @param {HTMLSelectElement} selectEl
 * @param {Array<string|null>} items
 */
function populateSelect(selectEl, items) {
  // Keep the placeholder / "Todas" option
  const placeholder = selectEl.options[0];
  selectEl.innerHTML = '';
  selectEl.appendChild(placeholder);

  items.forEach(item => {
    const val = item ?? '';
    const label = val === '' ? 'Nenhum' : val;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    selectEl.appendChild(opt);
  });
}

/**
 * Fetch filter options and populate all dropdowns.
 * GET /api/opcoes-filtros
 */
async function loadFilterOptions() {
  try {
    const data = await apiFetch(`${API_BASE}/opcoes-filtros`);

    if (data.situacao) populateSelect(dom.selectSituacao, data.situacao);
    if (data.seguradora) populateSelect(dom.selectSeguradora, data.seguradora);
    if (data.operacao) populateSelect(dom.selectOperacao, data.operacao);
    if (data.status_bh) populateSelect(dom.selectStatusBH, data.status_bh);
    if (data.alerta_bh) populateSelect(dom.selectAlertaBH, data.alerta_bh);

  } catch (err) {
    console.error('[loadFilterOptions]', err);
    showToast('Não foi possível carregar as opções de filtro.', 'warn');
  }
}

/* ============================================================
   TABLE RENDERING — /api/processos
   ============================================================ */

/**
 * Collect active filters from the form UI.
 * @returns {Record<string, string>}
 */
function collectFilters() {
  return {
    codigo_sinistro: dom.inputCodigo.value.trim(),
    segurado: dom.inputSegurado.value.trim(),
    seguradora: dom.selectSeguradora.value,
    situacao: dom.selectSituacao.value,
    operacao: dom.selectOperacao.value,
    status_bh: dom.selectStatusBH.value,
    alerta_bh: dom.selectAlertaBH.value,
  };
}

/**
 * Show/hide the loading indicator.
 */
function setLoading(isLoading) {
  state.isLoading = isLoading;
  dom.loadingIndicator.classList.toggle('hidden', !isLoading);
  dom.btnBuscar.disabled = isLoading;
}

/**
 * Render a single table row from a process object.
 * Columns: SITUAÇÃO | CÓD. SINISTRO | SEGURADO | DATA CADASTRO | SEGURADORA |
 *          OPERAÇÃO | ÜLT. ATIVIDADE | ALERTA COBRANÇA | STATUS BH | OBS | ALERTA BH | AÇÕES
 * @param {object} processo
 * @param {number} index - row index for animation delay
 */
function renderRow(processo, index) {
  const delay = Math.min(index * 30, 300);
  const codigo = processo.codigo_sinistro ?? '';

  const situacaoClass = situacaoBadgeClass(processo.situacao);
  const alertaCobrancaClass = alertaBadgeClass(processo.alerta_cobranca);
  const alertaBhClass = alertaBadgeClass(processo.alerta_bh);

  // Build STATUS BH inline select options
  const statusOptions = STATUS_BH_OPTIONS.map(opt => {
    const selected = (processo.status_bh ?? '') === opt.value ? 'selected' : '';
    return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
  }).join('');

  // Format dates (ISO -> DD/MM/YYYY)
  const fmtDate = (isoString) => {
    if (!isoString) return '—';
    try {
      // Clean string: remove time and timezone (e.g., "2023-12-21 16:59:43.733+00" -> "2023-12-21")
      const datePart = isoString.split(' ')[0].split('T')[0];
      const [year, month, day] = datePart.split('-');
      if (year && month && day) return `${day}/${month}/${year}`;
      return isoString;
    } catch (error) {
      return isoString;
    }
  };

  const obsVal = (processo.obs ?? '').replace(/"/g, '&quot;');

  return `
    <tr class="row-enter" style="animation-delay:${delay}ms" data-codigo="${codigo}">

      <!-- 1: SITUAÇÃO (sticky col 1) -->
      <td class="td-cell"
        style="min-width:280px;max-width:280px;position:sticky;left:0;z-index:10;background:#ffffff;white-space:nowrap;">
        ${renderBadge(processo.situacao, situacaoClass)}
      </td>

      <!-- 2: CÓD. SINISTRO (sticky col 2) -->
      <td class="td-cell font-mono text-xs"
        style="min-width:160px;max-width:160px;position:sticky;left:220px;z-index:10;background:#ffffff;white-space:nowrap;border-right:2px solid #e2e8f0;">
        ${codigo || '—'}
      </td>

      <!-- 3: SEGURADO -->
      <td class="td-cell" title="${processo.segurado ?? ''}">
        ${processo.segurado ?? '—'}
      </td>

      <!-- 4: DATA CADASTRO -->
      <td class="td-cell">
        ${fmtDate(processo.dat_criacao_sinistro)}
      </td>

      <!-- 5: SEGURADORA -->
      <td class="td-cell" title="${processo.seguradora ?? ''}">
        ${processo.seguradora ?? '—'}
      </td>

      <!-- 6: OPERAÇÃO -->
      <td class="td-cell">
        ${processo.operacao ?? '—'}
      </td>

      <!-- 7: ÜLT. ATIVIDADE -->
      <td class="td-cell">
        ${fmtDate(processo.dat_ultima_cobranca)}
      </td>

      <!-- 8: ALERTA COBRANÇA -->
      <td class="td-cell">
        ${renderBadge(processo.alerta_cobranca, alertaCobrancaClass)}
      </td>

      <!-- 9: STATUS BH (inline select) -->
      <td class="td-cell">
        <select
          class="inline-select"
          data-campo="status_bh"
          aria-label="Status BH para processo ${codigo}">
          ${statusOptions}
        </select>
      </td>

      <!-- 10: OBS (inline input + action buttons) -->
      <td class="td-cell" style="min-width:320px;white-space:nowrap;">
        <div class="obs-cell-wrapper">
          <input
            type="text"
            class="inline-obs-input"
            value="${obsVal}"
            placeholder="Observação..."
            maxlength="500"
            aria-label="Observação para processo ${codigo}" />
          <button
            class="obs-action-btn obs-save-btn"
            title="Salvar OBS"
            aria-label="Salvar observação">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#16a34a" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <button
            class="obs-action-btn obs-clear-btn"
            title="Limpar OBS"
            aria-label="Limpar observação">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#dc2626" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </td>

      <!-- NEW COLUMNS -->
      <td class="td-cell text-center font-medium text-slate-700" style="min-width:130px;">
        ${processo.total_h_cobrar ?? '—'}
      </td>
      <td class="td-cell text-center font-medium text-slate-700" style="min-width:140px;">
        ${processo.total_h_cobradas ?? '—'}
      </td>
      <td class="td-cell text-center font-medium text-slate-700" style="min-width:140px;">
        ${processo.total_h_sinistro ?? '—'}
      </td>

      <!-- 11: ALERTA BH -->
      <td class="td-cell" style="min-width:180px;white-space:nowrap;">
        ${renderBadge(processo.alerta_bh, alertaBhClass)}
      </td>

      <!-- 12: AÇÕES -->
      <td class="td-cell text-center">
        <button
          class="btn-gerar-bh"
          data-codigo="${codigo}"
          data-ult-atividade="${processo.dat_ultima_cobranca || ''}"
          data-data-cadastro="${processo.dat_criacao_sinistro || ''}"
          title="Gerar BH para ${processo.segurado ?? codigo}"
          aria-label="Gerar BH para processo ${codigo}">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3M5 20h14a2 2 0 002-2V8l-5-5H7a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          Gerar BH
        </button>
      </td>
    </tr>`;
}

/**
 * Render the "empty" placeholder row.
 */
function renderEmptyState() {
  dom.tableBody.innerHTML = `
    <tr id="row-placeholder">
      <td colspan="15" class="text-center py-16 text-slate-400">
        <div class="flex flex-col items-center gap-3">
          <svg class="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <span class="text-sm">Nenhum processo encontrado.</span>
        </div>
      </td>
    </tr>`;
}

/**
 * Render all rows from an array of process objects.
 * @param {object[]} dados
 */
function renderTableRows(dados) {
  if (!dados || dados.length === 0) {
    renderEmptyState();
    return;
  }

  dom.tableBody.innerHTML = dados
    .map((processo, i) => renderRow(processo, i))
    .join('');
}

/* ============================================================
   PAGINATION
   ============================================================ */

/**
 * Update pagination controls based on meta data.
 * @param {{ page: number, totalPages: number, total: number, limit: number }} meta
 */
function updatePagination(meta) {
  if (!meta) return;

  const { totalPages = 1, total = 0, limit = PER_PAGE } = meta;
  const page = parseInt(meta.page || 1, 10);

  state.currentPage = page;
  state.totalPages = totalPages;
  state.totalRecords = total;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  dom.paginationInfo.textContent =
    total > 0
      ? `Exibindo ${start}–${end} de ${total} registros`
      : 'Nenhum registro';

  dom.totalRecordsBadge.textContent = total > 0 ? total : '0';

  const disablePrev = page <= 1;
  const disableNext = page >= totalPages;

  if (disablePrev) {
    dom.btnPrev.disabled = true;
    dom.btnPrev.setAttribute('disabled', 'true');
  } else {
    dom.btnPrev.disabled = false;
    dom.btnPrev.removeAttribute('disabled');
  }

  if (disableNext) {
    dom.btnNext.disabled = true;
    dom.btnNext.setAttribute('disabled', 'true');
  } else {
    dom.btnNext.disabled = false;
    dom.btnNext.removeAttribute('disabled');
  }

  // Page number buttons (show up to 7 pages centered on current)
  dom.pageNumbers.innerHTML = '';
  const range = buildPageRange(page, totalPages);
  range.forEach(p => {
    if (p === '...') {
      const ellipsis = document.createElement('span');
      ellipsis.textContent = '…';
      ellipsis.className = 'text-slate-400 text-xs px-1 self-center';
      dom.pageNumbers.appendChild(ellipsis);
    } else {
      const btn = document.createElement('button');
      btn.textContent = p;
      btn.className = `page-number-btn${p === page ? ' active' : ''}`;
      btn.dataset.page = p;
      btn.setAttribute('aria-label', `Ir para página ${p}`);
      if (p === page) btn.setAttribute('aria-current', 'page');
      btn.addEventListener('click', () => goToPage(p));
      dom.pageNumbers.appendChild(btn);
    }
  });
}

/**
 * Build an array of page numbers with ellipsis for large ranges.
 * @param {number} current
 * @param {number} total
 */
function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}

/**
 * Navigate to a specific page.
 * @param {number} page
 */
function goToPage(page) {
  // Relaxed guard clause: prevent going below page 1 or staying on the same page.
  // We remove the strict `page > state.totalPages` check to support APIs that don't return total page counts.
  if (page < 1 || page === state.currentPage) return;

  state.currentPage = page;
  fetchProcessos();
}

/* ============================================================
   PATCH — Inline Editing API Calls
   ============================================================ */

/**
 * Send a PATCH request to update a specific field for a process.
 * PATCH /api/processos/:codigo_sinistro/status
 *
 * @param {string} codigo      - processo codigo_sinistro
 * @param {object} payload     - { status_bh } or { obs } or { obs: null }
 * @returns {Promise<void>}
 */
async function patchProcesso(codigo, payload) {
  const url = `${API_BASE}/processos/${encodeURIComponent(codigo)}/status`;
  const token = localStorage.getItem('authToken');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    if (typeof window.logout === 'function') window.logout();
    else window.location.replace('index.html');
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Erro desconhecido');
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  return response.json().catch(() => null); // 204 No Content is fine
}

/**
 * Handle STATUS BH <select> change via event delegation.
 * Immediately fires a PATCH and shows visual feedback.
 * @param {Event} e
 */
async function handleStatusBHChange(e) {
  const select = e.target.closest('select.inline-select[data-campo="status_bh"]');
  if (!select) return;

  const row = select.closest('tr[data-codigo]');
  const codigo = row?.dataset.codigo;
  if (!codigo) return;

  const newStatus = select.value;

  select.classList.add('saving');
  try {
    await patchProcesso(codigo, { status_bh: newStatus || null });
    showToast(`Status BH atualizado.`, 'success', 2500);
    // Brief green border flash
    select.style.borderColor = '#16a34a';
    setTimeout(() => { select.style.borderColor = ''; }, 1200);
  } catch (err) {
    console.error('[handleStatusBHChange]', err);
    showToast(`Erro ao salvar Status BH: ${err.message}`, 'error');
  } finally {
    select.classList.remove('saving');
  }
}

/**
 * Handle OBS Save / Clear button clicks via event delegation.
 * @param {Event} e
 */
async function handleObsAction(e) {
  const saveBtn = e.target.closest('.obs-save-btn');
  const clearBtn = e.target.closest('.obs-clear-btn');
  if (!saveBtn && !clearBtn) return;

  const wrapper = (saveBtn ?? clearBtn).closest('.obs-cell-wrapper');
  const input = wrapper?.querySelector('.inline-obs-input');
  const row = (saveBtn ?? clearBtn).closest('tr[data-codigo]');
  const codigo = row?.dataset.codigo;
  if (!codigo || !input) return;

  const isClear = Boolean(clearBtn);
  const obsValue = isClear ? null : input.value.trim();

  if (isClear) input.value = '';

  // Disable buttons during the request
  const btns = wrapper.querySelectorAll('.obs-action-btn');
  btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

  try {
    await patchProcesso(codigo, { obs: obsValue });
    showToast(isClear ? 'OBS limpa.' : 'OBS salva.', 'success', 2500);
    // Flash the input green on save
    if (!isClear) {
      wrapper.classList.add('save-flash');
      wrapper.addEventListener('animationend', () => wrapper.classList.remove('save-flash'), { once: true });
    }
  } catch (err) {
    console.error('[handleObsAction]', err);
    showToast(`Erro ao salvar OBS: ${err.message}`, 'error');
    // Restore value on error
    if (isClear) input.value = row.dataset.obsOriginal ?? '';
  } finally {
    btns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

/* ============================================================
   MAIN DATA FETCH — /api/processos
   ============================================================ */

/**
 * Fetch processes from the API and update the table + pagination.
 * Uses state.currentPage and state.activeFilters.
 */
async function fetchProcessos() {
  if (state.isLoading) return;
  setLoading(true);

  const params = {
    page: state.currentPage,
    limit: PER_PAGE,
    ...Object.fromEntries(
      Object.entries(state.activeFilters).filter(([, v]) => v !== '')
    ),
  };

  const url = `${API_BASE}/processos${buildQueryString(params)}`;

  console.log('🔄 Fetching API:', url);

  try {
    const result = await apiFetch(url);

    // Support both { dados, meta } and flat array responses
    const dados = result.dados ?? result.data ?? result ?? [];
    const meta = result.meta ?? result.pagination ?? null;

    renderTableRows(dados);

    if (meta) {
      updatePagination(meta);
    } else {
      // fallback when API returns no meta
      const count = Array.isArray(dados) ? dados.length : 0;
      dom.totalRecordsBadge.textContent = count > 0 ? count : '?';
      dom.paginationInfo.textContent = `${count} registro(s) exibido(s) (Página ${state.currentPage})`;

      const disablePrev = state.currentPage <= 1;
      const disableNext = count < PER_PAGE;

      if (disablePrev) {
        dom.btnPrev.disabled = true;
        dom.btnPrev.setAttribute('disabled', 'true');
      } else {
        dom.btnPrev.disabled = false;
        dom.btnPrev.removeAttribute('disabled');
      }

      if (disableNext) {
        dom.btnNext.disabled = true;
        dom.btnNext.setAttribute('disabled', 'true');
      } else {
        dom.btnNext.disabled = false;
        dom.btnNext.removeAttribute('disabled');
      }

      // Update page numbers for flat array fallback
      dom.pageNumbers.innerHTML = '';
      const btn = document.createElement('button');
      btn.textContent = state.currentPage;
      btn.className = 'page-number-btn active';
      dom.pageNumbers.appendChild(btn);
    }

  } catch (err) {
    console.error('[fetchProcessos]', err);
    renderEmptyState();
    showToast(`Erro ao carregar processos: ${err.message}`, 'error');
    dom.totalRecordsBadge.textContent = '–';
    dom.paginationInfo.textContent = 'Erro ao carregar dados';
  } finally {
    setLoading(false);
  }
}

/* ============================================================
   AUTOCOMPLETE — /api/sugestoes
   ============================================================ */

/**
 * Fetch autocomplete suggestions for a given field and term.
 * GET /api/sugestoes?campo=[field]&termo=[text]
 *
 * @param {string} campo - API field name
 * @param {string} termo - search term (min 3 chars)
 * @returns {Promise<string[]>}
 */
async function fetchSugestoes(campo, termo) {
  const url = `${API_BASE}/sugestoes${buildQueryString({ campo, termo })}`;
  const data = await apiFetch(url);
  // Support { sugestoes: [] } or flat array
  return Array.isArray(data) ? data : (data.sugestoes ?? data.data ?? []);
}

/**
 * Render suggestion items inside an autocomplete dropdown container.
 *
 * @param {HTMLElement} dropdown
 * @param {HTMLInputElement} inputEl
 * @param {string[]} items
 */
function renderSugestoes(dropdown, inputEl, items) {
  dropdown.innerHTML = '';

  if (!items || items.length === 0) {
    dropdown.innerHTML = '<div class="autocomplete-empty">Nenhuma sugestão encontrada.</div>';
    dropdown.classList.remove('hidden');
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.textContent = item;
    div.setAttribute('role', 'option');
    div.addEventListener('mousedown', (e) => {
      // Use mousedown (fires before blur) to reliably capture the click
      e.preventDefault();
      inputEl.value = item;
      closeAutocomplete(dropdown);
    });
    dropdown.appendChild(div);
  });

  dropdown.classList.remove('hidden');
}

/**
 * Close (hide) an autocomplete dropdown.
 * @param {HTMLElement} dropdown
 */
function closeAutocomplete(dropdown) {
  dropdown.classList.add('hidden');
  dropdown.innerHTML = '';
}

/**
 * Attach debounced autocomplete behaviour to an input.
 *
 * @param {HTMLInputElement} inputEl
 * @param {HTMLElement} dropdown
 * @param {string} campo - API field name
 */
function attachAutocomplete(inputEl, dropdown, campo) {
  const debouncedFetch = debounce(async (termo) => {
    if (termo.length < 3) {
      closeAutocomplete(dropdown);
      return;
    }

    try {
      const items = await fetchSugestoes(campo, termo);
      renderSugestoes(dropdown, inputEl, items);
    } catch (err) {
      console.warn(`[autocomplete:${campo}]`, err);
      closeAutocomplete(dropdown);
    }
  }, 300);

  inputEl.addEventListener('input', () => {
    const termo = inputEl.value.trim();
    debouncedFetch(termo);
  });

  inputEl.addEventListener('blur', () => {
    // Slight delay so mousedown on an item fires first
    setTimeout(() => closeAutocomplete(dropdown), 150);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAutocomplete(dropdown);
  });
}

/* ============================================================
   EVENT HANDLERS
   ============================================================ */

/** Handle "Buscar" button click. */
function handleSearch() {
  state.activeFilters = collectFilters();
  state.currentPage = 1;
  fetchProcessos();
}

/** Handle "Limpar" button click — reset form & reload. */
function handleClear() {
  dom.inputCodigo.value = '';
  dom.inputSegurado.value = '';
  dom.selectSeguradora.value = '';
  dom.selectSituacao.value = '';
  dom.selectOperacao.value = '';
  dom.selectStatusBH.value = '';
  dom.selectAlertaBH.value = '';

  closeAutocomplete(dom.autocompleteCodigo);
  closeAutocomplete(dom.autocompleteSegurado);

  state.activeFilters = {};
  state.currentPage = 1;
  fetchProcessos();
}

/** 
 * Handle "Gerar BH" button clicks via event delegation on tbody. 
 * Opens the modal and pre-fills the form data.
 */
function handleGerarBH(e) {
  const btn = e.target.closest('.btn-gerar-bh');
  if (!btn) return;

  const codigo = btn.dataset.codigo;
  const ultAtividade = btn.dataset.ultAtividade;
  const dataCadastro = btn.dataset.dataCadastro;
  let dtInicialValue = '';

  if (ultAtividade) {
    // Has Ultima Atividade: Add 1 day, set to 00:00
    const datePart = ultAtividade.split(' ')[0].split('T')[0]; // Extract YYYY-MM-DD safely
    const d = new Date(datePart + 'T00:00:00'); // Force local midnight
    d.setDate(d.getDate() + 1); // Add 1 day
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dtInicialValue = `${yyyy}-${mm}-${dd}T00:00`;
  } else if (dataCadastro) {
    // Empty Ultima Atividade, use Cadastro: EXACT day, set to 00:00
    const datePart = dataCadastro.split(' ')[0].split('T')[0];
    dtInicialValue = `${datePart}T00:00`;
  } else {
    // Fallback: Today at 00:00
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dtInicialValue = `${yyyy}-${mm}-${dd}T00:00`;
  }

  // Pre-fill the modal inputs
  document.getElementById('modal-processo').value = codigo;
  document.getElementById('modal-dt-inicial').value = dtInicialValue;
  // Clear final date or set to today
  document.getElementById('modal-dt-final').value = '';

  // Show modal
  dom.modalGerarBH.classList.remove('hidden');
}

/** Close the Gerar BH modal */
function closeModalBH() {
  dom.modalGerarBH.classList.add('hidden');
  dom.formGerarBH.reset();
}

/** Handle submit on Gerar BH form */
async function handleSubmitBH(e) {
  e.preventDefault();

  const payload = {
    processo: dom.modalProcesso.value,
    DtInicial: dom.modalDtInicial.value,
    DtFinal: dom.modalDtFinal.value
  };

  const btn = dom.btnSubmitBH;
  const originalText = btn.innerHTML;

  // Show loading state
  btn.disabled = true;
  btn.innerHTML = `<svg class="w-5 h-5 animate-spin mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Gerando...`;

  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch('https://painelprocessosfinanceirobackend.onrender.com/automacao/ts/export', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      if (typeof window.logout === 'function') window.logout();
      else window.location.replace('index.html');
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
      // Try to read error body as text for a more useful message
      const errBody = await response.text().catch(() => 'Erro desconhecido');
      throw new Error(`HTTP ${response.status}: ${errBody}`);
    }

    // --- Extract filename from Content-Disposition header ---
    const disposition = response.headers.get('Content-Disposition');
    let filename = 'boletim_horas.xls'; // sensible default
    if (disposition) {
      // Handles both: filename="name.xls" and filename*=UTF-8''name.xls
      const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;\n"']+)/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1].trim());
      }
    }

    // --- Process response as binary Blob ---
    const blob = await response.blob();

    // --- Trigger browser download via temporary <a> element ---
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    }, 150);

    showToast('Boletim gerado com sucesso!', 'success');
    closeModalBH();
  } catch (err) {
    console.error('[handleSubmitBH]', err);
    showToast(`Erro ao gerar boletim: ${err.message}`, 'error');
  } finally {
    // Restore button state
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/** Handle Enter key in filter inputs to trigger search. */
function handleFilterEnterKey(e) {
  if (e.key === 'Enter') handleSearch();
}

/* ============================================================
   PAGINATION EVENT HANDLERS
   ============================================================ */
// Pagination Event Listeners
dom.btnPrev.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  goToPage(state.currentPage - 1);
});

dom.btnNext.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  goToPage(state.currentPage + 1);
});

/* ============================================================
   SEARCH / CLEAR BUTTONS
   ============================================================ */
dom.btnBuscar.addEventListener('click', handleSearch);
dom.btnLimpar.addEventListener('click', handleClear);

/* ============================================================
   ENTER KEY ON INPUTS
   ============================================================ */
[dom.inputCodigo, dom.inputSegurado].forEach(el => {
  el.addEventListener('keydown', handleFilterEnterKey);
});

/* ============================================================
   MODAL CONFIGURATION
   ============================================================ */
dom.btnCancelarBH.addEventListener('click', closeModalBH);
dom.modalGerarBH.addEventListener('click', (e) => {
  if (e.target === dom.modalGerarBH) closeModalBH(); // Close on overlay click
});
dom.formGerarBH.addEventListener('submit', handleSubmitBH);

/* ============================================================
   TABLE DELEGATION
   - click  → Gerar BH, OBS Save, OBS Clear
   - change → STATUS BH inline select
   ============================================================ */
dom.tableBody.addEventListener('click', (e) => {
  handleGerarBH(e);
  handleObsAction(e);
});
dom.tableBody.addEventListener('change', handleStatusBHChange);

/* ============================================================
   AUTOCOMPLETE SETUP
   ============================================================ */
attachAutocomplete(dom.inputCodigo, dom.autocompleteCodigo, 'codigo_sinistro');
attachAutocomplete(dom.inputSegurado, dom.autocompleteSegurado, 'segurado');

/* ============================================================
   INITIALISATION
   ============================================================ */
async function init() {
  // Load filter dropdowns and initial table data in parallel
  await Promise.allSettled([
    loadFilterOptions(),
    fetchProcessos(),
  ]);
}

// Boot
init();
