
'use strict';
const $=id=>document.getElementById(id);
let book,filename='',rows=[],headerInfo=null,page=0,sending=false,revision=0,lastSent=-1;
let fileHash='';
let reviewingDuplicates=false;
let saved={};try{saved=JSON.parse(localStorage.getItem('olt-preferences')||'{}');}catch(_){}
const options={...window.OLT_CONFIG,...saved};
$('year').value=options.year||2026;
$('threshold').value=options.threshold||85;
const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
function notice(message,error=false){$('notice').textContent=message;$('notice').className=error?'error':'';}
function invalidate(){revision++;}
function distribution(){for(const c of OLT.columns){const node=document.querySelector(`[data-source="${c.key}"]`);if(!node)continue;const col=headerInfo?.mapping[c.key];node.textContent=!headerInfo?'Pendiente de cargar':col===undefined?'No encontrada en el archivo':`Origen: columna ${XLSX.utils.encode_col(col)}`;node.classList.toggle('missing',!!headerInfo&&col===undefined);}}
const PAGE=50;let visible=[],sumTimer;
const rowErrors=r=>r.result.issues.filter(x=>x.severity==='error');
const show=(c,v)=>c.key==='fecha'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('/'):v;
function validateRow(r){r.result=OLT.validate(r.raw,{year:Number($('year').value),threshold:Number(options.threshold)||85});r.err=rowErrors(r).length;}
function revalidate(){rows.forEach((r,i)=>{r.i=i;validateRow(r);});render();}
function totals(){let errors=0,bad=0,changes=0;for(const r of rows){errors+=r.err;if(r.err)bad++;changes+=r.result.changes.length;}return {errors,bad,ok:rows.length-bad,changes};}

