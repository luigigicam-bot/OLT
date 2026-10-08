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
    [62, "InActTrans"],
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
test("DT único: primera elegible, excluye facturas/devoluciones y alternativa máxima de todas las filas", () => {
  const r = consolidateDt(matrix(), ["DT1", "DT1"]);
  assert.equal(r.rows.length, 3);
  assert.equal(r.excluded, 2);
  const one = r.rows.find((x) => x.dt === "DT1");
  assert.equal(one.state, "1");
  assert.equal(one.inacttrans, null);
  assert.equal(one.date, "2026-09-05");
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
  assert.equal(stats.missing, 2);
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
