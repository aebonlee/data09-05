// 실행: node test/logic.test.mjs   (의존성 없음)
// 기대값은 모두 손으로 계산해 적었습니다(주석에 계산식).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const Sample = require('../js/sample-data.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

console.log('값 읽기');
test('날짜 여러 표기', () => {
  assert.equal(L.toDateStr(L.parseDate('2026.8.5')), '2026-08-05');
  assert.equal(L.toDateStr(L.parseDate('20260805')), '2026-08-05');
  assert.equal(L.toDateStr(L.parseDate('2026/08/05 13:20')), '2026-08-05');
  assert.equal(L.toDateStr(L.parseDate('2026년 8월 5일')), '2026-08-05');
});
test('엑셀 일련번호 45658 = 2025-01-01', () => assert.equal(L.toDateStr(L.parseDate(45658)), '2025-01-01'));
test('없는 날짜는 null (2026-02-30)', () => assert.equal(L.parseDate('2026-02-30'), null));
test('숫자 표기', () => {
  assert.equal(L.toNumber('1,234'), 1234);
  assert.equal(L.toNumber('(12)'), -12);
  assert.equal(L.toNumber('-'), null);
  assert.equal(L.toNumber(''), null);
  assert.ok(Number.isNaN(L.toNumber('abc')));
});
test('일수: 2026-02-01 → 2026-08-31 = 211일', () => assert.equal(L.daysBetween(new Date(2026, 1, 1), new Date(2026, 7, 31)), 211));
test('전월 말일: 2026-03-15 → 2026-02-28', () => assert.equal(L.toDateStr(L.prevMonthEnd(new Date(2026, 2, 15))), '2026-02-28'));

console.log('경과 개월 (월 단위 Aging)');
const D = (y, m, d) => new Date(y, m - 1, d);
test('같은 날 0개월, 같은 달 안 0개월', () => {
  assert.equal(L.monthsBetween(D(2026, 8, 31), D(2026, 8, 31)), 0);
  assert.equal(L.monthsBetween(D(2026, 8, 1), D(2026, 8, 31)), 0);
});
test('일이 모자라면 한 달 덜 참: 03-15 → 04-14 = 0, 04-15 = 1', () => {
  assert.equal(L.monthsBetween(D(2026, 3, 15), D(2026, 4, 14)), 0);
  assert.equal(L.monthsBetween(D(2026, 3, 15), D(2026, 4, 15)), 1);
});
test('말일 처리: 01-31 → 02-28 = 1(말일), 02-27 = 0', () => {
  assert.equal(L.monthsBetween(D(2026, 1, 31), D(2026, 2, 28)), 1);
  assert.equal(L.monthsBetween(D(2026, 1, 31), D(2026, 2, 27)), 0);
  assert.equal(L.monthsBetween(D(2026, 5, 31), D(2026, 8, 31)), 3);
  assert.equal(L.monthsBetween(D(2026, 7, 31), D(2026, 9, 30)), 2);
});
test('윤년: 2024-01-31 → 2024-02-29 = 1, 2024-02-29 → 2025-02-28 = 12, 2024-02-29 → 2024-03-28 = 0', () => {
  assert.equal(L.monthsBetween(D(2024, 1, 31), D(2024, 2, 29)), 1);
  assert.equal(L.monthsBetween(D(2024, 2, 29), D(2025, 2, 28)), 12);
  assert.equal(L.monthsBetween(D(2024, 2, 29), D(2024, 3, 28)), 0);
  assert.equal(L.monthsBetween(D(2024, 2, 29), D(2024, 3, 29)), 1);
  assert.equal(L.isMonthEnd(D(2024, 2, 29)), true);
  assert.equal(L.isMonthEnd(D(2025, 2, 28)), true);
});
test('연도 넘김: 2025-11-15 → 2026-02-14 = 2, 2026-02-15 = 3, 2025-12-01 → 2026-08-31 = 8', () => {
  assert.equal(L.monthsBetween(D(2025, 11, 15), D(2026, 2, 14)), 2);
  assert.equal(L.monthsBetween(D(2025, 11, 15), D(2026, 2, 15)), 3);
  assert.equal(L.monthsBetween(D(2025, 12, 1), D(2026, 8, 31)), 8);
});
test('시작일이 기준일보다 뒤면 null', () => assert.equal(L.monthsBetween(D(2026, 9, 1), D(2026, 8, 31)), null));
test('파일 경과 개월 표기 읽기', () => {
  assert.equal(L.parseAgingMonths('12 개월초과'), 13);
  assert.equal(L.parseAgingMonths('12개월초과'), 13);
  assert.equal(L.parseAgingMonths('8개월'), 8);
  assert.equal(L.parseAgingMonths('4 개월'), 4);
  assert.equal(L.parseAgingMonths(0), 0);
  assert.equal(L.parseAgingMonths(''), null);
  assert.equal(L.parseAgingMonths(' '), null);
});

