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
  assert.equal(r.settings.longRawMonths, 12); assert.equal(r.settings.longProdMonths, 6); assert.equal(r.settings.agingMaxMonths, 36);
  assert.equal(r.settings.longRawOp, 'gt'); assert.equal(r.settings.longProdOp, 'ge'); assert.equal(r.round3, true);
  assert.equal(r.settings.overEnabled, '');
  assert.equal(r.settings.topN, 7); assert.equal(r.settings.curDate, '2026-08-31');
  assert.equal('agingBounds' in r.settings, false); assert.equal('deadMonths' in r.settings, false); assert.equal('agingMonths' in r.settings, false);
});
test('오전 판(개월 구간) 설정도 알림 한 번, 지금 판 설정은 그대로', () => {
  assert.equal(L.migrateSettings({ agingMonths: '3, 6, 12', overMonths: 6, deadMonths: 12 }, L.defaultSettings()).migrated, true);
  const r = L.migrateSettings({ longRawMonths: 24, overMonths: 9 }, L.defaultSettings());
  assert.equal(r.migrated, false); assert.equal(r.settings.longRawMonths, 24); assert.equal(r.settings.overMonths, 9);
});
test('3차: 2차 판 설정(분포 최대 12, 기준 방식 없음) → 분포 36·원자재 「초과」, 일부러 바꾼 최대(24)는 그대로, 3차 판 설정은 알림 없음', () => {
  const r = L.migrateSettings({ longRawMonths: 12, agingMaxMonths: 12, curDate: '2026-08-31' }, L.defaultSettings());
  assert.equal(r.round3, true); assert.equal(r.settings.agingMaxMonths, 36); assert.equal(r.settings.longRawOp, 'gt');
  assert.equal(L.migrateSettings({ agingMaxMonths: 24 }, L.defaultSettings()).settings.agingMaxMonths, 24);
  const now = L.migrateSettings({ ...L.defaultSettings(), agingMaxMonths: 12 }, L.defaultSettings());
  assert.equal(now.round3, false); assert.equal(now.settings.agingMaxMonths, 12);
  assert.equal(L.migrateSettings(null, L.defaultSettings()).round3, false);
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
  assert.equal(L.mapGroup('기타', 'CI184-X0001', gm, 'other'), '파크라케이블(CI184)');
  assert.equal(L.mapGroup('DIODE', 'X2', gm, 'other'), '기타');
  assert.equal(L.mapGroup('DIODE', 'X2', gm, 'keep'), 'DIODE');
  assert.equal(L.mapGroup('하우징류', 'X3', gm, 'other'), '하우징류');
  assert.equal(L.mapGroup('원료', 'X', L.parseGroupMap(''), 'other'), '원료'); // 묶음표가 비면 그대로
});
test('공장을 붙인 품번 규칙: 인천 품목만 파크라케이블(CI184)', () => {
  const gm = L.parseGroupMap(L.defaultSettings().groupMap);
  assert.equal(L.mapGroup('기타', 'CI184-X0001', gm, 'other', ['인천']), '파크라케이블(CI184)');
  assert.equal(L.mapGroup('기타', 'CI184-X0001', gm, 'other', ['대구']), '기타');
  assert.equal(L.mapGroup('CLIP', 'X', gm, 'other', ['대구']), '클립류');
  assert.equal(L.mapGroup('SWITCH', 'X', gm, 'other', ['대구']), '스위치');
});
test('묶음표 형식 오류', () => assert.equal(L.parseGroupMap('HSG 하우징류').errors.length, 1));

