import { MONTHS, escape, percentText } from './kpi.js';
const nf = new Intl.NumberFormat('es-PE');
const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
const ratio = (r) => r.total ? r.en_fecha / r.total : null;
const rate = (value) => value == null ? '—' : `${(value * 100).toLocaleString('es-PE', {maximumFractionDigits: 1})}%`;
const points = (value) => value == null ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toLocaleString('es-PE', {maximumFractionDigits: 1})} pp`;
export function monthlyTotals(rows, year, month, zone = '') {
  const selected = rows.filter(r => Number(r.year) === year && Number(r.month) === month && (!zone || r.zona === zone));
  return Object.fromEntries(['total','en_fecha','fuera_fecha','sin_indicador','historical'].map(k => [k, sum(selected,k)]));
}
export function historicalSummaryHtml(data) {
  const rows = data.monthly || [], incidents = data.incidents || [];
  if (!rows.length) return '<div class="kpi-empty">No hay documentos con los filtros elegidos.</div>';
  const total = sum(rows,'total'), good = sum(rows,'en_fecha'), late = sum(rows,'fuera_fecha'), frozen = sum(rows,'historical');
  const years = [...new Set(rows.map(r => Number(r.year)))].sort((a,b) => a-b);
  const target = data.target == null ? null : Number(data.target);
  const withoutZone = sum(rows.filter(r=>!['LIMA','PROVINCIA'].includes(r.zona)), 'total');
  const cards = `<div class="kpi-total-strip"><span><strong>${nf.format(total)}</strong> documentos</span><span class="good-text">${nf.format(good)} En Fecha</span><span class="bad-text">${nf.format(late)} Fuera de Fecha</span><span><strong>${percentText(good,total)}</strong> cumplimiento acumulado</span><span>${nf.format(frozen)} históricos consolidados</span></div>`;
  const tables = years.map(year => {
    const months = Array.from({length:12},(_,i) => i+1);
    const all = months.map(m => monthlyTotals(rows,year,m));
    const annual = Object.fromEntries(['total','en_fecha','fuera_fecha','sin_indicador'].map(k => [k,sum(all,k)]));
    const averageMonths = all.filter(r => r.total);
    const average = averageMonths.length ? averageMonths.reduce((n,r) => n + ratio(r),0) / averageMonths.length : null;
    const head = `<th scope="col">Indicador</th>${months.map(m => `<th scope="col">${MONTHS[m-1].slice(0,3)}</th>`).join('')}<th scope="col">Acumulado</th>`;
    const row = (label, values, annualValue, cls='') => `<tr class="${cls}"><th scope="row">${label}</th>${values.map(v=>`<td>${v}</td>`).join('')}<td><strong>${annualValue}</strong></td></tr>`;
    let body = '';
    for (const zone of ['LIMA','PROVINCIA']) {
      const z = months.map(m => monthlyTotals(rows,year,m,zone));
      const zTotal = sum(z,'total'), zGood = sum(z,'en_fecha');
      body += row(`${zone} · Documentos`,z.map(r => r.total ? nf.format(r.total) : '—'),nf.format(zTotal),'summary-section-row');
      body += row('En Fecha',z.map(r => r.total ? nf.format(r.en_fecha) : '—'),nf.format(zGood),'good-text');
      body += row('Fuera de Fecha',z.map(r => r.total ? nf.format(r.fuera_fecha) : '—'),nf.format(sum(z,'fuera_fecha')),'bad-text');
      body += row('Cumplimiento',z.map(r => rate(ratio(r))),percentText(zGood,zTotal));
    }
    body += row('TOTAL · Documentos',all.map(r=>r.total ? nf.format(r.total) : '—'),nf.format(annual.total),'summary-section-row');
    body += row('En Fecha',all.map(r=>r.total ? nf.format(r.en_fecha) : '—'),nf.format(annual.en_fecha),'good-text');
    body += row('Fuera de Fecha',all.map(r=>r.total ? nf.format(r.fuera_fecha) : '—'),nf.format(annual.fuera_fecha),'bad-text');
    body += row('Cumplimiento',all.map(r=>rate(ratio(r))),percentText(annual.en_fecha,annual.total));
    if (annual.sin_indicador) body += row('Sin indicador',all.map(r=>r.total ? nf.format(r.sin_indicador) : '—'),nf.format(annual.sin_indicador));
    if (target != null) {
      body += row('Meta',months.map(()=>rate(target)),rate(target));
      body += row('Desviación de la meta',all.map(r=>r.total ? points(ratio(r)-target) : '—'),annual.total ? points(annual.en_fecha/annual.total-target) : '—');
    }
    const chart = `<div class="summary-spark" aria-label="Cumplimiento mensual ${year}">${all.map((r,i) => `<div><span>${rate(ratio(r))}</span><div class="summary-track"><i style="height:${r.total ? Math.max(1,100*ratio(r)) : 0}%"></i></div><small>${MONTHS[i].slice(0,3)}</small></div>`).join('')}</div>`;
    const group = new Map();
    for (const r of incidents.filter(r=>Number(r.year)===year)) {
      const key = JSON.stringify([r.zona,r.responsable,r.motivo]);
      const item = group.get(key) || {zona:r.zona,responsable:r.responsable,motivo:r.motivo,months:Array(12).fill(0),total:0};
      item.months[Number(r.month)-1] += Number(r.total);item.total += Number(r.total);group.set(key,item);
    }
    const lateYear = annual.fuera_fecha;
    const incidentTable = group.size ? `<div class="kpi-table-scroll"><table class="data-table summary-table"><thead><tr><th>Zona</th><th>Responsable</th><th>Motivo / incidencia</th>${months.map(m=>`<th>${MONTHS[m-1].slice(0,3)}</th>`).join('')}<th>Total</th><th>% fuera de fecha</th></tr></thead><tbody>${[...group.values()].sort((a,b)=>b.total-a.total).map(r=>`<tr><td>${escape(r.zona)}</td><td>${escape(r.responsable)}</td><td>${escape(r.motivo)}</td>${r.months.map(n=>`<td>${n ? nf.format(n) : '—'}</td>`).join('')}<td><strong>${nf.format(r.total)}</strong></td><td>${percentText(r.total,lateYear)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No hay documentos fuera de fecha para este período.</p>';
    return `<section class="panel"><div class="analysis-heading"><div><h2>Resultados ${year}</h2><p class="muted">Por mes de Fec. Despacho · Promedio mensual: <strong>${rate(average)}</strong>${target != null ? ` · Meta TECNOFARMA: ${rate(target)}` : ''}</p></div></div>${chart}<div class="kpi-table-scroll"><table class="data-table summary-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section><section class="panel"><h2>Responsables e incidencias · ${year}</h2><p class="muted">Solo Fuera de Fecha. Porcentaje sobre los ${nf.format(lateYear)} documentos fuera de fecha del período.</p>${incidentTable}</section>`;
  }).join('');
  return `${cards}<p class="notice">Los históricos consolidados conservan sus valores originales. Los registros actuales tienen prioridad sobre las coincidencias del archivo histórico. Los filtros superiores se aplican a este resumen.</p>${withoutZone ? `<p class="notice warn">${nf.format(withoutZone)} documento(s) sin zona Lima/Provincia. Se incluyen en el total y no en los subtotales por zona.</p>` : ''}${tables}`;
}
