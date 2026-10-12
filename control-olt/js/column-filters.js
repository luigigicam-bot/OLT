/** General-only column selection. Values and counts come from caller-scoped RPCs. */
export function createColumnFilters({ columns, fetchOptions, onChange, formatValue }) {
  const head = document.getElementById('tableHead');
  const summary = document.getElementById('columnFilterSummary');
  const panel = document.getElementById('columnFilterPanel');
  const title = panel.querySelector('h2');
  const search = panel.querySelector('[data-column-search]');
  const list = panel.querySelector('[data-column-values]');
  const message = panel.querySelector('[data-column-message]');
  const apply = panel.querySelector('[data-column-apply]');
  const more = panel.querySelector('[data-column-more]');
  const labels = new Map(columns.map(c => [c.key, c.label]));
  let filters = {}, total = null, request = 0, opener = null, activeKey = null;
  let options = [], selected = new Set(), shown = 200, selectionMode = 'all';
  const normalized = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const valueLabel = (key, value) => value === '' ? '(Vacíos)' : String(formatValue(key, value));

  function renderSummary() {
    summary.replaceChildren();
    const entries = Object.entries(filters);
    summary.classList.toggle('hidden', !entries.length);
    for (const button of head.querySelectorAll('[data-column-filter]')) {
      const active = Object.hasOwn(filters, button.dataset.columnFilter);
      button.classList.toggle('is-filtered', active);
      button.setAttribute('aria-label', `Filtrar ${labels.get(button.dataset.columnFilter)}${active ? ', filtro activo' : ''}`);
    }
    if (!entries.length) return;
    const caption = document.createElement('span');
    caption.className = 'active-filters-label';
    caption.textContent = total === null ? 'Filtros de columnas · General' : `${total.toLocaleString('es-PE')} documentos en la tabla`;
    summary.append(caption);
    for (const [key, values] of entries) {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      const text = document.createElement('span');
      text.textContent = `${labels.get(key)}: ${values.length === 1 ? valueLabel(key, values[0]) : `${values.length} valores`}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'column-chip-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Quitar filtro de ${labels.get(key)}`);
      remove.onclick = () => { delete filters[key]; total = null; close(false); renderSummary(); onChange(); };
      chip.append(text, remove);
      summary.append(chip);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'text-btn filter-clear';
    clear.textContent = 'Limpiar columnas';
    clear.onclick = () => { reset(); onChange(); };
    summary.append(clear);
  }
  function close(restoreFocus = true) {
    request++;
    panel.classList.add('hidden');
    opener?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && opener?.isConnected) opener.focus();
    activeKey = null;
  }
  function reset() {
    filters = {}; total = null; options = []; selected.clear();
    close(false); list.replaceChildren(); search.value = ''; message.textContent = '';
    renderSummary();
  }
  function renderValues() {
    const query = normalized(search.value);
    const matching = options.filter(o => normalized(valueLabel(activeKey, o.value)).includes(query));
    list.replaceChildren();
    for (const option of matching.slice(0, shown)) {
      const label = document.createElement('label');
      label.className = 'column-value';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = option.value;
      checkbox.checked = selected.has(option.value);
      checkbox.onchange = () => {
        selectionMode = 'manual';
        checkbox.checked ? selected.add(option.value) : selected.delete(option.value);
        updateSelection();
      };
      const text = document.createElement('span');
      text.textContent = valueLabel(activeKey, option.value);
      text.title = text.textContent;
      const count = document.createElement('small');
      count.textContent = Number(option.count).toLocaleString('es-PE');
      label.append(checkbox, text, count);
      list.append(label);
    }
    message.textContent = matching.length ? `${matching.length.toLocaleString('es-PE')} valores${matching.length > shown ? ` · ${shown} mostrados` : ''}` : 'No hay valores con esa búsqueda.';
    more.classList.toggle('hidden', matching.length <= shown);
    updateSelection();
  }
  function updateSelection() { apply.textContent = `Aplicar (${selected.size.toLocaleString('es-PE')})`; }
  function selectSearchResults() {
    const query = normalized(search.value);
    selected = new Set(options.filter(o => normalized(valueLabel(activeKey, o.value)).includes(query)).map(o => o.value));
  }
  function position(button) {
    const rect = button.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    const height = Math.min(520, window.innerHeight - 16);
    panel.style.maxHeight = `${height}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8))}px`;
  }
  async function open(button, key) {
    close(false);
    activeKey = key; opener = button;
    const sequence = ++request;
    title.textContent = `Filtrar ${labels.get(key)}`;
    button.setAttribute('aria-expanded', 'true');
    search.value = ''; selectionMode = 'all'; panel.querySelector('[data-column-all]').textContent = 'Todos';
    shown = 200; options = []; selected = new Set();
    list.replaceChildren(); message.textContent = 'Consultando valores de todos los registros…';
    apply.disabled = true; more.classList.add('hidden');
    panel.querySelector('[data-column-clear]').disabled = false;
    for (const control of panel.querySelectorAll('[data-column-all],[data-column-none]')) control.disabled = true;
    panel.classList.remove('hidden'); position(button); search.focus();
    try {
      const result = await fetchOptions(key, snapshot());
      if (sequence !== request || activeKey !== key) return;
      const map = new Map((result.values || []).map(o => [String(o.value ?? ''), { value: String(o.value ?? ''), count: Number(o.count || 0) }]));
      const current = filters[key];
      for (const value of current || []) if (!map.has(value)) map.set(value, { value, count: 0 });
      options = [...map.values()];
      selected = new Set(current ?? options.map(o => o.value));
      selectionMode = current ? 'manual' : search.value ? 'search' : 'all';
      if (selectionMode === 'search') selectSearchResults();
      apply.disabled = false;
      for (const control of panel.querySelectorAll('[data-column-all],[data-column-none]')) control.disabled = false;
      renderValues();
    } catch {
      if (sequence !== request) return;
      message.textContent = 'No se pudieron consultar los valores. Cierra el filtro e inténtalo nuevamente.';
    }
  }
  function snapshot() { return Object.fromEntries(Object.entries(filters).map(([key, values]) => [key, [...values]])); }
  function enhanceHeaders() {
    for (const th of head.querySelectorAll('[data-column-key]')) {
      if (th.querySelector('[data-column-filter]')) continue;
      const key = th.dataset.columnKey;
      const label = document.createElement('span');
      label.className = 'column-heading-label';
      label.textContent = th.textContent;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'column-filter-button';
      button.dataset.columnFilter = key;
      button.setAttribute('aria-controls', 'columnFilterPanel');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg>';
      button.onclick = () => activeKey === key && !panel.classList.contains('hidden') ? close() : open(button, key);
      th.replaceChildren(label, button);
    }
    renderSummary();
  }
  apply.onclick = () => {
    if (!activeKey || apply.disabled) return;
    const key = activeKey;
    const all = options.every(o => selected.has(o.value));
    if (all && options.length) delete filters[key]; else filters[key] = [...selected];
    total = null; close(); renderSummary(); onChange();
  };
  panel.querySelector('[data-column-close]').onclick = () => close();
  panel.querySelector('[data-column-clear]').onclick = () => {
    if (!activeKey) return;
    delete filters[activeKey]; total = null; close(); renderSummary(); onChange();
  };
  panel.querySelector('[data-column-all]').onclick = () => {
    selectionMode = search.value ? 'search' : 'all'; selectSearchResults(); renderValues();
  };
  panel.querySelector('[data-column-none]').onclick = () => { selectionMode = 'manual'; selected.clear(); renderValues(); };
  search.addEventListener('input', () => {
    shown = 200;
    if (!activeKey) return;
    panel.querySelector('[data-column-all]').textContent = search.value ? 'Seleccionar resultados' : 'Todos';
    if (selectionMode !== 'manual') {
      selectionMode = search.value ? 'search' : 'all'; selectSearchResults();
    }
    renderValues();
  });
  more.onclick = () => { shown += 200; renderValues(); };
  document.addEventListener('pointerdown', e => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest?.('[data-column-filter]')) close(false);
  });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  document.querySelector('.sheet-scroll').addEventListener('scroll', () => close(false));
  window.addEventListener('resize', () => close(false));
  enhanceHeaders();
  return { get values() { return snapshot(); }, reset, close, updateTotal(value) { total = value; renderSummary(); } };
}
