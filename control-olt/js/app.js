import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

const SUPABASE_URL = "https://vuoqmesrwgkkdqrecxnc.supabase.co";
const SUPABASE_KEY = "sb_publishable_P5CjX41UyzjQgbvSdkwfwA_jXON8rI1";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PAGE_SIZE = 100;
const HOLIDAYS = new Set(["2026-05-01", "2026-06-29"]);

const $ = (s) => document.querySelector(s);
const els = {
  loginView: $("#loginView"), appView: $("#appView"), loginForm: $("#loginForm"),
  email: $("#email"), password: $("#password"), loginMsg: $("#loginMsg"),
  userBadge: $("#userBadge"), logoutBtn: $("#logoutBtn"), btnSap: $("#btnSap"),
  sapFile: $("#sapFile"), refreshBtn: $("#refreshBtn"), searchInput: $("#searchInput"),
  prevBtn: $("#prevBtn"), nextBtn: $("#nextBtn"), pageInfo: $("#pageInfo"),
  sapStatus: $("#sapStatus"), rowStatus: $("#rowStatus"), loading: $("#loading"),
  tableHead: $("#tableHead"), tableBody: $("#tableBody"), modal: $("#modal"),
  modalClose: $("#modalClose"), modalBody: $("#modalBody")
};

let currentUser = null;
let currentPage = 0;
let currentRows = [];
let hasNext = false;
let activeSapLoad = null;
let searchTimer = null;
let pendingSap = null;

const COLUMNS = [
  ["A","nro_cargo","Nro. De Cargo","gestion"],["B","fec_cargo","Fec.Cargo","gestion"],
  ["C","fec_vencto","Fec.Vencto","indicador"],["D","indicador","Indicador","indicador"],["E","estado_cargo","Estado cargo","indicador"],
  ["F","fecha","Fec.Despacho","olt"],["G","area","Área de OLT","olt"],["H","entrega","Entrega","olt"],["I","factura","Factura/B.V.","olt"],
  ["J","gr","GR","olt"],["K","turno","Am - Pm","olt"],["L","cita","Cita","olt"],["M","razon","Razón Social del Cliente","olt"],
  ["N","distrito","Distrito","olt"],["O","provincia","Provincia","olt"],["P","departamento","Departamento","olt"],["Q","linea","Línea","olt"],
  ["R","bultos","Bultos","olt"],["S","volumen","Volumen","olt"],["T","peso","Peso","olt"],["U","despacho","Tipo de despacho","olt"],
  ["V","transporte","Tipo de Transporte","olt"],["W","mercaderia","Tipo de Mercaderia","olt"],["X","observacion","Observación","olt"],
  ["Y","codigo_transporte","Código del Transporte","gestion"],["Z","placa_prog","Placa Prog.","gestion"],["AA","dt_prog","DT Prog.","gestion"],["AB","transporte_prog","TRANSPORTE Prog.","gestion"],
  ["AC","dt","DT","sap"],["AD","et","ET","sap"],["AE","placa","Placa","sap"],["AF","fecha_salida_sap","Fecha Salida SAP","sap"],
  ["AG","estado_viaje","Estado Viaje","sap"],["AH","estado_entrega","Estado Entrega","sap"],["AI","fec_reg","Fec. Reg.","sap"],
  ["AJ","hor_reg","Hor. Reg.","sap"],["AK","usua_ctrl_re","UsuaCtrlRe","sap"],
  ["AL","responsable","Responsable","gestion"],["AM","motivo","Motivo","gestion"],
  ["AN","mes_olt","Mes OLT","derived"],["AO","mes_sap","Mes Sap","derived"],["AP","retraso","Indicador de días de retraso posterior a fecha límite","derived"],
  ["AQ","dias_plan_salida","días transcurridos entre planificación y salida real","derived"]
].map(([letter,key,label,group]) => ({letter,key,label,group}));

const EDITABLE = new Set(["nro_cargo","fec_cargo","codigo_transporte","placa_prog","dt_prog","transporte_prog","responsable","motivo"]);

