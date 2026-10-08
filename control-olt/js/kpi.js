const number = new Intl.NumberFormat("es-PE");
export const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export function percent(count, total) {
  return total > 0 ? (100 * count) / total : null;
}
export function percentText(count, total) {
  const p = percent(count, total);
  return p === null
    ? "—"
    : `${p.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
}
export function escape(value) {
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
export function combineTransport(rows, zone = "") {
  const map = new Map();
  for (const r of rows) {
    if (zone && r.zona !== zone) continue;
    const key = r.et;
    const old = map.get(key) || {
      et: key,
      total: 0,
      en_fecha: 0,
      fuera_fecha: 0,
      sin_indicador: 0,
    };
    for (const k of ["total", "en_fecha", "fuera_fecha", "sin_indicador"])
      old[k] += Number(r[k] || 0);
    map.set(key, old);
  }
  return [...map.values()].sort(
    (a, b) =>
      (percent(b.fuera_fecha, b.total) ?? -1) -
        (percent(a.fuera_fecha, a.total) ?? -1) ||
      b.total - a.total ||
      a.et.localeCompare(b.et),
  );
}
export function metricBar(row) {
  const parts = [
    ["good", row.en_fecha, "En Fecha"],
    ["bad", row.fuera_fecha, "Fuera de Fecha"],
    ["unknown", row.sin_indicador, "Sin indicador"],
  ];
  return `<div class="metric-bar" role="img" aria-label="${escape(parts.map(([, n, label]) => `${label}: ${n} de ${row.total}`).join("; "))}">${parts
    .filter(([, n]) => n > 0)
    .map(
      ([color, n, label]) =>
        `<span class="${color}" style="width:${percent(n, row.total) || 0}%" title="${label}: ${n} de ${row.total}"></span>`,
    )
    .join("")}</div>`;
}
function tabs(key, value, all = false) {
  return `<div class="zone-tabs" role="group" aria-label="Zona del análisis">${(all
    ? [
        ["", "Todos"],
        ["LIMA", "Lima"],
        ["PROVINCIA", "Provincia"],
      ]
    : [
        ["LIMA", "Lima"],
        ["PROVINCIA", "Provincia"],
      ]
  )
    .map(
      ([zone, label]) =>
        `<button type="button" data-kpi-tab="${key}" data-zone="${zone}" aria-pressed="${value === zone}" class="${value === zone ? "" : "btn-secondary"}">${label}</button>`,
    )
    .join("")}</div>`;
}
export function renderKpi(
  data,
  state = { lines: "LIMA", incidents: "LIMA", transports: "" },
) {
  const drills = [];
  const drill = (label, filters, cls = "metric-link") => {
    const id = drills.push(filters) - 1;
    return `<button type="button" class="${cls}" data-drill="${id}">${label}</button>`;
  };
  const t = data.totals;
  const warning = [
    t.sin_indicador
      ? `${number.format(t.sin_indicador)} documentos sin indicador; siguen incluidos en el total.`
      : "",
    t.sin_zona
      ? `${number.format(t.sin_zona)} documentos sin zona Lima/Provincia; se incluyen en el resumen total y transportistas.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const zones = data.zones
    .map(
      (z) =>
        `<article class="zone-card"><div class="zone-card-head"><div><p class="eyebrow">${escape(z.zona)}</p><h3>${number.format(z.total)} <span>documentos</span></h3></div><span class="zone-share">${percentText(z.total, t.total)} del total seleccionado</span></div>${metricBar(z)}<div class="zone-stats"><div class="good-text"><span>En Fecha</span>${drill(percentText(z.en_fecha, z.total), { zone: z.zona, indicator: "En Fecha" }, "metric-number good-text")}<small>${number.format(z.en_fecha)} de ${number.format(z.total)} documentos</small></div><div class="bad-text"><span>Fuera de Fecha</span>${drill(percentText(z.fuera_fecha, z.total), { zone: z.zona, indicator: "Fuera de Fecha" }, "metric-number bad-text")}<small>${number.format(z.fuera_fecha)} de ${number.format(z.total)} documentos</small></div></div>${z.sin_indicador ? `<p class="muted">Sin indicador: ${number.format(z.sin_indicador)} (${percentText(z.sin_indicador, z.total)})</p>` : ""}</article>`,
    )
    .join("");
  const lines = data.lines
    .filter((r) => r.zona === state.lines)
    .sort(
      (a, b) =>
        (percent(b.fuera_fecha, b.total) ?? -1) -
          (percent(a.fuera_fecha, a.total) ?? -1) ||
        b.total - a.total ||
        a.linea.localeCompare(b.linea),
    );
  const lineTable = lines.length
    ? `<div class="kpi-table-scroll"><table class="data-table kpi-table"><thead><tr><th>Línea</th><th>Documentos</th><th>En Fecha</th><th>Fuera de Fecha</th><th>Distribución</th></tr></thead><tbody>${lines.map((r) => `<tr><th scope="row">${drill(escape(r.linea), { zone: r.zona, line: r.linea })}</th><td>${number.format(r.total)}</td><td>${drill(percentText(r.en_fecha, r.total), { zone: r.zona, line: r.linea, indicator: "En Fecha" }, "metric-link good-text")}<small>${r.en_fecha} de ${r.total}</small></td><td>${drill(percentText(r.fuera_fecha, r.total), { zone: r.zona, line: r.linea, indicator: "Fuera de Fecha" }, "metric-link bad-text")}<small>${r.fuera_fecha} de ${r.total}</small></td><td>${metricBar(r)}${r.sin_indicador ? `<small>${r.sin_indicador} sin indicador</small>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : empty("No hay documentos de esta zona con los filtros actuales.");
  const incidents = data.incidents.filter((r) => r.zona === state.incidents);
  const lateBase =
    data.zones.find((z) => z.zona === state.incidents)?.fuera_fecha || 0;
  const incidentTable = incidents.length
    ? `<div class="kpi-table-scroll"><table class="data-table"><thead><tr><th>Responsable</th><th>Motivo / incidencia</th><th>Fuera de Fecha</th><th>% de la zona</th></tr></thead><tbody>${incidents.map((r) => `<tr><td>${escape(r.responsable)}</td><td>${escape(r.motivo)}</td><td>${drill(number.format(r.total), { zone: r.zona, indicator: "Fuera de Fecha", responsible: r.responsable, reason: r.motivo }, "metric-link bad-text")}</td><td>${percentText(r.total, lateBase)}<small>${r.total} de ${lateBase}</small></td></tr>`).join("")}</tbody></table></div>`
    : empty("Sin documentos Fuera de Fecha para esta zona y filtros.");
  const transports = combineTransport(data.transports, state.transports);
  const transportTable = transports.length
    ? `<div class="kpi-table-scroll"><table class="data-table kpi-table"><thead><tr><th>Transportista (ET)</th><th>Documentos</th><th>En Fecha</th><th>Fuera de Fecha</th></tr></thead><tbody>${transports.map((r) => `<tr><th scope="row">${drill(escape(r.et), { ...(state.transports ? { zone: state.transports } : {}), et: r.et })}</th><td>${r.total}</td><td>${drill(percentText(r.en_fecha, r.total), { ...(state.transports ? { zone: state.transports } : {}), et: r.et, indicator: "En Fecha" }, "metric-link good-text")}<small>${r.en_fecha} de ${r.total}</small></td><td>${drill(percentText(r.fuera_fecha, r.total), { ...(state.transports ? { zone: state.transports } : {}), et: r.et, indicator: "Fuera de Fecha" }, "metric-link bad-text")}<small>${r.fuera_fecha} de ${r.total}</small>${metricBar(r)}</td></tr>`).join("")}</tbody></table></div>`
    : empty("No hay transportistas para esta zona y filtros.");
  const html = `<div class="kpi-total-strip"><span><strong>${number.format(t.total)}</strong> documentos seleccionados</span><span class="good-text">${number.format(t.en_fecha)} En Fecha</span><span class="bad-text">${number.format(t.fuera_fecha)} Fuera de Fecha</span><span class="muted">Base: todos los documentos del grupo</span></div>${warning ? `<p class="notice warn">${escape(warning)}</p>` : ""}<div class="zone-cards">${zones}</div><div class="kpi-legend"><span><i class="dot green"></i>En Fecha</span><span><i class="dot red"></i>Fuera de Fecha</span><span><i class="dot gray"></i>Sin indicador</span><span>Pulsa una cifra para ver sus documentos en General.</span></div><section class="panel"><div class="analysis-heading"><div><h2>Cumplimiento por línea</h2><p class="muted">Porcentaje sobre los documentos de cada línea y zona. Primero las líneas con mayor % Fuera de Fecha.</p></div>${tabs("lines", state.lines)}</div>${lineTable}</section><div class="kpi-bottom-grid"><section class="panel"><div class="analysis-heading"><div><h2>Responsables e incidencias</h2><p class="muted">Solo Fuera de Fecha · base ${escape(state.incidents)}: ${number.format(lateBase)} documentos.</p></div>${tabs("incidents", state.incidents)}</div>${incidentTable}</section><section class="panel"><div class="analysis-heading"><div><h2>Comportamiento por transportista</h2><p class="muted">Cada ET usa su propio total de documentos.</p></div>${tabs("transports", state.transports, true)}</div>${transportTable}</section></div>`;
  return { html, drills };
}
function empty(message) {
  return `<div class="kpi-empty">${escape(message)}</div>`;
}