console.log('일 → 개월 설정 자동 변환');
test('예전 일 단위 설정 → 알림, 과잉 180일 → 6개월, 구간·불용 칸은 버리고 장기재고 기준 처음 값', () => {
  const r = L.migrateSettings({ agingBounds: '90, 180, 365', overDays: 180, deadDays: 365, topN: 7, curDate: '2026-08-31' }, L.defaultSettings());
  assert.equal(r.migrated, true);
  assert.equal(r.settings.overMonths, 6);
  assert.equal(r.settings.longRawMonths, 12); assert.equal(r.settings.longProdMonths, 6); assert.equal(r.settings.agingMaxMonths, 12);
  assert.equal(r.settings.overEnabled, '');
  assert.equal(r.settings.topN, 7); assert.equal(r.settings.curDate, '2026-08-31');
  assert.equal('agingBounds' in r.settings, false); assert.equal('deadMonths' in r.settings, false); assert.equal('agingMonths' in r.settings, false);
});
test('오전 판(개월 구간) 설정도 알림 한 번, 지금 판 설정은 그대로', () => {
  assert.equal(L.migrateSettings({ agingMonths: '3, 6, 12', overMonths: 6, deadMonths: 12 }, L.defaultSettings()).migrated, true);
  const r = L.migrateSettings({ longRawMonths: 24, overMonths: 9 }, L.defaultSettings());
  assert.equal(r.migrated, false); assert.equal(r.settings.longRawMonths, 24); assert.equal(r.settings.overMonths, 9);
});

console.log('컬럼 짝짓기');
test('예시 원자재 머리행 자동 짝', () => {
  const m = L.guessMapping(['자재코드', '자재명', '대분류', '현재고'], 'rawStock');
  assert.deepEqual(m, { code: '자재코드', name: '자재명', group: '대분류', qty: '현재고' });
});
test('저장해 둔 짝이 우선', () => {
  const m = L.guessMapping(['코드A', '분류B', '수량C', '재고수량'], 'rawStock', { code: '코드A', group: '분류B', qty: '수량C' });
  assert.equal(m.qty, '수량C');
  assert.equal(m.code, '코드A');
});
test('필수 누락 목록(원자재 대분류는 기준정보로 채울 수 있어 필수 아님)', () => assert.deepEqual(L.missingRequired({ code: 'x' }, 'rawStock'), ['재고수량']));
test('실데이터 형식 머리행: 금액·단가·경과 개월 칸, 「미입고」는 입고수량으로 잡지 않음', () => {
  const m = L.guessMapping(['품목코드', '품목명[규격]', '대분류', '미생산', '재고보유월수', '재고수량', '미입고', '가용수량', '입고단가', '금액(재고수량*입고단가)', '재고잔량분석'], 'rawStock');
  assert.equal(m.code, '품목코드'); assert.equal(m.qty, '재고수량'); assert.equal(m.amount, '금액(재고수량*입고단가)');
  assert.equal(m.price, '입고단가'); assert.equal(m.agingFile, '재고잔량분석'); assert.equal(m.inQty, undefined);
});
test('본사 7월 제품 형식: 수량 칸 「합계」는 이름이 똑같을 때만, 「합계금액」은 금액', () => {
  const m = L.guessMapping(['순번', '품목코드', '품목구분', '대분류', '품목명', '합계', '완제품단가', '반제품단가', '합계금액', '재고잔량', '고객사'], 'productStock');
  assert.equal(m.qty, '합계'); assert.equal(m.amount, '합계금액'); assert.equal(m.code, '품목코드'); assert.equal(m.name, '품목명');
  const m2 = L.guessMapping(['품목코드', '고객사', '합계금액'], 'productStock');
  assert.equal(m2.qty, undefined); assert.equal(m2.amount, '합계금액');
});
test('제품 금액은 「재고*완제품단가」', () => {
  const m = L.guessMapping(['품목코드', '대분류', '재고수량', '입고단가', '금액(재고수량*입고단가)', '완제품단가', '재고*완제품단가', '재고잔량', '고객사'], 'productStock');
  assert.equal(m.amount, '재고*완제품단가'); assert.equal(m.price, '완제품단가'); assert.equal(m.group, '고객사'); assert.equal(m.agingFile, '재고잔량');
});
test('한 시트에 7월·8월 칸: 당월 자리는 7월 칸을 피하고, 전월 자리는 8월 칸을 피함', () => {
  const hd = ['행 레이블', '7월재고수량', '8월재고수량', '고객사', '7월재고금액', '8월재고금액'];
  const cur = L.guessMapping(hd, 'productStock', null, { avoidMonth: 7 });
  const prev = L.guessMapping(hd, 'productStock', null, { avoidMonth: 8 });
  assert.equal(cur.qty, '8월재고수량'); assert.equal(cur.amount, '8월재고금액'); assert.equal(cur.code, '행 레이블');
  assert.equal(prev.qty, '7월재고수량'); assert.equal(prev.amount, '7월재고금액');
});
test('머리행 짐작: 1행 제목 → 2행', () => {
  const aoa = [['회사명 : 예시 / 2026/08/31  / 재고현황'], ['품목코드', '품목명[규격]', '대분류', '재고수량'], ['A', 'a', 'HSG', 1]];
  assert.equal(L.guessHeaderRow(aoa, 'rawStock'), 2);
  assert.equal(L.guessHeaderRow([['품목코드', '대분류', '수량'], ['A', 'HSG', 1]], 'rawStock'), 1);
  assert.equal(L.dateFromTitle(aoa), '2026-08-31');
});
test('시트 짐작: 달이 맞는 상세 시트 > 달 없는 요약 시트, 반제품은 제품 아님', () => {
  const names = ['총괄', '원자재', '반제품', '제품', '8월 원자재(본사)', '8월반제품(본사)', '7월+8월 제품', '8월제품'];
  assert.deepEqual(L.guessSheet(names, 'rawCur', 8), { name: '8월 원자재(본사)', sure: true });
  assert.equal(L.guessSheet(names, 'rawPrev', 7).sure, false); // 7월 원자재 시트가 없음 → 확신 없음
  assert.equal(L.guessSheet(names, 'prodCur', 8).name, '8월제품');
  assert.equal(L.guessSheet(['대구 8월 원자재', '대구 7월 원자재', '대구 7월 제품'], 'rawPrev', 7).name, '대구 7월 원자재');
});
test('머리행 2번째 줄 + 빈 행 건너뛰기 + 같은 이름 구분', () => {
  const t = L.tableToRows([['8월 재고현황'], ['품번', '수량', '수량'], ['A', 1, 2], ['', '', ''], ['B', 3, 4]], 2);
  assert.deepEqual(t.headers, ['품번', '수량', '수량 (2)']);
  assert.equal(t.rows.length, 2);
});
test('문제 행은 건너뛰고 이유를 센다 — 합계 줄·출력 일시 줄도 뺀다', () => {
  const rows = [{ c: 'A', g: '원료', q: '10' }, { c: '', g: '원료', q: '5' }, { c: 'B', g: '', q: 'abc' }, { c: 'C', g: '', q: '1,500' },
    { c: '합계', g: '', q: '1515' }, { c: '2026/09/12  오후 1:12:56', g: '', q: '1515' }];
  const r = L.applyMapping(rows, { code: 'c', group: 'g', qty: 'q' }, 'rawStock');
  assert.equal(r.records.length, 2);
  assert.equal(r.records[1].qty, 1500);
  assert.equal(r.records[1].group, '(분류 없음)');
  assert.deepEqual(r.problems.map(p => p.code + ':' + p.count).sort(), ['재고수량 숫자 아님:1', '출력 일시 줄(합계) 제외:1', '코드 빈칸:1', '합계·소계 행 제외:1']);
});

