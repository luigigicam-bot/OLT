const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'qa@example.invalid' };
const sample = { fecha:'2026-10-07', area:'OLT SALUD', entrega:'QA-1', factura:'F001', gr:'G001', turno:'AM', cita:'08:00', razon:'PRUEBA', distrito:'SANTA ANITA', provincia:'LIMA', departamento:'LIMA', linea:'FAES FARMA', bultos:2, volumen:1.5, peso:3, despacho:'LIMA', transporte:'CD SANTA ANITA', mercaderia:'SECO', observacion:'' };
const settle = () => new Promise(resolve => setImmediate(resolve));

function portal({ initialSession = null } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), { url:'https://qa.example.invalid/', runScripts:'outside-only' });
  const w = dom.window, records = [], calls = [], errors = [], behaviors = {};
  let session = initialSession, listener;
  w.scrollTo = () => {};
  w.console.warn = (...args) => errors.push(args.join(' '));
  Object.defineProperty(w.crypto,'subtle',{ value:webcrypto.subtle });
  for (const dialog of w.document.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new w.Event('close')); };
  }
  function query(table) {
    const filters = [], builder = {
      select: () => builder, eq:(k,v) => { filters.push(r=>r[k]===v); return builder; },
      in:(k,vs) => { filters.push(r=>vs.includes(r[k])); return builder; },
      order: () => builder, range:(a,b) => { builder.bounds=[a,b+1]; return builder; },
      limit:n => { builder.bounds=[0,n]; return builder; },
      then(resolve,reject) {
        const list = records.filter(r=>r.usuario_id===session?.user.id && filters.every(f=>f(r)));
        return Promise.resolve({data:list.slice(...(builder.bounds||[0,list.length])),error:null}).then(resolve,reject);
      }
    };
    calls.push({table}); return builder;
  }
  w.supabase = {createClient:()=>({
    auth: {
      getSession:async()=>({data:{session},error:null}),
      signInWithPassword:async({password})=> {
        if(password==='invalid') return {data:{},error:{code:'invalid_credentials',message:'private SQL detail'}};
        session={user:owner}; listener?.('SIGNED_IN',session); return {data:{session},error:null};
      },
      signOut:async()=> {session=null;listener?.('SIGNED_OUT',null);return {error:null};},
      onAuthStateChange:cb=>{listener=cb;}
    }, from:query,
    rpc:async(name,args)=> {
      calls.push({name,args}); if(behaviors[name]) return behaviors[name](args);
      if(name==='olt_resumen_mes') return {data:{totales:{registros:100001,archivos:20,lima:70000,provincia:30001},linea_principal:{linea:'FAES FARMA',registros:60000},historial:[]},error:null};
      let insertados=0,duplicados=0;
      for(const row of args.p_rows) {
        const fp=w.businessFingerprint(row);
        if(records.some(r=>w.businessFingerprint(r)===fp)) {duplicados++;continue;}
        records.push({...row,created_at:'2026-10-07T20:00:00Z'});insertados++;
      }
      return {data:{insertados,duplicados,ultima_fecha:'2026-10-07T20:00:00Z'},error:null};
    }
  })};
  for (const script of w.document.querySelectorAll('script[src]')) {
    const file=script.getAttribute('src'); if(file==='vendor/supabase.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), dom.getInternalVMContext(), { filename:file });
  }
  return {w,dom,records,calls,errors,behaviors,close:()=>w.close()};
}

