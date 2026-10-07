function supabaseRow(values, user) {
  return {
    fecha: values.fecha || null,
    area: values.area || null,
    entrega: values.entrega || null,
    factura: values.factura || null,
    gr: values.gr || null,
    turno: values.turno || null,
    cita: values.cita || null,
    razon: values.razon || null,
    distrito: values.distrito || null,
    provincia: values.provincia || null,
    departamento: values.departamento || null,
    linea: values.linea || null,
    bultos: values.bultos === '' ? null : values.bultos,
    volumen: values.volumen === '' ? null : values.volumen,
    peso: values.peso === '' ? null : values.peso,
    despacho: values.despacho || null,
    transporte: values.transporte || null,
    mercaderia: values.mercaderia || null,
    observacion: values.observacion || null,
    usuario_id: user.id,
    usuario: user.email || user.phone || user.id,
    archivo: filename,
    archivo_hash: fileHash,
    pestana: $('sheet').value
  };
}

function resetProgramacionDespuesDeEnvio() {
  book = null;
  filename = '';
  rows = [];
  headerInfo = null;
  page = 0;
  fileHash = '';
  lastSent = -1;

  invalidate();
  $('file').value = '';
  $('fileLabel').textContent = 'Arrastra tu programación aquí';
  $('sheet').replaceChildren(new Option('Primero carga un archivo'));
  $('sheet').disabled = true;
  $('filter').value = 'error';
  $('workspace').hidden = true;
  $('empty').hidden = false;
  $('mappingNote').textContent = '';
  $('lastFileUpload').textContent = oltSession?.user
    ? 'Carga un archivo para consultar su último envío.'
    : 'Carga un archivo e inicia sesión para consultar su último envío.';
  pendingSendReview = null;
  duplicateState('se comprobarán antes de enviar. Coincidencia 100% en las 19 columnas = registro omitido.');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('send').onclick = async () => {
  if (totals().errors || !rows.length || sending || reviewingDuplicates || rows.length > 5000) return;
  if (!oltSession?.user) { $('loginOpen').click(); return; }
  $('send').disabled = true;
  reviewingDuplicates = true;
  const reviewedRevision = revision, reviewedUser = oltSession.user.id;
  duplicateState('comparando las 19 columnas contra Supabase…','warn');
  notice('Comprobando duplicados exactos antes de enviar…');
  try {
    pendingSendReview = await revisarDuplicadosExactos(rows);
    if (reviewedRevision !== revision || reviewedUser !== oltSession?.user?.id) {
      pendingSendReview = null; notice('La programación o la sesión cambió. Vuelve a revisar antes de enviar.', true); return;
    }
    const d=pendingSendReview.duplicateRows.length, n=pendingSendReview.newRows.length, total=pendingSendReview.received;
    if (!n) {
      duplicateState(total.toLocaleString('es-PE')+' de '+total.toLocaleString('es-PE')+' registros ya existen al 100%. No se insertará ninguno.','bad');
      notice('El archivo fue revisado. Todos los registros ya existían y no se duplicó información.');
      render(); return;
    }
    duplicateState(d ? d.toLocaleString('es-PE')+' duplicado(s) exacto(s) serán omitidos; '+n.toLocaleString('es-PE')+' registro(s) nuevo(s) pasarán.' : 'no se encontraron duplicados exactos. Los '+n.toLocaleString('es-PE')+' registros pasarán.','ok');
    const q = qualitySummary();
    $('confirmText').textContent = 'Recibidos: '+total+'. Nuevos: '+n+'. Duplicados exactos omitidos: '+d+'. Archivo '+filename+', pestaña '+$('sheet').value+'. Calidad '+q.percent+'% ('+q.label+'). Lima: '+q.lima+' · Provincia: '+q.provincia+'.';
    $('confirmUser').textContent = 'Usuario: ' + sessionUserLabel();
    $('confirm').showModal();
    notice(d ? d+' duplicado(s) exacto(s) detectado(s). Solo se enviarán los registros nuevos.' : 'No se detectaron duplicados exactos.');
  } catch(error) {
    pendingSendReview=null;
    duplicateState(errorMessage(error, 'duplicados'),'bad');
    notice(errorMessage(error, 'duplicados'),true);
  } finally { reviewingDuplicates = false; render(); }
};

$('cancelSend').onclick = () => $('confirm').close();

$('sendForm').onsubmit = async e => {
  e.preventDefault();
  if (sending || !oltSession?.user || totals().errors || !rows.length || rows.length > 5000) return;
  sending = true;
  for (const id of ['confirmSend', 'cancelSend', 'logout', 'refreshHistory']) $(id).disabled = true;
  render();
  let insertados = 0, ultimaFecha = null, duplicados = 0, recibidos = rows.length;
  try {
    const user = oltSession.user;
    // Segunda comprobación inmediatamente antes de insertar.
    const review = await revisarDuplicadosExactos(rows);
    pendingSendReview = review;
    duplicados = review.duplicateRows.length;
    const payload = review.newRows.map(r => supabaseRow(r.result.values, user));
    if (!payload.length) {
      $('confirm').close();
      duplicateState(recibidos.toLocaleString('es-PE')+' de '+recibidos.toLocaleString('es-PE')+' registros ya existían al 100%. No se insertó ninguno.','bad');
      notice('El archivo fue procesado. Todos los registros ya existían y no se duplicó información.');
      await window.refreshOLTFileHistory();
      return;
    }
    const batchSize = 500;
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize);
      const { data, error } = await supabaseClient.rpc('olt_insertar_lote', { p_rows: batch });
      if (error) throw error;
      if (!Number.isInteger(data?.insertados) || !Number.isInteger(data?.duplicados) || data.insertados + data.duplicados !== batch.length) throw new Error('Invalid upload response');
      insertados += data.insertados;
      duplicados += data.duplicados;
      const batchLast = data.ultima_fecha;
      if (batchLast && (!ultimaFecha || batchLast > ultimaFecha)) ultimaFecha = batchLast;
    }
    $('confirm').close();
    $('lastUserUpload').textContent = 'Último envío del usuario: ' + displayLast(ultimaFecha || new Date().toISOString());
    const resultMessage = duplicados
      ? insertados.toLocaleString('es-PE')+' registro(s) nuevo(s) insertado(s). '+duplicados.toLocaleString('es-PE')+' duplicado(s) exacto(s) fueron omitidos.'
      : insertados.toLocaleString('es-PE')+' registro(s) insertado(s).';
    resetProgramacionDespuesDeEnvio();
    notice('Se cargó con éxito. '+resultMessage);
    await window.refreshOLTFileHistory();
  } catch (error) {
    notice(errorMessage(error, 'insercion') + (insertados ? ` Se confirmaron ${insertados} registros antes del error. Al reintentar se omitirán los duplicados.` : ''), true);
    duplicateState('el envío no se completó; vuelve a revisar antes de reintentar.','bad');
    render();
  } finally {
    sending = false;
    for (const id of ['confirmSend', 'cancelSend', 'logout', 'refreshHistory']) $(id).disabled = false;
    render();
  }
};