// ===== Resumen del envío y calidad de información =====
const QUALITY_FIELDS=OLT.columns.filter(c=>c.mode!=='optional');
function qualitySummary(){
  const byClient=new Map(),missingByField=new Map();
  let complete=0,expected=rows.length*QUALITY_FIELDS.length,lima=0,provincia=0,missingTotal=0;
  const affectedRows=new Set();
  for(const r of rows){
    const values=r.result?.values||{};
    const linea=String(values.linea||r.raw?.linea||'').trim()||'SIN LÍNEA';
    byClient.set(linea,(byClient.get(linea)||0)+1);
    const despacho=String(values.despacho||r.raw?.despacho||'').trim().toUpperCase();
    if(despacho==='LIMA')lima++; else if(despacho==='PROVINCIA')provincia++;
    for(const c of QUALITY_FIELDS){
      const v=values[c.key];
      const hasValue=!(v===''||v===null||v===undefined);
      const hasError=(r.result?.issues||[]).some(i=>i.key===c.key&&i.severity==='error');
      if(hasValue&&!hasError){complete++;continue;}
      missingTotal++;affectedRows.add(r.sourceRow);
      const x=missingByField.get(c.key)||{label:c.label,count:0,required:c.mode==='required'};x.count++;missingByField.set(c.key,x);
    }
  }
  const percent=expected?Math.round((complete/expected)*100):0;
  const level=percent>=90?'excellent':percent>=80?'good':percent>=70?'regular':'low';
  const label=percent>=90?'Excelente':percent>=80?'Buena':percent>=70?'Regular':'Baja';
  return {byClient,missingByField,complete,expected,percent,level,label,lima,provincia,missingTotal,affectedRows:affectedRows.size};
}
function renderQualitySummary(){
  const panel=$('qualityPanel');if(!panel)return;
  const q=qualitySummary(),n=v=>Number(v||0).toLocaleString('es-PE'),pct=v=>rows.length?Math.round(v*100/rows.length):0;
  panel.dataset.level=q.level;$('qualityRing').style.setProperty('--score',q.percent+'%');$('qualityPercent').textContent=q.percent+'%';$('qualityLabel').textContent=q.label;
  $('qualityCoverage').textContent=`${n(q.complete)} de ${n(q.expected)} datos completos`;$('qualityRecords').textContent=n(rows.length);$('qualityClientCount').textContent=`${n(q.byClient.size)} línea${q.byClient.size===1?'':'s'} / cliente${q.byClient.size===1?'':'s'}`;
  $('qualityLima').textContent=n(q.lima);$('qualityLimaPct').textContent=pct(q.lima)+'% del envío';$('qualityProvincia').textContent=n(q.provincia);$('qualityProvinciaPct').textContent=pct(q.provincia)+'% del envío';
  $('qualityMissingTotal').textContent=n(q.missingTotal);$('qualityMissingRows').textContent=`${n(q.affectedRows)} fila${q.affectedRows===1?'':'s'} afectada${q.affectedRows===1?'':'s'}`;
  $('qualityIncompleteCard').className='quality-card '+(q.missingTotal?'quality-warn':'quality-good');
  const clients=$('qualityClients');clients.replaceChildren();
  const clientEntries=[...q.byClient.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'));
  if(!clientEntries.length)clients.append(text('p','Sin datos para resumir.','quality-empty'));
  else for(const [name,count] of clientEntries){const tag=document.createElement('span');tag.className='quality-tag';tag.append(document.createTextNode(name+' '),text('b',n(count)));clients.append(tag);}
  const missing=$('qualityMissing');missing.replaceChildren();
  const missEntries=[...q.missingByField.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es')).slice(0,8);
  if(!missEntries.length)missing.append(text('p','Todos los campos evaluados están completos.','quality-empty'));
  else for(const x of missEntries){const item=document.createElement('div');item.className='quality-missing-item';item.append(text('span',x.label+(x.required?' · obligatorio':'')),text('b',n(x.count)+' pendiente'+(x.count===1?'':'s')));missing.append(item);}
}

function summary(){clearTimeout(sumTimer);sumTimer=setTimeout(()=>{const m=new Map();for(const r of rows)for(const i of rowErrors(r)){const k=i.key+'|'+i.message;const x=m.get(k)||{...i,rows:[]};x.rows.push(r.sourceRow);m.set(k,x);}const list=$('issueList');list.replaceChildren();for(const x of m.values()){const label=OLT.columns.find(c=>c.key===x.key).label;list.append(text('div',`${label}: ${x.rows.length} celda(s). ${x.message.replace('Campo obligatorio vacío.','Completa este campo.')} Filas ${x.rows.slice(0,20).join(', ')}${x.rows.length>20?'…':''}`,'issue-item red-text'));}if(!m.size)list.append(text('p','No hay errores.'));},rows.length>500?300:0);}
function stats(){renderQualitySummary();const t=totals(),n=v=>v.toLocaleString('es-PE');$('total').textContent=n(rows.length);$('okRows').textContent=n(t.ok);$('badRows').textContent=n(t.bad);$('errors').textContent=n(t.errors);
 $('send').disabled=!!t.errors||!rows.length||sending||reviewingDuplicates||lastSent===revision;$('download').disabled=!rows.length||sending;
 $('sendTitle').textContent=!rows.length?'Carga tu archivo para comenzar':sending?'Enviando programación…':t.errors?`Faltan ${n(t.bad)} registros por corregir`:lastSent===revision?'Envío confirmado':'Programación lista para enviar';
 $('sendHelp').textContent=!rows.length?'El botón se habilitará cuando haya registros y no existan errores rojos.':t.errors?`${n(t.errors)} errores impiden el envío. Las filas conformes se ocultan solas.`:`${n(rows.length)} registros listos para enviar.`;
 $('connectionStatus').textContent='Destino activo: Supabase · recepcion_olt.';
 if(rows.length>5000){$('send').disabled=true;$('sendHelp').textContent='Divide la programación en lotes de hasta 5.000 registros para enviarla.';}
 for(const id of ['file','sheet','year','settingsOpen'])$(id).disabled=sending||(id==='sheet'&&!book);
 document.querySelectorAll('.steps li').forEach((e,i)=>e.classList.toggle('active',i===(!rows.length?0:lastSent===revision?2:1)));}
function pager(){const f=$('filter').value,n=visible.length,done=!!rows.length&&!n&&f==='error';$('donePanel').hidden=!done;$('grid').parentElement.hidden=done;$('doneText').textContent=`${rows.length.toLocaleString('es-PE')} registros conformes. Revisa el resumen y envía cuando quieras.`;$('pageInfo').textContent=`${n?page*PAGE+1:0}–${Math.min((page+1)*PAGE,n)} de ${n.toLocaleString('es-PE')} ${f==='error'?'pendientes':'registros'}`;$('prev').disabled=page===0;$('next').disabled=(page+1)*PAGE>=n;}
function paintRow(r,tr){OLT.columns.forEach((c,j)=>{const td=tr.children[j+1],input=td.firstChild,v=String(r.result.values[c.key]);if(c.values&&v&&!c.values.includes(v)&&![...input.options].some(o=>o.value===v))input.add(new Option(v,v));input.value=show(c,v);td.className='';td.querySelectorAll('.cell-note').forEach(x=>x.remove());const errs=r.result.issues.filter(x=>x.key===c.key&&x.severity==='error');if(errs.length){td.className='cell-error';for(const i of errs)td.append(text('span',i.message.replace('Campo obligatorio vacío.','Completa este campo.')+(i.suggestion?` Sugerencia: ${i.suggestion}`:''),'cell-note'));}});}
function buildRow(r){const tr=document.createElement('tr');tr.append(text('td',r.sourceRow));for(const c of OLT.columns){const td=document.createElement('td');let input;if(c.values){input=document.createElement('select');input.add(new Option('Selecciona…',''));for(const v of c.values)input.add(new Option(v,v));}else input=document.createElement('input');input.setAttribute('aria-label',`Fila ${r.sourceRow}, ${c.label}`);input.disabled=sending;input.addEventListener('change',()=>edit(r,c,input,tr));td.append(input);tr.append(td);}paintRow(r,tr);return tr;}
function edit(r,c,input,tr){r.raw[c.key]=input.value;invalidate();validateRow(r);paintRow(r,tr);const gone=!r.err&&$('filter').value==='error';tr.classList.toggle('leaving',gone);if(gone)setTimeout(()=>drop(r,tr),260);stats();summary();}
function drop(r,tr){if(!tr.isConnected)return;if(r.err||$('filter').value!=='error'){tr.classList.remove('leaving');return;}tr.remove();const p=visible.indexOf(r.i);if(p>=0)visible.splice(p,1);const body=$('grid').querySelector('tbody'),next=visible[page*PAGE+body.children.length];if(next!==undefined)body.append(buildRow(rows[next]));if(!body.children.length&&page>0){page--;return render();}pager();}
function render(){stats();summary();const f=$('filter').value;visible=[];rows.forEach((r,i)=>{if(f==='all'||r.err)visible.push(i);});page=Math.min(page,Math.max(0,Math.ceil(visible.length/PAGE)-1));const head=$('grid').querySelector('thead');if(!head.firstChild){const tr=document.createElement('tr');tr.append(text('th','Fila Excel'));for(const c of OLT.columns)tr.append(text('th',c.label));head.append(tr);}const frag=document.createDocumentFragment();for(const i of visible.slice(page*PAGE,page*PAGE+PAGE))frag.append(buildRow(rows[i]));$('grid').querySelector('tbody').replaceChildren(frag);distribution();pager();}

$('file').onchange=e=>load(e.target.files[0]);$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('dragover');};$('drop').ondragleave=()=>$('drop').classList.remove('dragover');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('dragover');load(e.dataTransfer.files[0]);};$('sheet').onchange=selectSheet;$('year').onchange=()=>{if(Number($('year').value)<2000||Number($('year').value)>2100){$('year').value=2026;}invalidate();revalidate();};$('filter').onchange=()=>{page=0;render();};$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
$('settingsOpen').onclick=()=>$('settings').showModal();
for(const [index,c] of OLT.columns.entries()){const div=document.createElement('article');div.className='field-card';const title=document.createElement('div');title.className='field-title';title.append(text('span',String(index+1).padStart(2,'0'),'field-number'),text('h3',c.label));div.append(title);const source=text('p','Pendiente de cargar','field-source');source.dataset.source=c.key;div.append(source);if(c.values){const tags=document.createElement('div');tags.className='value-tags';for(const value of c.values)tags.append(text('span',value));div.append(tags);}else {const hints={fecha:'Fecha estimada de salida · 26-Set → 26/09/2026',entrega:'Número de entrega',factura:'Número de comprobante o S/F',gr:'Número de guía de remisión',observacion:'Información adicional de la programación.'};div.append(text('p',hints[c.key]||'Ingresa la información correspondiente.','field-hint'));}$('catalog').append(div);}
render();
$('download').onclick=()=>{const data=[OLT.columns.map(c=>c.label),...rows.map(r=>OLT.columns.map(c=>r.result.values[c.key]))];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Programacion');const audit=[['Fila Excel','Columna','Tipo','Original','Resultado o mensaje']];for(const r of rows){for(const i of r.result.issues.filter(x=>x.severity==='error'))audit.push([r.sourceRow,i.key,i.severity,String(r.raw[i.key]??''),i.message]);}XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(audit),'Revision');XLSX.writeFile(wb,'Programacion_OLT_revisada.xlsx');};
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'read_olt_validation_summary',description:'Read validation counts for the currently selected programming sheet. Does not submit records.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>({file:filename,sheet:$('sheet').value,records:rows.length,...totals()})});}catch(_){}}

