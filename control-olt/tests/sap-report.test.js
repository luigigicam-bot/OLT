import test from "node:test";
import assert from "node:assert/strict";
import { consolidateDt } from "../js/sap-report.js";
import { filterReport, summarizeDt } from "../js/sap-report-stats.js";
import { sapReportHtml } from "../js/sap-report-ui.js";
function matrix() {
  const header = Array.from({ length: 68 }, () => "");
  for (const [i, v] of [
    [0, "Transporte"],
    [1, "Sts.Trp"],
    [10, "Nombre 1"],
    [12, "Placa"],
    [14, "Entrega"],
    [37, "Referencia"],
    [62, "InActTrans"],
    [63, "HrAITr"],
  ])
    header[i] = v;
  const row = (dt, status, ent, date, alt, invoice = "") => {
    const r = Array(68).fill("");
    r[0] = dt;
    r[1] = status;
    r[10] = "MUNDO";
    r[12] = "ABC";
    r[14] = ent;
    r[62] = date;
    r[4] = alt;
    r[37] = invoice;
    return r;
  };
  return [
    header,
    row("DT1", "1", "E1", "", "01.09.2026"),
    row("DT1", "7", "E2", "02.09.2026", "03.09.2026"),
    row("DT1", "7", "500XYZ", "", "05.09.2026"),
    row("DT2", "6", "E3", "01.09.2026", "04.09.2026"),
    row("DT3", "7", "E4", "", "", "01-0FF000"),
    row("DT4", "9", "E5", "", ""),
  ];
}
test("DT único: selecciona la fila más reciente y conserva sus propios campos", () => {
  const r = consolidateDt(matrix(), ["DT1", "DT1"]);
  assert.equal(r.rows.length, 3);
  assert.equal(r.excluded, 2);
  const one = r.rows.find((x) => x.dt === "DT1");
  assert.equal(one.state, "7");
  assert.equal(one.inacttrans, "2026-09-02");
  assert.equal(one.date, "2026-09-02");
  assert.equal(one.alternative, "2026-09-03");
  assert.equal(one.source_row, 3);
  assert.equal(one.in_tracking, true);
  const two = r.rows.find((x) => x.dt === "DT2");
  assert.equal(two.date, "2026-09-01");
  assert.equal(two.date_type, "InActTrans");
  assert.equal(r.rows.find((x) => x.dt === "DT4").date, null);
});
test("Filtros del reporte independientes y estados dinámicos reconcilian total", () => {
  const r = consolidateDt(matrix());
  const stats = summarizeDt(r.rows);
  assert.equal(
    stats.states.reduce((n, x) => n + x.total, 0),
    3,
  );
  assert.equal(
    stats.ets.reduce((n, x) => n + x.total, 0),
    3,
  );
  assert.equal(stats.missing, 1);
  assert.equal(
    filterReport(r.rows, { from: "2026-09-02", to: "2026-09-06" }).length,
    1,
  );
  assert.equal(filterReport(r.rows, { state: "9" }).length, 1);
});
test("Reporte: sin comparación, aviso histórico y escape de datos", () => {
  const r = consolidateDt(matrix());
  r.complete = false;
  r.rows[0].et = "<script>";
  const out = sapReportHtml(r);
  assert.match(out.html, /versión antigua/);
  assert.match(out.html, /no contiene Mi Data/);
  assert.match(out.html, /&lt;script&gt;/);
  assert.doesNotMatch(out.html, /<script>/);
});

test("Plantilla reordenada bloquea auxiliares posicionales", () => {
  const m = matrix();
  m[0][37] = "Otra columna";
  assert.throws(() => consolidateDt(m), /posición/);
});


test('DT: fecha domina hora; hora desempata; empate exacto conserva primera fila física', () => {
  const base = matrix();
  const a = [...base[1]], b = [...base[2]], c = [...base[2]], excluded = [...base[3]];
  a[62] = b[62] = c[62] = '02.09.2026';
  a[63] = '08:00:00'; b[63] = c[63] = '09:00:00';
  a[1] = '1'; b[1] = '6'; c[1] = '7';
  b[10] = 'TRANSPORTE NUEVO'; b[12] = 'NUEVA';
  excluded[62] = '31.12.2026'; excluded[63] = '23:59:59';
  let result = consolidateDt([base[0], a, b, c, excluded]).rows[0];
  assert.equal(result.state, '6');
  assert.equal(result.et, 'TRANSPORTE NUEVO');
  assert.equal(result.plate, 'NUEVA');
  assert.equal(result.source_row, 3);
  a[62] = '03.09.2026'; a[63] = '00:01:00';
  result = consolidateDt([base[0], a, b, c, excluded]).rows[0];
  assert.equal(result.state, '1');
  assert.equal(result.source_row, 2);
});

test('DT: un blanco no reemplaza una salida real ni toma alternativas de otra fila', () => {
  const base = matrix(), a = [...base[1]], b = [...base[2]];
  a[62] = b[62] = ''; a[63] = '10:00:00'; b[63] = '09:00:00';
  a[4] = ''; b[4] = '31.12.2026';
  let result = consolidateDt([base[0], a, b]).rows[0];
  assert.equal(result.inacttrans, null);
  assert.equal(result.alternative, null);
  assert.equal(result.date, null);
  b[62] = '01.09.2026';
  result = consolidateDt([base[0], a, b]).rows[0];
  assert.equal(result.inacttrans, '2026-09-01');
  assert.equal(result.source_row, 3);
});
