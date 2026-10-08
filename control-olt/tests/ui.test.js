import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import { calc, todayISO, formatDate } from "../js/indicators.js";
import { reportFromBuffer } from "../js/sap-report.js";
import { sapReportHtml } from "../js/sap-report-ui.js";
import { MONTHS, renderKpi } from "../js/kpi.js";
import { parseSapRowsFromBuffer } from "../js/sap-parser.js";
import { dashboardData, sapDashboardHtml } from "../js/sap-dashboard.js";
const pause = () => new Promise((r) => setTimeout(r, 15));
const sapText =
  "Entrega\tTransporte\tNombre 1\tPlaca\tInActTrans\tSts.Trp\tEstatus\tFec. Reg.\tHor. Reg.\tUsuaCtrlRe\tHrAITr\n1\tDT1\tET\tABC\t08.10.2026\tV\tE\t08.10.2026\t09:00:00\tUSER\t10:00:00";
async function setup({
  missingMigration = false,
  failPublish = false,
  failMetrics = false,
  morePages = false,
} = {}) {
  const dom = new JSDOM(
    readFileSync(new URL("../index.html", import.meta.url), "utf8"),
    { url: "http://localhost/#general", runScripts: "outside-only" },
  );
  const w = dom.window;
  const counters = { publish: 0, append: 0, reject: 0, save: 0, requests: [], exports: [], filenames: [] };
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "fixture@example.test",
  };
  const row = calc({
    id: 1,
    entrega: "1",
    fecha: "2026-10-08",
    despacho: "LIMA",
    linea: "BIOPAS",
    transporte: "TERRESTRE",
  });
  let load = null;
  class Query {
    constructor(table) {
      this.table = table;
      this.id = null;
      this.one = false;
    }
    select() {
      return this;
    }
    eq(k, v) {
      if (k === "id") this.id = v;
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    range() {
      return this;
    }
    gte() {
      return this;
    }
    lt() {
      return this;
    }
    or() {
      return this;
    }
    single() {
      this.one = true;
      return this;
    }
    maybeSingle() {
      this.one = true;
      return this;
    }
    then(resolve) {
      let data =
        this.table === "olt_control_rows"
          ? [{ id: 1, row_data: row, cerrado: false }]
          : this.table === "calendario_feriados"
            ? []
            : this.table === "olt_sap_active"
              ? load?.estado === "publicada"
                ? { carga_activa_id: 99 }
                : null
              : this.table === "olt_sap_loads"
                ? this.one
                  ? load
                  : load
                    ? [load]
                    : []
                : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    }
  }
  const analysis = {
    changes: {
      nuevas: 1,
      modificadas: 0,
      desaparecidas: 0,
      dt: 0,
      placa: 0,
      et: 0,
      estado: 0,
    },
    detail: [],
    coverage: [],
    olt_total: 1,
    olt_missing: 0,
    sap_without_olt: 0,
    missing_detail: [],
    future: 0,
    incomplete: 0,
    multi_dt: 0,
    ties: 0,
  };
  const api = {
    from: (t) => new Query(t),
    auth: {
      getSession: async () => ({ data: { session: { user } } }),
      onAuthStateChange: () => {},
      signOut: async () => ({}),
      signInWithPassword: async () => ({ data: { user } }),
    },
    rpc: async (name, args) => {
      if (name === "olt_general_export_v1") return { data: { rows: Array.from({ length: 123 }, (_, i) => ({ id: i + 1, row_data: { ...row, entrega: `E${i}`, linea: i % 2 ? "OTRA" : "BIOPAS" } })) } };
      if (name === "olt_sap_dashboard_v1") return { data: { load_id: load?.estado === "publicada" ? load.id : null, filename: "20.XLS", dispatch_column_present: true, rows: [
        { dt: "0001", et: "MUNDO", state: "1", dispatch_date: null, inacttrans: null, in_general: false },
        { dt: "0002", et: "ANDI", state: "6", dispatch_date: "2026-10-08", inacttrans: "2026-10-08", in_general: true },
      ] } };
      if (name.startsWith("olt_metric_"))
        counters.requests.push({ name, args });
      if (name === "olt_cell_history_v1") return { data: [] };
      if (name === "olt_metric_options_v1")
        return { data: { lines: ["BIOPAS"], ets: ["ET"] } };
      if (name === "olt_metric_page_v2")
        return {
          data: {
            rows: [{ id: 1, row_data: row, cerrado: false }],
            has_next: morePages,
          },
        };
      if (name === "olt_metric_kpi_v1" && failMetrics)
        return { error: { message: "timeout" } };
      if (name === "olt_metric_kpi_v1")
        return {
          data: {
            totals: {
              total: 2,
              en_fecha: 1,
              fuera_fecha: 1,
              sin_indicador: 0,
              sin_zona: 0,
            },
            zones: [
              {
                zona: "LIMA",
                total: 2,
                en_fecha: 1,
                fuera_fecha: 1,
                sin_indicador: 0,
              },
              {
                zona: "PROVINCIA",
                total: 0,
                en_fecha: 0,
                fuera_fecha: 0,
                sin_indicador: 0,
              },
            ],
            lines: [
              {
                zona: "LIMA",
                linea: "BIOPAS",
                total: 2,
                en_fecha: 1,
                fuera_fecha: 1,
                sin_indicador: 0,
              },
            ],
            incidents: [
              { zona: "LIMA", responsable: "AL", motivo: "Demora", total: 1 },
            ],
            transports: [
              {
                zona: "LIMA",
                et: "ET",
                total: 2,
                en_fecha: 1,
                fuera_fecha: 1,
                sin_indicador: 0,
              },
            ],
            generated_at: new Date().toISOString(),
          },
        };
      if (name === "olt_sap_dt_report_v1")
        return {
          data: {
            rows: [],
            excluded: 0,
            blankDt: 0,
            complete: true,
            tracking_source: "DT registrados en Control OLT",
          },
        };
      if (name === "olt_sap_analysis")
        return missingMigration
          ? { error: { message: "Function unavailable" } }
          : { data: analysis };
      if (name === "olt_save_cell_v2") {
        counters.save++;
        row[args.p_key] = args.p_value;
        return { data: row };
      }
      if (name === "olt_sap_start") {
        load = {
          id: 99,
          archivo: args.p_file,
          estado: "validando",
          created_at: new Date().toISOString(),
          total_filas: 1,
          referencias_unicas: 1,
          referencias_nuevas: 1,
          referencias_actualizadas: 0,
        };
        return { data: 99 };
      }
      if (name === "olt_sap_append") {
        counters.append += args.p_rows.length;
        return { data: args.p_rows.length };
      }
      if (name === "olt_sap_summary")
        return {
          data: {
            valid: 1,
            unique: 1,
            new: 1,
            modified: 0,
            previous_unique: 0,
            future: 0,
          },
        };
      if (name === "olt_sap_reject") {
        counters.reject++;
        load.estado = "rechazada";
        return { data: null };
      }
      if (name === "olt_sap_publish") {
        counters.publish++;
        if (failPublish) return { error: { message: "Transacción rechazada" } };
        load.estado = "publicada";
        load.publicada_at = new Date().toISOString();
        return { data: { unique: 1 } };
      }
      return { data: null };
    },
  };
  w.createClient = () => api;
  w.sapReportHtml = sapReportHtml;
  w.dashboardData = dashboardData;
  w.sapDashboardHtml = sapDashboardHtml;
  w.URL.createObjectURL = () => "blob:fixture";
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { counters.filenames.push(this.download); };
  w.MONTHS = MONTHS;
  w.renderKpi = renderKpi;
  w.calc = calc;
  w.todayISO = todayISO;
  w.formatDate = formatDate;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.Worker = class {
    constructor(url) {
      this.report = String(url).includes("sap-report");
      this.excel = String(url).includes("excel-export");
    }
    postMessage(buffer) {
      if (this.excel) { counters.exports.push(buffer); setTimeout(() => this.onmessage({ data: { buffer: new ArrayBuffer(8) } }), 0); return; }
      setTimeout(
        () =>
          this.onmessage({
            data: {
              result: this.report
                ? reportFromBuffer(buffer)
                : parseSapRowsFromBuffer(buffer),
            },
          }),
        0,
      );
    }
    terminate() {}
  };
  const source = readFileSync(new URL("../js/app.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\s*/gm, "")
    .replace(
      /new URL\(\s*["']\.\/(?:sap(?:-report)?|excel-export)-worker\.js["'],\s*import\.meta\.url\s*\)/g,
      (match) =>
        match.includes("excel-export") ? "'/excel-export-worker.js'" : match.includes("sap-report")
          ? "'/sap-report-worker.js'"
          : "'/sap-worker.js'",
    );
  await w.eval(`(async()=>{${source}\n})()`);
  await pause();
  async function upload() {
    const buffer = new TextEncoder().encode(sapText).buffer;
    const file = {
      name: "SAP.XLS",
      size: buffer.byteLength,
      arrayBuffer: async () => buffer.slice(0),
    };
    Object.defineProperty(w.document.querySelector("#sapFile"), "files", {
      value: [file],
      configurable: true,
    });
    w.document.querySelector("#sapFile").dispatchEvent(new w.Event("change"));
    for (let i = 0; i < 30 && !w.document.querySelector("#publishSap"); i++)
      await pause();
  }
  return { w, dom, counters, upload };
}
test("General: 43 columnas, navegación SAP y edición solo por RPC", async () => {
  const t = await setup();
  try {
    const d = t.w.document;
    assert.equal(d.querySelectorAll("#tableBody tr:first-child td").length, 44);
    const input = d.querySelector('[data-key="nro_cargo"]');
    input.value = "CARGO1";
    input.dispatchEvent(new t.w.Event("change"));
    await pause();
    assert.equal(t.counters.save, 1);
    d.querySelector("#navSap").click();
    await pause();
    assert.equal(
      d.querySelector("#sapView").classList.contains("hidden"),
      false,
    );
    assert.equal(
      d.querySelector("#generalView").classList.contains("hidden"),
      true,
    );
  } finally {
    t.dom.window.close();
  }
});
test("SAP: staging y revisión no publican; requiere confirmación explícita", async () => {
  const t = await setup();
  try {
    await t.upload();
    assert.equal(t.counters.append, 1);
    assert.equal(t.counters.publish, 0);
    t.w.document.querySelector("#publishSap").click();
    await pause();
    assert.equal(t.counters.publish, 1);
    assert.equal(
      t.w.document.querySelector("#modal").classList.contains("hidden"),
      true,
    );
  } finally {
    t.dom.window.close();
  }
});
test("SAP: error de publicación conserva revisión y permite cancelar", async () => {
  const t = await setup({ failPublish: true });
  try {
    await t.upload();
    t.w.document.querySelector("#publishSap").click();
    await pause();
    assert.match(
      t.w.document.querySelector("#sapProgressText").textContent,
      /rechazada/,
    );
    assert.equal(
      t.w.document.querySelector("#modal").classList.contains("hidden"),
      false,
    );
    t.w.document.querySelector("#cancelSap").click();
    await pause();
    assert.equal(t.counters.reject, 1);
  } finally {
    t.dom.window.close();
  }
});
test("Migración ausente: aviso visible y publicación bloqueada", async () => {
  const t = await setup({ missingMigration: true });
  try {
    assert.match(
      t.w.document.querySelector("#generalKpis").textContent,
      /Documentos KPI/,
    );
    await t.upload();
    assert.equal(t.w.document.querySelector("#publishSap").disabled, true);
    assert.equal(t.counters.publish, 0);
  } finally {
    t.dom.window.close();
  }
});

test("KPI: filtros de fechas independientes, porcentajes y detalle conservan población", async () => {
  const t = await setup();
  try {
    const d = t.w.document;
    d.querySelector("#navKpi").click();
    assert.equal(
      d.querySelector("#kpiView").classList.contains("hidden"),
      false,
    );
    assert.match(d.querySelector("#kpiContent").textContent, /50%/);
    d.querySelector("#dateFrom").value = "2026-10-01";
    d.querySelector("#dateTo").value = "2026-10-08";
    d.querySelector("#applyDates").click();
    await pause();
    d.querySelector("#monthFilter").value = "9";
    d.querySelector("#monthFilter").dispatchEvent(new t.w.Event("change"));
    await pause();
    let req = t.counters.requests
      .filter((r) => r.name === "olt_metric_kpi_v1")
      .at(-1).args.p_filters;
    assert.equal(req.date_from, "2026-10-01");
    assert.equal(req.date_to, "2026-10-08");
    assert.equal(req.month, 9);
    assert.match(
      d.querySelector("#dateRangeSummary").textContent,
      /01\/10\/2026/,
    );
    d.querySelector('#kpiContent [data-drill="1"]').click();
    await pause();
    req = t.counters.requests
      .filter((r) => r.name === "olt_metric_page_v2")
      .at(-1).args.p_filters;
    assert.equal(req.reporting_only, true);
    assert.equal(req.zone, "LIMA");
    assert.equal(req.indicator, "Fuera de Fecha");
    assert.equal(req.month, 9);
    assert.equal(req.date_to, "2026-10-08");
    assert.equal(
      d.querySelector("#generalView").classList.contains("hidden"),
      false,
    );
    d.querySelector("#dateFrom").value = "2026-10-09";
    d.querySelector("#dateTo").value = "2026-10-01";
    const before = t.counters.requests.length;
    d.querySelector("#applyDates").click();
    await pause();
    assert.equal(t.counters.requests.length, before);
    assert.ok(d.querySelector("#dateError").textContent);
    d.querySelector("#clearFilters").click();
    await pause();
    req = t.counters.requests
      .filter((r) => r.name === "olt_metric_page_v2")
      .at(-1).args.p_filters;
    assert.equal(req.month, null);
    assert.equal(req.date_from, null);
    assert.equal(req.reporting_only, undefined);
  } finally {
    t.dom.window.close();
  }
});

test("General se muestra aunque falle la consulta KPI", async () => {
  const t = await setup({ failMetrics: true });
  try {
    assert.equal(
      t.w.document.querySelectorAll("#tableBody tr:first-child td").length,
      44,
    );
    assert.match(
      t.w.document.querySelector("#kpiContent").textContent,
      /independiente/,
    );
    assert.match(
      t.w.document.querySelector("#rowStatus").textContent,
      /1 filas visibles/,
    );
  } finally {
    t.dom.window.close();
  }
});

test("Filtros en esquina: apertura, Escape, foco y selección compartida", async () => {
  const t = await setup();
  try {
    const d = t.w.document;
    assert.equal(
      d.querySelector("#filterDrawer").classList.contains("hidden"),
      true,
    );
    d.querySelector("#openFilters").click();
    assert.equal(
      d.querySelector("#openFilters").getAttribute("aria-expanded"),
      "true",
    );
    d.querySelector("#lineFilter").value = "BIOPAS";
    d.querySelector("#lineFilter").dispatchEvent(new t.w.Event("change"));
    await pause();
    assert.match(d.querySelector("#activeFilterSummary").textContent, /BIOPAS/);
    d.dispatchEvent(new t.w.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(
      d.querySelector("#filterDrawer").classList.contains("hidden"),
      true,
    );
    assert.equal(d.activeElement.id, "openFilters");
    d.querySelector("#navSap").click();
    await pause();
    assert.match(d.querySelector("#sapReportContent").textContent, /DT únicos/);
  } finally {
    t.dom.window.close();
  }
});

test("SAP: analizar archivo es local y no publica ni cambia filtros General", async () => {
  const t = await setup();
  try {
    const d = t.w.document;
    d.querySelector("#lineFilter").value = "BIOPAS";
    d.querySelector("#navSap").click();
    await pause();
    const buffer = new TextEncoder().encode(sapText).buffer;
    Object.defineProperty(d.querySelector("#sapReportFile"), "files", {
      value: [
        {
          name: "reporte.xls",
          size: buffer.byteLength,
          arrayBuffer: async () => buffer.slice(0),
        },
      ],
      configurable: true,
    });
    d.querySelector("#sapReportFile").dispatchEvent(new t.w.Event("change"));
    await pause();
    await pause();
    assert.match(
      d.querySelector("#sapReportSource").textContent,
      /Vista local/,
    );
    assert.match(d.querySelector("#sapReportContent").textContent, /DT1/);
    assert.equal(t.counters.publish, 0);
    assert.equal(d.querySelector("#lineFilter").value, "BIOPAS");
    d.querySelector("#sapDtSearch").value = "no existe";
    d.querySelector("#sapDtSearch").dispatchEvent(new t.w.Event("input"));
    assert.match(
      d.querySelector("#sapReportContent").textContent,
      /Sin registros/,
    );
  } finally {
    t.dom.window.close();
  }
});

test("Paginación solo lee página; cerrar sesión limpia vistas", async () => {
  const t = await setup({ morePages: true });
  try {
    const d = t.w.document;
    const before = t.counters.requests.length;
    d.querySelector("#nextBtn").disabled = false;
    d.querySelector("#nextBtn").click();
    await pause();
    const calls = t.counters.requests.slice(before);
    assert.deepEqual(
      calls.map((x) => x.name),
      ["olt_metric_page_v2"],
    );
    d.querySelector(".cell-input").focus();
    d.querySelector("#cellHistory").click();
    await pause();
    assert.match(d.querySelector("#modalBody").textContent, /Sin cambios/);
    d.querySelector("#logoutBtn").click();
    await pause();
    assert.equal(d.querySelector("#tableBody").children.length, 0);
    assert.equal(d.querySelector("#kpiContent").textContent, "");
  } finally {
    t.dom.window.close();
  }
});

test("General: one descriptive header and full export ignores visible filters and page", async () => {
  const t = await setup();
  try {
    const d = t.w.document;
    assert.equal(d.querySelectorAll('#tableHead tr').length, 1);
    assert.equal(d.querySelector('#tableHead th:nth-child(2)').textContent, 'Nro. De Cargo');
    d.querySelector('#lineFilter').value = 'BIOPAS';
    d.querySelector('#downloadGeneral').click();
    await pause(); await pause();
    assert.equal(t.counters.exports.length, 1);
    assert.equal(t.counters.exports[0].rows.length, 123);
    assert.equal(t.counters.exports[0].headers.length, 43);
    assert.equal(t.counters.exports[0].rows[1][16], 'OTRA');
    assert.match(t.counters.filenames[0], /^General_OLT_.*\.xlsx$/);
  } finally { t.dom.window.close(); }
});
test("SAP: three latest-load reports, expand hierarchy and download only status 1", async () => {
  const t = await setup();
  try {
    const d = t.w.document;
    await t.upload(); d.querySelector('#publishSap').click();
    await pause(); await pause();
    d.querySelector('#navSap').click(); await pause(); await pause();
    assert.equal(d.querySelectorAll('#sapDashboard > section').length, 3);
    assert.match(d.querySelector('#sapDashboard').textContent, /Comparación SAP vs. General/);
    d.querySelector('[data-sap-expand="t1"]').click();
    assert.match(d.querySelector('#sapDashboard').textContent, /Sin fecha/);
    d.querySelector('#downloadStatus1').click(); await pause(); await pause();
    const payload = t.counters.exports[0];
    assert.equal(payload.sheetName, 'Estado 1');
    assert.equal(payload.rows.length, 1);
    assert.deepEqual(Array.from(payload.rows[0]), ['0001', 'MUNDO', null, '1', null]);
    assert.match(t.counters.filenames[0], /^SAP_Estado_1_.*\.xlsx$/);
  } finally { t.dom.window.close(); }
});