console.log('공장');
test('공장 이름 읽기 — 본사=인천, 중국은 제외 대상', () => {
  assert.equal(L.normalizePlant('본사'), '인천');
  assert.equal(L.normalizePlant('인천공장'), '인천');
  assert.equal(L.normalizePlant(' 대구공장 '), '대구');
  assert.equal(L.normalizePlant('중국 청도'), '중국');
  assert.equal(L.normalizePlant(''), '');
  assert.equal(L.plantFromFileName('8월재고분석(본사).xlsx'), '인천');
  assert.equal(L.plantFromFileName('8월재고분석현황(대구).xlsx'), '대구');
  assert.equal(L.plantFromFileName('재고현황.xlsx'), '');
});
test('파일 공장 지정 + 공장 칸 우선 + 중국 행 제외', () => {
  const r = L.assignPlant([{ code: 'A', plant: '' }, { code: 'B', plant: '대구' }, { code: 'C', plant: '중국' }], '인천');
  assert.deepEqual(r.records.map(x => x.code + ':' + x.plant), ['A:인천', 'B:대구']);
  assert.equal(r.excluded, 1);
});
test('공장 보기로 거르기 — 이력의 빈 공장은 공통', () => {
  const d = { rawCur: [{ code: 'A', plant: '인천' }, { code: 'B', plant: '대구' }], outbound: [{ code: 'A', plant: '' }, { code: 'B', plant: '대구' }] };
  const f = L.filterByPlant(d, '인천');
  assert.deepEqual(f.rawCur.map(x => x.code), ['A']);
  assert.deepEqual(f.outbound.map(x => x.code), ['A']);
  assert.equal(L.filterByPlant(d, ''), d);
});
test('예전 저장 형식(자리마다 파일 하나) → parts', () => {
  const m = L.migrateSlotData({ rawCur: { fileName: 'a.csv', records: [{ code: 'A' }] }, price: { parts: [{ fileName: 'p' }] } });
  assert.equal(m.rawCur.parts.length, 1); assert.equal(m.rawCur.parts[0].fileName, 'a.csv'); assert.equal(m.rawCur.parts[0].plant, '');
  assert.equal(m.price.parts[0].fileName, 'p');
});

