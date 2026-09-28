// 예시 데이터 파일 생성: node scripts/make-samples.js
// js/sample-data.js(가상 데이터)를 samples/ 에 CSV 7개와 xlsx 1개(시트 7개)로 씁니다.
// 쓴 파일을 앱과 같은 방식으로 다시 읽어 원본과 같은지 확인합니다.
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const t = Sample.build();

function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
const wb = XLSX.utils.book_new();
const sheetName = { rawCur: '원자재_당월', rawPrev: '원자재_전월', prodCur: '제품_당월', prodPrev: '제품_전월', inbound: '입고이력', outbound: '출고이력', price: '단가표' };
for (const slot of L.SLOTS) {
  const aoa = t[slot.id];
  // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙입니다
  fs.writeFileSync(path.join(out, Sample.FILE_NAMES[slot.id]), '﻿' + aoa.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName[slot.id]);
}
const xlsxName = '예시데이터_재고분석_자료모음.xlsx';
fs.writeFileSync(path.join(out, xlsxName), XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));

// 검증: CSV 와 xlsx 를 다시 읽어 짝짓기·레코드가 원본과 같은지
function records(aoa, def) {
  const tbl = L.tableToRows(aoa, 1);
  return L.applyMapping(tbl.rows, L.guessMapping(tbl.headers, def), def).records;
}
const back = XLSX.read(fs.readFileSync(path.join(out, xlsxName)), { type: 'buffer' });
for (const slot of L.SLOTS) {
  const want = JSON.stringify(records(t[slot.id], slot.def));
  let text = fs.readFileSync(path.join(out, Sample.FILE_NAMES[slot.id]), 'utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const csv = XLSX.read(text, { type: 'string', raw: true });
  const fromCsv = XLSX.utils.sheet_to_json(csv.Sheets[csv.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const fromXlsx = XLSX.utils.sheet_to_json(back.Sheets[sheetName[slot.id]], { header: 1, raw: true, defval: '' });
  if (JSON.stringify(records(fromCsv, slot.def)) !== want) { console.error('CSV 왕복 불일치: ' + slot.id); process.exit(1); }
  if (JSON.stringify(records(fromXlsx, slot.def)) !== want) { console.error('xlsx 왕복 불일치: ' + slot.id); process.exit(1); }
}
console.log('samples/ 생성·왕복 확인 완료: CSV ' + L.SLOTS.length + '개, ' + xlsxName);