async function loadExcel(p, rawRows) {
  const w=p.w;
  const wb=w.XLSX.utils.book_new();
  const matrix=[w.OLT.columns.map(c=>c.label),...rawRows.map(row=>w.OLT.columns.map(c=>row[c.key]??''))];
  w.XLSX.utils.book_append_sheet(wb,w.XLSX.utils.aoa_to_sheet(matrix),'Programacion');
  const bytes=w.XLSX.write(wb,{bookType:'xlsx',type:'array'});
  await w.load({name:'qa.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes});
  await settle();
}

test('login errors are safe, login displays app, logout hides data',async()=>{
  const p=portal();try {
    await settle();assert.equal(p.w.document.getElementById('appShell').hidden,true);
    const $=id=>p.w.document.getElementById(id);
    $('gateUsername').value=owner.email;$('gatePassword').value='invalid';
    await $('gateLoginForm').onsubmit({preventDefault(){}});
    assert.equal($('gateLoginError').textContent,'Correo o contraseña incorrectos.');
    assert.equal($('gatePassword').value,'');
    await p.w.signIn(owner.email,'test-fixture');
    assert.equal($('appShell').hidden,false);
    assert.equal($('dashRecords').textContent,'100,001');
    await $('logout').onclick();assert.equal($('appShell').hidden,true);assert.equal($('historyBody').children.length,0);
  } finally {p.close();}
});

test('real XLSX reader, validation, exact duplicate comparison, upload and reset',async()=>{
  const p=portal({initialSession:{user:owner}});try {
    await settle();await loadExcel(p,[sample,sample,{...sample,entrega:'QA-2'}]);
    assert.equal(p.w.totals().ok,3);assert.equal(p.w.totals().errors,0);
    const review=await p.w.revisarDuplicadosExactos();assert.equal(review.newRows.length,2);assert.equal(review.duplicateRows.length,1);
    const $=id=>p.w.document.getElementById(id);
    await $('send').onclick();assert.equal($('confirm').open,true);
    await $('sendForm').onsubmit({preventDefault(){}});
    assert.equal(p.records.length,2);assert.match($('notice').textContent,/2 registro/);
    assert.equal(p.w.totals().ok,0);assert.equal($('confirmSend').disabled,false);
    await loadExcel(p,[sample]);await $('send').onclick();
    await $('sendForm').onsubmit({preventDefault(){}});assert.match($('notice').textContent,/1 duplicado/);assert.equal(p.records.length,2);
  } finally {p.close();}
});

test('invalid Excel values block sends; malformed files show safe errors',async()=>{
  const p=portal({initialSession:{user:owner}});try {
    await settle();await loadExcel(p,[{...sample,fecha:'31/02/2026',bultos:-1}]);
    assert.ok(p.w.totals().errors>=2);assert.equal(p.w.document.getElementById('send').disabled,true);
    await p.w.load({name:'malformed.xlsx',size:100,arrayBuffer:async()=>{throw new Error('sensitive content');}});
    assert.match(p.w.document.getElementById('notice').textContent,/No se pudo leer el Excel/);
    assert.doesNotMatch(p.w.document.getElementById('notice').textContent,/sensitive content/);
  } finally {p.close();}
});

test('backend race duplicates are counted; insertion errors permit a safe retry',async()=>{
  const p=portal({initialSession:{user:owner}});try {
    await settle();await loadExcel(p,[sample]);
    p.behaviors.olt_insertar_lote=async()=>({data:{insertados:0,duplicados:1,ultima_fecha:null},error:null});
    const $=id=>p.w.document.getElementById(id);
    await $('sendForm').onsubmit({preventDefault(){}});
    assert.match($('notice').textContent,/1 duplicado/);
    await loadExcel(p,[sample]);
    p.behaviors.olt_insertar_lote=async()=>({data:null,error:{code:'42501',message:'secret database definition'}});
    await $('sendForm').onsubmit({preventDefault(){}});
    assert.match($('notice').textContent,/no tiene permiso/);assert.doesNotMatch($('notice').textContent,/secret/);
    assert.equal($('send').disabled,false);assert.equal($('confirmSend').disabled,false);
  } finally {p.close();}
});

test('stale dashboard responses cannot repaint data after logout',async()=>{
  const p=portal({initialSession:{user:owner}});try {
    await settle();let resolve;
    p.behaviors.olt_resumen_mes=()=>new Promise(r=>{resolve=r;});
    const pending=p.w.cargarDashboardEHistorial();await settle();
    await p.w.document.getElementById('logout').onclick();
    resolve({data:{totales:{registros:999999},historial:[]},error:null});await pending;
    assert.equal(p.w.document.getElementById('dashRecords').textContent,'0');
  } finally {p.close();}
});

test('3000 rows: six RPCs, no duplicate GET passes, failed batch resumes at its offset',async()=>{
 const p=portal({initialSession:{user:owner}});try {
 await settle();await loadExcel(p,Array.from({length:3000},(_,i)=>({...sample,entrega:'SPEED-'+i})));
 const $=id=>p.w.document.getElementById(id);let attempts=0;const lengths=[];
 p.behaviors.olt_insertar_lote=async({p_rows})=>{attempts++;lengths.push(p_rows[0].entrega);if(attempts===2)return {error:{code:'57014',message:'timeout'}};return {data:{insertados:p_rows.length,duplicados:0,ultima_fecha:null}};};
 const before=p.calls.filter(c=>c.table==='recepcion_olt').length;
 await $('send').onclick();await $('sendForm').onsubmit({preventDefault(){}});
 assert.match($('notice').textContent,/500 de 3000/);assert.equal($('send').disabled,false);
 await $('send').onclick();await $('sendForm').onsubmit({preventDefault(){}});
 assert.equal(attempts,7);assert.equal(lengths[1],lengths[2]);assert.match($('notice').textContent,/3,000 registro/);
 assert.equal(p.calls.filter(c=>c.table==='recepcion_olt').length-before,1); // history read only after completion
 }finally{p.close();}
});
