/*
 * 예시 데이터(가상) — 실제 회사 자료가 아닙니다.
 * 2026-09-29 수강생이 보낸 실데이터 엑셀 3종(인천 본사·대구 재고분석, 기준정보관리)의
 * 「열 구조」만 따라 만든 가상 값입니다. 품번·품명·고객사·수량·단가·날짜는 모두 지어낸 것이고,
 * 실데이터의 값은 이 리포 어디에도 넣지 않았습니다.
 *
 * 흉내 낸 구조
 *  - 인천(본사) 통합문서: 1행 제목(「회사명 : … / 2026/08/31 / 재고현황」) + 2행 머리행,
 *    시트 「8월 원자재(본사)」「7월 원자재(본사)」「8월제품」「7월제품」, 경과 개월 칸 「재고잔량분석」(「12 개월초과」 표기)
 *  - 대구 통합문서: 1행 머리행, 시트 「대구 8월 원자재」「대구 7월 원자재」…, 전월 시트는 수량 칸 이름이 「수량」,
 *    경과 개월 칸 「8월 잔량분석」(「12개월초과」 표기), 맨 아래 「합계」 줄
 *  - 원자재 대분류는 ERP 코드(HSG·SEAL·TML·TUBE·WIRE·CLIP·SWITCH·기타 …) — 보고서 대분류(하우징류 …)는 묶음표로 만듭니다
 *  - 기준정보: 제품 품목 마스터(품번·대분류(=고객사)·품명·마지막 단가)
 *  - 입고·출고 이력은 실데이터에 없습니다. 증감 원인(입고·출고 분해)을 시연하려고 가상 이력을 따로 둡니다.
 *  - (3차) 반제품 시트(인천 「8월반제품(본사)」 — 금액 칸 「합계금액」, 대구 「대구 8월 반제품」 — 「재고*반제품단가」),
 *    판매현황 파일(1행 「회사명 : … / 2026/07/01 ~ 2026/07/31」, 2행 머리행, 판매일자 「2026/07/03 -1」, 맨 아래 「계」「총합계」·출력 일시 줄),
 *    보고용 시트(「원자재」「반제품」「제품」 — 「○○기준」 구역, 「재고현황(07월)」 머리행)를 흉내 냈습니다.
 *    보고용 원자재 인천 7월 합계 금액은 차이 알람을 시연하려고 일부러 1,000원 다르게 적었습니다.
 *    보고용 반제품 대구 7월 금액은 「단위 차이」를 시연하려고 일부러 10배로 적었습니다(실데이터에 같은 경우가 있음 — 2026-09-30 답변).
 */
