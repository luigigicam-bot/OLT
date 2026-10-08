export function filterReport(rows, f = {}) {
  return rows.filter(
    (r) =>
      (!f.dt || r.dt.toLowerCase().includes(f.dt.toLowerCase())) &&
      (!f.et || r.et === f.et) &&
      (!f.state || r.state === f.state) &&
      (!f.from || r.date >= f.from) &&
      (!f.to || (r.date && r.date <= f.to)) &&
      (!f.missing || !r.inacttrans),
  );
}
export function summarizeDt(rows) {
  const countBy = (key) => {
    const map = new Map();
    for (const r of rows) {
      const value = key(r);
      map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map]
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  };
  const states = countBy((r) => r.state),
    dates = countBy((r) => r.date || "Sin fecha").sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  const ets = [...new Set(rows.map((r) => r.et))].sort().map((et) => ({
    et,
    total: rows.filter((r) => r.et === et).length,
    states: Object.fromEntries(
      states.map((s) => [
        s.label,
        rows.filter((r) => r.et === et && r.state === s.label).length,
      ]),
    ),
  }));
  return {
    total: rows.length,
    missing: rows.filter((r) => !r.inacttrans).length,
    alternative: rows.filter((r) => !r.inacttrans && r.alternative).length,
    no_date: rows.filter((r) => !r.date).length,
    in_tracking: rows.filter((r) => r.in_tracking).length,
    states,
    dates,
    ets,
  };
}