console.log('대분류 묶음표');
test('코드 → 보고서 대분류, 품번 규칙이 먼저, 나머지는 기타', () => {
  const gm = L.parseGroupMap('HSG=하우징류\nsw=스위치\n# 주석\n품번:CI184-*=파크라케이블(CI184)');
  assert.equal(gm.errors.length, 0); assert.equal(gm.count, 3);
  assert.equal(L.mapGroup('HSG', 'X1', gm, 'other'), '하우징류');
  assert.equal(L.mapGroup('SW', 'X1', gm, 'other'), '스위치');
  assert.equal(L.mapGroup('기타', 'CI184-12001', gm, 'other'), '파크라케이블(CI184)');
  assert.equal(L.mapGroup('DIODE', 'X2', gm, 'other'), '기타');
  assert.equal(L.mapGroup('DIODE', 'X2', gm, 'keep'), 'DIODE');
  assert.equal(L.mapGroup('하우징류', 'X3', gm, 'other'), '하우징류');
  assert.equal(L.mapGroup('원료', 'X', L.parseGroupMap(''), 'other'), '원료'); // 묶음표가 비면 그대로
});
test('공장을 붙인 품번 규칙: 인천 품목만 파크라케이블(CI184)', () => {
  const gm = L.parseGroupMap(L.defaultSettings().groupMap);
  assert.equal(L.mapGroup('기타', 'CI184-12001', gm, 'other', ['인천']), '파크라케이블(CI184)');
  assert.equal(L.mapGroup('기타', 'CI184-12001', gm, 'other', ['대구']), '기타');
  assert.equal(L.mapGroup('CLIP', 'X', gm, 'other', ['대구']), '클립류');
  assert.equal(L.mapGroup('SWITCH', 'X', gm, 'other', ['대구']), '스위치');
});
test('묶음표 형식 오류', () => assert.equal(L.parseGroupMap('HSG 하우징류').errors.length, 1));

console.log('Aging 개월별 분포 · 판정(정상/장기재고)');
test('분포 칸: 0~12개월 한 칸씩, 13 이상은 「13개월 이상」, 최대 24면 25개월 이상', () => {
  assert.equal(L.bucketOf(0, 12), '0개월');
  assert.equal(L.bucketOf(12, 12), '12개월');
  assert.equal(L.bucketOf(13, 12), '13개월 이상');
  assert.equal(L.bucketOf(30, 12), '13개월 이상');
  assert.equal(L.bucketOf(null, 12), '날짜 없음');
  assert.equal(L.bucketOf(20, 24), '20개월');
  assert.equal(L.bucketLabels(12).length, 15); // 0~12(13칸) + 13개월 이상 + 날짜 없음
});
test('장기재고 경계: 원자재 12개월 「이상」(11 정상 / 12 장기), 제품 6개월(5 정상 / 6 장기)', () => {
  assert.equal(L.fitnessOf(11, 12, null), '정상');
  assert.equal(L.fitnessOf(12, 12, null), '장기재고');
  assert.equal(L.fitnessOf(13, 12, null), '장기재고');
  assert.equal(L.fitnessOf(5, 6, null), '정상');
  assert.equal(L.fitnessOf(6, 6, null), '장기재고');
  assert.equal(L.fitnessOf(null, 12, null), '판정 보류');
});
test('과잉은 켰을 때만: 과잉 6 → 7개월 과잉, 12개월은 장기재고', () => {
  assert.equal(L.fitnessOf(7, 12, 6), '과잉');
  assert.equal(L.fitnessOf(6, 12, 6), '정상');
  assert.equal(L.fitnessOf(12, 12, 6), '장기재고');
});
test('기준 검사: 장기재고 기준·최대 개월 범위', () => {
  const base = { ...L.defaultSettings(), curDate: '2026-08-31' };
  assert.equal(L.checkSettings(base).ok, true);
  assert.equal(L.checkSettings({ ...base, longRawMonths: 0 }).ok, false);
  assert.equal(L.checkSettings({ ...base, longProdMonths: 6.5 }).ok, false);
  assert.equal(L.checkSettings({ ...base, agingMaxMonths: 37 }).ok, false);
  assert.equal(L.checkSettings({ ...base, agingMaxMonths: 24, longRawMonths: 24 }).ok, true);
  assert.equal(L.checkSettings({ ...base, overEnabled: 'on', overMonths: -1 }).ok, false);
});
test('기준 검사: 당월 기준일 없으면 오류', () => assert.equal(L.checkSettings(L.defaultSettings()).ok, false));

