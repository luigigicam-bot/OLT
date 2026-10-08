import { filterReport, summarizeDt } from "./sap-report-stats.js";
import { escape, percentText } from "./kpi.js";
const count = (n) => Number(n || 0).toLocaleString("es-PE");
const date = (d) => (d ? d.split("-").reverse().join("/") : "—");
function table(headers, rows) {
  return `<div class="kpi-table-scroll"><table class="data-table"><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}">Sin registros para estos filtros.</td></tr>`}</tbody></table></div>`;
}
function detail(rows) {
  return table(
    [
      "DT",
      "Sts.Trp",
      "Transportista",
      "Placa",
      "InActTrans",
      "Fecha alternativa",
      "Fecha utilizada",
      "Tipo de fecha",
      "En seguimiento",
    ],
    rows.map(
      (r) =>
        `<tr><td>${escape(r.dt)}</td><td>${escape(r.state)}</td><td>${escape(r.et)}</td><td>${escape(r.plate)}</td><td>${date(r.inacttrans)}</td><td>${date(r.alternative)}</td><td>${date(r.date)}</td><td>${escape(r.date_type)}</td><td>${r.in_tracking ? "Sí" : "No"}</td></tr>`,
    ),
  );
}
export function sapReportHtml(report, filters = {}, page = 0, missingPage = 0) {
  const rows = filterReport(report.rows, filters),
    s = summarizeDt(rows);
  const without = rows.filter((r) => !r.inacttrans),
    known = report.tracking_source !== "Sin comparación";
  const stat = (label, value) =>
    `<div class="summary-card"><span>${label}</span><strong>${count(value)}</strong></div>`;
  const quality = report.complete
    ? ""
    : `<p class="notice warn">Esta versión antigua no conserva las columnas de fecha alternativa y exclusión de facturas. El resumen puede incluir facturas sin identificar. Usa Analizar archivo con la 20 original para aplicar todas las reglas.</p>`;
  const stateBars = s.states
    .map(
      (x) =>
        `<div class="sap-report-bar"><span>Estado ${escape(x.label)}</span><div><i style="width:${s.total ? (100 * x.total) / s.total : 0}%"></i></div><span>${count(x.total)} · ${percentText(x.total, s.total)}</span></div>`,
    )
    .join("");
  const transport = table(
    ["Transportista", ...s.states.map((x) => `Estado ${x.label}`), "Total DT"],
    s.ets.map(
      (r) =>
        `<tr><th>${escape(r.et)}</th>${s.states.map((x) => `<td>${count(r.states[x.label])}</td>`).join("")}<td><strong>${count(r.total)}</strong></td></tr>`,
    ),
  );
  const dates = table(
    ["Fecha utilizada", "DT", "% del grupo"],
    s.dates.map(
      (x) =>
        `<tr><td>${x.label === "Sin fecha" ? x.label : date(x.label)}</td><td>${count(x.total)}</td><td>${percentText(x.total, s.total)}</td></tr>`,
    ),
  );
  const missing = without.slice(missingPage * 100, (missingPage + 1) * 100),
    visible = rows.slice(page * 100, (page + 1) * 100);
  const pager = (key, p, total) =>
    `<div class="toolbar-group"><button class="btn-secondary" data-report-page="${key}" data-direction="-1" ${p === 0 ? "disabled" : ""}>←</button><span>Página ${p + 1} · ${count(total)} DT</span><button class="btn-secondary" data-report-page="${key}" data-direction="1" ${(p + 1) * 100 >= total ? "disabled" : ""}>→</button></div>`;
  return {
    total: rows.length,
    missing: without.length,
    html: `${quality}<div class="sap-report-stats">${stat("DT únicos seleccionados", s.total)}${stat("Sin InActTrans", s.missing)}${stat("Con fecha alternativa", s.alternative)}${stat("Sin fecha identificable", s.no_date)}</div><p class="muted">Archivo: ${count(report.excluded)} filas de factura/devolución excluidas · ${count(report.blankDt)} filas sin DT. Fecha utilizada: InActTrans de la primera fila válida; si falta, máxima alternativa de E, I, Z, AI, AK y AU del DT.</p>${known ? `<p class="notice">Comparación con ${escape(report.tracking_source)}: <strong>${count(s.in_tracking)}</strong> DT presentes y <strong>${count(s.total - s.in_tracking)}</strong> faltantes.</p>` : '<p class="muted">Este archivo no contiene Mi Data; no se evalúa presencia en seguimiento.</p>'}<div class="sap-report-grid"><section><h3>Resumen por Sts.Trp</h3><div class="sap-report-bars">${stateBars || "<p>Sin estados.</p>"}</div></section><section><h3>Resumen por fecha</h3>${dates}</section></div><section><h3>Sts.Trp por transportista</h3>${transport}</section><details class="sap-report-detail"><summary>DT sin InActTrans (${count(without.length)})</summary>${pager("missing", missingPage, without.length)}${detail(missing)}</details><details class="sap-report-detail"><summary>DT consolidado (${count(rows.length)})</summary>${pager("all", page, rows.length)}${detail(visible)}</details>`,
  };
}