console.log('Aging 개월별 분포 · 판정(정상/장기재고)');
test('분포 칸(3차): 0~36개월 한 칸씩, 그 위는 「36개월 초과」, 처음 값 36', () => {
  assert.equal(L.defaultSettings().agingMaxMonths, 36);
  assert.equal(L.bucketOf(0, 36), '0개월');
  assert.equal(L.bucketOf(13, 36), '13개월');
  assert.equal(L.bucketOf(36, 36), '36개월');
  assert.equal(L.bucketOf(37, 36), '36개월 초과');
  assert.equal(L.bucketOf(80, 36), '36개월 초과');
  assert.equal(L.bucketOf(13, 12), '12개월 초과');
  assert.equal(L.bucketOf(null, 36), '날짜 없음');
  assert.equal(L.bucketLabels(36).length, 39); // 0~36(37칸) + 36개월 초과 + 날짜 없음
  assert.equal(L.bucketLabels(36)[37], '36개월 초과');
});
test('파일의 「12 개월초과」(정확한 개월 모름): 최대 36이면 「12개월 초과(개월 미상)」 칸, 최대 12면 「12개월 초과」', () => {
  assert.equal(L.isOpenAging('12 개월초과'), true); assert.equal(L.isOpenAging('12개월'), false); assert.equal(L.isOpenAging(13), false);
  assert.equal(L.bucketOf(13, 36, true), '12개월 초과(개월 미상)');
  assert.equal(L.bucketOf(13, 12, true), '12개월 초과');
  assert.equal(L.bucketOf(13, 36, false), '13개월');
});
test('장기재고 경계(3차): 원자재 12개월 「초과」 — 12 정상 / 13 장기재고, 반제품·제품 6개월 「이상」 — 5 정상 / 6 장기재고', () => {
  const d = L.defaultSettings();
  assert.equal(d.longRawOp, 'gt'); assert.equal(d.longProdOp, 'ge');
  assert.equal(L.fitnessOf(12, 12, null, 'gt'), '정상');
  assert.equal(L.fitnessOf(13, 12, null, 'gt'), '장기재고');
  assert.equal(L.fitnessOf(5, 6, null, 'ge'), '정상');
  assert.equal(L.fitnessOf(6, 6, null, 'ge'), '장기재고');
  assert.equal(L.longLabel(12, 'gt'), '12개월 초과'); assert.equal(L.longLabel(6, 'ge'), '6개월 이상');
  // 분석 전체에서도: 원자재 12개월 품목은 정상, 13개월은 장기재고 / 설정을 「이상」으로 바꾸면 12개월도 장기재고
  const d2 = { rawCur: [{ code: 'M12', group: 'g', qty: 1, amount: 10 }, { code: 'M13', group: 'g', qty: 1, amount: 20 }],
    outbound: [{ code: 'M12', date: '2025-08-31' }, { code: 'M13', date: '2025-07-31' }] };
  const base = { ...d, curDate: '2026-08-31', groupMap: '' };
  const fit = s => L.analyze(d2, s).raw.items.map(i => i.code + ':' + i.agingShown + ':' + i.fitness).join(',');
  assert.equal(fit(base), 'M12:12:정상,M13:13:장기재고');
  assert.equal(fit({ ...base, longRawOp: 'ge' }), 'M12:12:장기재고,M13:13:장기재고');
  const bk = Object.fromEntries(L.analyze(d2, base).raw.buckets.map(x => [x.bucket, x]));
  assert.equal(bk['12개월'].long, false); assert.equal(bk['13개월'].long, true);
  // 반제품·제품은 6개월 「이상」
  const p2 = { semiCur: [{ code: 'S6', group: 'c', qty: 1, agingFile: 6 }, { code: 'S5', group: 'c', qty: 1, agingFile: 5 }] };
  assert.equal(L.analyze(p2, base).semi.items.map(i => i.code + ':' + i.fitness).join(','), 'S6:장기재고,S5:정상');
});
test('장기재고 경계(예전 방식 ge 호출): op 없이 부르면 「이상」', () => {
  assert.equal(L.fitnessOf(11, 12, null), '정상');
  assert.equal(L.fitnessOf(12, 12, null), '장기재고');
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
  assert.equal(L.checkSettings({ ...base, reconTolerance: -1 }).ok, false);
  assert.equal(L.checkSettings({ ...base, plantAlias: '예시EO=대구' }).ok, true);
  assert.equal(L.checkSettings({ ...base, plantAlias: '예시EO=부산' }).ok, false);
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
test('C: 신규, 단가 없음, 출고 없음 → 입고일(2025-12-01) 대체 8개월 정상 / 기준 7 이면(8 > 7) 장기재고, 기준 8 이면 정상(초과)', () => {
  const c = item('C');
  assert.equal(c.change, '신규'); assert.equal(c.qtyRate, null); assert.equal(c.curAmt, null); assert.equal(c.curAmtSource, '금액 없음');
  assert.equal(c.agingShown, 8); assert.equal(c.agingBasis, '입고일 대체'); assert.equal(c.bucket, '8개월'); assert.equal(c.fitness, '정상');
  assert.equal(L.analyze(data, { ...settings, longRawMonths: 7 }).raw.items.find(i => i.code === 'C').fitness, '장기재고');
  assert.equal(L.analyze(data, { ...settings, longRawMonths: 8 }).raw.items.find(i => i.code === 'C').fitness, '정상');
});
test('D: 소멸, 전월 금액 40×2=80, 금액 증감 -80, 재고 없음', () => {
  const d = item('D');
  assert.equal(d.change, '소멸'); assert.equal(d.prevAmt, 80); assert.equal(d.diffAmt, -80); assert.equal(d.fitness, '재고 없음');
});
test('파일 경과 개월 칸: 출고 이력이 없으면 입고일보다 먼저 씀', () => {
  const d = { rawCur: [{ code: 'Z', group: 'g', qty: 1, agingFile: 13, agingFileOpen: true, agingFileText: '12 개월초과' }], inbound: [{ code: 'Z', date: '2026-08-01' }] };
  const z = L.analyze(d, settings).raw.items[0];
  assert.equal(z.agingShown, 13); assert.equal(z.agingBasis, '파일 경과 개월'); assert.equal(z.fitness, '장기재고'); assert.equal(z.bucket, '12개월 초과(개월 미상)');
  const bs = L.analyze(d, settings).raw.buckets;
  const ob = bs.find(b => b.open);
  assert.equal(ob.bucket, '12개월 초과(개월 미상)'); assert.equal(ob.long, true); assert.equal(ob.count, 1);
  assert.equal(bs[bs.indexOf(ob) - 1].bucket, '12개월'); // 12개월 칸 바로 뒤
  assert.equal(L.analyze(d, { ...settings, agingMaxMonths: 12 }).raw.items[0].bucket, '12개월 초과');
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
test('개월별 분포: 0개월 1건(120·1440), 6개월 1건(B 50·250), 8개월 1건(C 30), 원자재는 13개월 칸부터 장기재고(12개월 초과)', () => {
  const b = Object.fromEntries(res.raw.buckets.map(x => [x.bucket, x]));
  assert.deepEqual([b['0개월'].count, b['0개월'].qty, b['0개월'].amount], [1, 120, 1440]);
  assert.deepEqual([b['6개월'].count, b['6개월'].qty, b['6개월'].amount], [1, 50, 250]);
  assert.deepEqual([b['8개월'].count, b['8개월'].qty], [1, 30]);
  assert.equal(b['36개월 초과'].count, 0);
  assert.equal(b['12개월'].long, false); assert.equal(b['13개월'].long, true); assert.equal(b['36개월 초과'].long, true);
  assert.equal(res.raw.longMonths, 12);
});
test('제품 분포는 6개월 칸부터 장기재고, 최대 24개월이면 「24개월 초과」 칸', () => {
  const r = L.analyze({ prodCur: [{ code: 'P', group: 'c', qty: 1, agingFile: 6 }, { code: 'Q', group: 'c', qty: 1, agingFile: 5 }] }, { ...settings, agingMaxMonths: 24 });
  const b = Object.fromEntries(r.product.buckets.map(x => [x.bucket, x]));
  assert.equal(b['5개월'].long, false); assert.equal(b['6개월'].long, true); assert.ok(b['24개월 초과']);
  assert.deepEqual(r.product.items.map(i => i.code + ':' + i.fitness), ['P:장기재고', 'Q:정상']);
});
test('원자재 불용은 사람이 확정한 품목만(자동 기준 비움) — 총괄 정상/불용 2단계', () => {
  const r = L.analyze(data, settings, { dead: { raw: { B: true } } });
  assert.equal(r.raw.items.find(i => i.code === 'B').deadConfirmed, true);
  const o = Object.fromEntries(r.raw.overall.map(x => [x.label, x]));
  assert.deepEqual([o['정상'].count, o['불용'].count, o['불용'].amount, o['불용'].confirmedCount, o['불용'].autoCount], [2, 1, 250, 1, 0]);
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
  const r = L.analyze(data, { ...settings, longRawMonths: 7 });
  assert.equal(r.targets.find(x => x.code === 'C').reasons.join(','), '장기재고(Aging 7개월 초과),저회전');
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
test('시트 23개(10차 「입고_FIFO」·11차 「단가_비교」 더함) — 보고용 4개(총괄·원자재·반제품·제품)가 맨 앞, 백데이터 표 시트는 머리행과 자료 행의 칸 수가 같다', () => {
  const sheets = L.buildSheets(res, settings, false, { raw: { '원료': { memo: '메모', ai: '해설' } } });
  const names = Object.keys(sheets);
  assert.equal(names.length, 23);
  assert.deepEqual(names.slice(0, 4), ['총괄', '원자재', '반제품', '제품']);
  assert.deepEqual(L.REPORT_SHEETS, ['총괄', '원자재', '반제품', '제품']);
  for (const [name, rows] of Object.entries(sheets)) {
    if (L.REPORT_SHEETS.includes(name) || ['Aging_개월별', '기준', '대조_차이알람', '판매현황_파일', '입고_FIFO', '단가_비교'].includes(name)) continue;
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
test('보고용 「원자재」 시트: 구역 제목 → 재고현황(07월)·(08월) 머리행 → 수량·금액 → 대분류 줄(종수·메모) → 합계', () => {
  const sh = L.buildSheets(res, settings, false, { raw: { '원료': { memo: '메모' } } })['원자재'];
  assert.equal(sh[0][0], '공장 미지정 기준');
  assert.deepEqual(sh[1].slice(0, 6), ['구분', '대분류', '재고현황(07월)', '', '재고현황(08월)', '']);
  assert.deepEqual(sh[2].slice(2, 6), ['수량', '금액', '수량', '금액']);
  assert.equal(sh[3][0], '원자재');
  const won = sh.find(r => r[1] === '원료');
  assert.deepEqual(won.slice(1, 10), ['원료', 180, 1400, 170, 1690, -10, 290, '2종', '2종']);
  assert.equal(won[10], '메모');
  const tot = sh.find(r => r[1] === '합계');
  assert.deepEqual(tot.slice(2, 8), [220, 1480, 200, 1690, -20, 210]);
});
test('보고용 「총괄」 시트: 공장·구분(자재·반제품·제품)·정상/불용, 전월·당월·증감, 계 / 불용 확정이 불용 줄로', () => {
  const r = L.analyze(data, settings, { dead: { raw: { B: true } } });
  // 9차: 총괄은 백만원(소수 첫째 자리). 이 예제 금액(원)은 작아서 단가를 1,000,000배로 키운 사본으로 봅니다
  const big = { ...data, price: data.price.map(p => ({ ...p, price: p.price * 1e6 })) };
  const r2 = L.analyze(big, settings, { dead: { raw: { B: true } } });
  const sh = L.buildSheets(r2, settings, false, {})['총괄'];
  assert.ok(String(sh[0][0]).startsWith('단위: 백만원'));
  assert.deepEqual(sh[1], ['공장', '구분', '항목', '26년 07월 (백만원)', '26년 08월 (백만원)', '증감 (백만원)', '비고']);
  const i = sh.findIndex(x => x[0] === '합계');
  assert.deepEqual(sh[i].slice(0, 6), ['합계', '자재', '정상', 1080, 1440, 360]);   // A·C·D (C 금액 없음) — 1,080,000,000원 = 1,080백만원
  assert.deepEqual(sh[i + 1].slice(0, 6), ['', '', '불용', 400, 250, -150]);        // B
  assert.deepEqual(sh[i + 6].slice(0, 6), ['', '계', '', 1480, 1690, 210]);
  // 원 단위 예제는 백만원 소수 첫째 자리에서 0 — 원 단위 값은 「공장별_요약」 시트에 남습니다
  const small = L.buildSheets(r, settings, false, {});
  assert.deepEqual(small['총괄'][small['총괄'].findIndex(x => x[0] === '합계') + 6].slice(3, 6), [0, 0, 0]);
  assert.ok(small['공장별_요약'].some(x => x.includes(1690)));
  assert.ok(sh.some(x => String(x[0]).startsWith('보고서 대조 자료 없음')));
});
test('보고용 「제품」 시트: 고객사별 전월·당월 수량·금액 + 경과 개월 칸별 당월 수량 + 총 합계', () => {
  const d = { prodCur: [{ code: 'P1', group: '고객1', qty: 5, amount: 50, agingFile: 0 }, { code: 'P2', group: '고객1', qty: 3, amount: 30, agingFile: 40 }, { code: 'P3', group: '고객2', qty: 2, amount: 20 }],
    prodPrev: [{ code: 'P1', group: '고객1', qty: 4, amount: 40 }] };
  const r = L.analyze(d, { ...settings, noOutPolicy: 'none' });
  const sh = L.buildSheets(r, settings, false, {})['제품'];
  const h2 = sh[2];
  assert.deepEqual(h2.slice(0, 6), ['', '수량', '금액', '수량', '금액', '']);
  assert.equal(h2[6], '0개월'); assert.ok(h2.includes('36개월 초과')); assert.ok(h2.includes('날짜 없음')); assert.equal(h2[h2.length - 1], '총 합계');
  const g1 = sh.find(x => x[0] === '고객1');
  assert.deepEqual(g1.slice(0, 5), ['고객1', 4, 40, 8, 80]);
  assert.equal(g1[h2.indexOf('0개월')], 5); assert.equal(g1[h2.indexOf('36개월 초과')], 3); assert.equal(g1[g1.length - 1], 8);
  const t = sh.find(x => x[0] === '총합계');
  assert.equal(t[h2.indexOf('날짜 없음')], 2); assert.equal(t[t.length - 1], 10);
});

console.log('판매현황(출고) 여러 파일 — 최근 출고일');
// 실데이터 판매현황 파일 구조(값은 가상): 1행 제목(기간) · 2행 머리행 · 판매일자 「날짜 -순번」 · 계·총합계·출력 일시 줄
const salesAoa = [
  ['회사명 : 가상회사 / 2026/09/01  ~ 2026/09/30 '],
  ['주문일자', '프로젝트명', '판매일자', '대분류', '품목코드', '품목명(규격)', '수량', '단가', '공급가액', '거래처명'],
  ['2026/08/28 -1', '', '2026/09/02 -1', '완제품', 'P1', '제품1', 5, 10, 50, '고객'],
  ['2026/09/01 -2', '', '2026/09/15 -3', '완제품', 'P1', '제품1', 2, 10, 20, '고객'],
  ['2026/09/01 -2', '', '2026/09/10 -2', 'HSG', 'R1', '자재1', 7, 1, 7, '협력사'],
  ['2026/09  계', '', '', '', '', '', 14, '', 77],
  ['총합계', '', '', '', '', '', 14, '', 77],
  ['2026/09/29 (화) 오후 2:00:10']
];
const sf = L.scanSales(salesAoa.map(r => r.map(v => ({ v }))), { fileName: '판매현황(26.09).xlsx' });   // SheetJS 셀 {v} 도 읽음
test('머리행 2행, 판매일자·품목코드·수량 짝, 공장 칸 없음', () => {
  assert.equal(sf.headerRow, 2);
  assert.deepEqual([sf.mapping.code, sf.mapping.date, sf.mapping.qty, sf.mapping.plant || ''], ['품목코드', '판매일자', '수량', '']);
  assert.equal(sf.plantColumn, false); assert.deepEqual(sf.missing, []);
});
test('「날짜 -순번」 판매일자, 계·총합계·출력 일시 줄은 건너뜀, 품목별 달별 수량·마지막 날짜', () => {
  assert.equal(sf.used, 3);
  assert.deepEqual(sf.byCode, { P1: { '2026-09': [7, 15] }, R1: { '2026-09': [7, 10] } });   // [수량 합, 달 안 마지막 일]
  assert.deepEqual(sf.skipped, { '합계·소계 줄(품목코드 빈칸)': 2, '출력 일시 줄': 1 });
  assert.equal(sf.minDate, '2026-09-02'); assert.equal(sf.maxDate, '2026-09-15');
});
test('26.09 처럼 제목 기간(9/30)보다 출력 일시(9/29)가 앞이면 「월 중간분」', () => {
  assert.equal(sf.titleTo, '2026-09-30'); assert.equal(sf.stampDate, '2026-09-29'); assert.equal(sf.partial, true);
  const full = L.scanSales(salesAoa.map((r, i) => i === 7 ? ['2026/10/01 (목) 오전 9:00:00'] : r), {});
  assert.equal(full.partial, false);
});
test('달마다 열 순서·이름이 달라도 파일마다 짝을 따로 짐작하고, 달라진 열을 알려 줌', () => {
  const moved = salesAoa.map((r, i) => { if (i === 0) return r; const x = r.slice(); const q = x.splice(6, 1)[0]; x.splice(2, 0, q); return x; });
  moved[1][5] = '품번';   // 머리 「품목코드」 → 「품번」 (수량 칸을 앞으로 옮겨 품목코드는 6번째)
  moved[1].push('창고');
  const f2 = L.scanSales(moved, { fileName: 'b.xlsx' });
  assert.deepEqual([f2.mapping.code, f2.mapping.date, f2.mapping.qty], ['품번', '판매일자', '수량']);
  assert.deepEqual(f2.byCode, sf.byCode);
  const base = { ...sf, minDate: '2026-08-01' };
  const diff = L.salesHeaderDiff([f2, base]);
  assert.equal(diff.length, 1); assert.equal(diff[0].fileName, 'b.xlsx');
  assert.deepEqual(diff[0].missing, ['품목코드']); assert.deepEqual(diff[0].added, ['품번', '창고']);
  assert.deepEqual(diff[0].mappingChanged, ['code: 품목코드 → 품번']); assert.ok(diff[0].moved > 0);
  assert.deepEqual(L.salesHeaderDiff([sf, { ...sf, fileName: 'c' }]), []);
});
test('여러 파일 합치기: 최근 출고일은 기준일 이전만, 기간 수량은 (전월 말, 당월 말] 달', () => {
  const f1 = { byCode: { P1: { '2026-07': [3, '2026-07-20'], '2026-08': [4, '2026-08-05'] }, R1: { '2026-06': [1, '2026-06-30'] } }, minDate: '2026-06-01', maxDate: '2026-08-05' };
  const ix = L.salesIndex([f1, sf], new Date(2026, 7, 31), new Date(2026, 6, 31), new Date(2026, 5, 30));
  assert.deepEqual(ix.last, { P1: '2026-08-05', R1: '2026-06-30' });            // 9월 출고는 8월 말 기준일 뒤라 빠짐
  assert.deepEqual(ix.lastAny, { P1: '2026-09-15', R1: '2026-09-10' });
  assert.deepEqual(ix.qty, { P1: 4 }); assert.deepEqual(ix.qtyPrev, { P1: 3 });   // 6월(6/30)은 (6/30, 7/31] 밖
  assert.equal(ix.fileCount, 2); assert.equal(ix.codeCount, 2);
});
// 판매현황으로 Aging: 최근 출고일 경로(처음 값) / 예전 경로(재고잔량분석 칸 먼저) / 판매 없는 품목은 기존 규칙
const sd = {
  rawCur: [{ code: 'R1', group: 'HSG', qty: 10, amount: 100, agingFile: 2 }, { code: 'R2', group: 'HSG', qty: 5, amount: 50, agingFile: 13, agingFileOpen: true }],
  prodCur: [{ code: 'P1', group: '고객', qty: 3, amount: 30, agingFile: 1 }, { code: 'P9', group: '고객', qty: 1, amount: 9 }],
  sales: [{ fileName: 'a', byCode: { R1: { '2025-05': [1, '2025-05-10'] }, P1: { '2026-02': [2, '2026-02-28'] } }, minDate: '2025-05-10', maxDate: '2026-02-28' }]
};
const sset = { ...L.defaultSettings(), curDate: '2026-08-31', salesScope: 'all' };
test('최근 출고일 기준(처음 값): 판매 있는 품목은 판매일, 없는 품목은 재고잔량분석 칸 → 입고일 → 날짜 없음, 기준 표시', () => {
  const r = L.analyze(sd, sset);
  const it = c => r.raw.items.concat(r.product.items).find(i => i.code === c);
  assert.deepEqual([it('R1').agingShown, it('R1').agingBasis, it('R1').lastOutSource, it('R1').fitness], [15, '출고일', '판매현황', '장기재고']);
  assert.deepEqual([it('R2').agingShown, it('R2').agingBasis, it('R2').bucket], [13, '파일 경과 개월', '12개월 초과(개월 미상)']);
  assert.deepEqual([it('P1').agingShown, it('P1').agingBasis, it('P1').fitness], [6, '출고일', '장기재고']);
  assert.deepEqual([it('P9').agingShown, it('P9').agingBasis, it('P9').fitness], [null, '없음', '판정 보류']);
  // 다른 경로(재고잔량분석 칸 먼저)로 계산한 칸 — 기준 비교
  assert.deepEqual([it('R1').agingAlt, it('R1').agingAltBasis, it('R1').fitnessAlt], [2, '파일 경과 개월', '정상']);
  assert.equal(r.raw.bucketsAlt.find(b => b.bucket === '2개월').count, 1);
  assert.equal(r.raw.buckets.find(b => b.bucket === '15개월').count, 1);
  assert.equal(r.hasHistory.sales, true);
  assert.deepEqual(r.salesCoverage.raw, { stock: 2, withSale: 1, used: true, mode: 'all' });
  assert.deepEqual(r.salesCoverage.product, { stock: 2, withSale: 1, used: true, mode: 'all' });
});
test('판매현황 적용 대상 처음 값 = 반제품·제품만(원자재는 판매가 아니라 생산 투입이라)', () => {
  assert.equal(L.defaultSettings().salesScope, 'prod');
  const r = L.analyze(sd, { ...sset, salesScope: undefined });
  assert.deepEqual([r.raw.useSales, r.raw.items[0].agingBasis, r.product.useSales, r.product.items[0].agingBasis], [false, '파일 경과 개월', true, '출고일']);
});
test('예전 경로(재고잔량분석 칸 먼저)와 「반제품·제품만」 적용', () => {
  const r = L.analyze(sd, { ...sset, agingBasisRaw: 'file' });   // 10차: 예전 agingPath:'file' → 구분마다 agingBasis*
  assert.deepEqual([r.raw.items[0].agingShown, r.raw.items[0].agingBasis], [2, '파일 경과 개월']);
  assert.deepEqual([r.raw.items[0].agingAlt, r.raw.items[0].agingAltBasis], [15, '출고일']);
  const q = L.analyze(sd, { ...sset, salesScope: 'prod' });
  assert.deepEqual([q.raw.items[0].agingShown, q.raw.items[0].lastOut, q.raw.useSales], [2, '', false]);
  assert.equal(q.product.items[0].agingShown, 6);
});
test('판매현황 수량은 회전율·증감 원인의 출고로 들어감(당월 달만)', () => {
  const d = { prodCur: [{ code: 'P1', group: 'c', qty: 10, amount: 100 }], prodPrev: [{ code: 'P1', group: 'c', qty: 10, amount: 100 }],
    sales: [{ fileName: 'x', byCode: { P1: { '2026-08': [5, '2026-08-20'], '2026-07': [2, '2026-07-02'] } } }] };
  const it = L.analyze(d, sset).product.items[0];
  assert.deepEqual([it.outQty, it.outQtyPrev, it.turnover, it.effects.outflow, it.effects.adjust], [5, 2, 0.5, -50, 50]);
});

console.log('보고서 대조 · 차이 알람');
const repBook = {
  names: ['총괄', '원자재', '제품', '8월 원자재(본사)'],
  sheets: {
    '원자재': [
      ['본사기준'],
      ['구분', '대분류', '재고현황(07월)', '', '재고현황(08월)', '', '수량 증감', '금액 증감', '원인분석', '', '비고'],
      ['', '', ' 수량', '금액', ' 수량', '금액', '', '', '07월', '08월'],
      ['원자재', '원료', 180, 1400, 170, 1690, -10, 290, '2종', '2종'],
      ['', '부자재', 40, 80, 60, 0],
      ['', '합계', 220, 1480, 200, 2650, -20, 1170],
      ['메모 줄'],
      [],
      ['가상EO기준'],
      ['구분', '대분류', '재고현황(07월)', '', '재고현황(08월)', ''],
      ['', '', '수량', '금액', '수량', '금액'],
      ['원자재', '원료', 1, 1, 1, 1],
      ['', '합계', 1, 1, 1, 1]
    ],
    '제품': [
      ['본사기준'],
      ['구분', '26년 07월 재고현황', '', '26년 08월 재고현황', '', '', '재고잔량분석'],
      ['', '수량', '금액', '수량', '금액', '', '0 개월'],
      ['고객사X', 1, 1, 1, 1],
      ['총합계', 0, 0, 0, 0]
    ]
  }
};
const rep = L.parseReportBook(repBook, { fileName: '8월재고분석(본사).xlsx', filePlant: '인천' });
test('보고용 시트 읽기: 구역 제목(○○기준)·달 머리행(재고현황(07월) / 26년 07월 재고현황)·합계 줄, 합계 아래 줄은 무시', () => {
  assert.equal(rep.sections.length, 3);
  const [a, b, c] = rep.sections;
  assert.deepEqual([a.sheet, a.kind, a.name, a.months], ['원자재', 'raw', '본사', [7, 8]]);
  assert.deepEqual(a.rows.map(r => r.label + (r.total ? '*' : '')), ['원료', '부자재', '합계*']);
  assert.deepEqual(a.rows[2].v, { 7: { qty: 220, amt: 1480 }, 8: { qty: 200, amt: 2650 } });
  assert.deepEqual([b.name, c.kind, c.months], ['가상EO', 'product', [7, 8]]);
});
const pset = { ...settings, curDate: '2026-08-31' };
const pdat = { ...data, rawCur: data.rawCur.map(r => ({ ...r, plant: '인천' })), rawPrev: data.rawPrev.map(r => ({ ...r, plant: '인천' })) };
test('합계 줄 차이 = 알람(인천 원자재 8월 금액 1690 vs 2650 → −960), 대분류 줄 차이 = 참고, 모르는 구역은 알려 줌', () => {
  const r = L.analyze(pdat, pset);
  const rc = L.reconcile(r, [rep], L.checkSettings(pset), {});
  assert.equal(rc.hasReport, true);
  assert.deepEqual(rc.alarms.map(a => [a.plant, a.kind, a.label, a.month, a.field, a.report, a.tool, a.diff]),
    [['인천', 'raw', '합계', 8, '금액', 2650, 1690, -960]]);
  assert.ok(rc.infos.some(i => i.label === '부자재' && i.field === '수량' && i.diff === -30));
  assert.deepEqual(rc.unresolved, ['8월재고분석(본사).xlsx 「원자재」 가상EO']);
});
test('허용 차이(설정) 이하면 알람 없음, 「확인함」 표시한 차이는 알람에서 빠져 확인함으로', () => {
  const r = L.analyze(pdat, pset);
  assert.equal(L.reconcile(r, [rep], L.checkSettings({ ...pset, reconTolerance: 1000 }), {}).alarms.length, 0);
  const key = '2026-08-31|인천|raw|합계|8|금액';
  const rc = L.reconcile(r, [rep], L.checkSettings(pset), { [key]: true });
  assert.deepEqual([rc.alarms.length, rc.acked.length, rc.acked[0].key], [0, 1, key]);
});
test('공장 별칭(설정)으로 구역을 공장에 붙임 — 「가상EO=대구」', () => {
  const s2 = L.checkSettings({ ...pset, plantAlias: '가상EO=대구' });
  const r = L.analyze(pdat, { ...pset, plantAlias: '가상EO=대구' });
  const rc = L.reconcile(r, [rep], s2, {});
  assert.deepEqual(rc.unresolved, []);
});
test('analyze 가 대조 결과를 붙이고, 총괄 시트 아래와 「대조_차이알람」 시트에 나옴', () => {
  const r = L.analyze({ ...pdat, report: [rep] }, pset);
  assert.equal(r.recon.alarms.length, 1);
  const sh = L.buildSheets(r, pset, false, {});
  assert.ok(sh['총괄'].some(x => x[0] === '차이 1건'));
  assert.ok(sh['총괄'].some(x => x[0] === '인천' && x[2] === '합계' && x[7] === -960));
  assert.ok(sh['대조_차이알람'].some(x => x[9] === '차이'));
  assert.ok(sh['대조_차이알람'].some(x => String(x[9]).startsWith('참고')));
});

console.log('보고서 칸 단위 · 단위 차이 (2026-09-30 답변 「단위가 다릅니다」)');
test('단위 배수 읽기: ×10·10배·10 → 10, 천원 → 0.001, ÷1000 → 0.001, 원 → 1, 모르는 값 → null', () => {
  assert.deepEqual(['×10', '10배', '10', 'x100', '천원', '÷1000', '원', '백만원', '열배', ''].map(L.parseUnitFactor),
    [10, 10, 10, 100, 0.001, 0.001, 1, 0.000001, null, null]);
});
test('단위 설정 줄: 공장·구분·달·항목(빠지면 모두), 틀린 줄은 오류', () => {
  const u = L.parseReconUnits('대구 반제품 7월 금액=×10\n# 메모\n인천 * 금액=천원');
  assert.deepEqual(u.rules.map(r => [r.plant, r.kind, r.month, r.field, r.factor]), [['대구', 'semi', 7, '금액', 10], ['인천', '', null, '금액', 0.001]]);
  assert.equal(L.parseReconUnits('대구 반제품 금액').errors.length, 1);
  assert.equal(L.parseReconUnits('대구 반품 금액=×10').errors.length, 1);
  assert.equal(L.checkSettings({ ...settings, curDate: '2026-08-31', reconUnits: '대구 금액=열배' }).ok, false);
});
test('정확히 10의 거듭제곱 배만 단위 차이: 1000/100 → ×10, 1,235(천원)/1,234,567 → ÷1000, 1050/100·부호 다름·0 → 없음', () => {
  assert.equal(L.detectUnitFactor(1000, 100, 1), 10);
  assert.equal(L.detectUnitFactor(1235, 1234567, 1), 0.001);   // |1,235,000 − 1,234,567| = 433 ≤ 천원의 절반 500
  assert.equal(L.detectUnitFactor(1050, 100, 1), null);
  assert.equal(L.detectUnitFactor(-1000, 100, 1), null);
  assert.equal(L.detectUnitFactor(1000, 0, 1), null);
  assert.equal(L.factorLabel(10), '×10');
  assert.equal(L.factorLabel(0.001), '÷1,000(천원 단위)');
});
// 인천 원자재 8월 합계 금액: 도구 1690, 보고서를 16900(정확히 10배)으로 바꾼 사본
const repX10 = JSON.parse(JSON.stringify(rep));
repX10.sections[0].rows.find(r => r.total).v[8].amt = 16900;
const pset0 = { ...pset, reconUnits: '' };   // 칸 단위 설정을 비운 경우(9차 처음 값은 「총괄 금액=백만원 / * 금액=원」)
test('설정 없이도 정확히 10배 차이는 알람이 아니라 「단위 차이」(제안 설정 줄과 함께)', () => {
  const r = L.analyze(pdat, pset0);
  const rc = L.reconcile(r, [repX10], L.checkSettings(pset0), {});
  assert.equal(rc.alarms.length, 0);
  assert.deepEqual(rc.units.map(u => [u.plant, u.label, u.month, u.field, u.factor, u.unitSource, u.reportConv, u.suggest]),
    [['인천', '합계', 8, '금액', 10, 'auto', 1690, '인천 원자재 8월 금액=×10']]);
});
test('단위 설정 ×10 → 「단위 설정」으로 확정, ×100 이면 바꿔도 달라 알람, 「원」(배수 1)이면 자동 찾기 끄고 알람', () => {
  const r = L.analyze(pdat, pset);
  const on = L.reconcile(r, [repX10], L.checkSettings({ ...pset, reconUnits: '인천 원자재 8월 금액=×10' }), {});
  assert.deepEqual([on.alarms.length, on.units.length, on.units[0].unitSource], [0, 1, 'setting']);
  const wrong = L.reconcile(r, [repX10], L.checkSettings({ ...pset, reconUnits: '인천 원자재 8월 금액=×100' }), {});
  assert.deepEqual(wrong.alarms.map(a => [a.label, a.month, a.diff, a.note]), [['합계', 8, 1521, '단위 설정 ×100 적용 후에도 차이']]);   // 1690 − 16900/100
  const same = L.reconcile(r, [repX10], L.checkSettings({ ...pset, reconUnits: '인천 * 금액=원' }), {});
  assert.deepEqual([same.alarms.length, same.units.length, same.alarms[0].diff], [1, 0, -15210]);
});
test('단위 차이는 엑셀 「대조_차이알람」 시트와 총괄 아래에 「단위 차이」로 나옴', () => {
  const r = L.analyze({ ...pdat, report: [repX10] }, pset0);
  const sh = L.buildSheets(r, pset0, false, {});
  assert.ok(sh['대조_차이알람'].some(x => String(x[9]).startsWith('단위 차이')));
  assert.ok(sh['총괄'].some(x => x[0] === '차이 0건, 단위 차이 1건(알람 아님)'));
});

console.log('9차 답변 3 — 총괄현황 = 백만원, 나머지 시트 = 원');
test('처음 값 「총괄 금액=백만원 / * 금액=원」: 총괄 줄은 총괄 시트에만, 나머지 줄은 원자재·반제품·제품 시트에만', () => {
  const s = L.defaultSettings();
  assert.equal(s.reconUnits, '총괄 금액=백만원\n* 금액=원');
  const u = L.parseReconUnits(s.reconUnits);
  assert.deepEqual(u.errors, []);
  assert.deepEqual(u.rules.map(r => [r.sheet, r.plant, r.kind, r.field, r.factor]), [['summary', '', '', '금액', 0.000001], ['', '', '', '금액', 1]]);
  assert.deepEqual(L.parseReconUnits('총괄현황 대구 자재 7월 금액=천원').rules.map(r => [r.sheet, r.plant, r.kind, r.month, r.factor]), [['summary', '대구', 'raw', 7, 0.001]]);
});
test('백만원 ↔ 원 변환은 역수를 곱해 경계가 흔들리지 않음: 0.50169 백만원 = 501,690원, 반 단위 = 500,000원', () => {
  assert.equal(L.unitToTool(0.50169, 0.000001), 501690);
  assert.equal(L.halfUnit(0.000001), 500000);
  assert.equal(L.halfUnit(0.001), 500);
  assert.equal(L.detectUnitFactor(1.5, 1500000, 1), 0.000001);
  assert.equal(L.detectUnitFactor(2, 1500000, 1), 0.000001);          // 2백만원 − 150만원 = 50만원 = 반 단위 → 같음(경계 포함)
  assert.equal(L.detectUnitFactor(2, 1499999, 1), null);              // 500,001원 차이 → 단위 차이 아님
});
// 총괄 시트(가상): 공장 구역이 병합 셀처럼 첫 줄에만, 구분도 정상 줄에만. 인천·대구·「인천+대구 합계」·중국(제외) 구역, 금액은 백만원
const sumAoa = [
  ['총괄현황 (단위: 백만원)'],
  ['공장', '구분', '항목', '2026.06', '2026.07', '2026.08', '증감(08-07)'],
  ['인천', '자재', '정상', 9.9, 0.00108, 0.00144, 0],
  ['', '', '불용', 0, 0.0004, 0.00025, 0],          // 정상 + 불용: 7월 0.00148 백만원 = 1,480원, 8월 0.00169 = 1,690원(pdat 인천 원자재와 같음)
  ['', '반제품', '정상', 0, 0, 0, 0],
  ['', '제품', '정상', 1.5, 14.8, 30.2, 15.4],       // 소수 금액 칸(14.8)을 달 머리로 잘못 읽지 않음
  ['', '계', '', 11.4, 14.80148, 30.20325, 0],     // 「계」 줄은 읽지 않음
  ['대구'],                                         // 숫자 없는 구역 제목
  ['', '자재', '소계', 7, 7, 7, 0],                  // 구분 소계는 「계」로 보고 뺌(정상·불용 줄이 없으면 비교하지 않음)
  ['', '제품', '', 2, 3, 4, 1],                      // 정상/불용 없이 구분 줄만 = 그 구분 합계
  ['중국공장', '자재', '정상', 1, 1, 1, 0],          // 분석 제외 공장
  ['인천+대구 합계', '자재', '정상', 5, 5, 5, 0]
];
test('총괄 시트 읽기: 달 머리(2026.07)·병합 셀 이어 읽기·계 줄 제외·구분 줄·중국 제외·합계 구역', () => {
  const sec = L.parseSummarySheet(sumAoa, '총괄현황');
  assert.deepEqual(sec.months, [6, 7, 8]);
  assert.deepEqual(sec.rows.map(r => [r.plant, r.kindKey, r.v[7].amt, r.v[8].amt]), [
    ['인천', 'raw', 0.00148, 0.00169], ['인천', 'semi', 0, 0], ['인천', 'product', 14.8, 30.2],
    ['대구', 'product', 3, 4], ['(제외)', 'raw', 1, 1], ['합계', 'raw', 5, 5]]);
  // 통합문서 안 시트 이름 「총괄현황」·「총괄」 모두 총괄로 읽음
  assert.equal(L.parseReportBook({ names: ['총괄'], sheets: { '총괄': sumAoa } }).sections[0].kind, 'summary');
});
test('총괄 대조: 백만원 칸을 원으로 바꿔 맞댐 — 인천 자재 7·8월(1,480·1,690원) 같음, 반 단위(50만원) 경계, 설정 없으면 자동 「단위 차이」', () => {
  // 인천 원자재 도구 값: 7월 1,480원 · 8월 1,690원(pdat)
  const r = L.analyze(pdat, pset);
  const book = { names: ['총괄현황'], sheets: { '총괄현황': sumAoa.slice(0, 4) } };
  const rep9 = L.parseReportBook(book, { fileName: '8월재고분석(본사).xlsx', filePlant: '인천' });
  const rc = L.reconcile(r, [rep9], L.checkSettings(pset), {});
  assert.deepEqual([rc.alarms.length, rc.units.length, rc.unitsOk], [0, 0, 2]);
  // 8월 보고서를 0.50169 → 501,690 − 1,690 = 500,000(경계, 같음) / 0.501691 → 500,001(알람)
  const at = v => { const a = JSON.parse(JSON.stringify(sumAoa.slice(0, 4))); a[2][5] = v; a[3][5] = 0; return L.parseReportBook({ names: ['총괄현황'], sheets: { '총괄현황': a } }, { fileName: 'x', filePlant: '인천' }); };
  assert.equal(L.reconcile(r, [at(0.50169)], L.checkSettings(pset), {}).alarms.length, 0);
  const over = L.reconcile(r, [at(0.501691)], L.checkSettings(pset), {});
  assert.deepEqual(over.alarms.map(a => [a.plant, a.kindLabel, a.label, a.month, a.report, a.tool, a.diff, a.note]),
    [['인천', '원자재', '총괄', 8, 0.501691, 1690, -500001, '단위 설정 ÷1,000,000(백만원 단위) 적용 후에도 차이']]);
  // 칸 단위를 비우면: 백만원이 자동으로 단위 차이(÷1,000,000)로 분류되어 알람이 아님
  const auto = L.reconcile(r, [rep9], L.checkSettings(pset0), {});
  assert.deepEqual(auto.alarms, []);
  assert.deepEqual(auto.units.map(u => [u.label, u.month, u.factor, u.unitSource, u.suggest]), [['총괄', 7, 0.000001, 'auto', '총괄 인천 원자재 7월 금액=÷1000000'], ['총괄', 8, 0.000001, 'auto', '총괄 인천 원자재 8월 금액=÷1000000']]);
  // 제안 설정 줄을 그대로 적으면 읽힘(총괄 칸 설정)
  assert.deepEqual(L.parseReconUnits(auto.units[0].suggest).rules.map(x => [x.sheet, x.plant, x.kind, x.month, x.factor]), [['summary', '인천', 'raw', 7, 0.000001]]);
});
test('「* 금액=원」 은 총괄 칸에 적용되지 않음(총괄 줄이 없으면 총괄은 자동 찾기), 「총괄 금액=백만원」 은 원자재 시트에 적용되지 않음', () => {
  const r = L.analyze(pdat, pset);
  const book = { names: ['총괄현황'], sheets: { '총괄현황': sumAoa.slice(0, 4) } };
  const rep9 = L.parseReportBook(book, { fileName: 'x', filePlant: '인천' });
  const onlyWon = L.reconcile(r, [rep9], L.checkSettings({ ...pset, reconUnits: '* 금액=원' }), {});
  assert.deepEqual([onlyWon.alarms.length, onlyWon.units.length, onlyWon.units[0].unitSource], [0, 2, 'auto']);
  const onlySum = L.reconcile(r, [repX10], L.checkSettings({ ...pset, reconUnits: '총괄 금액=백만원' }), {});
  assert.deepEqual([onlySum.alarms.length, onlySum.units.length, onlySum.units[0].unitSource], [0, 1, 'auto']);   // 원자재 ×10 은 자동 단위 차이
});
test('원 단위로 확정한 칸의 정확히 10배 = 알람 + 「자릿수 입력 오류 의심」(처음 값)', () => {
  const r = L.analyze(pdat, pset);
  const rc = L.reconcile(r, [repX10], L.checkSettings(pset), {});
  assert.deepEqual(rc.alarms.map(a => [a.label, a.month, a.diff]), [['합계', 8, -15210]]);
  assert.equal(rc.alarms[0].note, '단위가 확정된 칸(설정 「* 금액=원」)인데 보고서 = 도구 ×10 — 자릿수 입력 오류 의심');
  assert.equal(rc.units.length, 0);
});
test('예전 설정: 칸 단위가 빈칸이면 새 처음 값으로(round9=set), 직접 적은 줄이 있으면 그대로(kept), 새 설정은 손대지 않음', () => {
  const d = L.defaultSettings();
  const a = L.migrateSettings({ curDate: '2026-08-31', longRawOp: 'gt', reconUnits: '' }, d);
  assert.deepEqual([a.settings.reconUnits, a.round9], [d.reconUnits, 'set']);
  const b = L.migrateSettings({ curDate: '2026-08-31', longRawOp: 'gt', reconUnits: '대구 반제품 7월 금액=×10' }, d);
  assert.deepEqual([b.settings.reconUnits, b.round9], ['대구 반제품 7월 금액=×10', 'kept']);
  const c = L.migrateSettings({ ...d, reconUnits: '' }, d);
  assert.deepEqual([c.settings.reconUnits, c.round9], ['', '']);
  assert.equal(L.migrateSettings({}, d).round9, '');
});
test('엑셀 총괄 시트 아래 대조 구역은 단위 안내와 함께 원 단위 차이를 그대로', () => {
  const r = L.analyze({ ...pdat, report: [rep] }, pset);
  const sh = L.buildSheets(r, pset, false, {})['총괄'];
  assert.ok(sh.some(x => /도구 값·차이는 원/.test(String(x[0]))));
  assert.ok(sh.some(x => x[0] === '인천' && x[2] === '합계' && x[7] === -960));
});

console.log('9차 답변 1 — 원자재 = 중국공장 판매(판매현황 거래처)');
test('중국공장 거래처 목록: 한 줄·쉼표, 「*」 는 아무 글자, 「*」 없으면 전체가 같아야(대소문자·띄어쓰기 무시)', () => {
  const r = L.parseChinaCustomers('가상 중국공장\n*(CN)*, C0012\n# 메모');
  assert.deepEqual(r.map(x => x.text), ['가상 중국공장', '*(CN)*', 'C0012']);
  assert.deepEqual(['가상중국공장', '가상 중국 공장', '가상중국공장2', '천진법인(cn)', 'c0012', 'C00123', ''].map(n => L.matchCustomer(r, n)),
    [true, true, false, true, true, false, false]);
  assert.equal(L.matchCustomer(L.parseChinaCustomers('a.b'), 'axb'), false);   // 점은 글자 그대로
});
// 가상 판매현황 한 파일: 원자재 R1 은 중국공장(2026-07-20)과 협력사(2026-08-25)에, 제품 P1 은 고객사에
const cnSheet = [
  ['회사명 : 가상 / 2026/07/01 ~ 2026/08/31'],
  ['판매일자', '품목코드', '수량', '거래처명'],
  ['2026/07/20 -1', 'R1', 5, '가상중국공장'],
  ['2026/08/25 -2', 'R1', 7, '가상협력사'],
  ['2026/08/10 -3', 'P1', 3, '가상고객사'],
  ['2026/07/05 -4', 'R2', 2, '가상중국공장']
];
const cnFile = L.scanSales(cnSheet, { fileName: 'cn.xlsx' });
const cnData = {
  rawCur: [{ code: 'R1', qty: 10, amount: 100, agingFile: 3 }, { code: 'R2', qty: 4, amount: 40, agingFile: 9 }, { code: 'R3', qty: 1, amount: 10, agingFile: 2 }],
  prodCur: [{ code: 'P1', group: '고객', qty: 3, amount: 30, agingFile: 5 }],
  sales: [cnFile]
};
const cnSet = { ...L.defaultSettings(), curDate: '2026-08-31', groupMap: '' };
test('판매현황 거래처 칸을 읽어 거래처별로 남김(거래처명 짝, 줄 수)', () => {
  assert.equal(cnFile.mapping.customer, '거래처명');
  assert.equal(cnFile.customerColumn, true);
  assert.deepEqual(cnFile.custRows, { '가상중국공장': 2, '가상협력사': 1, '가상고객사': 1 });
  assert.deepEqual(cnFile.byCust['가상중국공장'], { R1: { '2026-07': [5, 20] }, R2: { '2026-07': [2, 5] } });
  assert.deepEqual(L.salesCustomers([cnFile], L.parseChinaCustomers('가상중국공장')).map(c => [c.name, c.rows, c.hint, c.matched]),
    [['가상중국공장', 2, true, true], ['가상고객사', 1, false, false], ['가상협력사', 1, false, false]]);
});
test('처음 값(거래처 빈칸): 원자재는 판매현황을 쓰지 않음 — 재고잔량분석 칸', () => {
  const r = L.analyze(cnData, cnSet);
  assert.deepEqual([r.raw.salesMode, r.raw.useSales, r.raw.items[0].agingShown, r.raw.items[0].agingBasis, r.sales.china], ['', false, 3, '파일 경과 개월', null]);
  assert.equal(r.product.salesMode, 'all');
});
test('중국공장 거래처를 적으면: 원자재는 중국공장 판매의 최근 판매일(협력사 8/25 는 안 씀), 판매 없는 품목은 재고잔량분석 칸', () => {
  const r = L.analyze(cnData, { ...cnSet, chinaCustomers: '가상중국공장' });
  const it = c => r.raw.items.find(i => i.code === c);
  assert.equal(r.raw.salesMode, 'china');
  assert.deepEqual([it('R1').lastOut, it('R1').agingShown, it('R1').agingBasis, it('R1').outQty], ['2026-07-20', 1, '출고일', 0]);   // 8월 출고수량: 중국공장 8월 판매 0
  assert.deepEqual([it('R2').lastOut, it('R2').agingShown], ['2026-07-05', 1]);
  assert.deepEqual([it('R3').lastOut, it('R3').agingShown, it('R3').agingBasis], ['', 2, '파일 경과 개월']);
  assert.deepEqual(r.sales.china, { customers: ['가상중국공장'], rows: 2, codesAsOf: 2, filesNoCustomer: [] });
  // 제품은 그대로 전체 판매
  assert.deepEqual([r.product.salesMode, r.product.items[0].lastOut], ['all', '2026-08-10']);
  assert.deepEqual(r.salesCoverage.raw, { stock: 3, withSale: 2, used: true, mode: 'china' });
});
test('끄기(off)·적용 대상 「모두」·거래처 칸 없는 예전 파일', () => {
  const off = L.analyze(cnData, { ...cnSet, chinaCustomers: '가상중국공장', rawChinaSales: 'off' });
  assert.equal(off.raw.salesMode, '');
  const all = L.analyze(cnData, { ...cnSet, chinaCustomers: '가상중국공장', salesScope: 'all' });
  assert.deepEqual([all.raw.salesMode, all.raw.items[0].lastOut], ['all', '2026-08-25']);   // 모두 = 협력사 판매까지
  const oldFile = { fileName: 'old.xlsx', byCode: cnFile.byCode, minDate: cnFile.minDate, maxDate: cnFile.maxDate };
  const old = L.analyze({ ...cnData, sales: [oldFile] }, { ...cnSet, chinaCustomers: '가상중국공장' });
  assert.deepEqual([old.raw.salesMode, old.raw.items[0].lastOut, old.sales.china.filesNoCustomer], ['china', '', ['old.xlsx']]);
});
test('기준 시트에 중국공장 거래처·칸 단위가 적힘', () => {
  const st = { ...cnSet, chinaCustomers: '가상중국공장' };
  const r = L.analyze(cnData, st);
  const sh = L.buildSheets(r, st, false, {})['기준'];
  assert.ok(sh.some(x => x[0] === '중국공장 거래처(원자재 Aging)' && x[1] === '가상중국공장'));
  assert.ok(sh.some(x => x[0] === '판매현황 적용 대상' && /원자재\(중국공장 거래처 판매만\)/.test(x[1])));
  assert.ok(sh.some(x => x[0] === '보고서 칸 단위' && x[1] === '총괄 금액=백만원 / * 금액=원'));
});

console.log('판매현황 월 중간분 바꿔 넣기 (2026-09-30 답변 2)');
test('같은 이름 또는 같은 제목 기간이면 바꿔 넣고, 기간이 다르면 더함(25.08 반달 파일 둘은 따로)', () => {
  const f = (fileName, titleFrom, titleTo, partial) => ({ fileName, titleFrom, titleTo, partial });
  const old = [f('판매현황(26.09).xlsx', '2026-09-01', '2026-09-30', true), f('판매현황(25.08-1).xlsx', '2025-08-01', '2025-08-15'), f('예시.xlsx', '', '', false)];
  old[2].sample = true;
  const m = L.mergeSalesFiles(old, [f('판매현황(26.09)_마감.xlsx', '2026-09-01', '2026-09-30', false), f('판매현황(25.08-2).xlsx', '2025-08-16', '2025-08-31')]);
  assert.deepEqual(m.files.map(x => x.fileName), ['판매현황(25.08-1).xlsx', '판매현황(26.09)_마감.xlsx', '판매현황(25.08-2).xlsx']);
  assert.deepEqual(m.replaced, [{ from: '판매현황(26.09).xlsx', to: '판매현황(26.09)_마감.xlsx', fromPartial: true, toPartial: false }]);
});

console.log('예시 데이터 (실데이터 열 구조를 흉내 낸 가상 값)');
test('예시 파일이 시트·머리행·짝·공장 짐작으로 모두 읽히고 분석된다', () => {
  const plan = Sample.build();
  const month = { rawCur: 8, prodCur: 8, semiCur: 8, rawPrev: 7, prodPrev: 7, semiPrev: 7 };
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
  assert.equal(r.semi.items.length, 4);
  // 반제품 금액: 인천 「합계금액」, 대구 「재고*반제품단가」(완제품 단가 칸이 아님)
  assert.equal(r.semi.items.find(i => i.code === 'SF-101').curAmt, 150 * 9000);
  assert.equal(r.semi.items.find(i => i.code === 'SF-201').curAmt, 260 * 2500);
  // 판매현황 3개(가상) — 8월 파일은 「창고」 칸이 더 있어 열 차이로 잡힘
  const books = Sample.salesBooks();
  const sales = Object.entries(books).map(([fn, b]) => L.scanSales(b['판매현황내역'], { fileName: fn }));
  assert.ok(sales.every(f => !f.missing.length && f.headerRow === 2));
  assert.deepEqual(L.salesHeaderDiff(sales).map(d => d.fileName + ':' + d.added.join(',')), ['예시데이터_판매현황(26.08).xlsx:창고']);
  const r2 = L.analyze({ ...out, sales }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV });
  const fg501 = r2.product.items.find(i => i.code === 'FG-501');
  assert.deepEqual([fg501.lastOut, fg501.lastOutSource, fg501.agingShown], ['2026-08-29', '판매현황', 0]);
  assert.equal(r2.product.items.find(i => i.code === 'FG-503').agingShown, 8);   // 2025-12-10 → 8개월
  // 보고용 시트 대조: 인천 원자재 7월 합계 금액만 일부러 1,000원 다르게 적어 둠 → 알람 1건
  const wbs = Sample.workbooks();
  const reps = Sample.REPORT_FILES.map(fn => L.parseReportBook({ names: Object.keys(wbs[fn]), sheets: wbs[fn] }, { fileName: fn, filePlant: L.plantFromFileName(fn) }));
  const r3 = L.analyze({ ...out, report: reps }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV });
  // 대구 반제품 7월 금액은 일부러 10배 → 9차 처음 값(나머지 시트 = 원 단위 확정)에서는 단위 차이가 아니라 알람(자릿수 입력 오류 의심)
  // 10차: 대구 반제품 7월 금액은 수강생 답(「확인함」)으로 미리 확인함 — 알람에서 빠지고 「확인함」 목록에(체크를 풀면 다시 알람)
  assert.deepEqual(r3.recon.alarms.map(a => [a.plant, a.kindLabel, a.label, a.month, a.field, a.diff]), [['인천', '원자재', '합계', 7, '금액', -1000]]);
  assert.deepEqual(r3.recon.acked.map(a => [a.plant, a.kindLabel, a.label, a.month, a.field, a.diff, !!a.ackPreset]), [['대구', '반제품', '합계', 7, '금액', -6750000, true]]);
  assert.ok(/자릿수 입력 오류 의심/.test(r3.recon.acked[0].note));
  const r3u = L.analyze({ ...out, report: reps }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV }, { reconAck: { '2026-08-31|대구|semi|합계|7|금액': false } });
  assert.deepEqual(r3u.recon.alarms.map(a => [a.plant, a.kindLabel, a.month]), [['인천', '원자재', 7], ['대구', '반제품', 7]]);
  assert.deepEqual(r3.recon.unresolved, []);
  assert.deepEqual(r3.recon.units, []);
  // 총괄현황(백만원) 두 공장 × 자재·반제품·제품 × 7·8월 = 12칸, 단위를 맞추면 모두 같음
  assert.equal(r3.recon.unitsOk, 12);
  // 칸 단위 설정을 비우면 예전처럼: 대구 반제품 ×10 은 「단위 차이」, 총괄은 백만원(÷1,000,000)으로 자동 분류
  const r3b = L.analyze({ ...out, report: reps }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV, reconUnits: '' });
  assert.deepEqual(r3b.recon.alarms.map(a => [a.plant, a.kindLabel, a.month]), [['인천', '원자재', 7]]);
  assert.deepEqual(r3b.recon.units.filter(u => !u.summary).map(u => [u.plant, u.kindLabel, u.month, u.factor]), [['대구', '반제품', 7, 10]]);
  assert.ok(r3b.recon.units.filter(u => u.summary).every(u => u.factor === 0.000001 && u.unitSource === 'auto'));
  // 판매현황 예시의 거래처 — 「예시중국공장(가상)」에 적은 H-1003 은 중국공장 거래처를 적었을 때만 원자재 Aging 에 씀
  const cust = L.salesCustomers(sales, []);
  assert.deepEqual(cust.filter(c => c.hint).map(c => c.name), ['예시중국공장(가상)']);
  const r5 = L.analyze({ ...out, sales }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV, chinaCustomers: '예시중국공장(가상)' });
  const h3 = r5.raw.items.find(i => i.code === 'H-1003');
  assert.deepEqual([r5.raw.salesMode, h3.lastOut, h3.lastOutSource, h3.agingShown], ['china', '2026-07-08', '판매현황', 1]);
  assert.equal(r2.raw.items.find(i => i.code === 'H-1003').lastOutSource, '');   // 설정 전: 원자재에 판매현황 안 씀
});

console.log('10차 — 구매현황(입고) 여러 파일 · 입고 FIFO Aging');
// 예시 재고 자료(가상) — 앱의 자리별 읽기와 같은 흐름
function sampleOut() {
  const plan = Sample.build(), month = { rawCur: 8, prodCur: 8, semiCur: 8, rawPrev: 7, prodPrev: 7, semiPrev: 7 }, out = {};
  for (const slot of L.SLOTS) {
    out[slot.id] = [];
    for (const part of plan[slot.id]) out[slot.id] = out[slot.id].concat(L.importTable(part.aoa, slot.def, { plant: L.plantFromFileName(part.fileName), avoidMonth: month[slot.id] ? 15 - month[slot.id] : null }).records);
  }
  return out;
}
const AS = new Date(2026, 7, 31);
test('입고 FIFO — 딱 맞게 덮음: 26,000 = 8/18 12,000 + 8/2 14,000 → 가장 오래된 8/2, 0개월, 못 덮은 수량 0', () => {
  const f = L.fifoCover(26000, [['2026-08-18', 12000], ['2026-08-02', 14000], ['2026-02-11', 5000]], AS);
  assert.deepEqual(f.layers.map(x => [x.date, x.qty, x.months]), [['2026-08-18', 12000, 0], ['2026-08-02', 14000, 0]]);
  assert.deepEqual([f.covered, f.uncovered, f.oldest, f.months], [26000, 0, '2026-08-02', 0]);   // 2/11 입고는 쓰지 않음
});
test('입고 FIFO — 일부만 씀: 19,200 = 12,000 + 5,000 + 7/12 입고 6,000 중 2,200 → 1개월', () => {
  const f = L.fifoCover(19200, [['2026-08-20', 12000], ['2026-08-05', 5000], ['2026-07-12', 6000]], AS);
  assert.deepEqual(f.layers.map(x => x.qty), [12000, 5000, 2200]);
  assert.deepEqual([f.oldest, f.months, f.uncovered], ['2026-07-12', 1, 0]);
});
test('입고 FIFO — 현재고가 이력보다 많음: 25 중 10만 덮고 15 는 「이력 없음」', () => {
  const f = L.fifoCover(25, [['2026-08-30', 10]], AS);
  assert.deepEqual([f.covered, f.uncovered, f.oldest, f.months], [10, 15, '2026-08-30', 0]);
  const none = L.fifoCover(600, undefined, AS);
  assert.deepEqual([none.layers.length, none.covered, none.uncovered, none.oldest], [0, 0, 600, '']);
});
test('입고 FIFO — 기준일 뒤 입고는 건너뜀, 재고 0 이면 층 없음', () => {
  const f = L.fifoCover(50, [['2026-09-03', 999], ['2026-08-20', 100]], AS);
  assert.deepEqual(f.layers.map(x => x.date), ['2026-08-20']);
  assert.equal(L.fifoCover(0, [['2026-08-20', 100]], AS).layers.length, 0);
});
const rrow = (d, slip, code, q, p = 100, sup = 'V1', po = '') => [d, slip, code, q, p, sup, po, 0, 0];
test('겹친 기간 중복 제거 — 두 파일에 같은 줄은 한 번, 한 파일 안의 똑같은 두 줄은 둘 다', () => {
  const a = { fileName: 'a', rows: [rrow('2026-06-10', '1', 'S', 1000), rrow('2026-06-10', '1', 'S', 1000), rrow('2026-06-11', '1', 'T', 5)], groups: [''], notes: [''] };
  const b = { fileName: 'b', rows: [rrow('2026-06-10', '1', 'S', 1000), rrow('2026-06-10', '1', 'S', 1000), rrow('2026-07-01', '1', 'T', 7)], groups: [''], notes: [''] };
  const ri = L.receiptIndex([a, b], { asOf: AS });
  assert.deepEqual([ri.read, ri.kept, ri.overlap], [6, 4, 2]);
  assert.deepEqual(ri.byCode.S, [['2026-06-10', 1000, 100], ['2026-06-10', 1000, 100]]);
  // 수량이 다르면 다른 줄(겹침 아님)
  const c = { fileName: 'c', rows: [rrow('2026-06-10', '1', 'S', 999)], groups: [''], notes: [''] };
  assert.equal(L.receiptIndex([a, c]).kept, 4);
});
test('빈 달 찾기 — 첫 달 ~ (마지막 달·기준일 달 중 늦은 달) 사이 줄 0 인 달', () => {
  const f = { fileName: 'x', rows: [rrow('2026-01-05', '1', 'A', 1), rrow('2026-03-02', '1', 'A', 1)], groups: [''], notes: [''] };
  assert.deepEqual(L.receiptIndex([f], { asOf: new Date(2026, 4, 31) }).gaps, ['2026-02', '2026-04', '2026-05']);
  assert.deepEqual(L.receiptIndex([f], {}).gaps, ['2026-02']);
  assert.equal(L.receiptIndex([f]).histStart, '2026-01-01');
});
test('반품(음수)은 쌓지 않고 세기만, 적요 제외 규칙(「*」)', () => {
  const f = { fileName: 'x', rows: [rrow('2026-08-01', '1', 'A', 10), rrow('2026-08-02', '1', 'A', -3), [...rrow('2026-08-03', '1', 'A', 4)].map((v, i) => i === 8 ? 1 : v)], groups: [''], notes: ['', '예시수출(가상)'] };
  const ri = L.receiptIndex([f], { exclude: L.parseChinaCustomers('예시수출*') });
  assert.deepEqual([ri.negative, ri.excluded, ri.byCode.A], [1, 1, [['2026-08-01', 10, 100]]]);
});
test('구매현황 파일 읽기(가상 5개) — 19칸 머리행 짝, 전표 순번, 계·총합계·출력일 줄, 마감 전 파일', () => {
  const rb = Sample.receiptBooks();
  const fs = Object.entries(rb).map(([fn, b]) => L.scanReceipts(b['구매현황내역'], { fileName: fn }));
  assert.ok(fs.every(f => !f.missing.length && f.headerRow === 2));
  assert.deepEqual([fs[0].mapping.date, fs[0].mapping.code, fs[0].mapping.qty, fs[0].mapping.po, fs[0].mapping.note], ['입고일', '품목코드', '수량', '발주No.', '적요']);
  assert.deepEqual(fs[3].rows.find(r => r[2] === 'H-1001' && r[0] === '2026-08-20').slice(0, 4), ['2026-08-20', '1', 'H-1001', 12000]);
  assert.deepEqual(fs.map(f => f.partial), [false, false, false, false, true]);
  assert.deepEqual([fs[0].titleFrom, fs[0].titleTo, fs[0].skipped['출력 일시 줄']], ['2025-07-01', '2026-02-28', 1]);
  const ri = L.receiptIndex(fs, { asOf: AS });
  assert.deepEqual([ri.gaps, ri.overlap, ri.negative, ri.histStart], [['2026-03'], 2, 1, '2025-07-01']);
});
test('분석 — 원자재 Aging 기준 「입고 FIFO」: 품목별 개월·이력 없음 칸·장기재고, 회사 칸과 비교', () => {
  const rb = Sample.receiptBooks();
  const receipts = Object.entries(rb).map(([fn, b]) => L.scanReceipts(b['구매현황내역'], { fileName: fn }));
  const r = L.analyze({ ...sampleOut(), receipts }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV, agingBasisRaw: 'receipt' });
  const it = c => r.raw.items.find(i => i.code === c);
  assert.deepEqual([it('H-1001').agingShown, it('H-1001').agingBasis, it('H-1001').fifo.oldest], [1, '입고 FIFO', '2026-07-12']);   // 두 공장 합 19,200
  assert.deepEqual([it('H-1002').agingShown, it('H-1002').bucket], [4, '4개월']);
  // 이력 없음: 2025-07 이전 → 최소 14개월(2025-06-30 → 2026-08-31) 로 보고 「12개월 초과」 장기재고
  assert.deepEqual([it('H-1003').bucket, it('H-1003').agingShown, it('H-1003').agingShownOpen, it('H-1003').fitness, it('H-1003').fifo.uncovered], ['이력 없음(2025.07 이전)', 14, true, '장기재고', 200]);
  assert.deepEqual([it('SW-9001').bucket, it('D-8001').bucket], ['이력 없음(2025.07 이전)', '이력 없음(2025.07 이전)']);
  assert.deepEqual(r.raw.fifoStats, { stock: 13, full: 10, partial: 2, none: 1, uncoveredQty: 815, uncoveredAmt: 1976000 });
  assert.deepEqual([r.raw.fifoVsFile.same, r.raw.fifoVsFile.newer, r.raw.fifoVsFile.older], [10, 0, 3]);
  assert.deepEqual(r.raw.fifoVsFile.diffs.map(d => d.code).sort(), ['H-1001', 'H-1002', 'SW-9001']);
  const nh = r.raw.fifoBuckets.find(b => b.bucket === '이력 없음(2025.07 이전)');
  assert.deepEqual([nh.qty, nh.items, nh.long], [815, 3, true]);
  assert.equal(r.raw.buckets.find(b => b.bucket === '이력 없음(2025.07 이전)').count, 3);
  assert.equal(r.raw.basis, 'receipt');
  // 적요 제외: 8/15 T-3001 5,000(예시수출) 을 빼면 7/5 입고를 24,000 씀
  const r2 = L.analyze({ ...sampleOut(), receipts }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV, agingBasisRaw: 'receipt', receiptExclude: '예시수출*' });
  assert.deepEqual(r2.raw.items.find(i => i.code === 'T-3001').fifo.layers.map(x => x.qty), [20000, 60000, 24000]);
  // 처음 값(최근 출고일): 입고 FIFO 표는 참고로만 만들어지고 표시 기준은 바뀌지 않음
  const r3 = L.analyze({ ...sampleOut(), receipts }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV });
  assert.deepEqual([r3.raw.basis, r3.semi.basis, r3.product.basis, !!r3.raw.fifoBuckets], ['sale', 'sale', 'sale', true]);
  assert.ok(r3.raw.items.every(i => i.agingBasis !== '입고 FIFO'));
});
test('입고 FIFO 로 정했는데 구매현황이 없으면 최근 출고일 → 재고잔량분석 칸', () => {
  const r = L.analyze(sampleOut(), { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV, agingBasisRaw: 'receipt' });
  assert.equal(r.raw.items.find(i => i.code === 'C-5001').agingBasis, '파일 경과 개월');
  assert.ok(/구매현황이 없어/.test(r.raw.basisUsed));
  assert.equal(r.raw.fifoBuckets, null);
});
test('입고 이력 자리가 비면 구매현황이 입고 수량(증감 원인)으로', () => {
  const d = { rawCur: [{ code: 'A', group: 'HSG', qty: 10, amount: 100 }], rawPrev: [{ code: 'A', group: 'HSG', qty: 4, amount: 40 }],
    receipts: [{ fileName: 'x', rows: [rrow('2026-08-10', '1', 'A', 6), rrow('2026-07-10', '1', 'A', 2)], groups: [''], notes: [''] }] };
  const it = L.analyze(d, { ...L.defaultSettings(), curDate: '2026-08-31' }).raw.items[0];
  assert.deepEqual([it.inQty, it.inQtyPrev, it.lastIn], [6, 2, '2026-08-10']);
});
test('두 기준 개월 맞대기 — 열린 값(12개월 초과·이력 없음)은 범위로', () => {
  assert.equal(L.agingAgree(3, false, 3, false), 'same');
  assert.equal(L.agingAgree(2, false, 5, false), 'newer');
  assert.equal(L.agingAgree(14, true, 13, true), 'same');     // 이력 없음 ↔ 12개월 초과
  assert.equal(L.agingAgree(15, false, 13, true), 'same');    // 15개월 ↔ 12개월 초과
  assert.equal(L.agingAgree(10, false, 13, true), 'newer');
  assert.equal(L.agingAgree(14, true, 0, false), 'older');
  assert.equal(L.agingAgree(null, false, 3, false), 'onlyAlt');
});
test('총괄 시트(실데이터 구조) — 공장 칸의 회사 내부 이름은 윗 「합계」에 섞이지 않고, 「이름=제외」·해외 구역이 있으면 합계는 맞대지 않음', () => {
  const aoa = [['', '', '', '', '', '단위:백만원'], ['', '공장', '구분', '항목', '26년 07월', '26년 08월'],
    ['', '합계', '자재', '정상', 5, 6], ['', '', '', '불용', 0, 0], ['', '', '계', '', 5, 6],
    ['', '예시A', '자재', '정상', 2, 3], ['', '', '', '불용', 0, 0],
    ['', '예시해외', '자재', '정상', 3, 3], ['', '', '', '불용', 0, 0]];
  const sec = L.parseSummarySheet(aoa, '총괄');
  assert.deepEqual(sec.rows.map(r => [r.plant, r.kindKey, r.v[7].amt]), [['합계', 'raw', 5], ['예시A', 'raw', 2], ['예시해외', 'raw', 3]]);
  const d = { rawCur: [{ code: 'A', group: 'HSG', qty: 1, amount: 3000000, plant: '인천' }], rawPrev: [{ code: 'A', group: 'HSG', qty: 1, amount: 2000000, plant: '인천' }],
    report: [{ fileName: '예시.xlsx', filePlant: '', sections: [sec] }] };
  const set = { ...L.defaultSettings(), curDate: '2026-08-31' };
  const a = L.analyze(d, set).recon;       // 이름을 짝짓지 않으면: 이름 줄은 「공장을 정하지 못한 구역」, 합계는 참고
  assert.deepEqual([a.alarms.length, a.unitsOk, a.unresolved.length], [0, 0, 2]);
  assert.ok(a.infos.some(i => /밖 구역/.test(i.note)));
  const b = L.analyze(d, { ...set, plantAlias: '예시A=인천\n예시해외=제외' }).recon;
  assert.deepEqual([b.alarms.length, b.unitsOk, b.unresolved.length], [0, 2, 0]);   // 인천 7·8월 백만원 같음
  assert.equal(L.parsePlantAlias('예시해외=제외').map['예시해외'], '(제외)');
});
test('불용 자동 판정(10차 답 B) — 제품 6개월 이상: 5 정상 / 6·7 불용, 「불용 확정」은 언제나 불용, 원자재 12개월 초과, 반제품은 비움', () => {
  const d = {
    prodCur: [{ code: 'P5', group: 'c', qty: 1, amount: 10, agingFile: 5 }, { code: 'P6', group: 'c', qty: 1, amount: 20, agingFile: 6 }, { code: 'P7', group: 'c', qty: 1, amount: 40, agingFile: 7 }, { code: 'P2', group: 'c', qty: 1, amount: 80, agingFile: 2 }],
    rawCur: [{ code: 'R12', group: 'HSG', qty: 1, amount: 1, agingFile: 12 }, { code: 'R13', group: 'HSG', qty: 1, amount: 2, agingFile: 13, agingFileOpen: true }],
    semiCur: [{ code: 'S9', group: 'c', qty: 1, amount: 5, agingFile: 9 }]
  };
  const set = { ...L.defaultSettings(), curDate: '2026-08-31' };
  assert.deepEqual([set.deadProdMonths, set.deadProdOp, set.deadRawMonths, set.deadRawOp, set.deadSemiMonths, set.deadBasis], [6, 'ge', 12, 'gt', '', 'file']);
  const r = L.analyze(d, set, { dead: { product: { P2: true } } });
  const dead = k => r[k].items.filter(i => i.dead).map(i => i.code + (i.deadAuto ? '' : '(확정)')).sort();
  assert.deepEqual(dead('product'), ['P2(확정)', 'P6', 'P7']);
  assert.deepEqual(dead('raw'), ['R13']);
  assert.deepEqual(dead('semi'), []);
  const o = r.product.overall[1];
  assert.deepEqual([o.label, o.count, o.amount, o.autoCount, o.confirmedCount], ['불용', 3, 140, 2, 1]);
  assert.ok(r.targets.find(t => t.code === 'P6').reasons.includes('불용(Aging 자동)'));
  // 「초과」로 바꾸면 6 은 정상 · 개월을 비우면 확정만
  assert.deepEqual(L.analyze(d, { ...set, deadProdOp: 'gt' }).product.items.filter(i => i.deadAuto).map(i => i.code), ['P7']);
  assert.deepEqual(L.analyze(d, { ...set, deadProdMonths: '' }).product.items.filter(i => i.dead).map(i => i.code), []);
  assert.ok(L.checkSettings({ ...set, deadProdMonths: '육' }).errors.some(e => /제품 불용 기준/.test(e)));
});
test('불용 판정 개월 — 처음 값은 재고잔량분석 칸, 「표시 기준」으로 바꾸면 최근 출고일 개월', () => {
  const d = { prodCur: [{ code: 'P', group: 'c', qty: 1, amount: 10, agingFile: 8 }],
    sales: [{ fileName: 's', byCode: { P: { '2026-08': [1, '2026-08-20'] } } }] };
  const set = { ...L.defaultSettings(), curDate: '2026-08-31' };
  const a = L.analyze(d, set).product.items[0];
  assert.deepEqual([a.agingShown, a.agingBasis, a.deadAuto], [0, '출고일', true]);     // 표시는 판매일 0개월, 불용은 재고잔량분석 8개월 ≥ 6
  assert.equal(L.analyze(d, { ...set, deadBasis: 'shown' }).product.items[0].deadAuto, false);
});
test('설정 옮기기(10차) — 예전 「재고잔량분석 칸 먼저」는 세 구분 모두 file, 처음 값이던 사람은 그대로', () => {
  const d = L.defaultSettings();
  const a = L.migrateSettings({ agingPath: 'file', chinaCustomers: '', longRawOp: 'gt' }, d);
  assert.deepEqual([a.settings.agingBasisRaw, a.settings.agingBasisSemi, a.settings.agingBasisProd, a.round10], ['file', 'file', 'file', true]);
  const b = L.migrateSettings({ agingPath: 'out', chinaCustomers: '', longRawOp: 'gt' }, d);
  assert.deepEqual([b.settings.agingBasisRaw, b.settings.agingBasisSemi, b.round10], ['sale', 'sale', false]);
  assert.equal(L.migrateSettings({ agingBasisRaw: 'receipt', agingPath: 'file' }, d).settings.agingBasisRaw, 'receipt');
});

console.log('단가 기준 — 선입선출 역산 · 이동평균법 (11차)');
// 입고 목록은 receiptIndex().byCode 처럼 최근 순 [입고일, 수량, 단가]
const RX = [['2026-08-20', 100, 16], ['2026-08-01', 100, 10]];
test('이동평균: 100개@10 → 50개 출고 → 100개@16 = (50×10 + 100×16) ÷ 150 = 14', () => {
  const m = L.movingAverage({ receipts: RX, issues: [['2026-08-10', 50]], asOf: '2026-08-31' });
  assert.deepEqual([m.avg, m.qty, m.start, m.startDate, m.receipts, m.clamped], [14, 150, 'history', '2026-08-01', 2, 0]);
  // 출고가 없으면 (100×10 + 100×16) ÷ 200 = 13
  assert.equal(L.movingAverage({ receipts: RX, asOf: '2026-08-31' }).avg, 13);
  // 기준일(8/15) 뒤 입고는 보지 않음 → 10
  assert.equal(L.movingAverage({ receipts: RX, issues: [['2026-08-10', 50]], asOf: '2026-08-15' }).avg, 10);
});
test('선입선출 역산: 현재고 120 = 최근 100개×16 + 그 앞 20개×10 = 1,800 (단가 15)', () => {
  const f = L.fifoCover(120, RX, new Date(2026, 7, 31));
  assert.deepEqual(f.layers.map(x => [x.qty, x.price]), [[100, 16], [20, 10]]);
  const v = L.fifoValue(f, 999);
  assert.deepEqual([v.amount, v.unit, v.fallbackQty], [1800, 15, 0]);
  // 이력으로 다 못 덮은 30개는 파일 단가(12)로: 100×16 + 100×10 + 30×12 = 2,960
  const v2 = L.fifoValue(L.fifoCover(230, RX, new Date(2026, 7, 31)), 12);
  assert.deepEqual([v2.amount, v2.fallbackQty, v2.uncovered], [2960, 30, 30]);
  assert.equal(L.fifoValue(L.fifoCover(230, RX, new Date(2026, 7, 31)), null).amount, null);   // 파일 단가도 없으면 못 셈
});
test('이동평균: 전월 재고(50개·600원 → 12)에서 시작, 전월 기준일 이전 입고는 보지 않음 → (600 + 150×16) ÷ 200 = 15', () => {
  const m = L.movingAverage({ receipts: [['2026-08-10', 150, 16], ['2026-07-20', 999, 1]], opening: { date: '2026-07-31', qty: 50, amount: 600 }, asOf: '2026-08-31' });
  assert.deepEqual([m.avg, m.qty, m.start, m.startDate, m.receipts], [15, 200, 'prev', '2026-07-31', 1]);
  // 입고가 없으면 전월 평균 그대로
  assert.equal(L.movingAverage({ receipts: [], opening: { date: '2026-07-31', qty: 50, amount: 600 }, asOf: '2026-08-31' }).avg, 12);
});
test('이동평균: 출고가 재고보다 많으면 0 으로 맞추고 알림 — 10@5, 30 출고(20 모자람), 10@7 → 7', () => {
  const m = L.movingAverage({ receipts: [['2026-08-09', 10, 7], ['2026-08-01', 10, 5]], issues: [['2026-08-05', 30]], asOf: '2026-08-31' });
  assert.deepEqual([m.avg, m.qty, m.clamped, m.clampedQty], [7, 10, 1, 20]);
});
test('이동평균: 같은 날은 입고 먼저 — 100@10 입고·100 출고(8/1), 100@20(8/2) → 20', () => {
  const m = L.movingAverage({ receipts: [['2026-08-02', 100, 20], ['2026-08-01', 100, 10]], issues: [['2026-08-01', 100]], asOf: '2026-08-31' });
  assert.deepEqual([m.avg, m.qty, m.clamped], [20, 100, 0]);
});
test('단가 빈(0) 입고는 평균을 바꾸지 않음 — 수량만 더하고 셈, 평균이 없을 때는 수량도 넣지 않음', () => {
  const a = L.movingAverage({ receipts: [['2026-08-02', 100, null], ['2026-08-01', 100, 10]], asOf: '2026-08-31' });
  assert.deepEqual([a.avg, a.qty, a.noPrice], [10, 200, 1]);
  const b = L.movingAverage({ receipts: [['2026-08-02', 50, 12], ['2026-08-01', 100, 0]], asOf: '2026-08-31' });
  assert.deepEqual([b.avg, b.qty, b.noPrice], [12, 50, 1]);
  // 선입선출 역산: 단가 빈 층은 파일 단가로 — 50×12 + 70×(파일 11) = 1,370
  const v = L.fifoValue(L.fifoCover(120, [['2026-08-02', 50, 12], ['2026-08-01', 100, 0]], new Date(2026, 7, 31)), 11);
  assert.deepEqual([v.amount, v.noPriceQty], [1370, 70]);
});
test('분석 — 단가 기준 「이동평균」·「선입선출 역산」: 당월 금액·출처, 못 세는 품목은 현행 금액, 적요 제외 입고는 계속 빠짐', () => {
  // A: 전월 50개·500원(평균 10) → 8/5 100개@16 → 8/10 30개 출고 → 당월 120개(파일 1,200원)
  //    이동평균 = (500 + 1,600) ÷ 150 = 14 → 120 × 14 = 1,680
  //    선입선출 역산 = 100×16 + 20×(파일 단가 10) = 1,800
  // B: 구매 입고 없음 → 두 방법 모두 못 셈(파일 70원)
  const d = {
    rawCur: [{ code: 'A', group: 'HSG', qty: 120, amount: 1200 }, { code: 'B', group: 'HSG', qty: 10, amount: 70 }],
    rawPrev: [{ code: 'A', group: 'HSG', qty: 50, amount: 500 }, { code: 'B', group: 'HSG', qty: 10, amount: 70 }],
    outbound: [{ code: 'A', date: '2026-08-10', qty: 30 }],
    receipts: [{ fileName: 'x', rows: [rrow('2026-08-05', '1', 'A', 100, 16), [...rrow('2026-08-20', '1', 'A', 20, 100).slice(0, 8), 1]], groups: [''], notes: ['', '예시수출(가상)'] }]
  };
  const base = { ...L.defaultSettings(), curDate: '2026-08-31', prevDate: '2026-07-31', receiptExclude: '예시수출*' };
  const r0 = L.analyze(d, base);   // 처음 값 = 현행
  const a0 = r0.raw.items.find(i => i.code === 'A');
  assert.deepEqual([a0.curAmt, a0.curAmtSource, a0.pc.mavgUnit, a0.pc.mavgAmt, a0.pc.fifoAmt, a0.pc.fifoFallbackQty, a0.pc.mavgStart], [1200, '파일 금액', 14, 1680, 1800, 20, 'prev']);
  assert.deepEqual(r0.raw.priceCompare.total, { group: '합계', items: 2, qty: 130, file: 1270, fifo: 1870, mavg: 1750, fifoMissing: 1, mavgMissing: 1, fifoFallback: 1, fifoDiff: 600, mavgDiff: 480, mavgVsFifo: -120 });
  const rm = L.analyze(d, { ...base, amountBasis: 'mavg' });
  const am = rm.raw.items.find(i => i.code === 'A'), bm = rm.raw.items.find(i => i.code === 'B');
  assert.deepEqual([am.curAmt, am.curAmtSource, am.diffAmt], [1680, '이동평균', 1180]);
  assert.deepEqual([bm.curAmt, bm.curAmtSource], [70, '파일 금액 — 이동평균 계산 못 함']);
  assert.equal(rm.raw.groups.total.curAmt, 1750);
  const rf = L.analyze(d, { ...base, amountBasis: 'fifo' });
  assert.deepEqual([rf.raw.items[0].curAmt, rf.raw.items[0].curAmtSource, rf.raw.groups.total.curAmt], [1800, '선입선출 역산(일부 파일 단가)', 1870]);
  // 적요 제외를 지우면 8/20 20개@100 이 들어가 평균이 (120×14 + 2,000) ÷ 140 = 26.2857
  assert.equal(L.analyze(d, { ...base, receiptExclude: '' }).raw.items[0].pc.mavgUnit, 26.2857);
  // 구매현황이 없으면 비교표 없음, 기준을 바꿔도 현행 금액 + 까닭
  const rn = L.analyze({ ...d, receipts: [] }, { ...base, amountBasis: 'mavg' });
  assert.deepEqual([rn.raw.priceCompare, rn.raw.items[0].curAmt, rn.raw.items[0].curAmtSource], [null, 1200, '파일 금액 — 이동평균 계산 못 함(구매현황 없음)']);
  // 엑셀 「단가_비교」 시트
  const sh = L.buildSheets(r0, base, false, {})['단가_비교'];
  const hd = sh.find(x => x[0] === '구분' && x[1] === '품번');
  const rowA = sh.find(x => x[1] === 'A');
  assert.deepEqual([rowA[hd.indexOf('이동평균 금액')], rowA[hd.indexOf('선입선출 역산 금액')], rowA[hd.indexOf('차이(이동평균 − 파일)')]], [1680, 1800, 480]);
  assert.ok(sh.some(x => x[0] === '합계' && x[1] === '원자재' && x[6] === 1750));
  assert.equal(L.checkSettings({ ...base, amountBasis: '엉뚱' }).amountBasis, 'file');
});
test('이동평균 — 전월 재고 파일이 없으면 입고 이력 시작부터, 판매현황은 그 달 말일 출고로', () => {
  // 7/1 100@10, 7월 판매 60(7/31 로 봄), 8/1 100@16 → (40×10 + 100×16) ÷ 140 = 14.2857
  const d = { rawCur: [{ code: 'A', group: 'HSG', qty: 140, amount: 1400 }],
    sales: [{ fileName: 's', byCode: { A: { '2026-07': [60, '2026-07-15'] } } }],
    receipts: [{ fileName: 'x', rows: [rrow('2026-07-01', '1', 'A', 100, 10), rrow('2026-08-01', '1', 'A', 100, 16)], groups: [''], notes: [''] }] };
  const set = { ...L.defaultSettings(), curDate: '2026-08-31', salesScope: 'all' };
  const pc = L.analyze(d, set).raw.items[0].pc;
  assert.deepEqual([pc.mavgUnit, pc.mavgStart, pc.mavgStartLabel], [14.2857, 'history', '입고 이력 시작부터(2026-07-01)']);
  // 원자재에 판매현황을 쓰지 않으면(처음 값) 출고 없음 → 13
  assert.equal(L.analyze(d, { ...set, salesScope: 'prod' }).raw.items[0].pc.mavgUnit, 13);
});
test('예시 데이터 — 구매현황 5개로 원자재 단가 비교표가 만들어짐(W-4001 이동평균 102.623)', () => {
  const rb = Sample.receiptBooks();
  const receipts = Object.entries(rb).map(([fn, b]) => L.scanReceipts(b['구매현황내역'], { fileName: fn }));
  const r = L.analyze({ ...sampleOut(), receipts }, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV });
  const t = r.raw.priceCompare.total;
  assert.deepEqual([t.items, t.file], [13, r.raw.groups.total.curAmt]);
  assert.ok(t.fifoDiff !== 0 && t.mavgDiff !== 0);
  // W-4001: 전월 30,000개 × 95 → 8/1 22,000개@110 → 8/22 9,000개@110 (출고 자료 없음) = (2,850,000 + 3,410,000) ÷ 61,000 = 102.623
  assert.equal(r.raw.items.find(i => i.code === 'W-4001').pc.mavgUnit, 102.623);
});

console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과 (' + passed + '개)');
