import { createClient } from "@supabase/supabase-js";
import { calc, todayISO, formatDate } from "./indicators.js";

const SUPABASE_URL = "https://vuoqmesrwgkkdqrecxnc.supabase.co";
const SUPABASE_KEY = "sb_publishable_P5CjX41UyzjQgbvSdkwfwA_jXON8rI1";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PAGE_SIZE = 100;
const $ = (s) => document.querySelector(s);
const els = {
  loginView: $("#loginView"),
  appView: $("#appView"),
  loginForm: $("#loginForm"),
  email: $("#email"),
  password: $("#password"),
  loginMsg: $("#loginMsg"),
  userBadge: $("#userBadge"),
  logoutBtn: $("#logoutBtn"),
  btnSap: $("#btnSap"),
  sapFile: $("#sapFile"),
  refreshBtn: $("#refreshBtn"),
  searchInput: $("#searchInput"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  pageInfo: $("#pageInfo"),
  sapStatus: $("#sapStatus"),
  rowStatus: $("#rowStatus"),
  loading: $("#loading"),
  tableHead: $("#tableHead"),
  tableBody: $("#tableBody"),
  modal: $("#modal"),
  modalClose: $("#modalClose"),
  modalBody: $("#modalBody"),
};

let currentUser = null;
let currentPage = 0;
let currentRows = [];
let hasNext = false;
let activeSapLoad = null;
let searchTimer = null;
let pendingSap = null;
let busySap = false;
let holidays = new Set();
let loadSequence = 0;
let migrationReady = false;
let returnFocus = null;

const COLUMNS = [
  ["A", "nro_cargo", "Nro. De Cargo", "gestion"],
  ["B", "fec_cargo", "Fec.Cargo", "gestion"],
  ["C", "fec_vencto", "Fec.Vencto", "indicador"],
  ["D", "indicador", "Indicador", "indicador"],
  ["E", "estado_cargo", "Estado cargo", "indicador"],
  ["F", "fecha", "Fec.Despacho", "olt"],
  ["G", "area", "Área de OLT", "olt"],
  ["H", "entrega", "Entrega", "olt"],
  ["I", "factura", "Factura/B.V.", "olt"],
  ["J", "gr", "GR", "olt"],
  ["K", "turno", "Am - Pm", "olt"],
  ["L", "cita", "Cita", "olt"],
  ["M", "razon", "Razón Social del Cliente", "olt"],
  ["N", "distrito", "Distrito", "olt"],
  ["O", "provincia", "Provincia", "olt"],
  ["P", "departamento", "Departamento", "olt"],
  ["Q", "linea", "Línea", "olt"],
  ["R", "bultos", "Bultos", "olt"],
  ["S", "volumen", "Volumen", "olt"],
  ["T", "peso", "Peso", "olt"],
  ["U", "despacho", "Tipo de despacho", "olt"],
  ["V", "transporte", "Tipo de Transporte", "olt"],
  ["W", "mercaderia", "Tipo de Mercaderia", "olt"],
  ["X", "observacion", "Observación", "olt"],
  ["Y", "codigo_transporte", "Código del Transporte", "gestion"],
  ["Z", "placa_prog", "Placa Prog.", "gestion"],
  ["AA", "dt_prog", "DT Prog.", "gestion"],
  ["AB", "transporte_prog", "TRANSPORTE Prog.", "gestion"],
  ["AC", "dt", "DT", "sap"],
  ["AD", "et", "ET", "sap"],
  ["AE", "placa", "Placa", "sap"],
  ["AF", "fecha_salida_sap", "Fecha Salida SAP", "sap"],
  ["AG", "estado_viaje", "Estado Viaje", "sap"],
  ["AH", "estado_entrega", "Estado Entrega", "sap"],
  ["AI", "fec_reg", "Fec. Reg.", "sap"],
  ["AJ", "hor_reg", "Hor. Reg.", "sap"],
  ["AK", "usua_ctrl_re", "UsuaCtrlRe", "sap"],
  ["AL", "responsable", "Responsable", "gestion"],
  ["AM", "motivo", "Motivo", "gestion"],
  ["AN", "mes_olt", "Mes OLT", "derived"],
  ["AO", "mes_sap", "Mes Sap", "derived"],
  [
    "AP",
    "retraso",
    "Indicador de días de retraso posterior a fecha límite",
    "derived",
  ],
  [
    "AQ",
    "dias_plan_salida",
    "días transcurridos entre planificación y salida real",
    "derived",
  ],
].map(([letter, key, label, group]) => ({ letter, key, label, group }));

const EDITABLE = new Set([
  "nro_cargo",
  "fec_cargo",
  "codigo_transporte",
  "placa_prog",
  "dt_prog",
  "transporte_prog",
  "responsable",
  "motivo",
]);

function showLoading(on) {
  els.loading.classList.toggle("hidden", !on);
}
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
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
}
function dateFromISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
function dateToISO(d) {
  return d
    ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    : "";
}
function groupClass(group) {
  return group === "gestion"
    ? "group-gestion"
    : group === "indicador"
      ? "group-indicador"
      : group === "olt"
        ? "group-olt"
        : group === "sap"
          ? "group-sap"
          : "group-derived";
}
function renderHeader() {
  els.tableHead.innerHTML = `
    <tr><th class="col-row">#</th>${COLUMNS.map((c) => `<th class="${groupClass(c.group)}">${c.letter}</th>`).join("")}</tr>
    <tr><th class="col-row">Fila</th>${COLUMNS.map((c) => `<th class="${groupClass(c.group)}" title="${escapeHtml(c.label)}">${escapeHtml(c.label)}</th>`).join("")}</tr>`;
}
function statusClass(key, val) {
  if (key === "indicador")
    return val === "En Fecha" ? "status-ok" : "status-bad";
  if (key === "estado_cargo") {
    if (val === "Cumple") return "status-ok";
    if (val === "No Cumple" || val === "Cargo Pendiente") return "status-bad";
    return "status-warn";
  }
  return "";
}
function displayValue(row, key) {
  const v = row[key];
  if (
    [
      "fecha",
      "fec_cargo",
      "fec_vencto",
      "fecha_salida_sap",
      "fec_reg",
    ].includes(key)
  )
    return formatDate(v);
  return v ?? "";
}
function renderRows() {
  els.tableBody.innerHTML = currentRows
    .map((raw, idx) => {
      const row = raw;
      const excluded =
        String(row.transporte || "")
          .trim()
          .toUpperCase() === "RECOGE CLIENTE";
      const cells = COLUMNS.map((c) => {
        const value = displayValue(row, c.key);
        if (EDITABLE.has(c.key) && !row.cerrado) {
          const inputType = c.key === "fec_cargo" ? "date" : "text";
          const inputValue =
            inputType === "date" ? row[c.key] || "" : (row[c.key] ?? "");
          return `<td class="${excluded ? "excluded" : ""}"><input class="cell-input" data-id="${row.id}" data-key="${c.key}" type="${inputType}" value="${escapeHtml(inputValue)}" /></td>`;
        }
        const source =
          c.group === "olt"
            ? "source-olt"
            : c.group === "sap"
              ? "source-sap"
              : c.group === "indicador" || c.group === "derived"
                ? "calc"
                : "";
        return `<td class="${source} ${excluded ? "excluded" : ""} ${statusClass(c.key, row[c.key])}" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
      }).join("");
      return `<tr><td class="col-row">${currentPage * PAGE_SIZE + idx + 1}</td>${cells}</tr>`;
    })
    .join("");
  els.tableBody
    .querySelectorAll(".cell-input")
    .forEach((input) => input.addEventListener("change", saveCell));
}
async function saveCell(ev) {
  const input = ev.currentTarget;
  const id = Number(input.dataset.id);
  const key = input.dataset.key;
  const row = currentRows.find((r) => r.id === id);
  if (!row || !EDITABLE.has(key) || row.cerrado) return;
  const value = input.value.trim() || null;
  input.disabled = true;

  const { data: saved, error } = await supabase.rpc("olt_save_cell", {
    p_id: id,
    p_key: key,
    p_value: value,
  });
  input.disabled = false;
  if (error) {
    alert("No se pudo guardar: " + error.message);
    input.value = row[key] || "";
    return;
  }
  Object.assign(row, saved || { [key]: value });
  renderRows();
}

async function getActiveSapLoad() {
  const pointer = await supabase
    .from("olt_sap_active")
    .select("carga_activa_id")
    .maybeSingle();
  if (pointer.error) throw pointer.error;
  const id = pointer.data?.carga_activa_id;
  activeSapLoad = id
    ? await checked(
        supabase
          .from("olt_sap_loads")
          .select("*")
          .eq("id", id)
          .eq("estado", "publicada")
          .single(),
      )
    : null;
  els.sapStatus.textContent = activeSapLoad
    ? `Última actualización SAP: ${stamp(activeSapLoad.publicada_at)} · ${activeSapLoad.referencias_unicas} referencias activas`
    : "SAP: todavía no existe una versión activa.";
  return activeSapLoad;
}
function filters() {
  return {
    p_period: $("#periodFilter").value
      ? $("#periodFilter").value + "-01"
      : null,
    p_line: $("#lineFilter").value || null,
    p_transport: $("#transportFilter").value || null,
    p_zone: $("#zoneFilter").value || null,
  };
}
function filterQuery(q) {
  const f = filters();
  if (f.p_period) {
    const d = new Date(f.p_period + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    q = q.gte("fecha", f.p_period).lt("fecha", d.toISOString().slice(0, 10));
  }
  if (f.p_line) q = q.eq("linea", f.p_line);
  if (f.p_transport) q = q.eq("row_data->>transporte", f.p_transport);
  if (f.p_zone) q = q.eq("row_data->>despacho", f.p_zone);
  return q;
}
async function loadData() {
  if (!currentUser) return;
  const sequence = ++loadSequence;
  showLoading(true);
  try {
    await getActiveSapLoad();
    const calendar = await checked(
      supabase.from("calendario_feriados").select("fecha").eq("activo", true),
    );
    holidays = new Set(calendar.map((x) => x.fecha));
    await loadGeneralAnalytics();
    let q = filterQuery(
      supabase
        .from("olt_control_rows")
        .select("id,row_data,cerrado")
        .order("fecha", { ascending: false })
        .order("id", { ascending: false }),
    );
    const search = els.searchInput.value.trim().replace(/[(),%*\\]/g, " ");
    if (search) {
      const p = `%${search}%`;
      q = q.or(
        `entrega.ilike.${p},razon.ilike.${p},linea.ilike.${p},distrito.ilike.${p},provincia.ilike.${p}`,
      );
    }
    const base = await checked(
      q.range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    );
    if (sequence !== loadSequence) return;
    hasNext = base.length > PAGE_SIZE;
    currentRows = base.slice(0, PAGE_SIZE).map((x) => {
      let r = { ...x.row_data, id: x.id, cerrado: x.cerrado };
      if (!r.cerrado && r.carga_id && r.carga_id !== activeSapLoad?.id) {
        for (const k of [
          "carga_id",
          "inacttrans",
          "hraitr",
          "dt",
          "et",
          "placa",
          "fecha_salida_sap",
          "estado_viaje",
          "estado_entrega",
          "fec_reg",
          "hor_reg",
          "usua_ctrl_re",
        ])
          delete r[k];
        r = calc(r, { holidays });
      }
      return r;
    });
    if (!migrationReady) {
      for (const [id, key] of [
        ["lineFilter", "linea"],
        ["transportFilter", "transporte"],
      ]) {
        const el = $("#" + id);
        const values = new Set([...el.options].map((o) => o.value));
        for (const row of currentRows) {
          const v = row[key];
          if (v && !values.has(v)) {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = v;
            el.append(o);
            values.add(v);
          }
        }
      }
    }
    renderRows();
    els.pageInfo.textContent = `Página ${currentPage + 1}`;
    els.prevBtn.disabled = currentPage === 0;
    els.nextBtn.disabled = !hasNext;
    els.rowStatus.textContent = `${currentRows.length} filas visibles`;
    if (!$("#sapView").classList.contains("hidden")) await loadSapCenter();
  } catch (e) {
    els.rowStatus.textContent = "No se pudo cargar la operación: " + e.message;
  } finally {
    if (sequence === loadSequence) showLoading(false);
  }
}
async function checked(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
function stamp(value) {
  return value
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Lima",
      }).format(new Date(value))
    : "—";
}
function cards(entries) {
  return `<div class="summary-grid">${entries.map(([label, value]) => `<div class="summary-card"><strong>${escapeHtml(value ?? 0)}</strong><span>${escapeHtml(label)}</span></div>`).join("")}</div>`;
}
async function loadGeneralAnalytics() {
  const result = await supabase.rpc("olt_control_analytics", filters());
  if (result.error) {
    migrationReady = false;
    $("#generalKpis").innerHTML =
      '<div class="notice warn">Los indicadores globales están pendientes de activar la migración de análisis. La hoja operativa sigue disponible.</div>';
    return;
  }
  migrationReady = true;
  const a = result.data,
    t = a.totals;
  $("#generalKpis").innerHTML = cards([
    ["Programaciones", t.total],
    ["Cumple", t.cumple],
    ["No cumple", t.no_cumple],
    ["Por vencer / hoy", t.por_vencer],
    ["Cargos pendientes", t.pendientes],
    [
      "Cobertura SAP",
      t.total ? `${((100 * t.con_sap) / t.total).toFixed(1)}%` : "—",
    ],
  ]);
  for (const [id, list, placeholder] of [
    ["lineFilter", a.lines, "Todas las líneas"],
    ["transportFilter", a.transports, "Todos los transportes"],
  ]) {
    const el = $("#" + id),
      value = el.value;
    el.innerHTML =
      `<option value="">${placeholder}</option>` +
      list
        .map(
          (x) => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`,
        )
        .join("");
    el.value = value;
  }
}

async function sha256(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function modal(html) {
  if (els.modal.classList.contains("hidden"))
    returnFocus = document.activeElement;
  els.modalBody.innerHTML = html;
  els.modal.classList.remove("hidden");
  els.modalClose.focus();
}
async function closeModal() {
  if (busySap) return;
  if (pendingSap?.loadId) {
    try {
      await checked(
        supabase.rpc("olt_sap_reject", {
          p_load: pendingSap.loadId,
          p_message: "Validada y cancelada por el usuario",
        }),
      );
    } catch {
      return;
    }
  }
  els.modal.classList.add("hidden");
  pendingSap = null;
  returnFocus?.focus();
  await loadSapCenter();
}
function setProgress(pct, text) {
  const bar = $("#sapProgress");
  if (bar) bar.style.width = `${pct}%`;
  const msg = $("#sapProgressText");
  if (msg) msg.textContent = text;
}
function parseFile(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./sap-worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      data.error ? reject(new Error(data.error)) : resolve(data.result);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("No se pudo analizar el archivo SAP"));
    };
    worker.postMessage(buffer, [buffer]);
  });
}
function coverageTable(rows) {
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Dimensión</th><th>Segmento</th><th>Programaciones</th><th>Con SAP</th><th>Sin SAP</th><th>Cobertura</th></tr></thead><tbody>${rows
    .map((r) => {
      const p = r.total ? (100 * r.con_sap) / r.total : 0;
      return `<tr><td>${escapeHtml(r.dimension)}</td><td>${escapeHtml(r.segment || "Sin dato")}</td><td>${r.total}</td><td>${r.con_sap}</td><td>${r.total - r.con_sap}</td><td><span class="badge ${p < 90 ? "warn" : "ok"}">${p.toFixed(1)}%</span><span class="coverage-track"><i style="width:${p}%"></i></span></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function changeTable(rows) {
  return `<p class="muted">Primeros 100 cambios, ordenados por tipo y entrega.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Entrega</th><th>Tipo</th><th>Antes</th><th>Ahora</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.entrega)}</td><td>${escapeHtml(r.tipo)}</td><td>${escapeHtml(describeSap(r.antes))}</td><td>${escapeHtml(describeSap(r.ahora))}</td></tr>`).join("")}</tbody></table></div>`;
}
function describeSap(r) {
  return r
    ? `DT: ${r.dt || "—"} · Placa: ${r.placa || "—"} · ET: ${r.et || "—"} · Viaje: ${r.estado_viaje || "—"} · Entrega: ${r.estado_entrega || "—"} · Salida: ${r.inacttrans || "—"} ${r.hraitr || ""}`
    : "—";
}
function observation(level, text) {
  return `<div class="observation"><span class="badge ${level === "CRÍTICO" ? "error" : level === "ADVERTENCIA" ? "warn" : level === "CORRECTO" ? "ok" : ""}">${level}</span><span>${escapeHtml(text)}</span></div>`;
}
function analysisHtml(a) {
  const c = a.changes;
  const observations = [
    a.future
      ? observation(
          "ADVERTENCIA",
          `${a.future} referencias con fecha de salida futura`,
        )
      : "",
    a.incomplete
      ? observation(
          "ADVERTENCIA",
          `${a.incomplete} referencias con DT, placa, ET o salida incompletos`,
        )
      : "",
    a.multi_dt
      ? observation("ADVERTENCIA", `${a.multi_dt} entregas con más de un DT`)
      : "",
    a.ties
      ? observation(
          "INFORMATIVO",
          `${a.ties} grupos empatan en fecha y hora; se conserva la primera fila física`,
        )
      : "",
    a.olt_missing
      ? observation(
          "ADVERTENCIA",
          `${a.olt_missing} programaciones OLT sin coincidencia SAP`,
        )
      : "",
    a.sap_without_olt
      ? observation(
          "INFORMATIVO",
          `${a.sap_without_olt} entregas SAP sin programación OLT`,
        )
      : "",
  ].filter(Boolean);
  return `<section class="panel"><h2>Resumen de análisis</h2><p class="notice">Se detectaron ${c.modificadas} referencias modificadas, ${c.nuevas} nuevas y ${c.desaparecidas} desaparecidas. ${c.estado} modificaciones afectan estados y ${c.placa} afectan placas. ${a.olt_missing} programaciones OLT están pendientes de coincidencia SAP.</p><div class="observations">${observations.join("") || observation("CORRECTO", "Sin observaciones en las reglas de calidad evaluadas")}</div></section><section class="panel"><h2>Cambios desde la última carga</h2>${cards(
    [
      ["Nuevas", c.nuevas],
      ["Modificadas", c.modificadas],
      ["Desaparecidas", c.desaparecidas],
      ["Cambios DT", c.dt],
      ["Cambios placa", c.placa],
      ["Cambios transportista", c.et],
      ["Cambios estado", c.estado],
    ],
  )}<details><summary>Ver cambios</summary>${changeTable(a.detail)}</details></section><section class="panel"><h2>Cobertura OLT vs SAP</h2>${cards(
    [
      ["Programaciones OLT", a.olt_total],
      ["Con SAP", a.olt_total - a.olt_missing],
      ["Sin SAP", a.olt_missing],
      [
        "Cobertura",
        a.olt_total
          ? `${((100 * (a.olt_total - a.olt_missing)) / a.olt_total).toFixed(1)}%`
          : "—",
      ],
    ],
  )}${coverageTable(a.coverage)}<details><summary>Ver OLT sin SAP</summary><p class="muted">Primeras 100 programaciones pendientes.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Entrega</th><th>Línea</th><th>Fecha</th></tr></thead><tbody>${a.missing_detail.map((r) => `<tr><td>${escapeHtml(r.entrega)}</td><td>${escapeHtml(r.linea)}</td><td>${escapeHtml(r.fecha)}</td></tr>`).join("")}</tbody></table></div></details><p class="muted">RECOGE CLIENTE se conserva en la hoja y se excluye de esta cobertura operativa.</p></section>`;
}
async function loadSapCenter() {
  if (!currentUser) return;
  try {
    await getActiveSapLoad();
    const c = activeSapLoad;
    $("#activeVersion").innerHTML = `<h2>Última versión SAP activa</h2>${
      c
        ? cards([
            ["Fecha / hora Lima", stamp(c.publicada_at)],
            ["Archivo", c.archivo],
            ["Referencias activas", c.referencias_unicas],
            ["Filas procesadas", c.total_filas],
            ["Usuario", currentUser.email],
          ])
        : '<p class="muted">Sin versión publicada. Selecciona un archivo para validarlo.</p>'
    }`;
    const history = await checked(
      supabase
        .from("olt_sap_loads")
        .select("*")
        .order("id", { ascending: false })
        .limit(30),
    );
    $("#sapHistory").innerHTML =
      history
        .map(
          (r) =>
            `<tr><td>${stamp(r.publicada_at || r.created_at)}</td><td>${escapeHtml(r.archivo)}</td><td>${escapeHtml(currentUser.email)}</td><td>${r.total_filas}</td><td>${r.referencias_unicas}</td><td>${r.referencias_nuevas}</td><td>${r.referencias_actualizadas}</td><td><span class="badge ${r.estado === "publicada" ? "ok" : r.estado === "rechazada" ? "error" : "warn"}">${r.estado === "validando" ? "Validación / pendiente" : escapeHtml(r.estado)}</span></td><td><button class="text-btn" data-load="${r.id}">Revisar</button></td></tr>`,
        )
        .join("") || '<tr><td colspan="9">No hay cargas registradas.</td></tr>';
    $("#sapHistory")
      .querySelectorAll("[data-load]")
      .forEach(
        (b) => (b.onclick = () => reviewLoad(Number(b.dataset.load), history)),
      );
    if (c) {
      const a = await supabase.rpc("olt_sap_analysis", { p_load: c.id });
      $("#sapAnalytics").innerHTML = a.error
        ? '<div class="notice warn">El análisis de versiones y cobertura requiere la migración pendiente de aprobación.</div>'
        : analysisHtml(a.data);
    } else $("#sapAnalytics").innerHTML = "";
  } catch (e) {
    $("#sapAnalytics").innerHTML =
      `<div class="notice error">${escapeHtml(e.message)}</div>`;
  }
}
async function reviewLoad(id, history) {
  const c = history.find((x) => x.id === id);
  modal(
    `<h2>${escapeHtml(c.archivo)}</h2><p>${escapeHtml(c.mensaje || c.estado)}</p><p class="muted">${stamp(c.created_at)} · ${c.total_filas} filas · ${c.referencias_unicas} referencias</p><div id="historyAnalysis">Cargando análisis…</div>`,
  );
  const a = await supabase.rpc("olt_sap_analysis", { p_load: id });
  $("#historyAnalysis").innerHTML = a.error
    ? '<p class="notice warn">Detalle analítico pendiente de la migración de base de datos.</p>'
    : a.data
      ? analysisHtml(a.data)
      : "<p>Esta carga no tiene un snapshot disponible.</p>";
}
async function prepareSap(file) {
  if (busySap) return;
  busySap = true;
  els.modalClose.disabled = true;
  modal(
    `<div class="notice">Leyendo ${escapeHtml(file.name)}…</div><div class="progress"><div id="sapProgress"></div></div><p id="sapProgressText" class="muted">Validando formato y datos…</p>`,
  );
  let hash;
  try {
    if (file.size > 40 * 1024 * 1024)
      throw new Error("El archivo supera el límite actual de 40 MB.");
    const buffer = await file.arrayBuffer();
    hash = await sha256(file);
    const parsed = await parseFile(buffer);
    if (!parsed.rows.length) throw new Error("No hay filas SAP válidas.");
    if (parsed.rows.length > 250000)
      throw new Error("Esta versión admite hasta 250 000 filas por carga.");
    if (parsed.invalid / (parsed.rows.length + parsed.invalid) > 0.1)
      throw new Error(
        "Más del 10% de las filas son inválidas. Revisa el archivo antes de cargarlo.",
      );
    const loadId = await checked(
      supabase.rpc("olt_sap_start", {
        p_file: file.name,
        p_hash: hash,
        p_valid: parsed.rows.length,
        p_invalid: parsed.invalid,
        p_alerts: parsed.invalidDetails,
      }),
    );
    pendingSap = { file, hash, ...parsed, loadId };
    for (let i = 0; i < parsed.rows.length; i += 400) {
      await checked(
        supabase.rpc("olt_sap_append", {
          p_load: loadId,
          p_rows: parsed.rows.slice(i, i + 400),
        }),
      );
      setProgress(
        Math.round(((i + 400) / parsed.rows.length) * 90),
        `Validando filas ${Math.min(i + 400, parsed.rows.length)} / ${parsed.rows.length}`,
      );
    }
    const summary = await checked(
      supabase.rpc("olt_sap_summary", { p_load: loadId }),
    );
    if (
      Number(summary.valid) !== parsed.rows.length ||
      Number(summary.unique) !== parsed.latest.length
    )
      throw new Error("La validación del servidor no coincide con el archivo.");
    const a = await supabase.rpc("olt_sap_analysis", { p_load: loadId });
    const reduced =
      summary.previous_unique > 0 &&
      summary.unique < summary.previous_unique * 0.7;
    const repeated = new Set(),
      groups = new Map();
    let ties = 0,
      multipleDt = 0;
    for (const r of parsed.rows) {
      if (groups.has(r.referencia)) repeated.add(r.referencia);
      const g = groups.get(r.referencia) || { dt: new Set(), times: new Set() };
      if (r.dt) g.dt.add(r.dt);
      const t = `${r.inacttrans}|${r.hraitr}`;
      if (g.times.has(t)) ties++;
      g.times.add(t);
      groups.set(r.referencia, g);
    }
    for (const g of groups.values()) if (g.dt.size > 1) multipleDt++;
    const incomplete = parsed.latest.filter(
      (r) => !r.dt || !r.et || !r.placa || !r.inacttrans,
    ).length;
    modal(
      `<div class="notice">Validación completa. El snapshot activo conserva sus datos hasta que confirmes la publicación.</div>${cards(
        [
          ["Filas válidas", summary.valid],
          ["Entregas únicas", summary.unique],
          ["Entregas repetidas", repeated.size],
          ["Registros consolidados", parsed.latest.length],
          ["Referencias nuevas", summary.new],
          ["Referencias modificadas", summary.modified],
          ["Filas inválidas", parsed.invalid],
        ],
      )}<p class="muted">Cabecera: fila ${parsed.headerRow}. Selección: InActTrans más reciente → HrAITr más reciente → primera fila física.</p>${reduced ? observation("CRÍTICO", "La cantidad de referencias cayó más del 30% respecto de la carga anterior.") : ""}${summary.future ? observation("ADVERTENCIA", `${summary.future} referencias con fechas futuras`) : ""}${multipleDt ? observation("ADVERTENCIA", `${multipleDt} entregas tienen más de un DT`) : ""}${ties ? observation("INFORMATIVO", `${ties} filas empatan en fecha y hora`) : ""}${incomplete ? observation("ADVERTENCIA", `${incomplete} registros tienen datos incompletos`) : ""}${parsed.invalid ? `<details><summary>Ver filas inválidas (${parsed.invalid})</summary><ul>${parsed.invalidDetails.map((r) => `<li>Fila ${r.fila}: ${escapeHtml(r.motivo)}</li>`).join("")}</ul></details>` : ""}${a.error ? '<div class="notice warn">La publicación queda bloqueada hasta activar la migración de comparación detallada y cobertura. Los conteos anteriores provienen de la validación existente.</div>' : analysisHtml(a.data)}${reduced ? '<label><input id="ackReduction" type="checkbox" /> Revisé la reducción de referencias y confirmo que el archivo está completo.</label>' : ""}<div class="progress"><div id="sapProgress"></div></div><p id="sapProgressText" class="muted"></p><div class="modal-actions"><button id="cancelSap" class="btn-secondary">Cancelar</button><button id="publishSap" ${reduced || a.error ? "disabled" : ""}>Confirmar y publicar SAP</button></div>`,
    );
    $("#cancelSap").onclick = closeModal;
    $("#publishSap").onclick = publishSap;
    if (reduced && !a.error)
      $("#ackReduction").onchange = (e) =>
        ($("#publishSap").disabled = !e.target.checked);
  } catch (e) {
    if (pendingSap?.loadId)
      await supabase.rpc("olt_sap_reject", {
        p_load: pendingSap.loadId,
        p_message: e.message,
      });
    else if (hash)
      await supabase.rpc("olt_sap_failure", {
        p_file: file.name,
        p_hash: hash,
        p_error: e.message,
      });
    pendingSap = null;
    modal(
      `<div class="notice error">No se puede publicar: ${escapeHtml(e.message)}</div>`,
    );
  } finally {
    busySap = false;
    els.modalClose.disabled = false;
  }
}
async function publishSap() {
  if (!pendingSap || busySap) return;
  busySap = true;
  els.modalClose.disabled = true;
  $("#publishSap").disabled = true;
  $("#cancelSap").disabled = true;
  const loadId = pendingSap.loadId;
  try {
    setProgress(95, "Publicando snapshot completo en una transacción…");
    const result = await supabase.rpc("olt_sap_publish", {
      p_load: loadId,
      p_ack: Boolean($("#ackReduction")?.checked),
    });
    if (result.error) {
      // A network failure can occur after commit. Verify before claiming rollback.
      const state = await supabase
        .from("olt_sap_loads")
        .select("estado")
        .eq("id", loadId)
        .maybeSingle();
      if (state.error)
        throw new Error(
          "No se pudo confirmar el resultado. Actualiza el historial antes de intentar otra carga.",
        );
      if (state.data?.estado !== "publicada") throw result.error;
    }
    pendingSap = null;
    busySap = false;
    els.modalClose.disabled = false;
    await closeModal();
    await loadData();
  } catch (e) {
    setProgress(0, e.message);
    $("#publishSap").disabled = false;
    $("#cancelSap").disabled = false;
  } finally {
    busySap = false;
    els.modalClose.disabled = false;
  }
}
function setView(view) {
  const sap = view === "sap";
  $("#generalView").classList.toggle("hidden", sap);
  $("#sapView").classList.toggle("hidden", !sap);
  $("#viewTitle").textContent = sap ? "Centro SAP" : "General / Operación OLT";
  for (const [id, active] of [
    ["navGeneral", !sap],
    ["navSap", sap],
  ]) {
    const b = $("#" + id);
    b.classList.toggle("btn-secondary", !active);
    active
      ? b.setAttribute("aria-current", "page")
      : b.removeAttribute("aria-current");
  }
  history.replaceState(null, "", sap ? "#sap" : "#general");
  if (sap) loadSapCenter();
}
$("#navGeneral").onclick = () => setView("general");
$("#navSap").onclick = () => setView("sap");
$("#sapDetailLink").onclick = () => setView("sap");
for (const id of [
  "periodFilter",
  "lineFilter",
  "transportFilter",
  "zoneFilter",
])
  $("#" + id).onchange = () => {
    currentPage = 0;
    loadData();
  };
$("#clearFilters").onclick = () => {
  for (const id of [
    "periodFilter",
    "lineFilter",
    "transportFilter",
    "zoneFilter",
  ])
    $("#" + id).value = "";
  currentPage = 0;
  loadData();
};
document.addEventListener("keydown", (e) => {
  if (els.modal.classList.contains("hidden")) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab") {
    const focusable = [
      ...els.modal.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),summary",
      ),
    ];
    const first = focusable[0],
      last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginMsg.textContent = "Ingresando…";
  const { data, error } = await supabase.auth.signInWithPassword({
    email: els.email.value.trim(),
    password: els.password.value,
  });
  if (error) {
    els.loginMsg.textContent = error.message;
    return;
  }
  els.loginMsg.textContent = "";
  showApp(data.user);
  currentPage = 0;
  await loadData();
});
els.logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});
els.refreshBtn.addEventListener("click", () => loadData());
els.prevBtn.addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage--;
    loadData();
  }
});
els.nextBtn.addEventListener("click", () => {
  if (hasNext) {
    currentPage++;
    loadData();
  }
});
els.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 0;
    loadData();
  }, 350);
});
els.btnSap.addEventListener("click", () => {
  els.sapFile.value = "";
  els.sapFile.click();
});
els.sapFile.addEventListener("change", () => {
  const f = els.sapFile.files?.[0];
  if (f) prepareSap(f);
});
els.modalClose.addEventListener("click", closeModal);
els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) closeModal();
});

renderHeader();
setView(location.hash === "#sap" ? "sap" : "general");
const {
  data: { session },
} = await supabase.auth.getSession();
if (session?.user) {
  showApp(session.user);
  await loadData();
} else showLogin();
supabase.auth.onAuthStateChange((_event, session) => {
  if (!session?.user) showLogin();
});
