/*
 * 월간 재고 분석 — 순수 로직 모듈 (화면·저장소와 무관)
 * 기획서 docs/01_프로젝트_기획서.md 3장(데이터)·5장(기능)·8장 1단계 범위를 따릅니다.
 * 브라우저에서는 window.InvLogic, Node(테스트)에서는 module.exports 로 씁니다.
 * ES module 이 아닌 이유: index.html 을 로컬 파일(file://)로 열었을 때
 * 브라우저가 module 스크립트를 막기 때문입니다.
 */
(function (root) {
  'use strict';

  // ── 자료 정의 ────────────────────────────────────────────────
  // 실제 컬럼명은 아직 받지 못했습니다(기획서 10장 2번, 11장 확인 목록).
  // 그래서 필드마다 「이런 이름이면 자동으로 짝지어 본다」는 **열 이름 후보 목록(syn)** 만 두고,
  // 사용자가 화면에서 고릅니다. 실데이터가 오면 이 목록에 실제 열 이름을 앞쪽에 더하면 됩니다.
  // (짝짓기 순서: 저장해 둔 짝 → 후보와 이름이 똑같은 열 → 후보 이름이 들어 있는 열)
  var PLANT_FIELD = { key: 'plant', label: '공장(파일에 칸이 있으면)', required: false, syn: ['공장', '공장구분', '공장명', '사업장', '사업장명', '플랜트', 'plant', 'site'] };
  // 2026-09-29 실데이터(인천 본사·대구 재고분석 엑셀) 열 이름을 앞쪽에 넣었습니다(값은 리포에 없음).
  var COL = {
    stockQty: ['재고수량', '수량', '기말재고수량', '당월재고수량', '현재고', '기말재고', '당월재고', '기말수량', '재고량', '재고', 'qty', 'quantity', 'stock'],
    stockAmt: ['금액(재고수량*입고단가)', '재고금액', '기말재고금액', '당월재고금액', '기말금액', '합계금액', '금액', 'amount'],
    prodAmt: ['재고*완제품단가', '합계금액', '금액(재고수량*입고단가)', '재고금액', '기말재고금액', '당월재고금액', '기말금액', '금액', 'amount'],
    stockPrice: ['입고단가', '재고단가', '단가', '평균단가', '이동평균단가', 'unitprice', 'price'],
    prodPrice: ['완제품단가', '재고단가', '단가', '입고단가', 'unitprice', 'price'],
    // ERP 가 이미 계산해 둔 재고 경과 개월(「12 개월초과」「8개월」「0」 같은 값)
    aging: ['재고잔량분석', '잔량분석', '재고잔량', '잔량', '재고보유월수', '보유월수', 'aging'],
    // 「입고」「출고」 한 낱말만으로는 짝짓지 않습니다 — 실데이터의 「미입고」(아직 안 들어온 수량) 칸이 잡혔기 때문
    inQty: ['당월입고수량', '당월입고', '입고수량', '입고량'],
    outQty: ['당월출고수량', '당월출고', '당월사용수량', '당월사용', '출고수량', '사용수량', '출고량', '사용량']
  };
  var DEFS = {
    rawStock: {
      label: '원자재 월말 재고',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '품목코드', '자재코드', '자재번호', '품목번호', '코드', '행 레이블', 'item', 'itemcode', 'partno', 'code'] },
        { key: 'name', label: '품명', required: false, syn: ['품명', '품목명', '자재명', '명칭', 'itemname', 'name'] },
        { key: 'group', label: '대분류(없으면 기준정보에서)', required: false, syn: ['대분류', '대분류명', '분류', '자재분류', '품목군', 'category', 'group'] },
        { key: 'qty', label: '재고수량', required: true, syn: COL.stockQty },
        { key: 'amount', label: '재고금액(파일에 있으면)', required: false, syn: COL.stockAmt },
        { key: 'price', label: '재고단가(파일에 있으면)', required: false, syn: COL.stockPrice },
        { key: 'inQty', label: '당월 입고수량(파일에 있으면)', required: false, syn: COL.inQty },
        { key: 'outQty', label: '당월 출고·사용수량(파일에 있으면)', required: false, syn: COL.outQty },
        { key: 'agingFile', label: '재고 경과 개월(파일에 있으면 — 재고잔량분석 등)', required: false, syn: COL.aging },
        PLANT_FIELD
      ]
    },
    productStock: {
      label: '제품 월말 재고',
      fields: [
        { key: 'code', label: '제품코드', required: true, syn: ['제품코드', '품번', '품목코드', '제품번호', '코드', '행 레이블', 'itemcode', 'partno', 'code'] },
        { key: 'name', label: '제품명', required: false, syn: ['제품명', '품명', '품목명', 'name'] },
        { key: 'group', label: '고객사', required: true, syn: ['고객사', '거래처', '고객', '고객명', '납품처', 'customer'] },
        { key: 'qty', label: '재고수량', required: true, syn: COL.stockQty },
        { key: 'amount', label: '재고금액(파일에 있으면)', required: false, syn: COL.prodAmt },
        { key: 'price', label: '재고단가(파일에 있으면)', required: false, syn: COL.prodPrice },
        { key: 'inQty', label: '당월 입고수량(파일에 있으면)', required: false, syn: COL.inQty },
        { key: 'outQty', label: '당월 출고수량(파일에 있으면)', required: false, syn: COL.outQty },
        { key: 'agingFile', label: '재고 경과 개월(파일에 있으면 — 재고잔량 등)', required: false, syn: COL.aging },
        PLANT_FIELD
      ]
    },
    inbound: {
      label: '입고 이력',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '제품코드', '품목코드', '자재코드', '코드', 'itemcode', 'code'] },
        { key: 'date', label: '입고일', required: true, syn: ['입고일', '입고일자', '일자', '날짜', 'date'] },
        { key: 'qty', label: '입고수량', required: false, syn: ['입고수량', '수량', 'qty'] },
        PLANT_FIELD
      ]
    },
    outbound: {
      label: '출고·사용 이력',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '제품코드', '품목코드', '자재코드', '코드', 'itemcode', 'code'] },
        { key: 'date', label: '출고일', required: true, syn: ['출고일', '출고일자', '사용일', '불출일', '일자', '날짜', 'date'] },
        { key: 'qty', label: '출고수량', required: false, syn: ['출고수량', '사용수량', '불출수량', '수량', 'qty'] },
        PLANT_FIELD
      ]
    },
    price: {
      label: '단가표 · 품목 기준정보',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '제품코드', '품목코드', '자재코드', '코드', 'itemcode', 'code'] },
        { key: 'price', label: '단가', required: true, syn: ['단가', '마지막 단가', '표준단가', '이동평균단가', '평균단가', '입고단가', '완제품단가', 'price', 'unitprice'] },
        { key: 'date', label: '적용일(있으면)', required: false, syn: ['적용일', '적용일자', '시작일', '기준일', 'date'] },
        { key: 'name', label: '품명(있으면)', required: false, syn: ['품명', '품목명', '품명(한국어)', '자재명', 'itemname', 'name'] },
        { key: 'group', label: '대분류(있으면 — 재고 파일에 없을 때 씀)', required: false, syn: ['대분류', '대분류명', '자재분류', '품목군', 'category', 'group'] }
      ]
    }
  };

  // 공장 — 분석 대상은 인천·대구 두 곳입니다(2026-09-29 메일 요청). 중국공장은 대상이 아니라서
  // 「공장」 칸에 중국이 적힌 행은 읽을 때 빼고, 몇 행을 뺐는지 알려 줍니다.
  // alias: 칸 값이나 파일 이름에 이 글자가 들어 있으면 그 공장으로 봅니다(「본사」 = 인천 — 첨부 파일명 기준 가정).
  var PLANTS = [
    { id: '인천', alias: ['인천', '본사'] },
    { id: '대구', alias: ['대구'] }
  ];
  var EXCLUDED_PLANTS = [{ id: '중국', alias: ['중국', 'china'] }];
  var NO_PLANT = '';   // 공장을 지정하지 않은 자료(예전 자료·예시 이력). 화면에는 「공장 미지정」

  // 올리는 자리(슬롯) 7개 — 원자재·제품 × 당월·전월, 입고·출고 이력, 단가표.
  // 자리마다 파일을 여러 개(공장별로) 올릴 수 있습니다.
  var SLOTS = [
    { id: 'rawCur', def: 'rawStock', label: '원자재 재고 — 당월' },
    { id: 'rawPrev', def: 'rawStock', label: '원자재 재고 — 전월' },
    { id: 'prodCur', def: 'productStock', label: '제품 재고 — 당월' },
    { id: 'prodPrev', def: 'productStock', label: '제품 재고 — 전월' },
    { id: 'inbound', def: 'inbound', label: '입고 이력' },
    { id: 'outbound', def: 'outbound', label: '출고·사용 이력' },
    { id: 'price', def: 'price', label: '단가표 · 품목 기준정보' }
  ];

  // 기준값의 처음 값. 회사 기준을 받기 전 「예시 값」입니다(기획서 10장 4·9번).
  // Aging 은 2026-09-29 요청으로 「일」이 아니라 「개월」 단위입니다. 처음 값 3·6·12개월은
  // 예전 일 단위 예시 값 90·180·365일을 월로 환산한 것입니다(daysToMonths).
  function defaultSettings() {
    return {
      curDate: '',          // 당월 기준일(월말). 비우면 분석 불가
      prevDate: '',         // 전월 기준일. 비우면 당월 기준일의 전월 말일
      agingMonths: '3, 6, 12', // Aging 구간 경계(개월)
      overMonths: 6,        // 경과 개월이 이 값을 넘으면 「과잉」
      deadMonths: 12,       // 경과 개월이 이 값을 넘으면 「불용」
      noOutPolicy: 'inbound', // 출고 이력 없는 품목: inbound=입고일로 대신, none=판정 보류
      amountSource: 'file',   // file=재고 파일 금액 우선(없으면 단가표), price=단가표 우선 — 실데이터 재고 파일에 금액 칸이 있어 file 이 기본
      topN: 10,             // 금액 증가 상위 N건
      turnoverMax: '',      // 회전율이 이 값 미만이면 저회전(비우면 적용 안 함)
      causeTopN: 5,         // 증감 원인 — 대분류마다 기여 상위 몇 품목을 보일지
      // 원자재 대분류 묶음표 — ERP 대분류 코드(HSG·TML …)를 보고서 대분류(하우징류·터미널류 …)로 묶습니다.
      // 실데이터 본사 「원자재」 요약 시트와 같은 값이 나오는 짝을 처음 값으로 넣었습니다(기획서 11장 확인 목록).
      groupMap: 'HSG=하우징류\nSEAL=씰류\nTML=터미널류\nTUBE=튜브류\nWIRE=와이어류\nCLIP=클립류\nSWITCH=스위치',
      groupOthers: 'other', // 묶음표에 없는 대분류: other=「기타」로 모음, keep=적힌 그대로
      plantView: ''         // 보기: '' = 인천+대구 합계, '인천', '대구'
    };
  }

  // 일 → 개월 환산(평균 한 달 = 365.25 ÷ 12 = 30.4375일, 반올림). 90→3, 180→6, 365→12
  function daysToMonths(d) { return Math.max(0, Math.round(Number(d) / 30.4375)); }

  // 예전(일 단위) 설정을 저장해 둔 사용자는 자동으로 개월로 바꿉니다.
  // saved: 저장소에 있던 그대로의 객체. 돌려주는 값: { settings, migrated }
  function migrateSettings(saved, defaults) {
    saved = saved || {};
    var out = {};
    Object.keys(defaults).forEach(function (k) { out[k] = saved[k] == null ? defaults[k] : saved[k]; });
    var migrated = false;
    if (saved.agingMonths == null && saved.agingBounds != null) {
      var list = String(saved.agingBounds).split(/[,\s]+/).map(Number).filter(function (n) { return isFinite(n) && n > 0; })
        .map(function (n) { return Math.max(1, daysToMonths(n)); });
      list.sort(function (a, b) { return a - b; });
      list = list.filter(function (n, i) { return i === 0 || n !== list[i - 1]; });
      if (list.length) out.agingMonths = list.join(', ');
      migrated = true;
    }
    if (saved.overMonths == null && saved.overDays != null && saved.overDays !== '' && isFinite(Number(saved.overDays))) { out.overMonths = daysToMonths(saved.overDays); migrated = true; }
    if (saved.deadMonths == null && saved.deadDays != null && saved.deadDays !== '' && isFinite(Number(saved.deadDays))) { out.deadMonths = daysToMonths(saved.deadDays); migrated = true; }
    return { settings: out, migrated: migrated };
  }

  // ── 값 다듬기 ────────────────────────────────────────────────
  function pad(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function toDateStr(d) { return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : ''; }

  // 엑셀 날짜 일련번호(1900 체계): 25569 = 1970-01-01
  function fromSerial(n) {
    var ms = Math.round((Math.floor(n) - 25569) * 86400000);
    var u = new Date(ms);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number') return (v > 20000 && v < 80000) ? fromSerial(v) : null;
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-.\/년 ]\s*(\d{1,2})[-.\/월 ]\s*(\d{1,2})/);
    if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) {
      var y = +m[1], mo = +m[2], d = +m[3];
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      var dt = new Date(y, mo - 1, d);
      return dt.getMonth() === mo - 1 ? dt : null;
    }
    if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
    return null;
  }
  function daysBetween(from, to) {
    return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
  }
  // 그 날짜가 속한 달의 전월 말일
  function prevMonthEnd(d) { return new Date(d.getFullYear(), d.getMonth(), 0); }
  function isMonthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() === d.getDate(); }

  // 경과 개월(달력 기준) — 기획서 11장 「월 경과 계산 규칙」
  //  1) (기준일의 연×12 + 월) − (시작일의 연×12 + 월)
  //  2) 기준일의 「일」이 시작일의 「일」보다 작으면 아직 한 달이 덜 찼으므로 1을 뺍니다.
  //  3) 단, 기준일이 그 달의 말일이면 빼지 않습니다(말일 처리).
  //     예: 01-31 → 02-28 = 1개월(2월엔 31일이 없으므로 말일이면 한 달이 찬 것으로 봄)
  //         2024-02-29 → 2025-02-28 = 12개월(윤년 말일 → 평년 말일)
  //  4) 시작일이 기준일보다 뒤면 null(계산하지 않음). 같은 날은 0개월.
  // 월말 기준일로 분석하면 「같은 달 안의 입·출고 = 0개월」, 「지난달 = 1개월」이 됩니다.
  function monthsBetween(from, to) {
    if (!from || !to) return null;
    if (daysBetween(from, to) < 0) return null;
    var m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate() && !isMonthEnd(to)) m -= 1;
    return m;
  }

  // "1,234" "(12)" "-" 같은 표기를 숫자로. 못 읽으면 NaN, 빈칸은 null
  function toNumber(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v).trim();
    if (s === '' || s === '-') return null;
    var neg = /^\(.*\)$/.test(s);
    s = s.replace(/[(),\s원₩]/g, '');
    if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
    var n = Number(s);
    return neg ? -n : n;
  }
  function normCode(v) { return v == null ? '' : String(v).trim(); }
  // 품번 칸에 「합계」「소계」가 적힌 줄은 품목이 아니라 합계 줄입니다(실데이터 대구 시트 맨 아래에 있음)
  // ERP 내려받기 파일 맨 아래 「2026/09/12  오후 1:12:56」처럼 출력 일시가 품번 칸에 찍힌 합계 줄
  var STAMP_ROW = /^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}(\s|$)/;
  var TOTAL_ROW = /^(합\s*계|소\s*계|총\s*계|누\s*계|계|total|sum|subtotal)$/i;
  // 「12 개월초과」→ 13(=12개월을 넘음), 「8개월」「8 개월」→ 8, 0 → 0, 빈칸 → null
  function parseAgingMonths(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.floor(v) : null;
    var s = String(v).replace(/\s+/g, '');
    if (!s) return null;
    var m = s.match(/^(\d+)개?월?초과$/);
    if (m) return +m[1] + 1;
    m = s.match(/^(\d+)(개월|월)?$/);
    return m ? +m[1] : null;
  }
  function normHeader(s) { return String(s == null ? '' : s).replace(/[\s_\-()\[\]./]/g, '').toLowerCase(); }

  // ── 컬럼 짝짓기 ──────────────────────────────────────────────
  // 머리행 이름으로 필드를 짐작합니다. 같은 머리행을 두 필드에 주지 않습니다.
  // opts.avoidMonth: 이 달(예: 7)이 적힌 열은 되도록 피합니다 — 한 시트에 「7월재고수량」「8월재고수량」이
  // 나란히 있는 파일에서 당월 자리에 전월 칸이 잡히지 않게 하려는 것입니다.
  function guessMapping(headers, defKey, saved, opts) {
    var def = DEFS[defKey];
    var used = {};
    var map = {};
    var norm = headers.map(normHeader);
    var avoid = opts && opts.avoidMonth ? new RegExp('(^|[^0-9])' + opts.avoidMonth + '월') : null;
    // 1) 저장해 둔 짝이 이번 파일에도 있으면 그대로
    if (saved) def.fields.forEach(function (f) {
      var h = saved[f.key];
      if (h && headers.indexOf(h) >= 0 && !used[h]) { map[f.key] = h; used[h] = true; }
    });
    // 2) 이름이 똑같은 것 → 3) 이름이 들어 있는 것 순서로 (3은 피할 달이 없는 열부터)
    [['exact', false], ['contains', true], ['contains', false]].forEach(function (pass) {
      var exact = pass[0] === 'exact', skipAvoid = pass[1] && avoid;
      def.fields.forEach(function (f) {
        if (map[f.key]) return;
        for (var s = 0; s < f.syn.length && !map[f.key]; s++) {
          var target = normHeader(f.syn[s]);
          for (var i = 0; i < headers.length; i++) {
            if (used[headers[i]] || !norm[i]) continue;
            if (skipAvoid && avoid.test(norm[i])) continue;
            if (exact ? norm[i] === target : norm[i].indexOf(target) >= 0) {
              map[f.key] = headers[i]; used[headers[i]] = true; break;
            }
          }
        }
      });
    });
    return map;
  }

  // 머리행 위치 짐작: 위에서 15줄 안에서 필수 칸이 가장 많이 짝지어지는 줄(같으면 전체 짝 수, 그다음 위쪽)
  // ERP 내려받기 파일은 1행에 「회사명 : … / 재고현황」 같은 제목이 있어 2행이 머리행인 경우가 많습니다.
  function guessHeaderRow(aoa, defKey) {
    var best = 1, bestScore = -1;
    for (var r = 0; r < Math.min(15, (aoa || []).length); r++) {
      var tbl = tableToRows([aoa[r]], 1);
      var m = guessMapping(tbl.headers.map(function (h) { return /^\(빈 머리/.test(h) ? '' : h; }), defKey);
      var req = DEFS[defKey].fields.filter(function (f) { return f.required && m[f.key]; }).length;
      var score = req * 100 + Object.keys(m).length;
      if (score > bestScore) { bestScore = score; best = r + 1; }
    }
    return best;
  }

  // 시트 짐작: 자리(원자재·제품 × 당월·전월)에 맞는 이름의 시트를 고릅니다.
  //   「8월 원자재(본사)」 「대구 7월 원자재」처럼 종류 낱말 + 달 이 들어간 시트가 우선.
  //   「원자재」처럼 달이 없는 요약 시트보다 달이 맞는 시트가 앞섭니다. 반제품은 제품으로 보지 않습니다.
  // month: 이 자리의 달(1~12, 모르면 null). 돌려주는 값: { name, sure }
  function guessSheet(names, slotId, month) {
    var raw = /^raw/.test(slotId);
    var best = null, bestScore = -1;
    (names || []).forEach(function (n, i) {
      var t = String(n).replace(/\s+/g, '');
      var sc = 0;
      if (raw ? /원자재|자재|원재료/.test(t) : (/제품/.test(t) && !/반제품/.test(t))) sc += 2;
      var months = (t.match(/(\d{1,2})월/g) || []).map(function (x) { return parseInt(x, 10); });
      if (month && months.indexOf(month) >= 0) sc += months.length === 1 ? 3 : 1;
      else if (month && months.length) sc -= 1;
      if (sc > bestScore) { bestScore = sc; best = n; }
    });
    return { name: best, sure: bestScore >= 5 };
  }

  // 제목 줄의 날짜 찾기: 「회사명 : … / 2026/08/31 / 재고현황」 → 2026-08-31
  function dateFromTitle(aoa) {
    for (var r = 0; r < Math.min(3, (aoa || []).length); r++) {
      var line = (aoa[r] || []).join(' ');
      var m = line.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
      if (m) { var d = parseDate(m[1] + '-' + m[2] + '-' + m[3]); if (d) return toDateStr(d); }
    }
    return '';
  }

  function missingRequired(mapping, defKey) {
    return DEFS[defKey].fields.filter(function (f) { return f.required && !mapping[f.key]; })
      .map(function (f) { return f.label; });
  }

  // 표(배열의 배열)에서 머리행을 골라 행 객체로
  function tableToRows(aoa, headerRow) {
    var hi = Math.max(0, (headerRow || 1) - 1);
    var head = (aoa[hi] || []).map(function (h, i) {
      var s = String(h == null ? '' : h).trim();
      return s || ('(빈 머리 ' + (i + 1) + ')');
    });
    // 같은 이름이 둘이면 뒤에 번호를 붙여 구분
    var seen = {};
    head = head.map(function (h) { if (seen[h]) { seen[h]++; return h + ' (' + seen[h] + ')'; } seen[h] = 1; return h; });
    var rows = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var line = aoa[r] || [];
      var empty = true;
      var o = {};
      head.forEach(function (h, i) { var v = line[i]; if (v !== '' && v != null) empty = false; o[h] = v == null ? '' : v; });
      if (!empty) rows.push(o);
    }
    return { headers: head, rows: rows };
  }

  // 짝지은 대로 행을 읽어 레코드로. 문제 행은 건너뛰고 이유를 셉니다.
  function applyMapping(rows, mapping, defKey) {
    var def = DEFS[defKey];
    var out = [];
    var problems = {};
    function bad(code, rowNo) {
      if (!problems[code]) problems[code] = { code: code, count: 0, rows: [] };
      problems[code].count++;
      if (problems[code].rows.length < 5) problems[code].rows.push(rowNo);
    }
    rows.forEach(function (row, idx) {
      var rowNo = idx + 1;
      var rec = {};
      var skip = false;
      def.fields.forEach(function (f) {
        if (skip) return; // 품번에서 이미 뺀 줄(빈칸·합계 줄)은 다른 칸 문제를 또 세지 않습니다
        var col = mapping[f.key];
        var v = col ? row[col] : '';
        if (f.key === 'code') {
          rec.code = normCode(v);
          if (!rec.code) { bad('코드 빈칸', rowNo); skip = true; }
          else if (TOTAL_ROW.test(rec.code)) { bad('합계·소계 행 제외', rowNo); skip = true; }
          else if (STAMP_ROW.test(rec.code)) { bad('출력 일시 줄(합계) 제외', rowNo); skip = true; }
        }
        else if (f.key === 'agingFile') { rec.agingFile = parseAgingMonths(v); rec.agingFileText = v == null ? '' : String(v).trim(); }
        else if (f.key === 'name' || f.key === 'group') rec[f.key] = v == null ? '' : String(v).trim();
        else if (f.key === 'plant') rec.plant = normalizePlant(v);
        else if (f.key === 'date') {
          var d = parseDate(v);
          if (!d) { if (f.required) { bad(f.label + ' 날짜 아님', rowNo); skip = true; } rec.date = ''; }
          else rec.date = toDateStr(d);
        } else {
          var n = toNumber(v);
          if (n === null) { if (f.required) { bad(f.label + ' 빈칸', rowNo); skip = true; } rec[f.key] = null; }
          else if (isNaN(n)) { bad(f.label + ' 숫자 아님', rowNo); if (f.required) skip = true; rec[f.key] = null; }
          else rec[f.key] = n;
        }
      });
      if (!skip && rec.group === '' && mapping.group) rec.group = '(분류 없음)';
      if (!skip) out.push(rec);
    });
    return { records: out, problems: Object.keys(problems).map(function (k) { return problems[k]; }) };
  }

  // ── 공장 ──────────────────────────────────────────────────
  // 칸 값을 공장 이름으로: 인천·대구(분석 대상), 중국(제외 대상), 그 밖은 적힌 그대로
  function normalizePlant(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return NO_PLANT;
    var low = s.toLowerCase();
    var all = PLANTS.concat(EXCLUDED_PLANTS);
    for (var i = 0; i < all.length; i++) {
      for (var j = 0; j < all[i].alias.length; j++) if (low.indexOf(all[i].alias[j].toLowerCase()) >= 0) return all[i].id;
    }
    return s;
  }
  // 파일 이름으로 공장 짐작: 「8월재고분석현황(대구).xlsx」 → 대구, 「8월재고분석(본사).xlsx」 → 인천
  function plantFromFileName(name) {
    var p = normalizePlant(String(name || '').replace(/\.[a-z0-9]+$/i, ''));
    return isPlant(p) ? p : NO_PLANT;
  }
  function isPlant(p) { return PLANTS.some(function (x) { return x.id === p; }); }
  function isExcludedPlant(p) { return EXCLUDED_PLANTS.some(function (x) { return x.id === p; }); }
  function plantLabel(p) { return p ? p : '공장 미지정'; }

  // 읽은 레코드에 공장을 붙입니다. 파일에 공장 칸이 있고 값이 있으면 그 값, 없으면 파일에 지정한 공장.
  // 중국공장 등 제외 대상 행은 빼고 개수를 돌려줍니다.
  function assignPlant(records, filePlant) {
    var out = [], excluded = 0, other = {};
    (records || []).forEach(function (r) {
      var p = r.plant || filePlant || NO_PLANT;
      if (isExcludedPlant(p)) { excluded++; return; }
      if (p && !isPlant(p)) other[p] = (other[p] || 0) + 1;
      var c = {};
      Object.keys(r).forEach(function (k) { c[k] = r[k]; });
      c.plant = p;
      out.push(c);
    });
    return { records: out, excluded: excluded, otherPlants: Object.keys(other) };
  }

  // 보기(합계·인천·대구)에 맞춰 자료를 거릅니다.
  //  재고: 합계 보기면 전부, 공장 보기면 그 공장 행만.
  //  입·출고 이력과 단가표: 공장이 비어 있으면 「공통」으로 보고 어느 보기에나 넣습니다.
  function filterByPlant(data, plant) {
    if (!plant) return data;
    var out = {};
    Object.keys(data || {}).forEach(function (k) {
      var stock = /^(raw|prod)(Cur|Prev)$/.test(k);
      out[k] = (data[k] || []).filter(function (r) { return r.plant === plant || (!stock && !r.plant); });
    });
    return out;
  }
  // 예전 저장 형식(자리마다 파일 하나) → 새 형식(자리마다 파일 여러 개 parts)
  function migrateSlotData(d) {
    var out = {};
    Object.keys(d || {}).forEach(function (k) {
      var v = d[k];
      if (!v) return;
      if (v.parts) { out[k] = v; return; }
      var part = {};
      Object.keys(v).forEach(function (x) { part[x] = v[x]; });
      part.plant = part.plant || NO_PLANT;
      out[k] = { parts: [part] };
    });
    return out;
  }

  // 표 하나를 자리에 맞게 읽는 전 과정(머리행 짐작 → 짝 짐작 → 행 읽기 → 공장 붙이기).
  // 화면은 이 단계를 사용자가 고칠 수 있게 나눠 쓰고, 예시 데이터·테스트·실데이터 확인 스크립트는 이 함수를 씁니다.
  // o: { headerRow, mapping, saved, avoidMonth, plant(파일에 지정한 공장) }
  function importTable(aoa, defKey, o) {
    o = o || {};
    var hr = o.headerRow || guessHeaderRow(aoa, defKey);
    var tbl = tableToRows(aoa, hr);
    var mapping = o.mapping || guessMapping(tbl.headers, defKey, o.saved, { avoidMonth: o.avoidMonth });
    var r = applyMapping(tbl.rows, mapping, defKey);
    var pl = assignPlant(r.records, o.plant || NO_PLANT);
    var problems = r.problems.slice();
    if (pl.excluded) problems.push({ code: '분석 제외 공장(중국 등) 행', count: pl.excluded, rows: [] });
    return {
      headerRow: hr, headers: tbl.headers, rowCount: tbl.rows.length, mapping: mapping,
      missing: missingRequired(mapping, defKey), records: pl.records, problems: problems, otherPlants: pl.otherPlants
    };
  }

  // ── 집계 도우미 ──────────────────────────────────────────────
  // 같은 품번이 여러 줄(창고·로트·공장별)이면 수량·금액·입출고 수량을 더합니다.
  // 파일에 금액이 없고 단가 칸만 있으면 그 줄의 금액 = 수량 × 단가 로 봅니다.
  function aggregateStock(records) {
    var map = {};
    var order = [];
    (records || []).forEach(function (r) {
      var m = map[r.code];
      if (!m) { m = map[r.code] = { code: r.code, name: r.name || '', group: r.group || '', qty: 0, fileAmount: null, inQty: null, outQty: null, agingFile: null, agingFileText: '', plants: [] }; order.push(r.code); }
      if (!m.name && r.name) m.name = r.name;
      if ((!m.group || m.group === '(분류 없음)') && r.group) m.group = r.group;
      m.qty += r.qty || 0;
      var amt = r.amount != null ? r.amount : (r.price != null && r.qty != null ? round(r.qty * r.price, 2) : null);
      if (amt != null) m.fileAmount = round((m.fileAmount || 0) + amt, 2);
      if (r.inQty != null) m.inQty = (m.inQty || 0) + r.inQty;
      if (r.outQty != null) m.outQty = (m.outQty || 0) + r.outQty;
      if (r.plant && m.plants.indexOf(r.plant) < 0) m.plants.push(r.plant);
      // 여러 줄이면 가장 오래된(큰) 경과 개월
      if (r.agingFile != null && (m.agingFile == null || r.agingFile > m.agingFile)) { m.agingFile = r.agingFile; m.agingFileText = r.agingFileText; }
    });
    return { map: map, order: order };
  }
  // 품목 기준정보(단가표 파일의 품명·대분류 칸) — 재고 파일에 대분류가 비어 있을 때 채웁니다
  function masterMap(prices) {
    var out = {};
    (prices || []).forEach(function (p) {
      var m = out[p.code] || (out[p.code] = { name: '', group: '' });
      if (p.name) m.name = p.name;
      if (p.group) m.group = p.group;
    });
    return out;
  }

  // 품번별 기준일 이전(포함) 가장 최근 날짜
  function lastDateByCode(history, asOf) {
    var out = {};
    (history || []).forEach(function (h) {
      var d = parseDate(h.date);
      if (!d || (asOf && d > asOf)) return;
      var s = toDateStr(d);
      if (!out[h.code] || out[h.code] < s) out[h.code] = s;
    });
    return out;
  }
  // 품번별 (from, to] 기간 수량 합
  function sumQtyByCode(history, from, to) {
    var out = {};
    (history || []).forEach(function (h) {
      var d = parseDate(h.date);
      if (!d || (to && d > to) || (from && d <= from)) return;
      out[h.code] = (out[h.code] || 0) + (h.qty || 0);
    });
    return out;
  }

  // 단가: 적용일이 기준일 이전인 것 중 가장 최근. 적용일이 없는 행은 가장 낮은 순위,
  // 같은 순위면 파일에서 뒤에 나온 행을 씁니다(가정 — 기획서 10장 6번).
  function priceMapAt(prices, asOf) {
    var best = {};
    (prices || []).forEach(function (p, i) {
      if (p.price == null) return;
      var d = p.date ? parseDate(p.date) : null;
      if (d && asOf && d > asOf) return;
      var key = d ? toDateStr(d) : '';
      var b = best[p.code];
      if (!b || key > b.key || (key === b.key && i > b.i)) best[p.code] = { key: key, i: i, price: p.price };
    });
    var out = {};
    Object.keys(best).forEach(function (k) { out[k] = best[k].price; });
    return out;
  }

  function rate(prev, cur) {
    if (prev == null || cur == null) return null;
    if (prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  }
  function round(n, digits) {
    if (n == null || !isFinite(n)) return n;
    var f = Math.pow(10, digits || 0);
    return Math.round(n * f) / f;
  }

  // Aging 구간(개월): 경계 [3,6,12] → 0~3개월 / 4~6개월 / 7~12개월 / 12개월 초과
  // 경과 개월은 정수이므로 경계도 1 이상의 정수만 받습니다.
  function parseBounds(text) {
    var list = String(text == null ? '' : text).split(/[,\s]+/).filter(function (x) { return x !== ''; }).map(Number)
      .filter(function (n) { return isFinite(n) && n > 0 && Math.floor(n) === n; });
    list.sort(function (a, b) { return a - b; });
    return list.filter(function (n, i) { return i === 0 || n !== list[i - 1]; });
  }
  function boundsInvalid(text) {
    return String(text == null ? '' : text).split(/[,\s]+/).filter(function (x) { return x !== ''; })
      .some(function (x) { var n = Number(x); return !(isFinite(n) && n > 0 && Math.floor(n) === n); });
  }
  function bucketLabels(bounds) {
    var labels = [];
    var lo = 0;
    bounds.forEach(function (b) { labels.push(lo + '~' + b + '개월'); lo = b + 1; });
    labels.push((bounds.length ? bounds[bounds.length - 1] : 0) + '개월 초과');
    labels.push('날짜 없음');
    return labels;
  }
  function bucketOf(months, bounds) {
    var labels = bucketLabels(bounds);
    if (months == null) return labels[labels.length - 1];
    for (var i = 0; i < bounds.length; i++) if (months <= bounds[i]) return labels[i];
    return labels[bounds.length];
  }
  // 적정성: Aging(표시 기준) 경과 개월로 나눕니다(기획서 5장·11장).
  function fitnessOf(months, overMonths, deadMonths) {
    if (months == null) return '판정 보류';
    if (deadMonths != null && months > deadMonths) return '불용';
    if (overMonths != null && months > overMonths) return '과잉';
    return '적정';
  }

  // 대분류 묶음표 읽기. 한 줄에 하나:  HSG=하우징류   /   품번:CI184-*=파크라케이블(CI184)
  //   「품번:」으로 시작하면 품번(앞부분 일치, 끝의 *)으로 묶고, 대분류 코드보다 먼저 봅니다.
  function parseGroupMap(text) {
    var out = { byGroup: {}, byCode: [], count: 0, errors: [] };
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line, i) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') return;
      var eq = t.lastIndexOf('=');
      if (eq <= 0 || eq === t.length - 1) { out.errors.push((i + 1) + '번째 줄은 「코드=보고서 대분류」 형식이 아닙니다.'); return; }
      var key = t.slice(0, eq).trim(), name = t.slice(eq + 1).trim();
      var cm = key.match(/^품번\s*[:：]\s*(.+)$/);
      if (cm) out.byCode.push({ prefix: cm[1].replace(/\*$/, '').trim().toUpperCase(), name: name });
      else out.byGroup[key.toUpperCase()] = name;
      out.count++;
    });
    return out;
  }
  // 품목 하나의 보고서 대분류. 묶음표가 비어 있으면 적힌 그대로 둡니다.
  function mapGroup(group, code, gm, others) {
    if (!gm || !gm.count) return group;
    var c = String(code || '').toUpperCase();
    for (var i = 0; i < gm.byCode.length; i++) if (c.indexOf(gm.byCode[i].prefix) === 0) return gm.byCode[i].name;
    var g = String(group || '').trim().toUpperCase();
    if (gm.byGroup[g]) return gm.byGroup[g];
    // 이미 보고서 대분류 이름이면(예: 예시 데이터) 그대로
    var names = Object.keys(gm.byGroup).map(function (k) { return gm.byGroup[k]; }).concat(gm.byCode.map(function (x) { return x.name; }));
    if (names.indexOf(String(group || '').trim()) >= 0) return String(group).trim();
    return others === 'keep' ? (group || '(분류 없음)') : '기타';
  }

  function checkSettings(s) {
    var errors = [];
    var cur = parseDate(s.curDate);
    if (!cur) errors.push('당월 기준일을 입력해 주세요.');
    var prev = s.prevDate ? parseDate(s.prevDate) : (cur ? prevMonthEnd(cur) : null);
    if (s.prevDate && !prev) errors.push('전월 기준일 형식이 올바르지 않습니다.');
    if (cur && prev && prev >= cur) errors.push('전월 기준일은 당월 기준일보다 앞이어야 합니다.');
    var over = toNumber(s.overMonths), dead = toNumber(s.deadMonths);
    if (over == null || isNaN(over) || over < 0 || Math.floor(over) !== over) errors.push('과잉 기준 개월을 0 이상 정수로 입력해 주세요.');
    if (dead == null || isNaN(dead) || dead < 0 || Math.floor(dead) !== dead) errors.push('불용 기준 개월을 0 이상 정수로 입력해 주세요.');
    if (!errors.length && dead < over) errors.push('불용 기준 개월은 과잉 기준 개월보다 크거나 같아야 합니다.');
    if (boundsInvalid(s.agingMonths)) errors.push('Aging 구간 경계는 1 이상의 정수(개월)로 입력해 주세요(예: 3, 6, 12).');
    else if (!parseBounds(s.agingMonths).length) errors.push('Aging 구간 경계를 하나 이상 입력해 주세요(예: 3, 6, 12).');
    var topN = toNumber(s.topN);
    if (topN == null || isNaN(topN) || topN < 0) errors.push('증가 상위 건수를 0 이상 숫자로 입력해 주세요.');
    var tm = toNumber(s.turnoverMax);
    if (tm !== null && (isNaN(tm) || tm < 0)) errors.push('저회전 기준은 비우거나 0 이상 숫자로 입력해 주세요.');
    var ctn = s.causeTopN == null || s.causeTopN === '' ? 5 : toNumber(s.causeTopN);
    if (ctn == null || isNaN(ctn) || ctn < 1) errors.push('증감 원인 상위 품목 수를 1 이상 숫자로 입력해 주세요.');
    var gm = parseGroupMap(s.groupMap);
    if (gm.errors.length) errors.push('대분류 묶음표 ' + gm.errors[0]);
    var pv = s.plantView || '';
    return {
      ok: !errors.length, errors: errors,
      cur: cur, prev: prev, bounds: parseBounds(s.agingMonths),
      overMonths: over, deadMonths: dead, topN: topN, turnoverMax: tm, causeTopN: ctn,
      groupMap: gm, groupOthers: s.groupOthers === 'keep' ? 'keep' : 'other',
      plantView: isPlant(pv) ? pv : '',
      noOutPolicy: s.noOutPolicy === 'none' ? 'none' : 'inbound',
      amountSource: s.amountSource === 'file' ? 'file' : 'price'
    };
  }

  // ── 한 종류(원자재 또는 제품) 분석 ───────────────────────────
  function analyzeKind(curRecs, prevRecs, ctx) {
    var cur = aggregateStock(curRecs);
    var prev = aggregateStock(prevRecs);
    var codes = cur.order.slice();
    prev.order.forEach(function (c) { if (!cur.map[c]) codes.push(c); });
    var hasFlow = false;
    var items = codes.map(function (code) {
      var c = cur.map[code], p = prev.map[code], ms = ctx.master[code] || {};
      var curQty = c ? c.qty : 0, prevQty = p ? p.qty : 0;
      var curAmt = amountOf(c, ctx.curPrice[code], ctx.amountSource);
      var prevAmt = amountOf(p, ctx.prevPrice[code], ctx.amountSource);
      var lastIn = ctx.lastIn[code] || '';
      var lastOut = ctx.lastOut[code] || '';
      // Aging — 경과 개월(monthsBetween). 일수는 참고용으로 함께 둡니다.
      var dIn = lastIn ? parseDate(lastIn) : null, dOut = lastOut ? parseDate(lastOut) : null;
      var agingIn = dIn ? monthsBetween(dIn, ctx.cur) : null;
      var agingOut = dOut ? monthsBetween(dOut, ctx.cur) : null;
      var agingInDays = dIn ? daysBetween(dIn, ctx.cur) : null;
      var agingOutDays = dOut ? daysBetween(dOut, ctx.cur) : null;
      // 표시 기준 순서: 최근 출고일 → (없으면) 재고 파일의 경과 개월 칸(ERP 재고잔량분석) → (설정 시) 최근 입고일
      var agingFile = c && c.agingFile != null ? c.agingFile : null;
      var shown = agingOut, shownDays = agingOutDays, basis = '출고일';
      if (agingOut == null) {
        if (agingFile != null) { shown = agingFile; shownDays = null; basis = '파일 경과 개월'; }
        else if (ctx.noOutPolicy === 'inbound' && agingIn != null) { shown = agingIn; shownDays = agingInDays; basis = '입고일 대체'; }
        else { shown = null; shownDays = null; basis = '없음'; }
      }
      // 당월 입고·출고 수량: 재고 파일에 칸이 있으면 그 값, 없으면 입·출고 이력에서 (전월 기준일, 당월 기준일] 합계
      var inQty = c && c.inQty != null ? c.inQty : (ctx.hasInbound ? ctx.inQty[code] || 0 : null);
      var outQty = c && c.outQty != null ? c.outQty : (ctx.hasOutbound ? ctx.outQty[code] || 0 : null);
      var flowSource = (c && (c.inQty != null || c.outQty != null)) ? '재고 파일' : (ctx.hasInbound || ctx.hasOutbound ? '입출고 이력' : '');
      if (inQty != null || outQty != null) hasFlow = true;
      var avg = (curQty + prevQty) / 2;
      var turnover = avg > 0 && outQty != null ? outQty / avg : null;
      var change = !p || prevQty === 0 ? (curQty === 0 ? '유지' : '신규') : (!c || curQty === 0 ? '소멸' : '유지');
      var groupRaw = (c && c.group && c.group !== '(분류 없음)' ? c.group : '') || (p && p.group && p.group !== '(분류 없음)' ? p.group : '') || ms.group || '';
      var group = ctx.kindIsRaw ? mapGroup(groupRaw, code, ctx.groupMap, ctx.groupOthers) : (groupRaw || '(분류 없음)');
      if (!group) group = '(분류 없음)';
      var it = {
        code: code,
        name: (c && c.name) || (p && p.name) || ms.name || '',
        group: group, groupRaw: groupRaw,
        plants: mergePlants(c, p),
        prevQty: prevQty, curQty: curQty, diffQty: round(curQty - prevQty, 4), qtyRate: rate(prevQty, curQty),
        prevPrice: ctx.prevPrice[code] == null ? null : ctx.prevPrice[code],
        curPrice: ctx.curPrice[code] == null ? null : ctx.curPrice[code],
        prevAmt: prevAmt.value, curAmt: curAmt.value,
        diffAmt: (curAmt.value == null && prevAmt.value == null) ? null : round((curAmt.value || 0) - (prevAmt.value || 0), 2),
        amtRate: rate(prevAmt.value, curAmt.value),
        curAmtSource: c ? curAmt.source : '', prevAmtSource: p ? prevAmt.source : '',
        change: change,
        lastIn: lastIn, lastOut: lastOut, agingIn: agingIn, agingOut: agingOut,
        agingInDays: agingInDays, agingOutDays: agingOutDays, agingFile: agingFile, agingFileText: c ? c.agingFileText : '',
        agingShown: shown, agingShownDays: shownDays, agingBasis: basis,
        bucket: bucketOf(shown, ctx.bounds),
        fitness: curQty > 0 ? fitnessOf(shown, ctx.overMonths, ctx.deadMonths) : '재고 없음',
        inQty: inQty, outQty: outQty, flowSource: flowSource,
        inQtyPrev: ctx.hasInbound ? ctx.inQtyPrev[code] || 0 : null,
        outQtyPrev: ctx.hasOutbound ? ctx.outQtyPrev[code] || 0 : null,
        turnover: turnover == null ? null : round(turnover, 2)
      };
      decompose(it);
      return it;
    });
    return {
      items: items, groups: groupSummary(items, ctx.kindIsRaw ? ctx.groupOrder : null), buckets: bucketSummary(items, ctx.bounds), fitness: fitnessSummary(items),
      cause: causeSummary(items, ctx.causeTopN, ctx.kindIsRaw ? ctx.groupOrder : null), hasFlow: hasFlow
    };
  }
  function mergePlants(c, p) {
    var out = [];
    [c, p].forEach(function (x) { if (x) x.plants.forEach(function (pl) { if (out.indexOf(pl) < 0) out.push(pl); }); });
    return out.sort();
  }

  // ── 증감 원인 분해 (기획서 11장) ─────────────────────────────
  // 금액 증감 = 수량 효과 + 단가 효과 + 신규 품목 + 소멸 품목 + 금액 미산정
  //   (두 달 모두 재고가 있는 품목)
  //     전월 단위금액 Up = 전월 금액 ÷ 전월 수량,  당월 Uc = 당월 금액 ÷ 당월 수량
  //     수량 효과 = (당월 수량 − 전월 수량) × Up      ← 전월 단가로 잰 물량 변화
  //     단가 효과 = 당월 수량 × (Uc − Up)             ← 같은 물량의 단가 변화
  //     두 효과의 합은 당월 금액 − 전월 금액과 정확히 같습니다.
  //     수량 효과는 다시 입고 × Up, − 출고(사용) × Up, 조정·기타 × Up 로 나눕니다.
  //       조정·기타 수량 = 당월 수량 − (전월 수량 + 입고 − 출고) — 실사 차이, 이동, 누락된 이력 등
  //   (전월 재고 0 → 당월 재고 있음) 신규 품목 = 당월 금액
  //   (전월 재고 있음 → 당월 0)      소멸 품목 = − 전월 금액
  //   (재고가 있는데 금액을 못 구한 달이 있음) 금액 미산정 = 그 품목의 금액 증감 전체
  var EFFECT_KEYS = ['inflow', 'outflow', 'adjust', 'price', 'newItem', 'goneItem', 'noAmount'];
  var EFFECT_LABELS = {
    inflow: '입고', outflow: '출고·사용', adjust: '조정·기타(입출고로 설명 안 되는 수량)', price: '단가 변동',
    newItem: '신규 품목', goneItem: '소멸 품목', noAmount: '금액 미산정 품목'
  };
  function decompose(it) {
    var e = { inflow: 0, outflow: 0, adjust: 0, price: 0, newItem: 0, goneItem: 0, noAmount: 0 };
    var Qp = it.prevQty, Qc = it.curQty;
    var missing = (Qc !== 0 && it.curAmt == null) || (Qp !== 0 && it.prevAmt == null);
    var kind = 'none';
    if (missing) { e.noAmount = it.diffAmt || 0; kind = 'noAmount'; }
    else if (Qp === 0 && Qc === 0) kind = 'none';
    else if (Qp === 0) { e.newItem = it.curAmt || 0; kind = 'new'; }
    else if (Qc === 0) { e.goneItem = -(it.prevAmt || 0); kind = 'gone'; }
    else {
      var Up = it.prevAmt / Qp, Uc = it.curAmt / Qc;
      var inQ = it.inQty || 0, outQ = it.outQty || 0;
      // 조정·기타 = (당월 − 전월 − 입고 + 출고) × Up. 금액 증감에서 나머지를 빼서 구하면 같은 값이고 반올림 찌꺼기도 흡수됩니다.
      e.inflow = round(inQ * Up, 2);
      e.outflow = round(-outQ * Up, 2);
      e.price = round(Qc * (Uc - Up), 2);
      e.adjust = round((it.diffAmt || 0) - e.inflow - e.outflow - e.price, 2);
      kind = 'both';
      it.unitPrev = round(Up, 4); it.unitCur = round(Uc, 4);
    }
    it.effects = e;
    it.effectKind = kind;
    it.qtyEffect = round(e.inflow + e.outflow + e.adjust, 2);
    it.driver = driverOf(e, it);
    return it;
  }
  // 가장 크게 움직인 요인 한 가지를 글로
  function driverOf(e, it) {
    var best = null;
    EFFECT_KEYS.forEach(function (k) { if (e[k] && (!best || Math.abs(e[k]) > Math.abs(e[best]))) best = k; });
    if (!best) return '';
    if (best === 'price') return e.price > 0 ? '단가 상승' : '단가 하락';
    if (best === 'inflow') return '입고';
    if (best === 'outflow') return '출고·사용';
    if (best === 'adjust') return it.inQty == null && it.outQty == null ? '수량 ' + (e.adjust > 0 ? '증가' : '감소') + '(입출고 자료 없음)' : '조정·기타 수량';
    return EFFECT_LABELS[best];
  }

  function causeSummary(items, topN, sortOrder) {
    var map = {}, order = [];
    var total = newCause('합계');
    items.forEach(function (it) {
      var g = map[it.group];
      if (!g) { g = map[it.group] = newCause(it.group); order.push(it.group); }
      [g, total].forEach(function (x) {
        EFFECT_KEYS.forEach(function (k) { x.effects[k] += it.effects[k]; });
        x.prevAmt += it.prevAmt || 0; x.curAmt += it.curAmt || 0;
        x.prevQty += it.prevQty; x.curQty += it.curQty;
        if (it.inQty != null) x.inQty += it.inQty;
        if (it.outQty != null) x.outQty += it.outQty;
        if (it.effectKind === 'new') x.newCount++;
        if (it.effectKind === 'gone') x.goneCount++;
        if (it.effectKind === 'noAmount') x.noAmountCount++;
        x.items.push(it);
      });
    });
    order.sort(groupSorter(sortOrder));
    function finish(x) {
      EFFECT_KEYS.forEach(function (k) { x.effects[k] = round(x.effects[k], 2); });
      x.prevAmt = round(x.prevAmt, 2); x.curAmt = round(x.curAmt, 2);
      x.diffAmt = round(x.curAmt - x.prevAmt, 2); x.amtRate = rate(x.prevAmt, x.curAmt);
      x.diffQty = round(x.curQty - x.prevQty, 4); x.qtyRate = rate(x.prevQty, x.curQty);
      x.qtyEffect = round(x.effects.inflow + x.effects.outflow + x.effects.adjust, 2);
      // 기여 상위: 금액 증감 절댓값 큰 순(같으면 품번 순)
      x.top = x.items.filter(function (it) { return it.diffAmt; })
        .sort(function (a, b) { return Math.abs(b.diffAmt) - Math.abs(a.diffAmt) || (a.code < b.code ? -1 : 1); })
        .slice(0, topN || 5);
      x.itemCount = x.items.length;
      delete x.items;
      return x;
    }
    return { rows: order.map(function (k) { return finish(map[k]); }), total: finish(total) };
  }
  function newCause(name) {
    var e = {};
    EFFECT_KEYS.forEach(function (k) { e[k] = 0; });
    return { group: name, effects: e, prevAmt: 0, curAmt: 0, prevQty: 0, curQty: 0, inQty: 0, outQty: 0, newCount: 0, goneCount: 0, noAmountCount: 0, items: [] };
  }
  // 대분류 한 줄 요약(자동 문장): 금액 증감과 큰 요인 순서
  function causeSentence(g, fmtNum) {
    var f = fmtNum || function (n) { return String(round(n, 0)); };
    function sg(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n)); }
    var parts = EFFECT_KEYS.filter(function (k) { return g.effects[k]; })
      .sort(function (a, b) { return Math.abs(g.effects[b]) - Math.abs(g.effects[a]); })
      .map(function (k) { return EFFECT_LABELS[k].replace(/\(.*\)$/, '') + ' ' + sg(g.effects[k]); });
    var r = g.amtRate == null ? '' : ' (' + (g.amtRate > 0 ? '+' : '') + round(g.amtRate * 100, 1) + '%)';
    return g.group + ' 금액 ' + sg(g.diffAmt) + r + (parts.length ? ' = ' + parts.join(', ') : '');
  }

  function amountOf(stock, price, source) {
    if (!stock) return { value: null, source: '' };
    var byPrice = price == null ? null : round(stock.qty * price, 2);
    if (source === 'file') {
      if (stock.fileAmount != null) return { value: stock.fileAmount, source: '파일 금액' };
      if (byPrice != null) return { value: byPrice, source: '단가표' };
    } else {
      if (byPrice != null) return { value: byPrice, source: '단가표' };
      if (stock.fileAmount != null) return { value: stock.fileAmount, source: '파일 금액' };
    }
    return { value: null, source: '금액 없음' };
  }

  // 대분류 순서: 묶음표에 적은 순서 → 그 밖은 가나다 → 「기타」「(분류 없음)」은 맨 뒤
  function groupSorter(order) {
    order = order || [];
    function rank(g) { var i = order.indexOf(g); return i >= 0 ? i : (g === '기타' ? 1e6 : g === '(분류 없음)' ? 1e6 + 1 : 1e5); }
    return function (a, b) { return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0); };
  }
  function groupOrderOf(gm) {
    if (!gm || !gm.count) return [];
    var out = [];
    Object.keys(gm.byGroup).forEach(function (k) { if (out.indexOf(gm.byGroup[k]) < 0) out.push(gm.byGroup[k]); });
    gm.byCode.forEach(function (x) { if (out.indexOf(x.name) < 0) out.push(x.name); });
    return out;
  }
  function groupSummary(items, sortOrder) {
    var map = {}, order = [];
    var total = newGroup('합계');
    items.forEach(function (it) {
      var g = map[it.group];
      if (!g) { g = map[it.group] = newGroup(it.group); order.push(it.group); }
      [g, total].forEach(function (x) {
        x.itemCount += it.curQty !== 0 ? 1 : 0;
        x.prevItemCount += it.prevQty !== 0 ? 1 : 0;
        x.prevQty += it.prevQty; x.curQty += it.curQty;
        x.prevAmt += it.prevAmt || 0; x.curAmt += it.curAmt || 0;
        if ((it.curQty !== 0 && it.curAmt == null) || (it.prevQty !== 0 && it.prevAmt == null)) x.noAmount++;
      });
    });
    order.sort(groupSorter(sortOrder));
    var rows = order.map(function (k) { return finishGroup(map[k]); });
    return { rows: rows, total: finishGroup(total) };
  }
  function newGroup(name) { return { group: name, itemCount: 0, prevItemCount: 0, prevQty: 0, curQty: 0, prevAmt: 0, curAmt: 0, noAmount: 0 }; }
  function finishGroup(g) {
    g.prevAmt = round(g.prevAmt, 2); g.curAmt = round(g.curAmt, 2);
    g.diffQty = round(g.curQty - g.prevQty, 4); g.diffAmt = round(g.curAmt - g.prevAmt, 2);
    g.qtyRate = rate(g.prevQty, g.curQty); g.amtRate = rate(g.prevAmt, g.curAmt);
    return g;
  }
  function bucketSummary(items, bounds) {
    var labels = bucketLabels(bounds);
    var map = {};
    labels.forEach(function (l) { map[l] = { bucket: l, count: 0, qty: 0, amount: 0 }; });
    items.forEach(function (it) {
      if (it.curQty === 0) return;
      var b = map[it.bucket];
      b.count++; b.qty += it.curQty; b.amount += it.curAmt || 0;
    });
    return labels.map(function (l) { map[l].amount = round(map[l].amount, 2); return map[l]; });
  }
  function fitnessSummary(items) {
    var labels = ['적정', '과잉', '불용', '판정 보류'];
    var map = {};
    labels.forEach(function (l) { map[l] = { fitness: l, count: 0, qty: 0, amount: 0 }; });
    items.forEach(function (it) {
      var f = map[it.fitness];
      if (!f) return; // 재고 없음은 세지 않음
      f.count++; f.qty += it.curQty; f.amount += it.curAmt || 0;
    });
    return labels.map(function (l) { map[l].amount = round(map[l].amount, 2); return map[l]; });
  }

  // ── 관리대상 후보 ────────────────────────────────────────────
  // 사유: 금액 증가 상위 N / 과잉 / 불용 / 저회전(기준을 넣었을 때만)
  function selectTargets(items, kindLabel, ctx) {
    var byCode = {};
    function add(it, reason) {
      var t = byCode[it.code];
      if (!t) {
        t = byCode[it.code] = {
          kind: kindLabel, code: it.code, name: it.name, group: it.group,
          curQty: it.curQty, curAmt: it.curAmt, diffQty: it.diffQty, diffAmt: it.diffAmt,
          agingShown: it.agingShown, agingBasis: it.agingBasis, lastOut: it.lastOut,
          fitness: it.fitness, turnover: it.turnover, reasons: []
        };
      }
      t.reasons.push(reason);
    }
    var inc = items.filter(function (it) { return it.diffAmt != null && it.diffAmt > 0; })
      .sort(function (a, b) { return b.diffAmt - a.diffAmt || (a.code < b.code ? -1 : 1); });
    inc.slice(0, ctx.topN || 0).forEach(function (it, i) { add(it, '금액 증가 상위 ' + (i + 1) + '위'); });
    items.forEach(function (it) {
      if (it.curQty <= 0) return;
      if (it.fitness === '불용') add(it, '불용(장기 미출고)');
      else if (it.fitness === '과잉') add(it, '과잉');
      if (ctx.turnoverMax != null && it.turnover != null && it.turnover < ctx.turnoverMax) add(it, '저회전');
    });
    return Object.keys(byCode).map(function (k) { return byCode[k]; });
  }

  // 단가를 찾지 못한 품목(재고가 있는 달 기준)
  // 파일 금액 우선(file)일 때는 파일 금액이 있으면 단가표가 없어도 문제가 아니므로, 금액을 못 구한 달만 셉니다.
  function unmatchedList(items, kindLabel, source) {
    var out = [];
    items.forEach(function (it) {
      var months = [];
      var curMiss = it.curQty !== 0 && it.curPrice == null && (source !== 'file' || it.curAmt == null);
      var prevMiss = it.prevQty !== 0 && it.prevPrice == null && (source !== 'file' || it.prevAmt == null);
      if (curMiss) months.push('당월');
      if (prevMiss) months.push('전월');
      if (!months.length) return;
      var note = [];
      if (curMiss) note.push(it.curAmtSource === '파일 금액' ? '당월은 파일 금액 사용' : '당월 금액 없음');
      if (prevMiss) note.push(it.prevAmtSource === '파일 금액' ? '전월은 파일 금액 사용' : '전월 금액 없음');
      out.push({ kind: kindLabel, code: it.code, name: it.name, group: it.group, months: months.join('·'), curQty: it.curQty, prevQty: it.prevQty, note: note.join(', ') });
    });
    return out;
  }

  // ── 전체 분석 ────────────────────────────────────────────────
  // data: { rawCur, rawPrev, prodCur, prodPrev, inbound, outbound, price } 각 레코드 배열
  // settings.plantView 가 '인천'·'대구'면 그 공장 자료만, 비어 있으면 합계(인천+대구)로 분석합니다.
  function analyze(data, settings) {
    var s = checkSettings(settings || {});
    if (!s.ok) return { ok: false, errors: s.errors };
    var all = data || {};
    var res = analyzeFiltered(filterByPlant(all, s.plantView), s);
    res.plantView = s.plantView;
    res.plants = plantSummary(all, s);
    return res;
  }
  function analyzeFiltered(data, s) {
    var prices = data.price || [];
    var prevPrev = prevMonthEnd(s.prev);
    var ctx = {
      cur: s.cur, prev: s.prev, bounds: s.bounds, overMonths: s.overMonths, deadMonths: s.deadMonths,
      topN: s.topN, turnoverMax: s.turnoverMax, noOutPolicy: s.noOutPolicy, amountSource: s.amountSource, causeTopN: s.causeTopN,
      groupMap: s.groupMap, groupOthers: s.groupOthers, groupOrder: groupOrderOf(s.groupMap),
      curPrice: priceMapAt(prices, s.cur), prevPrice: priceMapAt(prices, s.prev), master: masterMap(prices),
      lastIn: lastDateByCode(data.inbound, s.cur), lastOut: lastDateByCode(data.outbound, s.cur),
      hasInbound: !!(data.inbound && data.inbound.length), hasOutbound: !!(data.outbound && data.outbound.length),
      inQty: sumQtyByCode(data.inbound, s.prev, s.cur), outQty: sumQtyByCode(data.outbound, s.prev, s.cur),
      inQtyPrev: sumQtyByCode(data.inbound, prevPrev, s.prev), outQtyPrev: sumQtyByCode(data.outbound, prevPrev, s.prev)
    };
    ctx.kindIsRaw = true;
    var raw = analyzeKind(data.rawCur, data.rawPrev, ctx);
    ctx.kindIsRaw = false;
    var prod = analyzeKind(data.prodCur, data.prodPrev, ctx);
    var targets = selectTargets(raw.items, '원자재', ctx).concat(selectTargets(prod.items, '제품', ctx));
    var unmatched = unmatchedList(raw.items, '원자재', ctx.amountSource).concat(unmatchedList(prod.items, '제품', ctx.amountSource));
    return {
      ok: true, errors: [],
      curDate: toDateStr(s.cur), prevDate: toDateStr(s.prev), bounds: s.bounds,
      hasHistory: { inbound: ctx.hasInbound, outbound: ctx.hasOutbound, price: !!prices.length },
      raw: raw, product: prod, targets: targets, unmatched: unmatched
    };
  }
  // 공장별 요약 — 인천·대구(와 공장 미지정 자료가 있으면 그것까지) 각각의 합계 줄 + 전체 합계
  function plantSummary(data, s) {
    var seen = {};
    ['rawCur', 'rawPrev', 'prodCur', 'prodPrev'].forEach(function (k) { (data[k] || []).forEach(function (r) { seen[r.plant || NO_PLANT] = true; }); });
    var ids = PLANTS.map(function (p) { return p.id; });
    Object.keys(seen).forEach(function (p) { if (ids.indexOf(p) < 0) ids.push(p); });
    var rows = ids.map(function (p) {
      var sub = {};
      Object.keys(data).forEach(function (k) {
        var stock = /^(raw|prod)(Cur|Prev)$/.test(k);
        sub[k] = (data[k] || []).filter(function (r) { return (r.plant || NO_PLANT) === p || (!stock && !r.plant); });
      });
      var r = analyzeFiltered(sub, s);
      return { plant: p, label: plantLabel(p), has: !!seen[p], raw: r.raw.groups.total, product: r.product.groups.total };
    });
    var t = analyzeFiltered(data, s);
    return { rows: rows, total: { plant: '합계', label: '합계', has: true, raw: t.raw.groups.total, product: t.product.groups.total } };
  }

  // ── AI 해설 프롬프트 (반자동) ─────────────────────────────────
  // 도구는 AI 를 직접 부르지 않습니다. 이 글을 복사해 ChatGPT 등에 붙여 넣고, 답을 다시 붙여 넣습니다.
  // mask=true 면 품번·품명을 「품목1」처럼 바꿔 회사 밖으로 나가는 정보를 줄입니다(기본값).
  function buildCausePrompt(g, opt) {
    opt = opt || {};
    var f = function (n) { return n == null ? '-' : String(round(n, 2)); };
    var sgn = function (n) { return n == null ? '-' : (n > 0 ? '+' : '') + f(n); };
    var pr = function (r) { return r == null ? '-' : (r > 0 ? '+' : '') + round(r * 100, 1) + '%'; };
    var L = [];
    L.push('너는 제조업 재고 분석 담당자를 돕는 분석가야. 아래 표의 숫자만 근거로, 「' + (opt.groupLabel || '대분류') + ' ' + g.group + '」 재고의 전월 대비 증감 원인을 설명해줘.');
    L.push('- 숫자에 없는 사실(발주 변경, 생산계획 변경 등)은 단정하지 말고 「확인 필요」로 적어줘.');
    L.push('- 결과는 ① 한 문장 요약 ② 주요 원인 3가지(근거 숫자 포함) ③ 담당자가 확인할 것 2~3가지 ④ 개선방안 제안 순서로 적어줘.');
    L.push('');
    L.push('[기준] 당월 ' + (opt.curDate || '') + ' / 전월 ' + (opt.prevDate || '') + ' / 공장: ' + (opt.plant || '인천+대구 합계') + ' / 구분: ' + (opt.kindLabel || '원자재'));
    L.push('[' + g.group + ' 합계] 수량 ' + f(g.prevQty) + ' → ' + f(g.curQty) + ' (' + sgn(g.diffQty) + ', ' + pr(g.qtyRate) + ') / 금액 ' + f(g.prevAmt) + ' → ' + f(g.curAmt) + ' (' + sgn(g.diffAmt) + ', ' + pr(g.amtRate) + ')');
    L.push('[금액 증감 분해] ' + EFFECT_KEYS.map(function (k) { return EFFECT_LABELS[k] + ' ' + sgn(g.effects[k]); }).join(' / '));
    L.push('  (수량 효과 = 입고 + 출고·사용 + 조정·기타, 전월 단가로 계산. 단가 변동 = 당월 수량 × 단가 차이)');
    L.push('[당월 입고 수량 합 ' + f(g.inQty) + ', 출고·사용 수량 합 ' + f(g.outQty) + ', 신규 품목 ' + g.newCount + '건, 소멸 품목 ' + g.goneCount + '건]');
    L.push('');
    L.push('[금액 증감 기여 상위 품목]');
    L.push('품목 | 수량 전월→당월 | 금액 증감 | 입고 전월→당월 | 출고 전월→당월 | 단가 효과 | 가장 큰 요인');
    (g.top || []).forEach(function (it, i) {
      var nm = opt.mask === false ? it.code + ' ' + it.name : '품목' + (i + 1);
      L.push(nm + ' | ' + f(it.prevQty) + '→' + f(it.curQty) + ' | ' + sgn(it.diffAmt) + ' | ' + f(it.inQtyPrev) + '→' + f(it.inQty) + ' | ' + f(it.outQtyPrev) + '→' + f(it.outQty) + ' | ' + sgn(it.effects.price) + ' | ' + (it.driver || '-'));
    });
    if (opt.memo) { L.push(''); L.push('[담당자 메모 — 참고해줘]'); L.push(opt.memo); }
    return L.join('\n');
  }

  // ── 엑셀 시트로 ──────────────────────────────────────────────
  function pct(r) { return r == null ? '' : round(r * 100, 1); }
  function blank(v) { return v == null ? '' : v; }
  function changeRate(prev, cur, r) { return (prev === 0 && cur !== 0) ? '신규' : pct(r); }

  function groupSheet(kind, groupLabel) {
    var head = [groupLabel, '품목 수(전월)', '품목 수(당월)', '전월 수량', '당월 수량', '수량 증감', '수량 증감률(%)', '전월 금액', '당월 금액', '금액 증감', '금액 증감률(%)', '금액 미산정 품목'];
    var rows = kind.groups.rows.concat([kind.groups.total]).map(function (g) {
      return [g.group, g.prevItemCount, g.itemCount, g.prevQty, g.curQty, g.diffQty, changeRate(g.prevQty, g.curQty, g.qtyRate), g.prevAmt, g.curAmt, g.diffAmt, changeRate(g.prevAmt, g.curAmt, g.amtRate), g.noAmount];
    });
    return [head].concat(rows);
  }
  function itemSheet(kind, codeLabel, groupLabel) {
    var head = [codeLabel, '품명', groupLabel, '대분류 원래 값', '공장', '구분', '전월 수량', '당월 수량', '수량 증감', '수량 증감률(%)',
      '전월 단가', '당월 단가', '전월 금액', '당월 금액', '금액 증감', '금액 증감률(%)', '당월 금액 출처',
      '최근 입고일', '최근 출고일', 'Aging 입고일 기준(개월)', 'Aging 출고일 기준(개월)', '파일 경과 개월', 'Aging 표시(개월)', '표시 기준', '경과 일수(표시 기준, 참고)', 'Aging 구간', '적정성',
      '당월 입고수량', '당월 출고수량', '회전율', '수량 효과(입고)', '수량 효과(출고·사용)', '수량 효과(조정·기타)', '단가 효과', '신규·소멸·미산정', '가장 큰 요인'];
    var rows = kind.items.map(function (it) {
      var e = it.effects;
      return [it.code, it.name, it.group, it.groupRaw, it.plants.join('·'), it.change, it.prevQty, it.curQty, it.diffQty, changeRate(it.prevQty, it.curQty, it.qtyRate),
        blank(it.prevPrice), blank(it.curPrice), blank(it.prevAmt), blank(it.curAmt), blank(it.diffAmt), changeRate(it.prevAmt || 0, it.curAmt || 0, it.amtRate),
        it.curAmtSource, it.lastIn, it.lastOut, blank(it.agingIn), blank(it.agingOut), blank(it.agingFileText || it.agingFile), blank(it.agingShown), it.agingBasis, blank(it.agingShownDays), it.bucket, it.fitness,
        blank(it.inQty), blank(it.outQty), blank(it.turnover), e.inflow, e.outflow, e.adjust, e.price, round(e.newItem + e.goneItem + e.noAmount, 2), it.driver];
    });
    return [head].concat(rows);
  }
  function bucketSheet(res) {
    var head = ['구분', 'Aging 구간(개월, 표시 기준)', '품목 수', '재고수량', '재고금액'];
    var rows = [];
    [['원자재', res.raw], ['제품', res.product]].forEach(function (k) {
      k[1].buckets.forEach(function (b) { rows.push([k[0], b.bucket, b.count, b.qty, b.amount]); });
    });
    rows.push([]);
    rows.push(['구분', '적정성', '품목 수', '재고수량', '재고금액']);
    [['원자재', res.raw], ['제품', res.product]].forEach(function (k) {
      k[1].fitness.forEach(function (f) { rows.push([k[0], f.fitness, f.count, f.qty, f.amount]); });
    });
    return [head].concat(rows);
  }
  function targetSheet(res) {
    var head = ['구분', '품번', '품명', '대분류·고객사', '선정 사유', '당월 수량', '당월 금액', '수량 증감', '금액 증감', 'Aging 표시(개월)', '표시 기준', '최근 출고일', '적정성', '회전율', '원인(담당자 기입)', '개선방안(담당자 기입)'];
    return [head].concat(res.targets.map(function (t) {
      return [t.kind, t.code, t.name, t.group, t.reasons.join(', '), t.curQty, blank(t.curAmt), t.diffQty, blank(t.diffAmt), blank(t.agingShown), t.agingBasis, t.lastOut, t.fitness, blank(t.turnover), '', ''];
    }));
  }
  function unmatchedSheet(res) {
    var head = ['구분', '품번', '품명', '대분류·고객사', '단가 없는 달', '당월 수량', '전월 수량', '비고'];
    return [head].concat(res.unmatched.map(function (u) { return [u.kind, u.code, u.name, u.group, u.months, u.curQty, u.prevQty, u.note]; }));
  }
  // 증감 원인 — 대분류 한 줄에 분해 값 + 담당자 메모 + AI 해설
  // memos: { 대분류: { memo, ai } }
  function causeSheet(kind, groupLabel, memos) {
    memos = memos || {};
    var head = [groupLabel, '품목 수(전월)', '품목 수(당월)', '전월 수량', '당월 수량', '수량 증감', '전월 금액', '당월 금액', '금액 증감', '금액 증감률(%)',
      '입고', '출고·사용', '조정·기타', '단가 변동', '신규 품목', '소멸 품목', '금액 미산정', '검산(합 − 금액 증감)', '자동 요약', '원인 메모(담당자)', 'AI 해설'];
    var gs = {};
    kind.groups.rows.concat([kind.groups.total]).forEach(function (g) { gs[g.group] = g; });
    var rows = kind.cause.rows.concat([kind.cause.total]).map(function (c) {
      var e = c.effects, g = gs[c.group] || {};
      var sum = round(EFFECT_KEYS.reduce(function (a, k) { return a + e[k]; }, 0) - c.diffAmt, 2);
      var m = memos[c.group] || {};
      return [c.group, blank(g.prevItemCount), blank(g.itemCount), c.prevQty, c.curQty, c.diffQty, c.prevAmt, c.curAmt, c.diffAmt, changeRate(c.prevAmt, c.curAmt, c.amtRate),
        e.inflow, e.outflow, e.adjust, e.price, e.newItem, e.goneItem, e.noAmount, sum, causeSentence(c), m.memo || '', m.ai || ''];
    });
    return [head].concat(rows);
  }
  function contribSheet(kind, groupLabel, codeLabel) {
    var head = [groupLabel, '순위', codeLabel, '품명', '구분', '전월 수량', '당월 수량', '금액 증감', '입고(전월→당월 수량)', '출고·사용(전월→당월 수량)', '수량 효과', '단가 효과', '가장 큰 요인'];
    var rows = [];
    kind.cause.rows.forEach(function (c) {
      c.top.forEach(function (it, i) {
        rows.push([c.group, i + 1, it.code, it.name, it.change, it.prevQty, it.curQty, blank(it.diffAmt),
          (it.inQtyPrev == null ? '-' : it.inQtyPrev) + ' → ' + (it.inQty == null ? '-' : it.inQty),
          (it.outQtyPrev == null ? '-' : it.outQtyPrev) + ' → ' + (it.outQty == null ? '-' : it.outQty),
          it.qtyEffect, it.effects.price, it.driver]);
      });
    });
    return [head].concat(rows);
  }
  function plantSheet(res) {
    var head = ['공장', '원자재 전월 수량', '원자재 당월 수량', '원자재 전월 금액', '원자재 당월 금액', '원자재 금액 증감', '제품 전월 수량', '제품 당월 수량', '제품 전월 금액', '제품 당월 금액', '제품 금액 증감'];
    return [head].concat(res.plants.rows.filter(function (r) { return r.has; }).concat([res.plants.total]).map(function (r) {
      return [r.label, r.raw.prevQty, r.raw.curQty, r.raw.prevAmt, r.raw.curAmt, r.raw.diffAmt, r.product.prevQty, r.product.curQty, r.product.prevAmt, r.product.curAmt, r.product.diffAmt];
    }));
  }
  function settingsSheet(res, settings, sample) {
    return [['항목', '값'],
      ['보기(공장)', res.plantView || '합계(인천+대구)'],
      ['당월 기준일', res.curDate], ['전월 기준일', res.prevDate],
      ['Aging 구간 경계(개월)', res.bounds.join(', ')],
      ['과잉 기준(개월 초과)', settings.overMonths], ['불용 기준(개월 초과)', settings.deadMonths],
      ['경과 개월 계산', '달력 월 차이. 기준일의 일이 시작일의 일보다 작으면 1을 빼되, 기준일이 말일이면 빼지 않음'],
      ['출고 이력 없는 품목', '재고 파일의 경과 개월 칸 → ' + (settings.noOutPolicy === 'none' ? '판정 보류' : '최근 입고일로 대신')],
      ['금액 산출', settings.amountSource === 'price' ? '단가표 우선, 없으면 파일 금액' : '파일 금액 우선, 없으면 단가표'],
      ['원자재 대분류 묶음표', String(settings.groupMap || '').split(/\r?\n/).filter(Boolean).join(' / ') || '(없음 — 적힌 그대로)'],
      ['묶음표에 없는 대분류', settings.groupOthers === 'keep' ? '적힌 그대로' : '기타로 모음'],
      ['금액 증가 상위 건수', settings.topN], ['저회전 기준(회전율 미만)', settings.turnoverMax === '' ? '적용 안 함' : settings.turnoverMax],
      ['Aging 표시 기준', '최근 출고일 → 재고 파일 경과 개월 → (설정 시) 최근 입고일'],
      ['회전율', '당월 출고수량 ÷ ((전월 수량 + 당월 수량) ÷ 2)'],
      ['증감 원인 분해', '금액 증감 = 입고 + 출고·사용 + 조정·기타(여기까지 전월 단가 × 수량) + 단가 변동(당월 수량 × 단가 차이) + 신규 + 소멸 + 금액 미산정'],
      ['자료', sample ? '예시 데이터(가상) — 실제 회사 자료가 아닙니다' : '사용자가 올린 자료']];
  }
  function buildSheets(res, settings, sample, memos) {
    memos = memos || {};
    return {
      '공장별_요약': plantSheet(res),
      '원자재_대분류별': groupSheet(res.raw, '대분류'),
      '원자재_증감원인': causeSheet(res.raw, '대분류', memos.raw),
      '원자재_증감기여': contribSheet(res.raw, '대분류', '품번'),
      '원자재_품목별': itemSheet(res.raw, '품번', '대분류'),
      '제품_고객사별': groupSheet(res.product, '고객사'),
      '제품_증감원인': causeSheet(res.product, '고객사', memos.product),
      '제품_품목별': itemSheet(res.product, '제품코드', '고객사'),
      'Aging_적정성': bucketSheet(res),
      '관리대상': targetSheet(res),
      '단가_미매칭': unmatchedSheet(res),
      '기준': settingsSheet(res, settings, sample)
    };
  }

  var api = {
    DEFS: DEFS, SLOTS: SLOTS, PLANTS: PLANTS, EXCLUDED_PLANTS: EXCLUDED_PLANTS, EFFECT_KEYS: EFFECT_KEYS, EFFECT_LABELS: EFFECT_LABELS,
    defaultSettings: defaultSettings, daysToMonths: daysToMonths, migrateSettings: migrateSettings, migrateSlotData: migrateSlotData,
    toDateStr: toDateStr, parseDate: parseDate, daysBetween: daysBetween, prevMonthEnd: prevMonthEnd, isMonthEnd: isMonthEnd, monthsBetween: monthsBetween,
    toNumber: toNumber, normCode: normCode, parseAgingMonths: parseAgingMonths, guessMapping: guessMapping, missingRequired: missingRequired,
    guessHeaderRow: guessHeaderRow, guessSheet: guessSheet, dateFromTitle: dateFromTitle,
    tableToRows: tableToRows, applyMapping: applyMapping, importTable: importTable, aggregateStock: aggregateStock,
    normalizePlant: normalizePlant, plantFromFileName: plantFromFileName, isPlant: isPlant, plantLabel: plantLabel, assignPlant: assignPlant, filterByPlant: filterByPlant,
    parseGroupMap: parseGroupMap, mapGroup: mapGroup,
    lastDateByCode: lastDateByCode, sumQtyByCode: sumQtyByCode, priceMapAt: priceMapAt, rate: rate, round: round,
    parseBounds: parseBounds, bucketLabels: bucketLabels, bucketOf: bucketOf, fitnessOf: fitnessOf,
    checkSettings: checkSettings, analyze: analyze, decompose: decompose, causeSentence: causeSentence, buildCausePrompt: buildCausePrompt,
    buildSheets: buildSheets, pct: pct
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvLogic = api;
})(typeof window !== 'undefined' ? window : this);