console.log('단가 매칭');
test('적용일이 기준일 이전인 것 중 최근, 미래 적용일은 무시', () => {
  const prices = [{ code: 'A', price: 10, date: '2026-07-01' }, { code: 'A', price: 12, date: '2026-08-01' }, { code: 'A', price: 99, date: '2026-09-15' }, { code: 'B', price: 5, date: '' }];
  assert.deepEqual(L.priceMapAt(prices, new Date(2026, 6, 31)), { A: 10, B: 5 });
  assert.deepEqual(L.priceMapAt(prices, new Date(2026, 7, 31)), { A: 12, B: 5 });
});

// ── 손 계산 예제 ───────────────────────────────────────────
const data = {
  rawCur: [
    { code: 'A', name: '원료A', group: '원료', qty: 100 },
    { code: 'B', name: '원료B', group: '원료', qty: 50 },
    { code: 'C', name: '부자재C', group: '부자재', qty: 30 },
    { code: 'A', name: '원료A', group: '원료', qty: 20 } // 같은 품번 두 줄 → 120
  ],
  rawPrev: [
    { code: 'A', name: '원료A', group: '원료', qty: 100 },
    { code: 'B', name: '원료B', group: '원료', qty: 80 },
    { code: 'D', name: '부자재D', group: '부자재', qty: 40 }
  ],
  price: [
    { code: 'A', price: 10, date: '2026-07-01' }, { code: 'A', price: 12, date: '2026-08-01' }, { code: 'A', price: 99, date: '2026-09-15' },
    { code: 'B', price: 5, date: '' }, { code: 'D', price: 2, date: '2026-07-01' }
  ],
  inbound: [{ code: 'A', date: '2026-08-20', qty: 50 }, { code: 'B', date: '2026-03-01', qty: 10 }, { code: 'C', date: '2025-12-01', qty: 30 }],
  outbound: [
    { code: 'A', date: '2026-08-30', qty: 60 }, { code: 'A', date: '2026-07-15', qty: 10 },
    { code: 'B', date: '2026-02-01', qty: 5 }, { code: 'D', date: '2026-08-10', qty: 40 }
  ]
};
// 이 예제는 대분류가 원료·부자재라 묶음표를 비웁니다(적힌 그대로)
const settings = { ...L.defaultSettings(), curDate: '2026-08-31', topN: 1, turnoverMax: '0.5', groupMap: '' };
const res = L.analyze(data, settings);
const item = code => res.raw.items.find(i => i.code === code);

console.log('품목별 증감 (손 계산)');
test('분석 성공, 전월 기준일 비우면 2026-07-31', () => { assert.equal(res.ok, true); assert.equal(res.prevDate, '2026-07-31'); });
test('A: 수량 100→120, +20, +20%', () => {
  const a = item('A');
  assert.equal(a.prevQty, 100); assert.equal(a.curQty, 120); assert.equal(a.diffQty, 20); assert.equal(a.qtyRate, 0.2);
});
test('A: 금액 100×10=1000 → 120×12=1440, +440, +44%', () => {
  const a = item('A');
  assert.equal(a.prevAmt, 1000); assert.equal(a.curAmt, 1440); assert.equal(a.diffAmt, 440); assert.equal(a.amtRate, 0.44);
});
test('A: 출고 08-30·입고 08-20 → 같은 달이라 0개월(일수 1·11), 정상', () => {
  const a = item('A');
  assert.equal(a.agingOut, 0); assert.equal(a.agingIn, 0); assert.equal(a.agingShown, 0); assert.equal(a.agingBasis, '출고일');
  assert.equal(a.agingOutDays, 1); assert.equal(a.agingInDays, 11); assert.equal(a.bucket, '0개월');
  assert.equal(a.fitness, '정상');
});
test('A: 회전율 = 당월 출고 60 ÷ 평균재고 110 = 0.55 (7월 출고 10은 제외)', () => {
  assert.equal(item('A').outQty, 60); assert.equal(item('A').turnover, 0.55);
});
test('B: 출고 2026-02-01 → 6개월(표시), 입고 03-01 → 5개월, 원자재라 정상 / 과잉 5 를 켜면 과잉', () => {
  const b = item('B');
  assert.equal(b.agingOut, 6); assert.equal(b.agingIn, 5); assert.equal(b.agingShown, 6); assert.equal(b.agingShownDays, 211);
  assert.equal(b.bucket, '6개월'); assert.equal(b.fitness, '정상');
  assert.equal(L.analyze(data, { ...settings, overEnabled: 'on', overMonths: 5 }).raw.items.find(i => i.code === 'B').fitness, '과잉');
});
test('B: 적용일 없는 단가 5 → 400 → 250, 증감률 -37.5%', () => {
  const b = item('B');
  assert.equal(b.prevAmt, 400); assert.equal(b.curAmt, 250); assert.equal(b.qtyRate, -0.375);
});
test('C: 신규, 단가 없음, 출고 없음 → 입고일(2025-12-01) 대체 8개월 정상 / 기준 8 이면 장기재고', () => {
  const c = item('C');
  assert.equal(c.change, '신규'); assert.equal(c.qtyRate, null); assert.equal(c.curAmt, null); assert.equal(c.curAmtSource, '금액 없음');
  assert.equal(c.agingShown, 8); assert.equal(c.agingBasis, '입고일 대체'); assert.equal(c.bucket, '8개월'); assert.equal(c.fitness, '정상');
  assert.equal(L.analyze(data, { ...settings, longRawMonths: 8 }).raw.items.find(i => i.code === 'C').fitness, '장기재고');
});
test('D: 소멸, 전월 금액 40×2=80, 금액 증감 -80, 재고 없음', () => {
  const d = item('D');
  assert.equal(d.change, '소멸'); assert.equal(d.prevAmt, 80); assert.equal(d.diffAmt, -80); assert.equal(d.fitness, '재고 없음');
});
test('파일 경과 개월 칸: 출고 이력이 없으면 입고일보다 먼저 씀', () => {
  const r = L.analyze({ rawCur: [{ code: 'Z', group: 'g', qty: 1, agingFile: 13, agingFileText: '12 개월초과' }], inbound: [{ code: 'Z', date: '2026-08-01' }] }, settings);
  const z = r.raw.items[0];
  assert.equal(z.agingShown, 13); assert.equal(z.agingBasis, '파일 경과 개월'); assert.equal(z.fitness, '장기재고'); assert.equal(z.bucket, '13개월 이상');
});

