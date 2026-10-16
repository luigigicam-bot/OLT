import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTotals, historicalSummaryHtml } from '../js/historical-summary.js';
test('monthly historical summary preserves years, zones and accumulated denominator',()=>{
 const monthly=[{year:2026,month:1,zona:'LIMA',total:2,en_fecha:1,fuera_fecha:1,historical:2},{year:2026,month:2,zona:'PROVINCIA',total:8,en_fecha:8,fuera_fecha:0,historical:8},{year:2025,month:1,zona:'LIMA',total:50,en_fecha:50,fuera_fecha:0}];
 assert.equal(monthlyTotals(monthly,2026,1).total,2);
 assert.equal(monthlyTotals(monthly,2026,2,'LIMA').total,0);
 const html=historicalSummaryHtml({monthly:monthly.slice(0,2),incidents:[],target:.96});
 assert.match(html,/90%/);assert.match(html,/75%/);assert.match(html,/-6 pp/);assert.match(html,/Promedio mensual/);assert.doesNotMatch(html,/NaN|Infinity/);
});
test('historical summary escapes incidents and leaves empty months without invented percentages',()=>{
 const html=historicalSummaryHtml({monthly:[{year:2026,month:1,zona:'LIMA',total:1,en_fecha:0,fuera_fecha:1}],incidents:[{year:2026,month:1,zona:'LIMA',responsable:'<img src=x>',motivo:'A & B',total:1}],target:null});
 assert.match(html,/&lt;img src=x&gt;/);assert.match(html,/A &amp; B/);assert.doesNotMatch(html,/<img src=x>|Meta TECNOFARMA/);assert.match(html,/—/);
 assert.match(historicalSummaryHtml({monthly:[]}),/No hay documentos/);
});
