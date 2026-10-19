
(function(root){
 'use strict';
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\u00a0/g,' ').trim().replace(/\s+/g,' ').toUpperCase();
 const spec=[
 ['fecha','Fec. Despacho','required',null,['FECHA DE DESPACHO','FEC.DESPACHO']],
 ['area','Área de OLT','required',['AREAS CLAVE','OLT CONSUMO','OLT SALUD']],
 ['entrega','Entrega','required'],['factura','Factura/B.V.','required',null,['FACTURA','FACTURA/BV','FACTURA/B.V.']],
 ['gr','GR','required',null,['GUIA']],['turno','Am - Pm','warning',null,['TURNO','AM - PM']],
 ['cita','Cita','warning'],['razon','Razón Social del Cliente','required'],['distrito','Distrito','warning'],
 ['provincia','Provincia','warning'],['departamento','Departamento','warning'],
 ['linea','Línea','required',['FAES FARMA','FERQUIM','GENOMMA LAB','ELEA','RECKITT BENCKISER','TAKEDA','OMPHARMA','BIOPAS','TECNOFARMA','CLINICA INTERNACIONAL']],
 ['bultos','Bultos','warning'],['volumen','Volumen','warning'],['peso','Peso','warning'],
 ['despacho','Tipo de despacho','required',['LIMA','PROVINCIA']],
 ['transporte','Tipo de Transporte','required',['CD SANTA ANITA','EXCLUSIVO','EN RUTA','AEREO','TERRESTRE','RECOGE CLIENTE']],
 ['mercaderia','Tipo de Mercadería','required',['SECO','REFRIGERADO','CLIMATIZADO']],['observacion','Observación','optional']
 ];
 const columns=spec.map(([key,label,mode,values,aliases=[]])=>({key,label,mode,values,aliases}));
 const aliases={area:{'AREAS CLAVES':'AREAS CLAVE','AREA CLAVE':'AREAS CLAVE','AREA CLAVES':'AREAS CLAVE','AREA CCLAVES':'AREAS CLAVE','OLT CONSUMOS':'OLT CONSUMO'},linea:{'ELEA PERU':'ELEA','ELE':'ELEA','ELEO':'ELEA','ADIUM':'TECNOFARMA','ADIUM PERU':'TECNOFARMA'},despacho:{'PROVINCIAS':'PROVINCIA','LIMA PERU':'LIMA'}};
 const header=v=>norm(v).replace(/\(\*\)/g,'').replace(/[^A-Z0-9]/g,'');
 function distance(a,b){let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;}return prev[b.length];}
 function match(value,col,threshold=85){const text=norm(value);if(col.values.includes(text))return {value:text,method:'normalización'};if(aliases[col.key]?.[text])return {value:aliases[col.key][text],method:'equivalencia'};const ranked=col.values.map(v=>({value:v,score:100*(1-distance(text,norm(v))/Math.max(text.length,v.length))})).sort((a,b)=>b.score-a.score);if(ranked[0].score>=threshold&&ranked[0].score-ranked[1].score>=10)return {...ranked[0],method:'similitud'};return {error:'Valor fuera del catálogo. Selecciona una opción.',suggestion:ranked[0].value,score:ranked[0].score};}
 function dateValue(value,year=2026){
  let d,m,y;if(value instanceof Date){d=value.getDate();m=value.getMonth()+1;y=value.getFullYear();}
  else if(typeof value==='number'&&value>0&&value<2958466){const x=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000);d=x.getUTCDate();m=x.getUTCMonth()+1;y=x.getUTCFullYear();}
  else {const t=norm(value);const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);if(iso){[,y,m,d]=iso.map(Number);}else{const a=t.split(/[-/ .]+/);if(a.length<2||a.length>3)return null;const months={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,SET:9,OCT:10,NOV:11,DIC:12};d=Number(a[0]);m=months[a[1]]||Number(a[1]);y=a.length===3?Number(a[2]):Number(year);if(a.length===2&&!months[a[1]])return null;if(y<100)y+=2000;}}
  if(!Number.isInteger(d)||!Number.isInteger(m)||!Number.isInteger(y)||y<1900||y>2100)return null;const x=new Date(Date.UTC(y,m-1,d));if(x.getUTCFullYear()!==y||x.getUTCMonth()+1!==m||x.getUTCDate()!==d)return null;return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 }
 function detectHeader(matrix){let best=null;for(let i=0;i<Math.min(30,matrix.length);i++){const mapping={};const duplicate=[];matrix[i].forEach((v,j)=>{const c=columns.find(c=>[c.label,...c.aliases].some(a=>header(a)===header(v)));if(c){if(mapping[c.key]!==undefined)duplicate.push(c.label);else mapping[c.key]=j;}});const score=Object.keys(mapping).length;if(score>=6&&mapping.entrega!==undefined&&(!best||score>best.score))best={row:i,mapping,score,duplicate};}return best;}
 function validate(raw,options={}){const values={},issues=[],changes=[];const year=options.year||2026;const threshold=options.threshold||85;
  const add=(key,severity,message,suggestion)=>issues.push({key,severity,message,suggestion});
  for(const c of columns){let input=raw[c.key]??'';let v=String(input).trim();if(c.key==='cita'&&input instanceof Date)v=`${String(input.getHours()).padStart(2,'0')}:${String(input.getMinutes()).padStart(2,'0')}`;
   if(c.key==='mercaderia'&&!v){const obs=norm(raw.observacion);const hits=c.values.filter(t=>new RegExp('\\b'+t+'\\b').test(obs));if(hits.length===1){v=hits[0];changes.push({key:c.key,before:'',after:v,method:'desde Observación'});}else if(hits.length>1)add(c.key,'error','Observación contiene varios tipos. Selecciona uno.');}
   if(!v){const clinicInvoice=c.key==='factura'&&match(raw.linea??'',columns.find(x=>x.key==='linea'),threshold).value==='CLINICA INTERNACIONAL';if(c.mode==='required'&&!clinicInvoice)add(c.key,'error','Campo obligatorio vacío.');else if(c.mode==='warning')add(c.key,'warning','Celda vacía (opcional con advertencia).');values[c.key]='';continue;}
   if(['entrega','factura','gr'].includes(c.key)&&/^[-–—]+$/.test(v))add(c.key,'error','El valor «-» no es válido.');
   if(c.key==='fecha'){const parsed=dateValue(input,year);if(!parsed)add(c.key,'error','Fecha inválida. Usa una fecha completa o 26-Set.');else {v=parsed;if(Number(v.slice(0,4))!==Number(year))add(c.key,'warning',`Fecha de ${v.slice(0,4)}: verifica el año de programación.`);}}
   if(c.values){const result=match(v,c,threshold);if(result.error)add(c.key,'error',result.error,result.suggestion);else {if(v!==result.value)changes.push({key:c.key,before:v,after:result.value,method:result.method});v=result.value;}}
   if(['bultos','volumen','peso'].includes(c.key)){if(v==='-'){v='';add(c.key,'warning','Sin cantidad (opcional con advertencia).');}else {const n=Number(v.replace(',','.'));if(!Number.isFinite(n)||n<0||(c.key==='bultos'&&!Number.isInteger(n)))add(c.key,'error',c.key==='bultos'?'Usa un entero no negativo.':'Usa un número no negativo.');else v=n;}}
   values[c.key]=v;
  }return {values,issues,changes};
 }
 function isSummaryRow(raw){
  const marker=v=>/^(?:SUB\s*TOTAL(?:ES)?|TOTAL(?:ES)?(?: GENERAL)?)[\s:]*$/.test(norm(v));
  const entries=columns.map(c=>[c.key,raw[c.key]]).filter(([,v])=>norm(v));
  if(!entries.some(([,v])=>marker(v)))return false;
  // Never discard a row containing order identifiers or a dispatch date.
  if(['fecha','entrega','factura','gr','razon'].some(k=>norm(raw[k])&&!marker(raw[k])))return false;
  return entries.every(([,v])=>marker(v)||/^[+-]?\d+(?:[.,]\d+)*$/.test(norm(v)));
 }
 const api={columns,aliases,norm,header,distance,match,dateValue,detectHeader,validate,isSummaryRow};root.OLT=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