console.log('대분류별 집계');
test('원료: 수량 180→170(-10), 금액 1400→1690(+290), 품목 수 2→2', () => {
  const g = res.raw.groups.rows.find(r => r.group === '원료');
  assert.equal(g.prevQty, 180); assert.equal(g.curQty, 170); assert.equal(g.diffQty, -10);
  assert.equal(g.prevAmt, 1400); assert.equal(g.curAmt, 1690); assert.equal(g.diffAmt, 290); assert.equal(g.itemCount, 2); assert.equal(g.prevItemCount, 2);
});
test('부자재: 금액 80→0, 금액 미산정 1건(C)', () => {
  const g = res.raw.groups.rows.find(r => r.group === '부자재');
  assert.equal(g.prevAmt, 80); assert.equal(g.curAmt, 0); assert.equal(g.noAmount, 1); assert.equal(g.itemCount, 1);
});
test('합계: 수량 220→200, 금액 1480→1690(+210)', () => {
  const t = res.raw.groups.total;
  assert.equal(t.prevQty, 220); assert.equal(t.curQty, 200); assert.equal(t.prevAmt, 1480); assert.equal(t.curAmt, 1690); assert.equal(t.diffAmt, 210);
});
test('개월별 분포: 0개월 1건(120·1440), 6개월 1건(B 50·250), 8개월 1건(C 30), 12개월 칸부터 장기재고', () => {
  const b = Object.fromEntries(res.raw.buckets.map(x => [x.bucket, x]));
  assert.deepEqual([b['0개월'].count, b['0개월'].qty, b['0개월'].amount], [1, 120, 1440]);
  assert.deepEqual([b['6개월'].count, b['6개월'].qty, b['6개월'].amount], [1, 50, 250]);
  assert.deepEqual([b['8개월'].count, b['8개월'].qty], [1, 30]);
  assert.equal(b['13개월 이상'].count, 0);
  assert.equal(b['11개월'].long, false); assert.equal(b['12개월'].long, true); assert.equal(b['13개월 이상'].long, true);
  assert.equal(res.raw.longMonths, 12);
});
test('제품 분포는 6개월 칸부터 장기재고, 최대 24개월로 늘리면 25개월 이상 칸', () => {
  const r = L.analyze({ prodCur: [{ code: 'P', group: 'c', qty: 1, agingFile: 6 }, { code: 'Q', group: 'c', qty: 1, agingFile: 5 }] }, { ...settings, agingMaxMonths: 24 });
  const b = Object.fromEntries(r.product.buckets.map(x => [x.bucket, x]));
  assert.equal(b['5개월'].long, false); assert.equal(b['6개월'].long, true); assert.ok(b['25개월 이상']);
  assert.deepEqual(r.product.items.map(i => i.code + ':' + i.fitness), ['P:장기재고', 'Q:정상']);
});
test('불용은 사람이 확정한 품목만 — 총괄 정상/불용 2단계', () => {
  const r = L.analyze(data, settings, { dead: { raw: { B: true } } });
  assert.equal(r.raw.items.find(i => i.code === 'B').deadConfirmed, true);
  const o = Object.fromEntries(r.raw.overall.map(x => [x.label, x]));
  assert.deepEqual([o['정상'].count, o['불용(확정)'].count, o['불용(확정)'].amount], [2, 1, 250]);
  assert.ok(r.targets.find(t => t.code === 'B').reasons.includes('불용 확정'));
  assert.equal(res.raw.overall[1].count, 0);
});

