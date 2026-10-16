function dateFromISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
function dateToISO(d) {
  return d
    ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    : "";
}
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function isWorkday(d, holidays) {
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(dateToISO(d));
}
export function addWorkdays(startISO, days, holidays = new Set()) {
  const d = dateFromISO(startISO);
  if (!d) return "";
  if (!days) return dateToISO(d);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkday(d, holidays)) remaining--;
  }
  return dateToISO(d);
}
function compareISO(a, b) {
  return a === b ? 0 : a < b ? -1 : 1;
}
function daysBetween(a, b) {
  const da = dateFromISO(a),
    db = dateFromISO(b);
  if (!da || !db) return null;
  return Math.round((da - db) / 86400000);
}
function monthName(iso) {
  const d = dateFromISO(iso);
  return d
    ? new Intl.DateTimeFormat("es-PE", {
        month: "long",
        timeZone: "UTC",
      }).format(d)
    : "";
}
export function formatDate(iso) {
  const d = dateFromISO(iso);
  return d
    ? new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(d)
    : "";
}
function dueDays(row) {
  const line = String(row.linea || "")
    .trim()
    .toUpperCase();
  const dep = String(row.departamento || "")
    .trim()
    .toUpperCase();
  const dispatch = String(row.despacho || "")
    .trim()
    .toUpperCase();
  if (line === "TECNOFARMA" && dep === "LORETO") return 25;
  const lines7 = new Set([
    "ELEA",
    "GENOMMA LAB",
    "OMPHARMA",
    "BIOPAS",
    "BONAPHARM",
    "FAES FARMA",
    "FERQUIM",
    "RECKITT BENCKISER",
    "TAKEDA",
    "ADIUM",
    "ELEA PERU",
  ]);
  if (dispatch === "PROVINCIA" && lines7.has(line)) return 7;
  if (dispatch === "PROVINCIA" && line === "TECNOFARMA") return 15;
  if (dispatch === "LIMA") return 1;
  return 0;
}
export function calc(row, { holidays = new Set(), today = todayISO() } = {}) {
  if (!row.entrega) return { ...row };
  const base = row.fecha_salida_sap || row.fecha || "";
  const due = addWorkdays(base, dueDays(row), holidays);
  const cargoOrToday = row.fec_cargo || today;
  const indicador = !due
    ? ""
    : due && compareISO(cargoOrToday, due) <= 0
      ? "En Fecha"
      : "Fuera de Fecha";
  let estado = "";
  if (!due) estado = "";
  else if (!row.fec_cargo) {
    estado =
      due === today
        ? "Vencen Hoy"
        : due && due > today
          ? "Por Vencer"
          : "Cargo Pendiente";
  } else estado = due && row.fec_cargo <= due ? "Cumple" : "No Cumple";
  let retraso = "";
  if (!due) retraso = "";
  else if (!row.fec_cargo) {
    const diff = daysBetween(today, due);
    retraso =
      diff > 0
        ? `${diff} días de retraso`
        : diff === 0
          ? "Vence hoy 0 días"
          : `Vence en ${Math.abs(diff)} días`;
  } else {
    const diff = daysBetween(row.fec_cargo, due);
    retraso = diff <= 0 ? "-" : `${diff} días de retraso`;
  }
  const pd =
    row.fecha && row.fecha_salida_sap
      ? Math.abs(daysBetween(row.fecha, row.fecha_salida_sap))
      : null;
  return {
    ...row,
    fec_vencto: due,
    indicador,
    estado_cargo: estado,
    mes_olt: monthName(row.fecha),
    mes_sap: monthName(row.fecha_salida_sap),
    retraso,
    dias_plan_salida: pd === null ? "" : `${pd} ${pd === 1 ? "día" : "días"}`,
  };
}