function showLoading(on) { els.loading.classList.toggle("hidden", !on); }
function showApp(user) {
  currentUser = user;
  els.userBadge.textContent = user?.email || "Usuario";
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
}
function showLogin() {
  currentUser = null;
  els.appView.classList.add("hidden");
  els.loginView.classList.remove("hidden");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}
function isoDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return [value.getFullYear(), String(value.getMonth()+1).padStart(2,"0"), String(value.getDate()).padStart(2,"0")].join("-");
  }
  if (typeof value === "number") {
    const p = XLSX.SSF.parse_date_code(value);
    return p ? `${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}` : "";
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return "";
}
function isoTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}:${String(value.getSeconds()).padStart(2,"0")}`;
  }
  if (typeof value === "number") {
    const seconds = Math.round((value % 1) * 86400) % 86400;
    const h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2,"0")}:${m[2]}:${m[3] || "00"}` : "";
}
function dateFromISO(s) {
  if (!s) return null;
  const [y,m,d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y,m-1,d));
}
function dateToISO(d) {
  return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}` : "";
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isWorkday(d) {
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !HOLIDAYS.has(dateToISO(d));
}
function addWorkdays(startISO, days) {
  const d = dateFromISO(startISO);
  if (!d) return "";
  if (!days) return dateToISO(d);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkday(d)) remaining--;
  }
  return dateToISO(d);
}
function compareISO(a,b) { return a === b ? 0 : (a < b ? -1 : 1); }
function daysBetween(a,b) {
  const da = dateFromISO(a), db = dateFromISO(b);
  if (!da || !db) return null;
  return Math.round((da - db) / 86400000);
}
function monthName(iso) {
  const d = dateFromISO(iso);
  return d ? new Intl.DateTimeFormat("es-PE",{month:"long",timeZone:"UTC"}).format(d) : "";
}
function formatDate(iso) {
  const d = dateFromISO(iso);
  return d ? new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(d) : "";
}
function dueDays(row) {
  const line = String(row.linea || "").trim().toUpperCase();
  const dep = String(row.departamento || "").trim().toUpperCase();
  const dispatch = String(row.despacho || "").trim().toUpperCase();
  if (line === "TECNOFARMA" && dep === "LORETO") return 25;
  const lines7 = new Set(["ELEA","GENOMMA LAB","OMPHARMA","BIOPAS","BONAPHARM","FAES FARMA","FERQUIM","RECKITT BENCKISER","TAKEDA","ADIUM","ELEA PERU"]);
  if (dispatch === "PROVINCIA" && lines7.has(line)) return 7;
  if (dispatch === "PROVINCIA" && line === "TECNOFARMA") return 15;
  if (dispatch === "LIMA") return 1;
  return 0;
}
function calc(row) {
  if (!row.entrega) return {...row};
  const base = row.fecha_salida_sap || row.fecha || "";
  const due = addWorkdays(base, dueDays(row));
  const cargoOrToday = row.fec_cargo || todayISO();
  const indicador = due && compareISO(cargoOrToday,due) <= 0 ? "En Fecha" : "Fuera de Fecha";
  let estado = "";
  if (!row.fec_cargo) {
    const today = todayISO();
    estado = due === today ? "Vencen Hoy" : (due && due > today ? "Por Vencer" : "Cargo Pendiente");
  } else estado = due && row.fec_cargo <= due ? "Cumple" : "No Cumple";
  let retraso = "";
  if (!due) retraso = "SIN CARGO";
  else if (!row.fec_cargo) {
    const diff = daysBetween(todayISO(),due);
    retraso = diff > 0 ? `${diff} días de retraso` : diff === 0 ? "Vence hoy 0 días" : `Vence en ${Math.abs(diff)} días`;
  } else {
    const diff = daysBetween(row.fec_cargo,due);
    retraso = diff <= 0 ? "-" : `${diff} días de retraso`;
  }
  const pd = row.fecha && row.fecha_salida_sap ? Math.abs(daysBetween(row.fecha,row.fecha_salida_sap)) : null;
  return {
    ...row, fec_vencto: due, indicador, estado_cargo: estado,
    mes_olt: monthName(row.fecha), mes_sap: monthName(row.fecha_salida_sap),
    retraso, dias_plan_salida: pd === null ? "" : `${pd} ${pd === 1 ? "día" : "días"}`
  };
}
function groupClass(group) {
  return group === "gestion" ? "group-gestion" : group === "indicador" ? "group-indicador" : group === "olt" ? "group-olt" : group === "sap" ? "group-sap" : "group-derived";
}
function renderHeader() {
  els.tableHead.innerHTML = `
    <tr><th class="col-row">#</th>${COLUMNS.map(c=>`<th class="${groupClass(c.group)}">${c.letter}</th>`).join("")}</tr>
    <tr><th class="col-row">Fila</th>${COLUMNS.map(c=>`<th class="${groupClass(c.group)}" title="${escapeHtml(c.label)}">${escapeHtml(c.label)}</th>`).join("")}</tr>`;
}
function statusClass(key,val) {
  if (key === "indicador") return val === "En Fecha" ? "status-ok" : "status-bad";
  if (key === "estado_cargo") {
    if (val === "Cumple") return "status-ok";
    if (val === "No Cumple" || val === "Cargo Pendiente") return "status-bad";
    return "status-warn";
  }
  return "";
}
function displayValue(row,key) {
  const v = row[key];
  if (["fecha","fec_cargo","fec_vencto","fecha_salida_sap","fec_reg"].includes(key)) return formatDate(v);
  return v ?? "";
}
function renderRows() {
  els.tableBody.innerHTML = currentRows.map((raw,idx)=>{
    const row = calc(raw);
    const excluded = String(row.transporte || "").trim().toUpperCase() === "RECOGE CLIENTE";
    const cells = COLUMNS.map(c=>{
      const value = displayValue(row,c.key);
      if (EDITABLE.has(c.key)) {
        const inputType = c.key === "fec_cargo" ? "date" : "text";
        const inputValue = inputType === "date" ? (row[c.key] || "") : (row[c.key] ?? "");
        return `<td class="${excluded ? "excluded" : ""}"><input class="cell-input" data-id="${row.id}" data-key="${c.key}" type="${inputType}" value="${escapeHtml(inputValue)}" /></td>`;
      }
      const source = c.group === "olt" ? "source-olt" : c.group === "sap" ? "source-sap" : (c.group === "indicador" || c.group === "derived" ? "calc" : "");
      return `<td class="${source} ${excluded ? "excluded" : ""} ${statusClass(c.key,row[c.key])}" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
    }).join("");
    return `<tr><td class="col-row">${currentPage*PAGE_SIZE+idx+1}</td>${cells}</tr>`;
  }).join("");
  els.tableBody.querySelectorAll(".cell-input").forEach(input => input.addEventListener("change", saveCell));
}
async function saveCell(ev) {
  const input = ev.currentTarget;
  const id = Number(input.dataset.id);
  const key = input.dataset.key;
  const row = currentRows.find(r=>r.id===id);
  if (!row) return;
  const value = input.value.trim() || null;
  input.disabled = true;
  const payload = { olt_id:id, updated_by:currentUser.id, updated_at:new Date().toISOString(), [key]:value };
  const { error } = await supabase.from("gestion_olt").upsert(payload,{onConflict:"olt_id"});
  input.disabled = false;
  if (error) {
    alert("No se pudo guardar: " + error.message);
    input.value = row[key] || "";
    return;
  }
  row[key] = value;
  renderRows();
}

