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
test('필수 누락 목록', () => assert.deepEqual(L.missingRequired({ code: 'x' }, 'rawStock'), ['대분류', '재고수량']));
test('머리행 2번째 줄 + 빈 행 건너뛰기 + 같은 이름 구분', () => {
  const t = L.tableToRows([['8월 재고현황'], ['품번', '수량', '수량'], ['A', 1, 2], ['', '', ''], ['B', 3, 4]], 2);
  assert.deepEqual(t.headers, ['품번', '수량', '수량 (2)']);
  assert.equal(t.rows.length, 2);
});
test('문제 행은 건너뛰고 이유를 센다', () => {
  const rows = [{ c: 'A', g: '원료', q: '10' }, { c: '', g: '원료', q: '5' }, { c: 'B', g: '', q: 'abc' }, { c: 'C', g: '', q: '1,500' }];
  const r = L.applyMapping(rows, { code: 'c', group: 'g', qty: 'q' }, 'rawStock');
  assert.equal(r.records.length, 2);
  assert.equal(r.records[1].qty, 1500);
  assert.equal(r.records[1].group, '(분류 없음)');
  assert.deepEqual(r.problems.map(p => p.code + ':' + p.count).sort(), ['재고수량 숫자 아님:1', '코드 빈칸:1']);
});

