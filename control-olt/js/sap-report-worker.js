import { reportFromBuffer } from "./sap-report.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: reportFromBuffer(data) });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
