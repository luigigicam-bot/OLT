import * as XLSX from "xlsx";
import { isoDate, isoTime, isNewerSap, matrixFromSapBuffer } from "./sap-parser.js";
export function consolidateDt(matrix, miData = null) {
  const header = matrix.findIndex(
    (r) =>
      r.map((v) => String(v ?? "").trim()).includes("InActTrans") &&
      r.map((v) => String(v ?? "").trim()).includes("Transporte"),
  );
  if (header < 0)
    throw new Error(
      "No encontré las columnas Transporte e InActTrans del reporte SAP.",
    );
  const headers = matrix[header].map((v) => String(v ?? "").trim());
  const idx = (name) => headers.indexOf(name);
  const d = idx("Transporte"),
    s =
      idx("Sts.Trp") >= 0
        ? idx("Sts.Trp")
        : d === 0 && idx("Entrega") === 14
          ? 1
          : -1;
  const et = idx("Nombre 1"),
    date = idx("InActTrans"),
    hour = idx("HrAITr"),
    placa = idx("Placa"),
    entrega = idx("Entrega") >= 0 ? idx("Entrega") : idx("Columna1");
  if ([d, s, et, date, placa, entrega].some((i) => i < 0))
    throw new Error(
      "Faltan columnas para consolidar DT, estado, transportista, placa y entrega.",
    );
  const positional =
    d === 0 &&
    et === 10 &&
    placa === 12 &&
    entrega === 14 &&
    date === 62 &&
    headers[37] === "Referencia";
  if (headers.length >= 47 && !positional)
    throw new Error(
      "Las columnas del reporte SAP cambiaron de posición. Usa la plantilla original para evitar fechas o exclusiones incorrectas.",
    );
  const known = new Set(
    (miData || []).filter(Boolean).map((v) => String(v).trim()),
  );
  const map = new Map();
  let excluded = 0,
    blankDt = 0;
  for (let i = header + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    if (!r.some((v) => String(v ?? "").trim())) continue;
    const dt = String(r[d] ?? "").trim();
    if (!dt) {
      blankDt++;
      continue;
    }
    const alt =
      headers.length >= 47
        ? [4, 8, 25, 34, 36, 46]
            .map((j) => isoDate(r[j]))
            .filter(Boolean)
            .sort()
            .at(-1) || null
        : null;
    const old = map.get(dt) || { dt, selected: null };
    const omit =
      String(r[37] ?? "")
        .trim()
        .startsWith("01-0FF") ||
      String(r[entrega] ?? "")
        .trim()
        .startsWith("500");
    if (omit) excluded++;
    else {
      const candidate = {
        dt,
        state: String(r[s] ?? "").trim() || "Sin estado",
        et: String(r[et] ?? "").trim() || "Sin transportista",
        plate: String(r[placa] ?? "").trim(),
        inacttrans: isoDate(r[date]) || null,
        hraitr: isoTime(r[hour]) || null,
        fila_origen: i + 1,
        source_row: i + 1,
        alternative: alt,
      };
      if (!old.selected || isNewerSap(candidate, old.selected)) old.selected = candidate;
    }
    map.set(dt, old);
  }
  return {
    rows: [...map.values()]
      .filter((r) => r.selected)
      .map((r) => ({
        ...r.selected,
        alternative: r.selected.alternative,
        date: r.selected.inacttrans || r.selected.alternative,
        date_type: r.selected.inacttrans
          ? "InActTrans"
          : r.selected.alternative
            ? "Fecha alternativa"
            : "Sin fecha",
        in_tracking: known.has(r.dt),
      })),
    excluded,
    blankDt,
    tracking_source:
      miData !== null ? "Mi Data del archivo" : "Sin comparación",
    complete: positional,
  };
}
export function reportFromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let tracking = null,
    matrix;
  if (
    (bytes[0] === 0x50 && bytes[1] === 0x4b) ||
    (bytes[0] === 0xd0 && bytes[1] === 0xcf)
  ) {
    const w = XLSX.read(buffer, {
      type: "array",
      cellDates: false,
      cellFormula: false,
    });
    const name = w.SheetNames.find((n) => n.trim().toLowerCase() === "mi data");
    if (name)
      tracking = XLSX.utils
        .sheet_to_json(w.Sheets[name], { header: 1, defval: null })
        .slice(1)
        .map((r) => r[0]);
    const source =
      w.SheetNames.find((n) => n.trim().toLowerCase() === "datos sap") ||
      w.SheetNames[0];
    matrix = XLSX.utils.sheet_to_json(w.Sheets[source], {
      header: 1,
      defval: null,
      raw: true,
    });
  } else matrix = matrixFromSapBuffer(buffer);
  return consolidateDt(matrix, tracking);
}
