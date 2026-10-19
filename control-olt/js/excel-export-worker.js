import { workbookBuffer } from "./excel-export.js";
self.onmessage = ({ data }) => {
  try {
    const buffer = workbookBuffer(data.headers, data.rows, data.sheetName, data.dateColumns);
    self.postMessage({ buffer }, [buffer]);
  } catch {
    self.postMessage({ error: "No se pudo generar el archivo Excel." });
  }
};
