let excelReaderPromise = null;

function excelReaderReady() {
  return !!(window.XLSX && typeof window.XLSX.read === 'function' && window.XLSX.utils);
}

function injectExcelReader(src) {
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.oltExcelFallback = 'true';
    script.onload = () => resolve(excelReaderReady());
    script.onerror = () => resolve(false);
    document.head.append(script);
  });
}

async function ensureExcelReader() {
  if (excelReaderReady()) return true;
  if (excelReaderPromise) return excelReaderPromise;

  excelReaderPromise = (async () => {
    // Primer reintento: mismo lector autocontenido, con cache-busting para evitar
    // que un asset antiguo o incompleto quede atrapado en caché.
    if (await injectExcelReader('/vendor/xlsx.js?v=20261007-2')) return true;

    // Respaldo oficial de SheetJS: solo se usa si el asset local no cargó.
    if (await injectExcelReader('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')) return true;

    return false;
  })();

  const ready = await excelReaderPromise;
  if (!ready) excelReaderPromise = null;
  return ready;
}

async function load(file){
  if(!file||sending)return;
  if(!/\.(xlsx|xls)$/i.test(file.name))return notice('Selecciona un archivo Excel .xlsx o .xls.',true);
  if(file.size>20*1024*1024)return notice('El archivo supera 20 MB. Divide la programación.',true);

  if(!excelReaderReady()){
    notice('Preparando el lector Excel…');
    if(!await ensureExcelReader()){
      return notice('No se pudo cargar el lector Excel. Actualiza la página e inténtalo nuevamente.',true);
    }
  }

  notice('Leyendo las pestañas del archivo…');
  try{
    const data=await file.arrayBuffer();
    fileHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
    book=XLSX.read(data,{type:'array',cellDates:true,sheetRows:10031});
    filename=file.name;
    rows=[];
    headerInfo=null;
    invalidate();
    render();
    $('fileLabel').textContent=file.name;
    $('sheet').replaceChildren(new Option('Selecciona una pestaña…',''));
    for(const name of book.SheetNames){
      const hidden=book.Workbook?.Sheets?.find(s=>s.name===name)?.Hidden;
      const opt=new Option(name+(hidden?' (oculta)':''),name);
      $('sheet').add(opt);
    }
    $('sheet').disabled=false;
    $('workspace').hidden=true;
    $('empty').hidden=false;
    if(book.SheetNames.length===1){
      $('sheet').value=book.SheetNames[0];
      selectSheet();
    }else{
      notice(`Se encontraron ${book.SheetNames.length} pestañas. Selecciona la programación que deseas enviar.`);
    }
  }catch(e){
    notice(errorMessage(e, 'excel'),true);
  }
}

function selectSheet(){
  rows=[];headerInfo=null;page=0;$('filter').value='error';invalidate();render();window.refreshOLTFileHistory?.();
  const name=$('sheet').value;if(!name)return;
  const ws=book.Sheets[name];
  if(ws['!fullref']&&XLSX.utils.decode_range(ws['!fullref']).e.r>=10031){
    rows=[];$('workspace').hidden=true;
    return notice('La pestaña supera 10.000 filas de lectura. Divide el archivo antes de continuar.',true);
  }
  const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  headerInfo=OLT.detectHeader(matrix);
  if(!headerInfo){
    rows=[];$('workspace').hidden=true;
    return notice('No se reconoce la tabla. Se necesitan encabezados de programación, incluida Entrega.',true);
  }
  if(headerInfo.duplicate.length){
    rows=[];$('workspace').hidden=true;
    return notice('Hay columnas duplicadas: '+headerInfo.duplicate.join(', ')+'. Corrige los encabezados.',true);
  }

  rows=[];
  for(let i=headerInfo.row+1;i<matrix.length;i++){
    const cells=matrix[i];
    const raw={};
    for(const c of OLT.columns)raw[c.key]=cells[headerInfo.mapping[c.key]]??'';
    if(OLT.isSummaryRow(raw))continue;
    // Ignore footer instructions only when no operational cells accompany them.
    const meaningful=OLT.columns.filter(c=>!['fecha','observacion'].includes(c.key)).some(c=>String(raw[c.key]).trim());
    if(!meaningful&&!String(raw.fecha).trim())continue;
    if(!meaningful&&typeof raw.fecha==='string'&&/^(\(\*\)|NOTA|OBSERVACIONES|FIRMA|ELABORADO)/i.test(raw.fecha.trim()))continue;
    rows.push({sourceRow:i+1,raw,original:{...raw}});
  }

  if(rows.length>10000){
    rows=[];
    return notice('Máximo 10.000 registros por revisión.',true);
  }

  invalidate();
  page=0;
  $('workspace').hidden=!rows.length;
  $('empty').hidden=!!rows.length;
  const mapped=Object.keys(headerInfo.mapping).length;
  const extras=(matrix[headerInfo.row]||[]).filter((v,i)=>String(v).trim()&&!Object.values(headerInfo.mapping).includes(i));
  $('mappingNote').textContent=`Encabezados: fila ${headerInfo.row+1} · ${mapped} de ${OLT.columns.length} campos reconocidos.`+(extras.length?` Fuera del destino: ${extras.join(', ')}.`:'');
  notice(rows.length?`Se revisarán ${rows.length} registros de «${name}». Las columnas ausentes se mostrarán vacías para completarlas.`:'La pestaña no contiene registros.');
  revalidate();
}