console.log('Aging 구간 · 적정성');
test('구간 경계 90·180·365', () => {
  const b = L.parseBounds('365, 90 180');
  assert.deepEqual(b, [90, 180, 365]);
  assert.equal(L.bucketOf(90, b), '0~90일');
  assert.equal(L.bucketOf(91, b), '91~180일');
  assert.equal(L.bucketOf(365, b), '181~365일');
  assert.equal(L.bucketOf(366, b), '365일 초과');
  assert.equal(L.bucketOf(null, b), '날짜 없음');
});
test('적정성: 180 적정 / 181 과잉 / 366 불용', () => {
  assert.equal(L.fitnessOf(180, 180, 365), '적정');
  assert.equal(L.fitnessOf(181, 180, 365), '과잉');
  assert.equal(L.fitnessOf(366, 180, 365), '불용');
  assert.equal(L.fitnessOf(null, 180, 365), '판정 보류');
});
test('기준 검사: 불용 < 과잉 이면 오류', () => {
  const s = { ...L.defaultSettings(), curDate: '2026-08-31', overDays: 400, deadDays: 365 };
  assert.equal(L.checkSettings(s).ok, false);
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
const settings = { ...L.defaultSettings(), curDate: '2026-08-31', topN: 1, turnoverMax: '0.5' };
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
test('A: Aging 출고일 08-30 → 1일, 입고일 08-20 → 11일, 적정', () => {
  const a = item('A');
  assert.equal(a.agingOut, 1); assert.equal(a.agingIn, 11); assert.equal(a.agingShown, 1); assert.equal(a.agingBasis, '출고일');
  assert.equal(a.fitness, '적정');
});
test('A: 회전율 = 당월 출고 60 ÷ 평균재고 110 = 0.55 (7월 출고 10은 제외)', () => {
  assert.equal(item('A').outQty, 60); assert.equal(item('A').turnover, 0.55);
});
test('B: 출고일 02-01 → 211일(표시), 입고일 03-01 → 183일, 과잉', () => {
  const b = item('B');
  assert.equal(b.agingOut, 211); assert.equal(b.agingIn, 183); assert.equal(b.agingShown, 211);
  assert.equal(b.bucket, '181~365일'); assert.equal(b.fitness, '과잉');
});
test('B: 적용일 없는 단가 5 → 400 → 250, 증감률 -37.5%', () => {
  const b = item('B');
  assert.equal(b.prevAmt, 400); assert.equal(b.curAmt, 250); assert.equal(b.qtyRate, -0.375);
});
test('C: 신규, 단가 없음, 출고 없음 → 입고일(2025-12-01) 대체 273일 과잉', () => {
  const c = item('C');
  assert.equal(c.change, '신규'); assert.equal(c.qtyRate, null); assert.equal(c.curAmt, null); assert.equal(c.curAmtSource, '금액 없음');
  assert.equal(c.agingShown, 273); assert.equal(c.agingBasis, '입고일 대체'); assert.equal(c.fitness, '과잉');
});
test('D: 소멸, 전월 금액 40×2=80, 금액 증감 -80, 재고 없음', () => {
  const d = item('D');
  assert.equal(d.change, '소멸'); assert.equal(d.prevAmt, 80); assert.equal(d.diffAmt, -80); assert.equal(d.fitness, '재고 없음');
});

console.log('대분류별 집계');
test('원료: 수량 180→170(-10), 금액 1400→1690(+290)', () => {
  const g = res.raw.groups.rows.find(r => r.group === '원료');
  assert.equal(g.prevQty, 180); assert.equal(g.curQty, 170); assert.equal(g.diffQty, -10);
  assert.equal(g.prevAmt, 1400); assert.equal(g.curAmt, 1690); assert.equal(g.diffAmt, 290); assert.equal(g.itemCount, 2);
});
test('부자재: 금액 80→0, 금액 미산정 1건(C)', () => {
  const g = res.raw.groups.rows.find(r => r.group === '부자재');
  assert.equal(g.prevAmt, 80); assert.equal(g.curAmt, 0); assert.equal(g.noAmount, 1); assert.equal(g.itemCount, 1);
});
test('합계: 수량 220→200, 금액 1480→1690(+210)', () => {
  const t = res.raw.groups.total;
  assert.equal(t.prevQty, 220); assert.equal(t.curQty, 200); assert.equal(t.prevAmt, 1480); assert.equal(t.curAmt, 1690); assert.equal(t.diffAmt, 210);
});
test('Aging 구간 집계: 0~90일 1건(120·1440), 181~365일 2건(80·250)', () => {
  const b = Object.fromEntries(res.raw.buckets.map(x => [x.bucket, x]));
  assert.deepEqual([b['0~90일'].count, b['0~90일'].qty, b['0~90일'].amount], [1, 120, 1440]);
  assert.deepEqual([b['181~365일'].count, b['181~365일'].qty, b['181~365일'].amount], [2, 80, 250]);
  assert.equal(b['365일 초과'].count, 0);
});

console.log('관리대상 · 단가 미매칭');
test('관리대상: A 증가 1위, B 과잉·저회전, C 과잉·저회전', () => {
  const t = Object.fromEntries(res.targets.map(x => [x.code, x.reasons.join(',')]));
  assert.deepEqual(t, { A: '금액 증가 상위 1위', B: '과잉,저회전', C: '과잉,저회전' });
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
test('파일 금액 우선 설정이면 파일 금액을 쓴다', () => {
  const r = L.analyze({ rawCur: [{ code: 'A', group: 'g', qty: 10, amount: 777 }], price: [{ code: 'A', price: 1 }] }, { ...settings, amountSource: 'file' });
  assert.equal(r.raw.items[0].curAmt, 777); assert.equal(r.raw.items[0].curAmtSource, '파일 금액');
  const r2 = L.analyze({ rawCur: [{ code: 'A', group: 'g', qty: 10, amount: 777 }], price: [{ code: 'A', price: 1 }] }, settings);
  assert.equal(r2.raw.items[0].curAmt, 10);
});

console.log('엑셀 시트');
test('시트 8개, 머리행과 자료 행의 칸 수가 같다', () => {
  const sheets = L.buildSheets(res, settings, false);
  assert.equal(Object.keys(sheets).length, 8);
  for (const [name, rows] of Object.entries(sheets)) {
    if (name === 'Aging_적정성' || name === '기준') continue;
    rows.slice(1).forEach(r => assert.equal(r.length, rows[0].length, name));
  }
  assert.equal(sheets['원자재_품목별'].length, 1 + 4);
  assert.equal(sheets['관리대상'].length, 1 + 3);
});

console.log('예시 데이터');
test('예시 데이터가 자동 짝짓기로 모두 읽히고 분석된다', () => {
  const t = Sample.build();
  const out = {};
  for (const slot of L.SLOTS) {
    const tbl = L.tableToRows(t[slot.id], 1);
    const m = L.guessMapping(tbl.headers, slot.def);
    assert.deepEqual(L.missingRequired(m, slot.def), [], slot.id);
    const r = L.applyMapping(tbl.rows, m, slot.def);
    assert.equal(r.problems.length, 0, slot.id);
    out[slot.id] = r.records;
  }
  const r = L.analyze(out, { ...L.defaultSettings(), curDate: Sample.CUR, prevDate: Sample.PREV });
  assert.equal(r.ok, true);
  assert.equal(r.raw.items.length, 12);
  assert.equal(r.product.items.length, 7);
  assert.deepEqual(r.unmatched.map(u => u.code), ['RM-3003']);
});

console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과 (' + passed + '개)');