async function getActiveSapLoad() {
  const { data, error } = await supabase.from("sap_cargas")
    .select("id,archivo,publicada_at,total_filas,referencias_unicas")
    .eq("estado","publicada").order("publicada_at",{ascending:false}).limit(1).maybeSingle();
  if (error) throw error;
  activeSapLoad = data || null;
  if (!data) els.sapStatus.textContent = "SAP: todavía no existe una carga publicada.";
  else {
    const when = data.publicada_at ? new Date(data.publicada_at).toLocaleString("es-PE") : "";
    els.sapStatus.textContent = `SAP: ${data.archivo || "carga"} · ${data.referencias_unicas || 0} referencias · ${when}`;
  }
  return activeSapLoad;
}
async function loadData() {
  if (!currentUser) return;
  showLoading(true);
  try {
    const search = els.searchInput.value.trim().replace(/[(),]/g," ");
    let q = supabase.from("recepcion_olt").select("id,fecha,area,entrega,factura,gr,turno,cita,razon,distrito,provincia,departamento,linea,bultos,volumen,peso,despacho,transporte,mercaderia,observacion")
      .order("fecha",{ascending:false}).order("id",{ascending:false});
    if (search) {
      const p = `%${search}%`;
      q = q.or(`entrega.ilike.${p},razon.ilike.${p},linea.ilike.${p},distrito.ilike.${p},provincia.ilike.${p}`);
    }
    const from = currentPage * PAGE_SIZE;
    const { data, error } = await q.range(from, from + PAGE_SIZE);
    if (error) throw error;
    const base = data || [];
    hasNext = base.length > PAGE_SIZE;
    const rows = base.slice(0,PAGE_SIZE);
    const ids = rows.map(r=>r.id);
    const refs = [...new Set(rows.map(r=>String(r.entrega || "").trim()).filter(Boolean))];

    const gestionMap = new Map();
    if (ids.length) {
      const { data:g, error:ge } = await supabase.from("gestion_olt")
        .select("olt_id,nro_cargo,fec_cargo,codigo_transporte,placa_prog,dt_prog,transporte_prog,responsable,motivo").in("olt_id",ids);
      if (ge) throw ge;
      (g||[]).forEach(x=>gestionMap.set(x.olt_id,x));
    }

    const sapMap = new Map();
    const carga = await getActiveSapLoad();
    if (carga && refs.length) {
      const { data:s, error:se } = await supabase.from("sap_snapshot")
        .select("referencia,inacttrans,hraitr,dt,et,placa,fecha_salida_sap,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re")
        .eq("carga_id",carga.id).in("referencia",refs);
      if (se) throw se;
      (s||[]).forEach(x=>sapMap.set(String(x.referencia),x));
    }

    currentRows = rows.map(r=>({
      ...r,
      ...(gestionMap.get(r.id)||{}),
      ...(sapMap.get(String(r.entrega||"").trim())||{})
    }));
    renderRows();
    els.pageInfo.textContent = `Página ${currentPage+1}`;
    els.prevBtn.disabled = currentPage===0;
    els.nextBtn.disabled = !hasNext;
    els.rowStatus.textContent = `${currentRows.length} filas visibles`;
  } catch (e) {
    console.error(e);
    els.rowStatus.textContent = "Error: " + (e.message || e);
  } finally { showLoading(false); }
}

