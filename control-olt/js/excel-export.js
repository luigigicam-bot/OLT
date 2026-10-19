import * as XLSX from "xlsx";

// Explicit strings remain text, including IDs with leading zeroes and '=' prefixes.
export function workbookBuffer(headers, rows, sheetName = "General", dateColumns = []) {
  const values = rows.map((r) => r.map((v, i) => dateColumns.includes(i) ? excelDate(v) : v ?? ""));
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...values], { cellDates: true, dateNF: "dd/mm/yyyy" });
  sheet["!cols"] = headers.map((h, i) => ({
    wch: Math.min(42, Math.max(14, String(h).length + 2, ...rows.slice(0, 100).map((r) => String(r[i] ?? "").length + 2))),
  }));
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return XLSX.write(book, { type: "array", bookType: "xlsx", compression: true, cellDates: true });
}

export function excelDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value ?? "";
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(y, m - 1, d);
}
