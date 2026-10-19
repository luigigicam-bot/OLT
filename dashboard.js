function qualityPercentFromValues(list) {
  if (!list.length) return 0;
  const fields = OLT.columns.filter(c => c.mode !== 'optional');
  let filled = 0;
  for (const row of list) for (const c of fields) {
    const value = row?.[c.key];
    if (value !== null && value !== undefined && String(value).trim() !== '') filled++;
  }
  return Math.round(100 * filled / (list.length * fields.length));
}
function firstDayCurrentMonthISO() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const value = name => parts.find(p => p.type === name).value;
  return `${value('year')}-${value('month')}-01T00:00:00-05:00`;
}
async function cargarDashboardEHistorial(version = historyVersion) {
  const userId = oltSession?.user?.id;
  if (!userId) return;
  $('insightsPanel').hidden = false;
  $('historyEmpty').textContent = 'Consultando historial…';
  $('historyEmpty').hidden = false;
  const { data, error } = await supabaseClient.rpc('olt_resumen_mes', { p_inicio: firstDayCurrentMonthISO() });
  if (error) throw error;
  if (version !== historyVersion || userId !== oltSession?.user?.id) return;
  const totals = data?.totales || {}, n = v => Number(v || 0).toLocaleString('es-PE');
  const lima = Number(totals.lima || 0), provincia = Number(totals.provincia || 0), zoned = lima + provincia;
  $('dashRecords').textContent = n(totals.registros);
  $('dashFiles').textContent = n(totals.archivos);
  $('dashLima').textContent = n(lima); $('dashProvincia').textContent = n(provincia);
  $('dashLimaPct').textContent = zoned ? Math.round(100*lima/zoned)+'%' : '0%';
  $('dashProvinciaPct').textContent = zoned ? Math.round(100*provincia/zoned)+'%' : '0%';
  const top = data?.linea_principal;
  $('dashTopLine').textContent = top?.linea || '—';
  $('dashTopLineCount').textContent = top ? n(top.registros)+' registro(s)' : 'Sin datos';
  $('dashboardScope').textContent = 'Mes actual';
  const history = data?.historial || [], body = $('historyBody');
  body.replaceChildren();
  if (!history.length) { $('historyEmpty').textContent = 'No hay envíos registrados este mes.'; $('historyEmpty').hidden = false; return; }
  $('historyEmpty').hidden = true;
  for (const g of history) {
    const tr = document.createElement('tr'), quality = Number(g.calidad || 0);
    const q = document.createElement('span'); q.className = 'quality-pill'+(quality<70?' bad':quality<90?' warn':''); q.textContent = quality+'%';
    tr.append(text('td',(g.archivo||'Sin nombre')+(g.pestana?' · '+g.pestana:'')),text('td',displayLast(g.latest)),text('td',n(g.registros)));
    const tdq = document.createElement('td'); tdq.append(q);
    tr.append(tdq,text('td',n(g.lima)),text('td',n(g.provincia)),text('td',g.usuario||'—'));
    body.append(tr);
  }
}