async function sha256(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256",buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function matrixFromSapBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B;
  const isOle = bytes.length >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;

  if (isZip || isOle) {
    const workbook = XLSX.read(buffer,{type:"array",cellDates:true});
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
  }

  // SAP puede entregar un archivo .XLS que en realidad es texto tabulado Windows-1252.
  const text = new TextDecoder("windows-1252").decode(bytes);
  return text.split(/\r?\n/).map(line => line.split("\t"));
}

function parseSapRowsFromBuffer(buffer) {
  const matrix = matrixFromSapBuffer(buffer);
  const headerIndex = matrix.findIndex(r => {
    const vals = r.map(v=>String(v??"").trim());
    const hasKey = vals.includes("Entrega") || vals.includes("Columna1");
    return hasKey && vals.includes("InActTrans") && vals.includes("HrAITr");
  });
  if (headerIndex < 0) throw new Error("No encontré la cabecera SAP esperada (Entrega/Columna1, InActTrans y HrAITr).");

  const headers = matrix[headerIndex].map(v=>String(v??"").trim());
  const firstIndex = (...names) => {
    for (const name of names) {
      const i = headers.findIndex(h => h === name);
      if (i >= 0) return i;
    }
    return -1;
  };

  const index = {
    dt: firstIndex("Transporte"),
    estado_viaje: firstIndex("Sts.Trp"),
    et: firstIndex("Nombre 1"), // primer "Nombre 1": transportista
    placa: firstIndex("Placa"),
    referencia: firstIndex("Entrega","Columna1"),
    estado_entrega: firstIndex("Estatus"),
    fec_reg: firstIndex("Fec. Reg.","Fec/ Reg/"),
    hor_reg: firstIndex("Hor. Reg."),
    inacttrans: firstIndex("InActTrans"),
    hraitr: firstIndex("HrAITr"),
    usua_ctrl_re: firstIndex("UsuaCtrlRe")
  };

  const missing = Object.entries(index).filter(([,i])=>i<0).map(([k])=>k);
  if (missing.length) throw new Error("Faltan columnas SAP requeridas: " + missing.join(", "));

  const rows = [];
  let invalid = 0;
  for (let i=headerIndex+1;i<matrix.length;i++) {
    const r = matrix[i] || [];
    if (!r.some(v=>String(v??"").trim())) continue;
    const referencia = String(r[index.referencia] ?? "").trim();
    if (!referencia) { invalid++; continue; }

    rows.push({
      fila_origen:i+1,
      referencia,
      inacttrans:isoDate(r[index.inacttrans]) || null,
      hraitr:isoTime(r[index.hraitr]) || null,
      dt:String(r[index.dt] ?? "").trim() || null,
      et:String(r[index.et] ?? "").trim() || null,
      placa:String(r[index.placa] ?? "").trim() || null,
      fecha_salida_sap:isoDate(r[index.inacttrans]) || null,
      estado_viaje:String(r[index.estado_viaje] ?? "").trim() || null,
      estado_entrega:String(r[index.estado_entrega] ?? "").trim() || null,
      fec_reg:isoDate(r[index.fec_reg]) || null,
      hor_reg:isoTime(r[index.hor_reg]) || null,
      usua_ctrl_re:String(r[index.usua_ctrl_re] ?? "").trim() || null,
      raw_data:{}
    });
  }

  const latest = new Map();
  for (const r of rows) {
    const old = latest.get(r.referencia);
    if (!old || isNewerSap(r,old)) latest.set(r.referencia,r);
  }
  return { rows, latest:[...latest.values()], invalid, headerRow:headerIndex+1 };
}
function isNewerSap(a,b) {
  const ad=a.inacttrans||"", bd=b.inacttrans||"";
  if (ad!==bd) return ad>bd;
  const at=a.hraitr||"", bt=b.hraitr||"";
  if (at!==bt) return at>bt;
  return a.fila_origen < b.fila_origen;
}
function sameSap(a,b) {
  return ["inacttrans","hraitr","dt","et","placa","estado_viaje","estado_entrega","fec_reg","hor_reg","usua_ctrl_re"]
    .every(k=>(a?.[k]??null)===(b?.[k]??null));
}
async function previousSnapshotMap() {
  const map = new Map();
  const carga = await getActiveSapLoad();
  if (!carga) return map;
  for (let from=0;;from+=1000) {
    const {data,error}=await supabase.from("sap_snapshot")
      .select("referencia,inacttrans,hraitr,dt,et,placa,estado_viaje,estado_entrega,fec_reg,hor_reg,usua_ctrl_re")
      .eq("carga_id",carga.id).range(from,from+999);
    if (error) throw error;
    (data||[]).forEach(x=>map.set(String(x.referencia),x));
    if (!data || data.length<1000) break;
  }
  return map;
}
function modal(html) { els.modalBody.innerHTML=html; els.modal.classList.remove("hidden"); }
function closeModal() { els.modal.classList.add("hidden"); pendingSap=null; }
function setProgress(pct,text) {
  const bar=$("#sapProgress"); if(bar) bar.style.width=`${pct}%`;
  const msg=$("#sapProgressText"); if(msg) msg.textContent=text;
}
async function prepareSap(file) {
  modal(`<div class="notice">Leyendo y validando <strong>${escapeHtml(file.name)}</strong>…</div><div class="progress"><div id="sapProgress"></div></div><p id="sapProgressText" class="muted">Analizando estructura SAP…</p>`);
  try {
    setProgress(10,"Calculando huella del archivo…");
    const [hash,buffer] = await Promise.all([sha256(file),file.arrayBuffer()]);
    const {data:duplicate} = await supabase.from("sap_cargas").select("id,publicada_at").eq("archivo_hash",hash).eq("estado","publicada").limit(1).maybeSingle();

    setProgress(30,"Leyendo Excel…");
    const parsed = parseSapRowsFromBuffer(buffer);

    setProgress(60,"Comparando con la última versión SAP…");
    const previous = await previousSnapshotMap();
    let nuevas=0, actualizadas=0;
    for(const row of parsed.latest) {
      const old=previous.get(row.referencia);
      if(!old) nuevas++;
      else if(!sameSap(old,row)) actualizadas++;
    }
    const duplicadas = parsed.rows.length - parsed.latest.length;
    pendingSap = {file,hash,...parsed,nuevas,actualizadas,duplicadas,duplicate:Boolean(duplicate)};
    setProgress(100,"Validación completa.");

    modal(`
      <div class="notice ${duplicate?"error":""}">${duplicate ? "Este archivo exacto ya fue publicado anteriormente. No se volverá a publicar." : "Archivo válido. No se modificará la versión SAP activa hasta terminar toda la carga."}</div>
      <div class="summary-grid">
        <div class="summary-card"><strong>${parsed.rows.length}</strong><span>filas válidas</span></div>
        <div class="summary-card"><strong>${parsed.latest.length}</strong><span>referencias únicas</span></div>
        <div class="summary-card"><strong>${duplicadas}</strong><span>filas repetidas por referencia</span></div>
        <div class="summary-card"><strong>${nuevas}</strong><span>referencias nuevas</span></div>
        <div class="summary-card"><strong>${actualizadas}</strong><span>referencias con cambios</span></div>
        <div class="summary-card"><strong>${parsed.invalid}</strong><span>filas sin referencia</span></div>
      </div>
      <p class="muted">Cabecera detectada en fila ${parsed.headerRow}. Desempate: InActTrans más reciente → HrAITr más reciente → primera fila del archivo.</p>
      <div class="progress"><div id="sapProgress"></div></div><p id="sapProgressText" class="muted"></p>
      <div class="modal-actions"><button id="cancelSap" class="btn-secondary">Cancelar</button><button id="publishSap" ${duplicate?"disabled":""}>Publicar SAP</button></div>
    `);
    $("#cancelSap").onclick=closeModal;
    if(!duplicate) $("#publishSap").onclick=publishSap;
  } catch(e) {
    console.error(e);
    modal(`<div class="notice error"><strong>No se puede publicar.</strong><br>${escapeHtml(e.message||e)}</div><div class="modal-actions"><button id="cancelSap" class="btn-secondary">Cerrar</button></div>`);
    $("#cancelSap").onclick=closeModal;
  }
}
async function batchInsert(table,rows,size,onProgress) {
  for(let i=0;i<rows.length;i+=size) {
    const {error}=await supabase.from(table).insert(rows.slice(i,i+size));
    if(error) throw error;
    onProgress?.(Math.min(i+size,rows.length),rows.length);
  }
}
async function publishSap() {
  if(!pendingSap) return;
  const btn=$("#publishSap"); if(btn) btn.disabled=true;
  try {
    setProgress(3,"Creando registro de carga…");
    const {data:carga,error:ce}=await supabase.from("sap_cargas").insert({
      usuario_id:currentUser.id, archivo:pendingSap.file.name, archivo_hash:pendingSap.hash,
      total_filas:pendingSap.rows.length, referencias_unicas:pendingSap.latest.length,
      referencias_nuevas:pendingSap.nuevas, referencias_actualizadas:pendingSap.actualizadas,
      filas_invalidas:pendingSap.invalid, schema_version:2, estado:"validando",
      mensaje:"Carga en proceso"
    }).select("id").single();
    if(ce) throw ce;
    const cargaId=carga.id;

    try {
      setProgress(8,"Subiendo staging SAP…");
      const staging=pendingSap.rows.map(r=>({...r,carga_id:cargaId}));
      await batchInsert("sap_staging",staging,400,(done,total)=>setProgress(8+Math.round(done/total*42),`Staging SAP ${done}/${total}`));

      setProgress(52,"Creando snapshot validado…");
      const snapshot=pendingSap.latest.map(r=>({
        usuario_id:currentUser.id,carga_id:cargaId,referencia:r.referencia,
        inacttrans:r.inacttrans,hraitr:r.hraitr,dt:r.dt,et:r.et,placa:r.placa,
        fecha_salida_sap:r.fecha_salida_sap,
        estado_viaje:r.estado_viaje,estado_entrega:r.estado_entrega,
        fec_reg:r.fec_reg,hor_reg:r.hor_reg,usua_ctrl_re:r.usua_ctrl_re,raw_data:{}
      }));
      await batchInsert("sap_snapshot",snapshot,400,(done,total)=>setProgress(52+Math.round(done/total*43),`Snapshot SAP ${done}/${total}`));

      setProgress(96,"Publicando nueva versión…");
      const {error:ue}=await supabase.from("sap_cargas").update({
        estado:"publicada",publicada_at:new Date().toISOString(),procesada_at:new Date().toISOString(),
        mensaje:"Carga SAP publicada correctamente."
      }).eq("id",cargaId);
      if(ue) throw ue;
      await supabase.from("sap_staging").delete().eq("carga_id",cargaId);
      setProgress(100,"Carga publicada correctamente.");
      await loadData();
      setTimeout(closeModal,700);
    } catch(inner) {
      await supabase.from("sap_cargas").update({estado:"rechazada",mensaje:inner.message||String(inner),procesada_at:new Date().toISOString()}).eq("id",cargaId);
      throw inner;
    }
  } catch(e) {
    console.error(e);
    const msg=$("#sapProgressText"); if(msg) msg.textContent="Error: "+(e.message||e);
    const notice=document.createElement("div"); notice.className="notice error"; notice.textContent="La carga no fue publicada. La versión SAP anterior sigue activa.";
    els.modalBody.prepend(notice);
    if(btn) btn.disabled=false;
  }
}