(function (root) {
  'use strict';
  var CUR = '2026-08-31';
  var PREV = '2026-07-31';

  // [품목코드, 품목명[규격], 대분류(ERP 코드), 공장, 전월 수량, 당월 수량, 전월 입고단가, 당월 입고단가, 전월 경과 개월, 당월 경과 개월]
  // 단가가 null 이면 그 달 금액 칸이 빈칸(금액 미산정 시연)
  var RAW = [
    ['H-1001', '예시 하우징 6P [HSG]', 'HSG', '인천', 12000, 15000, 120, 120, 1, 0],
    ['H-1002', '예시 하우징 12P [HSG]', 'HSG', '인천', 8000, 6400, 410, 410, 2, 3],
    ['H-1003', '예시 하우징 2P [HSG]', 'HSG', '인천', 300, 300, 5200, 5200, 12, 13],
    ['S-2001', '예시 씰 A', 'SEAL', '인천', 50000, 42000, 12, 12, 0, 0],
    ['T-3001', '예시 터미널 A [TML]', 'TML', '인천', 90000, 76000, 45, 45, 0, 0],
    ['T-3002', '예시 터미널 B [TML]', 'TML', '인천', 20000, 26000, 38, 40, 1, 0],
    ['W-4001', '예시 전선 0.5SQ', 'WIRE', '인천', 30000, 31000, 95, 110, 0, 0],
    ['C-5001', '예시 클립 A', 'CLIP', '인천', 4000, 4000, 30, 30, 7, 8],
    ['G-6001', '예시 그로멧 A', 'GROMMET', '인천', 0, 1800, null, 150, null, 0],
    ['X-7001', '예시 테이프 A', 'TAPE', '인천', 1200, 0, 60, null, 4, null],
    ['X-7002', '예시 기타자재 A', '', '인천', 500, 500, 100, null, 6, 7],
    ['H-1001', '예시 하우징 6P [HSG]', 'HSG', '대구', 5000, 4200, 120, 120, 2, 0],
    ['T-3001', '예시 터미널 A [TML]', 'TML', '대구', 30000, 28000, 45, 45, 0, 1],
    ['W-4002', '예시 전선 1.25SQ', 'WIRE', '대구', 7000, 9000, 180, 180, 0, 0],
    ['D-8001', '예시 다이오드 A', 'DIODE', '대구', 600, 600, 310, 310, 12, 13],
    ['SW-9001', '예시 스위치 A', 'SWITCH', '대구', 20, 25, 50000, 50000, 3, 0]
  ];

  // [품목코드, 품목명[규격], 대분류, 공장, 고객사, 전월, 당월, 전월 완제품단가, 당월 완제품단가, 전월 경과 개월, 당월 경과 개월]
  var PROD = [
    ['FG-501', '예시제품 가', '완제품', '인천', '예시고객사 1', 400, 520, 18000, 18000, 0, 0],
    ['FG-502', '예시제품 나', '완제품', '인천', '예시고객사 1', 260, 180, 22000, 22000, 1, 0],
    ['FG-503', '예시제품 다', '완제품', '인천', '예시고객사 2', 90, 90, 35000, 35000, 12, 13],
    ['FG-504', '예시제품 라', '완제품', '인천', '예시고객사 2', 500, 740, 12000, 12500, 1, 0],
    ['FG-505', '예시제품 마', '상품', '인천', '예시고객사 3', 0, 300, null, 15000, null, 0],
    ['FG-506', '예시제품 바', '완제품', '인천', '예시고객사 3', 120, 0, 41000, null, 3, null],
    ['FG-507', '예시제품 사', '완제품', '대구', '예시고객사 3', 75, 75, 27000, 27000, 12, 13],
    ['FG-601', '예시제품 아', '완제품', '대구', '예시고객사 1', 200, 150, 9000, 9000, 0, 0]
  ];

  // [품목코드, 품목명[규격], 대분류, 공장, 고객사, 전월, 당월, 전월 반제품단가, 당월 반제품단가, 전월 경과 개월, 당월 경과 개월]
  var SEMI = [
    ['SF-101', '예시반제품 가 [SUB]', '반제품', '인천', '예시고객사 1', 120, 150, 9000, 9000, 1, 0],
    ['SF-102', '예시반제품 나 [SUB]', '반제품', '인천', '예시고객사 2', 40, 40, 15000, 15000, 7, 8],
    ['SF-201', '예시반제품 다 [SUB]', '반제품', '대구', '예시고객사 3', 300, 260, 2500, 2500, 12, 13],
    ['SF-202', '예시반제품 라 [SUB]', '반제품', '대구', '예시고객사 1', 0, 90, null, 4000, null, 0]
  ];

  // 가상 판매현황(출고) [품목코드, 품목명, 대분류, 판매일자, 수량, 단가, 거래처] — 25년 12월·26년 7월·8월 세 파일.
  // 원자재 일부(유상사급 판매처럼)와 반제품·제품. 8월 파일은 열 차이 인식을 보이려고 「창고」 칸이 하나 더 있습니다.
  var SALES = {
    '2025-12': [['FG-503', '예시제품 다', '완제품', '2025-12-10', 10, 35000, '예시고객사 2'], ['FG-507', '예시제품 사', '완제품', '2025-12-22', 5, 27000, '예시고객사 3'],
      ['SF-201', '예시반제품 다 [SUB]', '반제품', '2025-12-05', 40, 2500, '예시고객사 3']],
    '2026-07': [['FG-502', '예시제품 나', '완제품', '2026-07-15', 60, 22000, '예시고객사 1'], ['FG-601', '예시제품 아', '완제품', '2026-07-30', 50, 9000, '예시고객사 1'],
      ['H-1003', '예시 하우징 2P [HSG]', 'HSG', '2026-07-08', 20, 5200, '예시협력사 A'], ['SF-102', '예시반제품 나 [SUB]', '반제품', '2026-07-21', 5, 15000, '예시고객사 2']],
    '2026-08': [['FG-501', '예시제품 가', '완제품', '2026-08-29', 300, 18000, '예시고객사 1'], ['FG-504', '예시제품 라', '완제품', '2026-08-20', 160, 12500, '예시고객사 2'],
      ['FG-501', '예시제품 가', '완제품', '2026-08-03', 40, 18000, '예시고객사 1'], ['H-1001', '예시 하우징 6P [HSG]', 'HSG', '2026-08-12', 500, 120, '예시협력사 A'],
      ['SF-101', '예시반제품 가 [SUB]', '반제품', '2026-08-25', 30, 9000, '예시고객사 1']]
  };

  // 가상 입·출고 이력 [품번, 일자, 수량] — 공장 칸 없음(공통). 일부 품목만 있습니다.
  var INBOUND = [
    ['H-1001', '2026-07-12', 6000], ['H-1001', '2026-08-20', 9000],
    ['H-1002', '2026-05-15', 4000],
    ['T-3001', '2026-07-05', 30000], ['T-3001', '2026-08-06', 20000],
    ['T-3002', '2026-08-18', 12000],
    ['W-4001', '2026-07-22', 8000], ['W-4001', '2026-08-22', 9000],
    ['G-6001', '2026-08-25', 1800],
    ['FG-504', '2026-08-19', 400]
  ];
  var OUTBOUND = [
    ['H-1001', '2026-07-28', 7000], ['H-1001', '2026-08-28', 6800],
    ['H-1002', '2026-06-25', 900], ['H-1002', '2026-08-25', 1600],
    ['S-2001', '2026-07-30', 5000], ['S-2001', '2026-08-30', 8000],
    ['T-3001', '2026-07-29', 32000], ['T-3001', '2026-08-29', 36000],
    ['T-3002', '2026-08-26', 6000],
    ['W-4001', '2026-07-30', 7500], ['W-4001', '2026-08-30', 8000],
    ['X-7001', '2026-08-14', 1200],
    ['FG-501', '2026-08-29', 300], ['FG-502', '2026-08-21', 80], ['FG-506', '2026-08-10', 120]
  ];

  // 기준정보(제품 품목 마스터) — 실데이터처럼 「대분류」 칸에 고객사 이름이 들어 있습니다
  var MASTER = [
    ['품번', '대분류', '중분류', '품명(한국어)', '품목구분', '마지막 단가'],
    ['FG-501', '예시고객사 1', '하네스', '예시제품 가', '제품', 18000],
    ['FG-502', '예시고객사 1', '하네스', '예시제품 나', '제품', 22000],
    ['FG-503', '예시고객사 2', '하네스', '예시제품 다', '제품', 35000],
    ['FG-504', '예시고객사 2', '하네스', '예시제품 라', '제품', 12500],
    ['FG-505', '예시고객사 3', '케이블', '예시제품 마', '제품', 15000],
    ['FG-506', '예시고객사 3', '케이블', '예시제품 바', '제품', 41000],
    ['FG-507', '예시고객사 3', '케이블', '예시제품 사', '제품', 27000],
    ['FG-601', '예시고객사 1', '케이블', '예시제품 아', '제품', 9000]
  ];

  function agingText(m, style) {
    if (m == null) return '';
    if (m === 0) return 0;
    if (m > 12) return style === 'daegu' ? '12개월초과' : '12 개월초과';
    return style === 'daegu' ? m + '개월' : m + ' 개월';
  }
  function money(q, p) { return p == null ? '' : Math.round(q * p * 100) / 100; }

  // 원자재 시트(한 공장·한 달)
  function rawSheet(plant, cur) {
    var qi = cur ? 5 : 4, pi = cur ? 7 : 6, ai = cur ? 9 : 8;
    var rows = RAW.filter(function (r) { return r[3] === plant && r[qi] !== 0; });
    if (plant === '인천') {
      var date = cur ? '2026/08/31' : '2026/07/31';
      return [['회사명 : 예시회사(가상) / 예시-자재-본사창고 외 / ' + date + '  / 재고현황'],
        ['품목코드', '품목명[규격]', '대분류', '재고보유월수', '재고수량', '가용수량', '입고단가', '금액(재고수량*입고단가)', '재고잔량분석', '비고']]
        .concat(rows.map(function (r) { return [r[0], r[1], r[2], '', r[qi], r[qi], r[pi] == null ? '' : r[pi], money(r[qi], r[pi]), agingText(r[ai], 'hq'), '']; }));
    }
    // 대구: 전월 시트는 수량 칸 이름이 「수량」이고 창고 칸이 없습니다(실데이터 구조)
    var head = cur ? ['품목코드', '품목명[규격]', '대분류', '재고수량', '예시-자재창고', '입고단가', '금액(재고수량*입고단가)', '8월 잔량분석', '비고']
      : ['품목코드', '품목명[규격]', '대분류', '수량', '입고단가', '금액(재고수량*입고단가)', '7월 잔량분석', '비고'];
    var sumQ = 0, sumA = 0;
    var body = rows.map(function (r) {
      sumQ += r[qi]; sumA += Number(money(r[qi], r[pi])) || 0;
      var a = [r[0], r[1], r[2], r[qi]];
      if (cur) a.push(r[qi]);
      return a.concat([r[pi] == null ? '' : r[pi], money(r[qi], r[pi]), agingText(r[ai], 'daegu'), '']);
    });
    var total = cur ? ['합계', '', '', sumQ, sumQ, '', Math.round(sumA * 100) / 100, '', ''] : ['합계', '', '', sumQ, '', Math.round(sumA * 100) / 100, '', ''];
    return [head].concat(body, [total]);
  }
  function prodSheet(plant, cur) {
    var qi = cur ? 6 : 5, pi = cur ? 8 : 7, ai = cur ? 10 : 9;
    var rows = PROD.filter(function (r) { return r[3] === plant && r[qi] !== 0; });
    var head = ['품목코드', '품목명[규격]', '대분류', '재고수량', '완제품단가', '재고*완제품단가', '고객사', plant === '인천' ? '재고잔량' : '잔량분석'];
    var body = rows.map(function (r) { return [r[0], r[1], r[2], r[qi], r[pi] == null ? '' : r[pi], money(r[qi], r[pi]), r[4], agingText(r[ai], plant === '인천' ? 'hq' : 'daegu')]; });
    if (plant === '인천') return [['회사명 : 예시회사(가상) / 예시-완제품-본사창고 외 / ' + (cur ? '2026/08/31' : '2026/07/31') + '  / 재고현황'], head].concat(body);
    return [head].concat(body);
  }

  function semiSheet(plant, cur) {
    var qi = cur ? 6 : 5, pi = cur ? 8 : 7, ai = cur ? 10 : 9;
    var rows = SEMI.filter(function (r) { return r[3] === plant && r[qi] !== 0; });
    if (plant === '인천') {
      var head = ['품목코드', '품목명[규격]', '대분류', '재고수량', '완제품단가', '재고*완제품단가', '반제품단가', '합계금액', '재고잔량', '고객사'];
      return [['회사명 : 예시회사(가상) / 예시-반제품-본사창고 외 / ' + (cur ? '2026/08/31' : '2026/07/31') + '  / 재고현황'], head]
        .concat(rows.map(function (r) { return [r[0], r[1], r[2], r[qi], r[pi] == null ? '' : r[pi] * 1.5, money(r[qi], r[pi] == null ? null : r[pi] * 1.5), r[pi] == null ? '' : r[pi], money(r[qi], r[pi]), agingText(r[ai], 'hq'), r[4]]; }));
    }
    var hd = ['품목코드', '품목명[규격]', '대분류', '재고수량', '완제품단가', '반제품단가', '재고*완제품단가', '재고*반제품단가', '고객사', '잔량분석'];
    return [hd].concat(rows.map(function (r) { return [r[0], r[1], r[2], r[qi], r[pi] == null ? '' : r[pi] * 1.5, r[pi] == null ? '' : r[pi], money(r[qi], r[pi] == null ? null : r[pi] * 1.5), money(r[qi], r[pi]), r[4], agingText(r[ai], 'daegu')]; }));
  }

  // 판매현황 한 달 파일(한 시트 「판매현황내역」)
  function salesSheet(month) {
    var y = month.slice(0, 4), m = month.slice(5, 7), last = new Date(+y, +m, 0).getDate();
    var extra = month === '2026-08';
    var head = ['주문일자', '프로젝트명', '판매일자', '대분류', '품목코드', '품목명(규격)', '수량', '단가', '공급가액', '거래처명', '비고'];
    if (extra) head.splice(6, 0, '창고');
    var q = 0, amt = 0;
    var body = SALES[month].map(function (r, i) {
      q += r[4]; amt += r[4] * r[5];
      var line = [r[3].replace(/-/g, '/') + ' -' + (i + 1), '', r[3].replace(/-/g, '/') + ' -' + (i + 1), r[2], r[0], r[1], r[4], r[5], r[4] * r[5], r[6], ''];
      if (extra) line.splice(6, 0, '예시창고');
      return line;
    });
    var pad = function (a) { while (a.length < head.length) a.push(''); return a; };
    var stamp = month === '2026-08' ? '2026/09/02 (수) 오전 9:10:11' : y + '/' + m + '/' + last + ' (예시) 오후 6:00:00';
    return [pad(['회사명 : 예시회사(가상) / ' + y + '/' + m + '/01  ~ ' + y + '/' + m + '/' + last + ' ']), head].concat(body,
      [pad([y + '/' + m + '  계', '', '', '', '', '', q, '', amt]), pad(['총합계', '', '', '', '', '', q, '', amt]), pad([stamp])]);
  }
  function salesBooks() {
    var out = {};
    Object.keys(SALES).forEach(function (k) { out['예시데이터_판매현황(' + k.slice(2, 4) + '.' + k.slice(5, 7) + ').xlsx'] = { '판매현황내역': salesSheet(k) }; });
    return out;
  }

  // 보고용 시트(원자재·반제품·제품) — 가상 재고 값에서 만든 요약. 인천 원자재 7월 합계 금액은 일부러 +1,000원(차이 알람 시연)
  var GROUP = { HSG: '하우징류', SEAL: '씰류', TML: '터미널류', TUBE: '튜브류', WIRE: '와이어류', CLIP: '클립류', SWITCH: '스위치' };
  function sumBy(rows, keyFn, qi, pi) {
    var out = {}, order = [];
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (!out[k]) { out[k] = { q: 0, a: 0, n: 0 }; order.push(k); }
      out[k].q += r[qi]; out[k].a += Number(money(r[qi], r[pi])) || 0; if (r[qi]) out[k].n++;
    });
    return { map: out, order: order };
  }
  function reportRaw(plant, title, bump) {
    var rows = RAW.filter(function (r) { return r[3] === plant; });
    var key = function (r) { return GROUP[r[2]] || '기타'; };
    var p = sumBy(rows, key, 4, 6), c = sumBy(rows, key, 5, 7);
    var groups = ['하우징류', '씰류', '터미널류', '튜브류', '와이어류', '클립류', '스위치', '기타'].filter(function (g) { return p.map[g] || c.map[g]; });
    var out = [[title], ['구분', '대분류', '재고현황(07월)', '', '재고현황(08월)', '', '수량 증감 비교 (08월재고현황 - 07월재고현황)', '금액 증감 비교 (08월재고현황 - 07월재고현황)', '원인분석', '', '비고'],
      ['', '', ' 수량', '금액', ' 수량', '금액', '', '', '07월 재고현황', '08월 재고현황']];
    var t = { pq: 0, pa: 0, cq: 0, ca: 0 };
    groups.forEach(function (g, i) {
      var a = p.map[g] || { q: 0, a: 0, n: 0 }, b = c.map[g] || { q: 0, a: 0, n: 0 };
      t.pq += a.q; t.pa += a.a; t.cq += b.q; t.ca += b.a;
      out.push([i ? '' : '원자재', g, a.q, a.a, b.q, b.a, b.q - a.q, b.a - a.a, a.n + '종', b.n + '종', '']);
    });
    out.push(['', '합계', t.pq, t.pa + (bump || 0), t.cq, t.ca, t.cq - t.pq, t.ca - t.pa - (bump || 0), '', '', '']);
    return out;
  }
  function reportCust(list, plant, title, qiP, qiC, piP, piC, priceMul, prevMul) {
    var rows = list.filter(function (r) { return r[3] === plant; });
    var pm = priceMul * (prevMul || 1);
    var p = sumBy(rows.map(function (r) { return r.slice(0, 7).concat([r[piP] == null ? null : r[piP] * pm]); }), function (r) { return r[4]; }, qiP, 7);
    var c = sumBy(rows.map(function (r) { return r.slice(0, 7).concat([r[piC] == null ? null : r[piC] * priceMul]); }), function (r) { return r[4]; }, qiC, 7);
    var out = [[title], ['구분', '07월 재고현황', '', '08월 재고현황', '', '', '재고잔량분석'], ['', ' 수량', '금액', ' 수량', '금액', '']];
    var t = [0, 0, 0, 0];
    c.order.concat(p.order.filter(function (k) { return !c.map[k]; })).forEach(function (k) {
      var a = p.map[k] || { q: 0, a: 0 }, b = c.map[k] || { q: 0, a: 0 };
      t[0] += a.q; t[1] += a.a; t[2] += b.q; t[3] += b.a;
      out.push([k, a.q, a.a, b.q, b.a, '']);
    });
    out.push(['총합계', t[0], t[1], t[2], t[3], '']);
    return out;
  }
  function reportSheets(plant) {
    var title = plant === '인천' ? '본사기준' : '대구기준';
    return {
      '원자재': reportRaw(plant, title, plant === '인천' ? 1000 : 0),
      '반제품': reportCust(SEMI, plant, title, 5, 6, 7, 8, 1, plant === '대구' ? 10 : 1),   // 대구 7월 금액 10배(단위 차이 시연)
      '제품': reportCust(PROD, plant, title, 5, 6, 7, 8, 1)
    };
  }

  // 통합문서 3개 + 이력 CSV 2개 — 실데이터 파일 이름 형식을 따르되 앞에 「예시데이터_」를 붙였습니다
  function merge(a, b) { var o = {}; [a, b].forEach(function (x) { Object.keys(x).forEach(function (k) { o[k] = x[k]; }); }); return o; }
  function workbooks() {
    return {
      '예시데이터_8월재고분석(본사).xlsx': merge(reportSheets('인천'), {
        '8월 원자재(본사)': rawSheet('인천', true), '7월 원자재(본사)': rawSheet('인천', false),
        '8월반제품(본사)': semiSheet('인천', true), '7월반제품(본사)': semiSheet('인천', false),
        '8월제품': prodSheet('인천', true), '7월제품': prodSheet('인천', false)
      }),
      '예시데이터_8월재고분석현황(대구).xlsx': merge(reportSheets('대구'), {
        '대구 8월 원자재': rawSheet('대구', true), '대구 7월 원자재': rawSheet('대구', false),
        '대구 8월 반제품': semiSheet('대구', true), '대구 7월 반제품': semiSheet('대구', false),
        '대구 8월 제품': prodSheet('대구', true), '대구 7월 제품': prodSheet('대구', false)
      }),
      '예시데이터_기준정보관리.xlsx': { 'Sheet': MASTER }
    };
  }
  function histories() {
    return {
      '예시데이터_입고이력(가상).csv': [['품번', '입고일자', '입고수량']].concat(INBOUND),
      '예시데이터_출고이력(가상).csv': [['품번', '출고일자', '출고수량']].concat(OUTBOUND)
    };
  }

  // 자리별로 불러올 파일 목록 — [파일 이름, 시트 이름]. 공장은 파일 이름으로 짐작합니다.
  var LOAD_PLAN = {
    rawCur: [['예시데이터_8월재고분석(본사).xlsx', '8월 원자재(본사)'], ['예시데이터_8월재고분석현황(대구).xlsx', '대구 8월 원자재']],
    rawPrev: [['예시데이터_8월재고분석(본사).xlsx', '7월 원자재(본사)'], ['예시데이터_8월재고분석현황(대구).xlsx', '대구 7월 원자재']],
    semiCur: [['예시데이터_8월재고분석(본사).xlsx', '8월반제품(본사)'], ['예시데이터_8월재고분석현황(대구).xlsx', '대구 8월 반제품']],
    semiPrev: [['예시데이터_8월재고분석(본사).xlsx', '7월반제품(본사)'], ['예시데이터_8월재고분석현황(대구).xlsx', '대구 7월 반제품']],
    prodCur: [['예시데이터_8월재고분석(본사).xlsx', '8월제품'], ['예시데이터_8월재고분석현황(대구).xlsx', '대구 8월 제품']],
    prodPrev: [['예시데이터_8월재고분석(본사).xlsx', '7월제품'], ['예시데이터_8월재고분석현황(대구).xlsx', '대구 7월 제품']],
    inbound: [['예시데이터_입고이력(가상).csv', null]],
    outbound: [['예시데이터_출고이력(가상).csv', null]],
    price: [['예시데이터_기준정보관리.xlsx', 'Sheet']]
  };
  // 자리 id → [{ fileName, sheetName, aoa, names(시트 목록), sheets }]
  function build() {
    var wbs = workbooks(), hs = histories();
    var out = {};
    Object.keys(LOAD_PLAN).forEach(function (slot) {
      out[slot] = LOAD_PLAN[slot].map(function (p) {
        var book = wbs[p[0]] ? wbs[p[0]] : { '예시': hs[p[0]] };
        var sheet = p[1] || '예시';
        return { fileName: p[0], sheetName: sheet, names: Object.keys(book), sheets: book, aoa: book[sheet] };
      });
    });
    return out;
  }

  // 보고서 대조 자리에 올릴 통합문서(재고분석 파일 두 개 그대로)
  var REPORT_FILES = ['예시데이터_8월재고분석(본사).xlsx', '예시데이터_8월재고분석현황(대구).xlsx'];
  var api = { CUR: CUR, PREV: PREV, build: build, workbooks: workbooks, histories: histories, salesBooks: salesBooks, REPORT_FILES: REPORT_FILES, RAW: RAW, SEMI: SEMI, PROD: PROD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvSample = api;
})(typeof window !== 'undefined' ? window : this);
