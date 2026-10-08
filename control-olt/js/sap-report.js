import * as XLSX from "xlsx";
import { isoDate, matrixFromSapBuffer } from "./sap-parser.js";
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
    placa = idx("Placa"),
    entrega = idx("Entrega") >= 0 ? idx("Entrega") : idx("Columna1");
  if ([d, s, et, date, placa, entrega].some((i) => i < 0))
    throw new Error(
      "Faltan columnas para consolidar DT, estado, transportista, placa y entrega.",
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
    const old = map.get(dt) || { dt, first: null, alternative: null };
    if (alt && (!old.alternative || alt > old.alternative))
      old.alternative = alt;
    const omit =
      String(r[37] ?? "")
        .trim()
        .startsWith("01-0FF") ||
      String(r[entrega] ?? "")
        .trim()
        .startsWith("500");
    if (omit) excluded++;
    else if (!old.first)
      old.first = {
        dt,
        state: String(r[s] ?? "").trim() || "Sin estado",
        et: String(r[et] ?? "").trim() || "Sin transportista",
        plate: String(r[placa] ?? "").trim(),
        inacttrans: isoDate(r[date]) || null,
        source_row: i + 1,
      };
    map.set(dt, old);
  }
  return {
    rows: [...map.values()]
      .filter((r) => r.first)
      .map((r) => ({
        ...r.first,
        alternative: r.alternative,
        date: r.first.inacttrans || r.alternative,
        date_type: r.first.inacttrans
          ? "InActTrans"
          : r.alternative
            ? "Fecha alternativa"
            : "Sin fecha",
        in_tracking: known.has(r.dt),
      })),
    excluded,
    blankDt,
    tracking_source:
      miData !== null ? "Mi Data del archivo" : "Sin comparación",
    complete: true,
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