console.log('증감 원인 분해 (손 계산)');
test('A: 입고 50×10=+500, 출고 −60×10=−600, 단가 120×(12−10)=+240, 조정 (120−100−50+60)×10=+300', () => {
  const e = item('A').effects;
  assert.deepEqual([e.inflow, e.outflow, e.price, e.adjust, e.newItem, e.goneItem, e.noAmount], [500, -600, 240, 300, 0, 0, 0]);
  assert.equal(item('A').qtyEffect, 200); assert.equal(item('A').driver, '출고·사용');
  assert.equal(item('A').outQtyPrev, 10); assert.equal(item('A').inQtyPrev, 0);
});
test('B: 입출고 없음 → 조정 −30×5 = −150, D: 소멸 −80, C: 금액 미산정 0', () => {
  assert.equal(item('B').effects.adjust, -150); assert.equal(item('B').driver, '조정·기타 수량');
  assert.equal(item('D').effects.goneItem, -80); assert.equal(item('D').effectKind, 'gone');
  assert.equal(item('C').effectKind, 'noAmount');
});
test('원료 대분류: 입고 500 + 출고 −600 + 조정 150 + 단가 240 = 금액 증감 290, 기여 상위 A·B', () => {
  const g = res.raw.cause.rows.find(r => r.group === '원료');
  assert.deepEqual([g.effects.inflow, g.effects.outflow, g.effects.adjust, g.effects.price], [500, -600, 150, 240]);
  assert.equal(g.diffAmt, 290); assert.equal(g.qtyEffect, 50);
  assert.deepEqual(g.top.map(x => x.code), ['A', 'B']);
  assert.equal(L.causeSentence(g), '원료 금액 +290 (+20.7%) = 출고·사용 −600, 입고 +500, 단가 변동 +240, 조정·기타 +150');
});
test('합계: 요인의 합 = 금액 증감(210)', () => {
  const t = res.raw.cause.total;
  assert.equal(L.round(L.EFFECT_KEYS.reduce((a, k) => a + t.effects[k], 0), 2), t.diffAmt);
  assert.equal(t.diffAmt, 210); assert.equal(t.goneCount, 1); assert.equal(t.noAmountCount, 1);
});
test('단가만 바뀐 품목: 금액 증감 전부 단가 효과', () => {
  const it = L.decompose({ prevQty: 10, curQty: 10, prevAmt: 100, curAmt: 130, diffAmt: 30, inQty: null, outQty: null });
  assert.equal(it.effects.price, 30); assert.equal(it.effects.adjust, 0); assert.equal(it.driver, '단가 상승');
});
test('AI 프롬프트: 숫자·요인 포함, 품번·품명은 기본으로 가림', () => {
  const g = res.raw.cause.rows.find(r => r.group === '원료');
  const p = L.buildCausePrompt(g, { groupLabel: '대분류', curDate: '2026-08-31', prevDate: '2026-07-31' });
  assert.ok(p.includes('대분류 원료')); assert.ok(p.includes('단가 변동 +240')); assert.ok(p.includes('품목1 |'));
  assert.ok(!p.includes('원료A'));
  assert.ok(L.buildCausePrompt(g, { mask: false }).includes('A 원료A'));
});

console.log('관리대상 · 단가 미매칭');
test('관리대상: A 증가 1위, B·C 저회전 / 기준 8 이면 C 장기재고', () => {
  const t = Object.fromEntries(res.targets.map(x => [x.code, x.reasons.join(',')]));
  assert.deepEqual(t, { A: '금액 증가 상위 1위', B: '저회전', C: '저회전' });
  const r = L.analyze(data, { ...settings, longRawMonths: 8 });
  assert.equal(r.targets.find(x => x.code === 'C').reasons.join(','), '장기재고(Aging 8개월 이상),저회전');
});
test('저회전 기준을 비우면 저회전 사유 없음', () => {
  const r = L.analyze(data, { ...settings, turnoverMax: '' });
  assert.ok(r.targets.every(x => x.reasons.indexOf('저회전') < 0));
});
test('단가 미매칭: C 당월 1건', () => {
  assert.deepEqual(res.unmatched.map(u => u.code + ':' + u.months + ':' + u.note), ['C:당월:당월 금액 없음']);
});
test('출고 없는 품목 「판정 보류」 설정이면 C 는 날짜 없음', () => {
  const r = L.analyze(data, { ...settings, noOutPolicy: 'none' });
  const c = r.raw.items.find(i => i.code === 'C');
  assert.equal(c.agingShown, null); assert.equal(c.fitness, '판정 보류'); assert.equal(c.bucket, '날짜 없음');
});
test('파일 금액 우선(기본)이면 파일 금액, 단가표 우선이면 단가 × 수량', () => {
  const d = { rawCur: [{ code: 'A', group: 'g', qty: 10, amount: 777 }], price: [{ code: 'A', price: 1 }] };
  const r = L.analyze(d, settings);
  assert.equal(r.raw.items[0].curAmt, 777); assert.equal(r.raw.items[0].curAmtSource, '파일 금액');
  assert.equal(L.analyze(d, { ...settings, amountSource: 'price' }).raw.items[0].curAmt, 10);
});
test('파일에 금액 없이 단가 칸만 있으면 수량 × 단가', () => {
  const r = L.analyze({ rawCur: [{ code: 'A', group: 'g', qty: 4, price: 2.5 }] }, settings);
  assert.equal(r.raw.items[0].curAmt, 10);
});

