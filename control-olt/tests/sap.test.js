import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseSapRowsFromBuffer, isoDate, isoTime } from "../js/sap-parser.js";
const headers = [
  "Entrega",
  "Transporte",
  "Nombre 1",
  "Placa",
  "InActTrans",
  "Sts.Trp",
  "Estatus",
  "Fec. Reg.",
  "Hor. Reg.",
  "UsuaCtrlRe",
  "HrAITr",
  "Nombre 1",
];
const row = (
  id = "00123",
  date = "08.10.2026",
  time = "09:00:00",
  dt = "DT1",
) => [
  id,
  dt,
  "Transportista Álvarez",
  "ABC-123",
  date,
  "Viaje",
  "Entregado",
  "07.10.2026",
  "08:00:00",
  "usuario",
  time,
  "Cliente distinto",
];
const text = (rows, h = headers) =>
  new TextEncoder().encode(
    ["Reporte SAP", "", h.join("\t"), ...rows.map((r) => r.join("\t"))].join(
      "\r\n",
    ),
  ).buffer;
test("SAP tabulado disfrazado como XLS: preámbulo y primer Nombre 1", () => {
  const p = parseSapRowsFromBuffer(text([row()]));
  assert.equal(p.headerRow, 3);
  assert.equal(p.rows[0].referencia, "00123");
  assert.equal(p.rows[0].et, "Transportista Álvarez");
  assert.equal(p.rows[0].inacttrans, "2026-10-08");
});
test("Columna1 y Fec/ Reg/ son aliases admitidos", () => {
  const h = headers.map((x) =>
    x === "Entrega" ? "Columna1" : x === "Fec. Reg." ? "Fec/ Reg/" : x,
  );
  assert.equal(parseSapRowsFromBuffer(text([row()], h)).latest.length, 1);
});
test("Windows-1252 conserva tildes sin conversión del usuario", () => {
  let s = headers.join("\t") + "\n" + row().join("\t");
  const b = Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  assert.equal(
    parseSapRowsFromBuffer(b.buffer).latest[0].et,
    "Transportista Álvarez",
  );
});
for (const bookType of ["xlsx", "biff8"])
  test(`Formato binario ${bookType} detectado por contenido`, () => {
    const ws = XLSX.utils.aoa_to_sheet([headers, row()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SAP");
    const b = XLSX.write(wb, { type: "array", bookType });
    assert.equal(parseSapRowsFromBuffer(b).latest[0].dt, "DT1");
  });
test("Selección por fecha, hora y primera fila física", () => {
  const p = parseSapRowsFromBuffer(
    text([
      row("1", "07.10.2026", "23:00:00", "OLD"),
      row("1", "08.10.2026", "08:00:00", "EARLY"),
      row("1", "08.10.2026", "09:00:00", "WIN"),
      row("1", "08.10.2026", "09:00:00", "TIE"),
    ]),
  );
  assert.equal(p.latest.length, 1);
  assert.equal(p.latest[0].dt, "WIN");
  assert.equal(p.latest[0].fila_origen, 6);
});
test("Rechaza fecha imposible, hora fuera de rango y entrega vacía", () => {
  const p = parseSapRowsFromBuffer(
    text([
      row("1", "31.02.2026"),
      row("2", "08.10.2026", "25:00:00"),
      row(""),
      row("3"),
    ]),
  );
  assert.equal(p.invalid, 3);
  assert.equal(p.latest.length, 1);
  assert.equal(p.invalidDetails.length, 3);
});
test("Valores vacíos de salida se conservan como datos incompletos", () => {
  const p = parseSapRowsFromBuffer(text([row("1", "", "")]));
  assert.equal(p.latest[0].inacttrans, null);
  assert.equal(p.latest[0].hraitr, null);
});
test("Fechas y horas estrictas; serial Excel y fracción de día", () => {
  assert.equal(isoDate("2026-02-29"), "");
  assert.equal(isoDate("29.02.2024"), "2024-02-29");
  assert.equal(isoDate(46200), "2026-06-27");
  assert.equal(isoTime(0.5), "12:00:00");
  assert.equal(isoTime("24:00"), "");
  assert.equal(isoTime("10:00 basura"), "");
});
test("Archivo ajeno o columnas faltantes bloquean la carga", () => {
  assert.throws(() =>
    parseSapRowsFromBuffer(
      new TextEncoder().encode("<html>no SAP</html>").buffer,
    ),
  );
  assert.throws(
    () =>
      parseSapRowsFromBuffer(
        text(
          [row()],
          headers.filter((x) => x !== "Placa"),
        ),
      ),
    /Faltan columnas/,
  );
});
