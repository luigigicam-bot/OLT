function canonicalBusinessValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}
function businessFingerprint(values) {
  return JSON.stringify(BUSINESS_KEYS.map(key => canonicalBusinessValue(values?.[key])));
}
function duplicateState(message, tone = '') {
  const node = $('duplicateState');
  if (!node) return;
  node.className = 'duplicate-state' + (tone ? ' ' + tone : '');
  node.replaceChildren();
  node.append(text('strong','Duplicados: '), document.createTextNode(message));
}
async function cargarCandidatosDuplicados(incomingRows) {
  const entregas = [...new Set(incomingRows.map(r => canonicalBusinessValue(r.result?.values?.entrega)).filter(Boolean))];
  if (!entregas.length) return [];
  const selectColumns = BUSINESS_KEYS.join(',');
  const result = [];
  const deliveryBatch = 40;
  const pageSize = 1000;
  for (let d = 0; d < entregas.length; d += deliveryBatch) {
    const batch = entregas.slice(d, d + deliveryBatch);
    for (let from = 0;; from += pageSize) {
      const { data, error } = await supabaseClient
        .from('recepcion_olt')
        .select(selectColumns)
        .eq('usuario_id', oltSession.user.id)
        .in('entrega', batch)
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const pageRows = data || [];
      result.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }
  }
  return result;
}
async function revisarDuplicadosExactos(sourceRows = rows) {
  const candidates = await cargarCandidatosDuplicados(sourceRows);
  const existing = new Set(candidates.map(businessFingerprint));
  const accepted = new Set();
  const nuevos = [], duplicados = [];
  for (const r of sourceRows) {
    const fp = businessFingerprint(r.result?.values || {});
    if (existing.has(fp) || accepted.has(fp)) duplicados.push(r);
    else { accepted.add(fp); nuevos.push(r); }
  }
  return { received: sourceRows.length, newRows: nuevos, duplicateRows: duplicados, existingCandidates: candidates.length };
}
