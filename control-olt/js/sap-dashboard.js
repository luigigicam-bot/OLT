const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const count = (v) => Number(v || 0).toLocaleString("es-PE");
const normalized = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
export const excludedRecojo = (r) => normalized(r.et) === "RECOJO DE MERCADERIA EN CD-STA";
const dateLabel = (v) => v ? v.split("-").reverse().join("/") : "Sin fecha";
const monthKey = (r) => r.dispatch_date?.slice(0, 7) || "";
const monthLabel = (v) => v ? `${MONTHS[Number(v.slice(5)) - 1]} ${v.slice(0, 4)}` : "Sin fecha";
const sorted = (a, b) => a.localeCompare(b, "es", { numeric: true });
const dateSort = (a, b) => a && b ? b.localeCompare(a) : a ? -1 : b ? 1 : 0;
const groupBy = (rows, key) => {
  const map = new Map();
  for (const r of rows) { const k = key(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  return [...map];
};
const states = (rows) => {
  const result = { "1": 0, "6": 0, "7": 0, other: 0, total: rows.length };
  for (const r of rows) result[["1", "6", "7"].includes(r.state) ? r.state : "other"]++;
  return result;
};
export function dashboardData(report) {
  const rows = report.rows || [];
  const scheduled = rows.filter((r) => r.state === "1");
  const compared = rows.filter((r) => !excludedRecojo(r));
  return {
    rows, scheduled, withoutExit: scheduled.filter((r) => !r.inacttrans),
    counts: states(rows), compared, missing: compared.filter((r) => !r.in_general),
    excluded: rows.length - compared.length,
  };
}

export function sapDashboardHtml(report, expanded = new Set(), missingPage = 0) {
  if (!report?.load_id) return '<section class="panel"><p class="muted">Publica una carga SAP para ver los resúmenes y la comparación.</p></section>';
  const d = dashboardData(report), other = d.counts.other > 0;
  const numbers = (rows) => {
    const c = states(rows);
    return ["1", "6", "7", ...(other ? ["other"] : []), "total"].map((k) => `<td class="sap-number ${k === "total" ? "sap-total" : ""}">${count(c[k])}</td>`).join("");
  };
  const row = (label, rows, key, depth = 0) => `<tr class="sap-pivot-depth-${depth}"><th scope="row" style="--depth:${depth}">${key ? `<button type="button" class="sap-expand" data-sap-expand="${key}" aria-expanded="${expanded.has(key)}" aria-label="${expanded.has(key) ? "Contraer" : "Expandir"} ${escape(label)}"><span aria-hidden="true">${expanded.has(key) ? "−" : "+"}</span>${escape(label)}</button>` : `<span class="sap-leaf">${escape(label)}</span>`}</th>${numbers(rows)}</tr>`;
  const pivot = groupBy(d.rows, (r) => r.et).sort((a, b) => sorted(a[0], b[0])).map(([et, rows], ti) => {
    const t = `t${ti}`; let html = row(et, rows, t);
    if (expanded.has(t)) groupBy(rows, monthKey).sort((a, b) => dateSort(a[0], b[0])).forEach(([month, mr], mi) => {
      const m = `${t}-m${mi}`; html += row(monthLabel(month), mr, m, 1);
      if (expanded.has(m)) groupBy(mr, (r) => r.dispatch_date || "").sort((a, b) => dateSort(a[0], b[0])).forEach(([date, dr], di) => {
        const dd = `${m}-d${di}`; html += row(dateLabel(date), dr, dd, 2);
        if (expanded.has(dd)) for (const r of dr.slice().sort((a, b) => sorted(a.dt, b.dt))) html += row(`DT ${r.dt}`, [r], null, 3);
      });
    });
    return html;
  }).join("");
  const state1 = groupBy(d.scheduled, (r) => r.et).sort((a, b) => b[1].length - a[1].length || sorted(a[0], b[0])).map(([et, rows]) => `<tr><td>${escape(et)}</td><td><span class="badge warn">1 · Programado</span></td><td class="sap-number">${count(rows.length)}</td></tr>`).join("");
  const pageSize = 50, page = Math.min(Math.max(missingPage, 0), Math.max(0, Math.ceil(d.missing.length / pageSize) - 1));
  const missingRows = d.missing.slice(page * pageSize, (page + 1) * pageSize).map((r) => `<tr><td><strong>${escape(r.dt)}</strong></td><td>${escape(r.et)}</td><td><span class="badge ${r.state === "1" ? "warn" : r.state === "7" ? "ok" : ""}">${escape(r.state)}</span></td></tr>`).join("");
  return `<section class="panel sap-summary-panel"><div class="analysis-heading"><div><h2>Resumen de la última carga SAP</h2><p class="muted">${escape(report.filename)} · DT únicos · Transporte → mes → fecha → DT</p></div><span class="badge">Última carga publicada</span></div>${report.dispatch_column_present ? '<p class="muted sap-date-note">Mes y fecha: únicamente Fec. Despacho. Los valores vacíos aparecen como Sin fecha.</p>' : '<p class="notice warn sap-date-note">El archivo no incluye la columna Fec. Despacho. Los DT aparecen como Sin fecha.</p>'}<div class="table-scroll sap-pivot-scroll"><table class="data-table sap-pivot"><thead><tr><th>Transporte / Fec. Despacho / DT</th><th>Estado 1<small>Programado</small></th><th>Estado 6<small>En reparto</small></th><th>Estado 7<small>Cerrado</small></th>${other ? '<th>Otros</th>' : ""}<th>Total</th></tr></thead><tbody>${pivot || `<tr><td colspan="${other ? 6 : 5}">Sin DT en esta carga.</td></tr>`}<tr class="sap-grand-total"><th>Total general</th>${numbers(d.rows)}</tr></tbody></table></div></section>
  <section class="panel"><div class="analysis-heading"><div><h2>Estado 1 · Programados</h2><p class="muted">${count(d.scheduled.length)} DT en estado 1 de la última carga publicada.</p></div><button type="button" id="downloadStatus1" ${d.scheduled.length ? "" : "disabled"}>Descargar detalle en Excel</button></div>${d.withoutExit.length ? `<p class="notice warn">${count(d.withoutExit.length)} programados sin salida a ruta: InActTrans está vacío.</p>` : '<p class="muted">No hay programados con InActTrans vacío.</p>'}<div class="table-scroll"><table class="data-table sap-state1"><thead><tr><th>Transporte</th><th>Estado</th><th>DT</th></tr></thead><tbody>${state1 || '<tr><td colspan="3">No hay registros en estado 1.</td></tr>'}${state1 ? `<tr class="sap-grand-total"><th>Total</th><td>Estado 1</td><td class="sap-number">${count(d.scheduled.length)}</td></tr>` : ""}</tbody></table></div><p id="status1ExportMessage" class="muted export-message" role="status"></p></section>
  <section class="panel"><div class="analysis-heading"><div><h2>Comparación SAP vs. General</h2><p class="muted">DT presentes en SAP que faltan en toda la hoja General.</p></div><div class="sap-comparison-counts"><span>DT SAP<strong>${count(d.compared.length)}</strong></span><span>Coinciden en General<strong>${count(d.compared.length - d.missing.length)}</strong></span><span class="${d.missing.length ? "sap-missing-count" : ""}">Faltantes<strong>${count(d.missing.length)}</strong></span></div></div><p class="notice ${d.missing.length ? "warn" : ""}">${d.missing.length ? `Te falta cargar en General ${count(d.missing.length)} DT. Revisa los números y transportes siguientes.` : 'Todos los DT SAP considerados están en General.'}</p>${d.missing.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>DT pendiente de cargar</th><th>Transporte</th><th>Estado SAP</th></tr></thead><tbody>${missingRows}</tbody></table></div><div class="sap-missing-pager"><span>${page * pageSize + 1}–${Math.min((page + 1) * pageSize, d.missing.length)} de ${count(d.missing.length)} faltantes</span><div><button type="button" class="btn-secondary" data-missing-page="${page - 1}" ${page ? "" : "disabled"}>Anterior</button><button type="button" class="btn-secondary" data-missing-page="${page + 1}" ${(page + 1) * pageSize < d.missing.length ? "" : "disabled"}>Siguiente</button></div></div>` : ""}<p class="muted">RECOJO DE MERCADERÍA EN CD-STA excluido de esta comparación (${count(d.excluded)} DT).</p></section>`;
}
