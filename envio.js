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

let uploadCheckpoint = null;
function uploadProgress(checkpoint, message='') {
  const done=checkpoint.offset, total=checkpoint.payload.length;
  const detail=`${done.toLocaleString('es-PE')} de ${total.toLocaleString('es-PE')} procesados · ${checkpoint.insertados.toLocaleString('es-PE')} guardados · ${checkpoint.duplicados.toLocaleString('es-PE')} duplicados omitidos`;
  duplicateState(detail, 'warn');
  $('sendTitle').textContent=message || 'Enviando programación…';
  $('sendHelp').textContent=detail;
  notice(message ? message+' '+detail : detail);
}

$('send').onclick = () => {
  if (totals().errors || !rows.length || sending || reviewingDuplicates || rows.length > 5000) return;
  if (!oltSession?.user) { $('loginOpen').click(); return; }
  const q=qualitySummary();
  $('confirmText').textContent=`Se procesarán ${rows.length.toLocaleString('es-PE')} registros del archivo ${filename}, pestaña ${$('sheet').value}. Calidad ${q.percent}%. Supabase comprobará coincidencias exactas en las 19 columnas y omitirá los registros ya guardados.`;
  $('confirmUser').textContent='Usuario: '+sessionUserLabel();
  $('confirm').showModal();
};
$('cancelSend').onclick = () => $('confirm').close();
$('sendForm').onsubmit = async e => {
  e.preventDefault();
  if (sending || !oltSession?.user || totals().errors || !rows.length || rows.length > 5000) return;
  const user=oltSession.user;
  if (!uploadCheckpoint || uploadCheckpoint.revision!==revision || uploadCheckpoint.userId!==user.id) {
    uploadCheckpoint={revision,userId:user.id,payload:rows.map(r=>supabaseRow(r.result.values,user)),offset:0,insertados:0,duplicados:0,ultimaFecha:null};
  }
  const checkpoint=uploadCheckpoint;
  sending=true;
  for(const id of ['confirmSend','cancelSend','logout','refreshHistory']) $(id).disabled=true;
  render();
  let completed=false;
  try {
    const batchSize=500;
    while(checkpoint.offset<checkpoint.payload.length) {
      if(oltSession?.user?.id!==checkpoint.userId) throw new Error('La sesión cambió. Inicia sesión y vuelve a enviar.');
      const batch=checkpoint.payload.slice(checkpoint.offset,checkpoint.offset+batchSize);
      uploadProgress(checkpoint,`Enviando lote ${Math.floor(checkpoint.offset/batchSize)+1} de ${Math.ceil(checkpoint.payload.length/batchSize)}…`);
      const {data,error}=await supabaseClient.rpc('olt_insertar_lote',{p_rows:batch});
      if(error) throw error;
      if(!Number.isInteger(data?.insertados)||!Number.isInteger(data?.duplicados)||data.insertados<0||data.duplicados<0||data.insertados+data.duplicados!==batch.length) throw new Error('Invalid upload response');
      checkpoint.insertados+=data.insertados;checkpoint.duplicados+=data.duplicados;checkpoint.offset+=batch.length;
      if(data.ultima_fecha&&(!checkpoint.ultimaFecha||data.ultima_fecha>checkpoint.ultimaFecha)) checkpoint.ultimaFecha=data.ultima_fecha;
      uploadProgress(checkpoint);
    }
    completed=true;
    $('confirm').close();
    if(checkpoint.ultimaFecha) $('lastUserUpload').textContent='Último envío del usuario: '+displayLast(checkpoint.ultimaFecha);
    const message=`Se procesó con éxito: ${checkpoint.insertados.toLocaleString('es-PE')} registro(s) guardado(s), ${checkpoint.duplicados.toLocaleString('es-PE')} duplicado(s) exacto(s) omitidos.`;
    uploadCheckpoint=null;resetProgramacionDespuesDeEnvio();notice(message);
  } catch(error) {
    const message=errorMessage(error,'insercion')+` Se confirmaron ${checkpoint.offset} de ${checkpoint.payload.length} registros (${checkpoint.insertados} guardados y ${checkpoint.duplicados} duplicados). Pulsa Enviar para reanudar; los lotes confirmados se conservaron.`;
    notice(message,true);duplicateState('Envío parcial. Puedes reanudar; Supabase comprobará también cualquier lote cuya respuesta no llegó.','bad');
  } finally {
    sending=false;
    for(const id of ['confirmSend','cancelSend','logout','refreshHistory']) $(id).disabled=false;
    render();
    if(!completed) {$('sendTitle').textContent='Envío pendiente · puedes reanudar';$('sendHelp').textContent=`${checkpoint.offset} de ${checkpoint.payload.length} registros confirmados. El siguiente envío continúa desde el lote pendiente.`;}
  }
  // History is a separate read: an error here must never turn a successful upload into a failed one.
  if(completed) {
    try {await window.refreshOLTFileHistory();}
    catch(error) {notice('La programación se guardó. No se pudo actualizar el historial; pulsa Actualizar historial.',true);}
  }
};