els.loginForm.addEventListener("submit",async(e)=>{
  e.preventDefault(); els.loginMsg.textContent="Ingresando…";
  const {data,error}=await supabase.auth.signInWithPassword({email:els.email.value.trim(),password:els.password.value});
  if(error){els.loginMsg.textContent=error.message;return;}
  els.loginMsg.textContent=""; showApp(data.user); currentPage=0; await loadData();
});
els.logoutBtn.addEventListener("click",async()=>{await supabase.auth.signOut();showLogin();});
els.refreshBtn.addEventListener("click",()=>loadData());
els.prevBtn.addEventListener("click",()=>{if(currentPage>0){currentPage--;loadData();}});
els.nextBtn.addEventListener("click",()=>{if(hasNext){currentPage++;loadData();}});
els.searchInput.addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{currentPage=0;loadData();},350);});
els.btnSap.addEventListener("click",()=>{els.sapFile.value="";els.sapFile.click();});
els.sapFile.addEventListener("change",()=>{const f=els.sapFile.files?.[0];if(f)prepareSap(f);});
els.modalClose.addEventListener("click",closeModal);
els.modal.addEventListener("click",e=>{if(e.target===els.modal)closeModal();});

renderHeader();
const {data:{session}}=await supabase.auth.getSession();
if(session?.user){showApp(session.user);await loadData();}else showLogin();
supabase.auth.onAuthStateChange((_event,session)=>{if(!session?.user)showLogin();});
