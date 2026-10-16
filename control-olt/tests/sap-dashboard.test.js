import test from "node:test";
import assert from "node:assert/strict";
import { dashboardData, sapDashboardHtml } from "../js/sap-dashboard.js";
import { workbookBuffer } from "../js/excel-export.js";
import { parseSapRowsFromBuffer } from "../js/sap-parser.js";
import * as XLSX from "xlsx";

const report = { load_id: 2, filename: "20.XLS", dispatch_column_present: true, rows: [
  { dt: "0001", et: "MUNDO", state: "1", dispatch_date: null, inacttrans: "2026-10-08", in_general: false },
  { dt: "0002", et: "MUNDO", state: "6", dispatch_date: "2026-09-04", inacttrans: "2026-10-08", in_general: true },
  { dt: "0003", et: "ANDI", state: "1", dispatch_date: "2026-10-04", inacttrans: null, in_general: false },
  { dt: "0004", et: "RECOJO DE MERCADERÍA EN CD-STA", state: "7", dispatch_date: "2026-10-04", inacttrans: null, in_general: false },
  { dt: "0005", et: "ANDI", state: "7", dispatch_date: "2026-10-04", inacttrans: "2026-10-04", in_general: true },
] };
test("SAP: counts reconcile, compare unique DT and exclude Recojo only from comparison", () => {
  const d = dashboardData(report);
  assert.deepEqual(d.counts, { "1": 2, "6": 1, "7": 2, other: 0, total: 5 });
  assert.equal(d.scheduled.length, 2);
  assert.equal(d.withoutExit.length, 1);
  assert.equal(d.excluded, 1);
  assert.deepEqual(d.missing.map((r) => r.dt), ["0001", "0003"]);
  const html = sapDashboardHtml(report, new Set(["t1", "t1-m1"]));
  assert.match(html, /Sin fecha/);
  assert.doesNotMatch(html, /08\/10\/2026/); // InActTrans never becomes dispatch date.
  assert.match(html, /Descargar detalle en Excel/);
  assert.match(html, /Comparación SAP vs\. General/);
});
test("SAP: unknown states remain in totals and untrusted labels are escaped", () => {
  const html = sapDashboardHtml({ ...report, rows: [{ dt: "=123", et: '<img src=x onerror="alert(1)">', state: "9" }] });
  assert.match(html, /Otros/); assert.doesNotMatch(html, /<img/);
});
test("Parser: Fec. Despacho is independent, blank stays blank, missing header has no fallback", () => {
  const header = "Entrega\tTransporte\tNombre 1\tPlaca\tInActTrans\tSts.Trp\tEstatus\tFec. Reg.\tHor. Reg.\tUsuaCtrlRe\tHrAITr";
  const row = "E1\t0001\tMUNDO\tABC\t08.10.2026\t1\tE\t08.10.2026\t09:00:00\tUSER\t10:00:00";
  const parse = (text) => parseSapRowsFromBuffer(new TextEncoder().encode(text).buffer).rows[0];
  assert.equal(parse(`${header}\n${row}`).raw_data.fecha_despacho, null);
  assert.equal(parse(`${header}\n${row}`).raw_data.dispatch_column_present, false);
  assert.equal(parse(`${header}\tFec. Despacho\n${row}\t`).raw_data.fecha_despacho, null);
  assert.equal(parse(`${header}\tFec. Despacho\n${row}\t04.09.2026`).raw_data.fecha_despacho, "2026-09-04");
});
test("Excel: roundtrip all rows, 43 columns, leading zeros, blank exit and literal formula text", () => {
  const headers = Array.from({ length: 43 }, (_, i) => `Campo ${i}`);
  const rows = Array.from({ length: 150 }, (_, i) => Array.from({ length: 43 }, (_, j) => j === 0 ? `000${i}` : j === 1 ? '=HYPERLINK("bad")' : j === 2 ? "2026-09-04" : ""));
  const buffer = workbookBuffer(headers, rows, "General", [2]);
  const book = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = book.Sheets.General;
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  assert.equal(values.length, 151); assert.equal(values[0].length, 43);
  assert.equal(values[1][0], "0000"); assert.equal(sheet.B2.t, "s"); assert.equal(sheet.B2.f, undefined);
  assert.equal(values[1][2].getFullYear(), 2026); assert.equal(values[1][2].getMonth(), 8); assert.equal(values[1][2].getDate(), 4);
  assert.equal(values[1][4], "");
});
