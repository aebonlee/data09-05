// 예시 데이터 파일 생성: node scripts/make-samples.js
// js/sample-data.js(가상 데이터)를 samples/ 에 통합문서 3개(xlsx)와 이력 CSV 2개로 씁니다.
// 실데이터(인천 본사·대구 재고분석, 기준정보관리)의 열 구조만 흉내 낸 가상 값입니다.
// 쓴 파일을 앱과 같은 방식(시트 짐작·머리행 짐작·짝 짐작·공장 짐작)으로 다시 읽어 원본과 같은지 확인합니다.
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
// 예전 형식 예시 파일(자리별 CSV 7개 + 자료모음 xlsx)은 지웁니다
for (const f of fs.readdirSync(out)) if (/^예시데이터_/.test(f.normalize('NFC'))) fs.unlinkSync(path.join(out, f));

function csvCell(v) { const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
const wbs = Sample.workbooks();
for (const [name, sheets] of Object.entries(wbs)) {
  const wb = XLSX.utils.book_new();
  for (const [sn, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sn);
  fs.writeFileSync(path.join(out, name), XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}
// 판매현황(가상) 3개 — 실데이터 판매현황 파일과 같은 열 구조
const salesBooks = Sample.salesBooks();
for (const [name, sheets] of Object.entries(salesBooks)) {
  const wb = XLSX.utils.book_new();
  for (const [sn, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sn);
  fs.writeFileSync(path.join(out, name), XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}
// 구매현황(가상) 5개 — 실데이터 구매현황 파일과 같은 열 구조(10차)
const receiptBooks = Sample.receiptBooks();
for (const [name, sheets] of Object.entries(receiptBooks)) {
  const wb = XLSX.utils.book_new();
  for (const [sn, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sn);
  fs.writeFileSync(path.join(out, name), XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));
}
for (const [name, aoa] of Object.entries(Sample.histories())) {
  // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙입니다
  fs.writeFileSync(path.join(out, name), '﻿' + aoa.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

// 검증: 파일을 다시 읽어, 앱의 짐작 흐름으로 얻은 레코드가 원본 표에서 얻은 것과 같은지
function readBook(file) {
  const buf = fs.readFileSync(path.join(out, file));
  let wb;
  if (/\.csv$/.test(file)) { let t = buf.toString('utf8'); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); wb = XLSX.read(t, { type: 'string', raw: true }); }
  else wb = XLSX.read(buf, { type: 'buffer' });
  const sheets = {};
  wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });
  return { names: wb.SheetNames, sheets };
}
const plan = Sample.build();
const month = { rawCur: 8, semiCur: 8, prodCur: 8, rawPrev: 7, semiPrev: 7, prodPrev: 7 };
let n = 0;
for (const slot of L.SLOTS) {
  for (const part of plan[slot.id] || []) {
    const book = readBook(part.fileName);
    const sheet = month[slot.id] ? L.guessSheet(book.names, slot.id, month[slot.id]).name : book.names[0];
    if (month[slot.id] && sheet !== part.sheetName) { console.error('시트 짐작 불일치: ' + slot.id + ' ' + part.fileName + ' → ' + sheet); process.exit(1); }
    const opt = { plant: L.plantFromFileName(part.fileName), avoidMonth: month[slot.id] ? (month[slot.id] === 8 ? 7 : 8) : null };
    const a = L.importTable(book.sheets[sheet], slot.def, opt);
    const b = L.importTable(part.aoa, slot.def, opt);
    if (a.missing.length) { console.error('필수 칸 짝 없음: ' + slot.id + ' ' + part.fileName + ' ' + a.missing); process.exit(1); }
    if (JSON.stringify(a.records) !== JSON.stringify(b.records)) { console.error('왕복 불일치: ' + slot.id + ' ' + part.fileName); process.exit(1); }
    n++;
  }
}
// 판매현황: 앱과 같은 읽기(readSalesWorkbook — dense·필요한 칸만)로 다시 읽어 원본 표와 같은지
for (const [name, sheets] of Object.entries(salesBooks)) {
  const a = L.readSalesWorkbook(XLSX, new Uint8Array(fs.readFileSync(path.join(out, name))), name);
  const b = L.scanSales(sheets['판매현황내역'], { fileName: name });
  if (a.missing.length || JSON.stringify(a.byCode) !== JSON.stringify(b.byCode)) { console.error('판매현황 왕복 불일치: ' + name); process.exit(1); }
}
// 구매현황: 앱과 같은 읽기(readReceiptWorkbook)로 다시 읽어 원본 표와 같은지
for (const [name, sheets] of Object.entries(receiptBooks)) {
  const a = L.readReceiptWorkbook(XLSX, new Uint8Array(fs.readFileSync(path.join(out, name))), name);
  const b = L.scanReceipts(sheets['구매현황내역'], { fileName: name });
  if (a.missing.length || JSON.stringify(a.rows) !== JSON.stringify(b.rows)) { console.error('구매현황 왕복 불일치: ' + name); process.exit(1); }
}
// 보고용 시트: 다시 읽어도 같은 구역·값
for (const fn of Sample.REPORT_FILES) {
  const a = L.parseReportBook(readBook(fn), { fileName: fn });
  const b = L.parseReportBook({ names: Object.keys(wbs[fn]), sheets: wbs[fn] }, { fileName: fn });
  if (JSON.stringify(a.sections) !== JSON.stringify(b.sections)) { console.error('보고용 시트 왕복 불일치: ' + fn); process.exit(1); }
}
console.log('samples/ 생성·왕복 확인 완료: 통합문서 ' + Object.keys(wbs).length + '개, 판매현황 ' + Object.keys(salesBooks).length + '개, 구매현황 ' + Object.keys(receiptBooks).length + '개, CSV 2개, 자리별 파일 ' + n + '건');
