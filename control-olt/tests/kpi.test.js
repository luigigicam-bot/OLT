import test from "node:test";
import assert from "node:assert/strict";
import {
  percent,
  percentText,
  combineTransport,
  renderKpi,
} from "../js/kpi.js";
const row = (total, en, late, extra = {}) => ({
  total,
  en_fecha: en,
  fuera_fecha: late,
  sin_indicador: total - en - late,
  ...extra,
});
test("Porcentajes: base del grupo, no del total global; cero tiene base vacía", () => {
  assert.equal(percent(1, 2), 50);
  assert.equal(percent(2, 5), 40);
  assert.equal(percent(0, 0), null);
  assert.equal(percentText(0, 0), "—");
  assert.equal(percentText(1, 2), "50%");
});
test("ET: agrega documentos entre zonas antes de calcular porcentaje", () => {
  const rows = [
    row(2, 1, 1, { zona: "LIMA", et: "MUNDO" }),
    row(8, 8, 0, { zona: "PROVINCIA", et: "MUNDO" }),
  ];
  const total = combineTransport(rows)[0];
  assert.equal(total.total, 10);
  assert.equal(percent(total.fuera_fecha, total.total), 10);
  assert.equal(combineTransport(rows, "LIMA")[0].total, 2);
});
test("KPI: TECNO 2 documentos, 1 en y 1 fuera; detalle incluye línea y zona; etiquetas seguras", () => {
  const data = {
    totals: row(2, 1, 1, { sin_zona: 0 }),
    zones: [
      row(2, 1, 1, { zona: "LIMA" }),
      row(0, 0, 0, { zona: "PROVINCIA" }),
    ],
    lines: [row(2, 1, 1, { zona: "LIMA", linea: "TECNO<script>" })],
    incidents: [
      {
        zona: "LIMA",
        responsable: "Sin responsable",
        motivo: "Sin motivo registrado",
        total: 1,
      },
    ],
    transports: [],
  };
  const result = renderKpi(data);
  assert.match(result.html, /50%/);
  assert.match(result.html, /1 de 2/);
  assert.match(result.html, /TECNO&lt;script&gt;/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.ok(
    result.drills.some(
      (d) =>
        d.line === "TECNO<script>" &&
        d.zone === "LIMA" &&
        d.indicator === "Fuera de Fecha",
    ),
  );
  assert.ok(
    result.drills.some(
      (d) =>
        d.reason === "Sin motivo registrado" &&
        d.responsible === "Sin responsable",
    ),
  );
  assert.match(result.html, /1 de 1/);
});
test("Sin indicador permanece en base y muestra aviso", () => {
  const data = {
    totals: row(3, 1, 1, { sin_zona: 1 }),
    zones: [row(3, 1, 1, { zona: "LIMA" })],
    lines: [],
    incidents: [],
    transports: [],
  };
  const { html } = renderKpi(data);
  assert.match(html, /33[.,]3%/);
  assert.match(html, /siguen incluidos en el total/);
  assert.match(html, /sin zona Lima\/Provincia/);
});
