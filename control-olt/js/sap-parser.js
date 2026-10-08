import * as XLSX from "xlsx";
export function isoDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }
  if (typeof value === "number") {
    const p = XLSX.SSF.parse_date_code(value);
    return p ? validDate(p.y, p.m, p.d) : "";
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return "";
}
export function isoTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value >= 1) return "";
    const seconds = Math.round(value * 86400) % 86400;
    const h = Math.floor(seconds / 3600),
      m = Math.floor((seconds % 3600) / 60),
      s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m && +m[1] < 24 && +m[2] < 60 && +(m[3] || 0) < 60
    ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}`
    : "";
}
export function matrixFromSapBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle =
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;

  if (isZip || isOle) {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheetName =
      workbook.SheetNames.find(
        (name) => name.trim().toLowerCase() === "datos sap",
      ) || workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  }

  // SAP puede entregar un archivo .XLS que en realidad es texto tabulado Windows-1252.
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    text = new TextDecoder("utf-16le").decode(bytes);
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  if (!text.includes("\t"))
    throw new Error("El archivo no es XLSX, XLS ni texto SAP tabulado.");
  return text.split(/\r?\n/).map((line) => line.split("\t"));
}

export function parseSapRowsFromBuffer(buffer) {
  const matrix = matrixFromSapBuffer(buffer);
  const headerIndex = matrix.findIndex((r) => {
    const vals = r.map((v) => String(v ?? "").trim());
    const hasKey = vals.includes("Entrega") || vals.includes("Columna1");
    return hasKey && vals.includes("InActTrans") && vals.includes("HrAITr");
  });
  if (headerIndex < 0)
    throw new Error(
      "No encontré la cabecera SAP esperada (Entrega/Columna1, InActTrans y HrAITr).",
    );

  const headers = matrix[headerIndex].map((v) => String(v ?? "").trim());
  const firstIndex = (...names) => {
    for (const name of names) {
      const i = headers.findIndex((h) => h === name);
      if (i >= 0) return i;
    }
    return -1;
  };

  const index = {
    dt: firstIndex("Transporte"),
    estado_viaje: firstIndex("Sts.Trp"),
    et: firstIndex("Nombre 1"), // primer "Nombre 1": transportista
    placa: firstIndex("Placa"),
    referencia: firstIndex("Entrega", "Columna1"),
    estado_entrega: firstIndex("Estatus"),
    fec_reg: firstIndex("Fec. Reg.", "Fec/ Reg/"),
    hor_reg: firstIndex("Hor. Reg."),
    inacttrans: firstIndex("InActTrans"),
    hraitr: firstIndex("HrAITr"),
    usua_ctrl_re: firstIndex("UsuaCtrlRe"),
  };

  const missing = Object.entries(index)
    .filter(([, i]) => i < 0)
    .map(([k]) => k);
  if (missing.length)
    throw new Error("Faltan columnas SAP requeridas: " + missing.join(", "));

  const rows = [];
  const invalidDetails = [];
  let invalid = 0;
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    if (!r.some((v) => String(v ?? "").trim())) continue;
    const referencia = String(r[index.referencia] ?? "").trim();
    const badDate = [index.inacttrans, index.fec_reg].some(
      (j) => String(r[j] ?? "").trim() && !isoDate(r[j]),
    );
    const badTime = [index.hraitr, index.hor_reg].some(
      (j) => String(r[j] ?? "").trim() && !isoTime(r[j]),
    );
    if (!referencia || badDate || badTime || referencia.length > 100) {
      invalid++;
      if (invalidDetails.length < 100)
        invalidDetails.push({
          fila: i + 1,
          motivo: !referencia
            ? "Sin entrega"
            : badDate
              ? "Fecha inválida"
              : badTime
                ? "Hora inválida"
                : "Entrega demasiado larga",
        });
      continue;
    }

    rows.push({
      fila_origen: i + 1,
      referencia,
      inacttrans: isoDate(r[index.inacttrans]) || null,
      hraitr: isoTime(r[index.hraitr]) || null,
      dt: String(r[index.dt] ?? "").trim() || null,
      et: String(r[index.et] ?? "").trim() || null,
      placa: String(r[index.placa] ?? "").trim() || null,
      fecha_salida_sap: isoDate(r[index.inacttrans]) || null,
      estado_viaje: String(r[index.estado_viaje] ?? "").trim() || null,
      estado_entrega: String(r[index.estado_entrega] ?? "").trim() || null,
      fec_reg: isoDate(r[index.fec_reg]) || null,
      hor_reg: isoTime(r[index.hor_reg]) || null,
      usua_ctrl_re: String(r[index.usua_ctrl_re] ?? "").trim() || null,
      raw_data: {
        report_version: 1,
        fecha_alternativa:
          [4, 8, 25, 34, 36, 46]
            .map((j) => isoDate(r[j]))
            .filter(Boolean)
            .sort()
            .at(-1) || null,
        excluido_reporte:
          String(r[37] ?? "")
            .trim()
            .startsWith("01-0FF") || referencia.startsWith("500"),
      },
    });
  }

  const latest = new Map();
  for (const r of rows) {
    const old = latest.get(r.referencia);
    if (!old || isNewerSap(r, old)) latest.set(r.referencia, r);
  }
  return {
    rows,
    latest: [...latest.values()],
    invalid,
    invalidDetails,
    headerRow: headerIndex + 1,
  };
}
export function isNewerSap(a, b) {
  const ad = a.inacttrans || "",
    bd = b.inacttrans || "";
  if (ad !== bd) return ad > bd;
  const at = a.hraitr || "",
    bt = b.hraitr || "";
  if (at !== bt) return at > bt;
  return a.fila_origen < b.fila_origen;
}
export function sameSap(a, b) {
  return [
    "inacttrans",
    "hraitr",
    "dt",
    "et",
    "placa",
    "estado_viaje",
    "estado_entrega",
    "fec_reg",
    "hor_reg",
    "usua_ctrl_re",
  ].every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

function validDate(y, m, d) {
  const v = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 &&
    y <= 2200 &&
    v.getUTCFullYear() === y &&
    v.getUTCMonth() === m - 1 &&
    v.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : "";
}
