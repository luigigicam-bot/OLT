import test from "node:test";
import assert from "node:assert/strict";
import { calc, addWorkdays } from "../js/indicators.js";
const base = {
  entrega: "1",
  fecha: "2026-10-08",
  despacho: "LIMA",
  linea: "BIOPAS",
};
const opts = { today: "2026-10-09" };
test("Un día hábil Lima y prioridad fecha SAP", () => {
  assert.equal(calc(base, opts).fec_vencto, "2026-10-09");
  assert.equal(
    calc({ ...base, fecha_salida_sap: "2026-10-09" }, opts).fec_vencto,
    "2026-10-12",
  );
});
test("Calendario consultable omite fines de semana y feriados", () => {
  assert.equal(
    addWorkdays("2026-10-08", 1, new Set(["2026-10-09"])),
    "2026-10-12",
  );
});
test("Reglas Provincia 7, Tecnofarma 15 y Loreto 25", () => {
  assert.equal(
    calc({ ...base, despacho: "PROVINCIA" }, opts).fec_vencto,
    "2026-10-19",
  );
  assert.equal(
    calc({ ...base, despacho: "PROVINCIA", linea: "TECNOFARMA" }, opts)
      .fec_vencto,
    "2026-10-29",
  );
  assert.equal(
    calc(
      {
        ...base,
        despacho: "PROVINCIA",
        linea: "TECNOFARMA",
        departamento: "LORETO",
      },
      opts,
    ).fec_vencto,
    "2026-11-12",
  );
});
test("Sin cargo: vence hoy, futuro y pendiente; AP usa días calendario", () => {
  assert.equal(calc(base, opts).estado_cargo, "Vencen Hoy");
  assert.equal(calc(base, opts).retraso, "Vence hoy 0 días");
  assert.equal(calc(base, { today: "2026-10-08" }).retraso, "Vence en 1 días");
  assert.equal(
    calc(base, { today: "2026-10-12" }).retraso,
    "3 días de retraso",
  );
});
test("Con cargo: Cumple y No Cumple incluyendo igualdad", () => {
  const r = calc({ ...base, fec_cargo: "2026-10-09" }, opts);
  assert.equal(r.estado_cargo, "Cumple");
  assert.equal(r.indicador, "En Fecha");
  assert.equal(r.retraso, "-");
  assert.equal(
    calc({ ...base, fec_cargo: "2026-10-12" }, opts).estado_cargo,
    "No Cumple",
  );
});
test("AQ: diferencia absoluta y singular", () => {
  assert.equal(
    calc({ ...base, fecha_salida_sap: "2026-10-09" }, opts).dias_plan_salida,
    "1 día",
  );
  assert.equal(
    calc({ ...base, fecha_salida_sap: "2026-10-06" }, opts).dias_plan_salida,
    "2 días",
  );
});
test("Sin fecha no inventa un incumplimiento", () => {
  assert.equal(calc({ ...base, fecha: null }, opts).indicador, "");
});