console.log('공장별 보기');
const pdata = {
  rawCur: [{ code: 'A', group: 'g', qty: 10, amount: 100, plant: '인천' }, { code: 'A', group: 'g', qty: 5, amount: 50, plant: '대구' }],
  rawPrev: [{ code: 'A', group: 'g', qty: 8, amount: 80, plant: '인천' }, { code: 'A', group: 'g', qty: 5, amount: 50, plant: '대구' }]
};
test('합계 보기: 같은 품번은 두 공장을 더함(15, 금액 150), 공장 요약 2줄', () => {
  const r = L.analyze(pdata, settings);
  assert.equal(r.raw.items[0].curQty, 15); assert.equal(r.raw.groups.total.curAmt, 150);
  assert.deepEqual(r.plants.rows.map(x => x.label + ':' + x.raw.diffAmt), ['인천:20', '대구:0']);
  assert.equal(r.plants.total.raw.diffAmt, 20);
});
test('인천 보기: 인천 것만(10, 금액 증감 +20)', () => {
  const r = L.analyze(pdata, { ...settings, plantView: '인천' });
  assert.equal(r.raw.items[0].curQty, 10); assert.equal(r.raw.groups.total.diffAmt, 20); assert.equal(r.plantView, '인천');
});

console.log('엑셀 시트');
test('시트 12개, 표 시트는 머리행과 자료 행의 칸 수가 같다', () => {
  const sheets = L.buildSheets(res, settings, false, { raw: { '원료': { memo: '메모', ai: '해설' } } });
  assert.equal(Object.keys(sheets).length, 12);
  for (const [name, rows] of Object.entries(sheets)) {
    if (name === 'Aging_개월별' || name === '기준') continue;
    rows.slice(1).forEach(r => assert.equal(r.length, rows[0].length, name));
  }
  assert.equal(sheets['원자재_품목별'].length, 1 + 4);
  assert.equal(sheets['관리대상'].length, 1 + 3);
  const cause = sheets['원자재_증감원인'];
  const hd = cause[0];
  const won = cause.find(r => r[0] === '원료');
  assert.equal(won[hd.indexOf('원인 메모(담당자)')], '메모'); assert.equal(won[hd.indexOf('AI 해설')], '해설');
  cause.slice(1).forEach(r => assert.equal(r[hd.indexOf('검산(합 − 금액 증감)')], 0));
});

console.log('예시 데이터 (실데이터 열 구조를 흉내 낸 가상 값)');
test('예시 파일이 시트·머리행·짝·공장 짐작으로 모두 읽히고 분석된다', () => {
  const plan = Sample.build();
  const month = { rawCur: 8, prodCur: 8, rawPrev: 7, prodPrev: 7 };
  const out = {};
  for (const slot of L.SLOTS) {
    out[slot.id] = [];
    for (const part of plan[slot.id]) {
      if (month[slot.id]) assert.equal(L.guessSheet(part.names, slot.id, month[slot.id]).name, part.sheetName, slot.id);
      const r = L.importTable(part.aoa, slot.def, { plant: L.plantFromFileName(part.fileName), avoidMonth: month[slot.id] ? 15 - month[slot.id] : null });
      assert.deepEqual(r.missing, [], slot.id);
      assert.ok(r.problems.every(p => p.code === '합계·소계 행 제외'), slot.id + ' ' + JSON.stringify(r.problems));
      out[slot.id] = out[slot.id].concat(r.records);
    }
  }
  assert.ok(out.rawCur.every(x => x.plant === '인천' || x.plant === '대구'));
  const r = L.analyze(out, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV });
  assert.equal(r.ok, true);
  assert.equal(r.raw.items.length, 14);
  assert.equal(r.product.items.length, 8);
  assert.deepEqual(r.raw.groups.rows.map(g => g.group), ['하우징류', '씰류', '터미널류', '와이어류', '클립류', '스위치', '기타']);
  assert.deepEqual(r.unmatched.map(u => u.code), ['X-7002']);
  for (const g of r.raw.cause.rows.concat([r.raw.cause.total])) {
    assert.equal(L.round(L.EFFECT_KEYS.reduce((a, k) => a + g.effects[k], 0), 2), g.diffAmt, g.group);
  }
  assert.deepEqual(r.plants.rows.map(p => p.label), ['인천', '대구']);
});

console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과 (' + passed + '개)');
