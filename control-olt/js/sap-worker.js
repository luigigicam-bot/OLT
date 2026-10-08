import { parseSapRowsFromBuffer } from "./sap-parser.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: parseSapRowsFromBuffer(data) });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
