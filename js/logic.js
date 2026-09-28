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
  // 실제 컬럼명은 아직 받지 못했습니다(기획서 10장 2번). 그래서 필드마다
  // 「이런 이름이면 자동으로 짝지어 본다」는 후보만 두고, 사용자가 화면에서 고릅니다.
  var DEFS = {
    rawStock: {
      label: '원자재 월말 재고',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '품목코드', '자재코드', '자재번호', '품목번호', '코드', 'item', 'itemcode', 'partno', 'code'] },
        { key: 'name', label: '품명', required: false, syn: ['품명', '품목명', '자재명', '명칭', 'itemname', 'name'] },
        { key: 'group', label: '대분류', required: true, syn: ['대분류', '분류', '자재분류', '품목군', '구분', 'category', 'group'] },
        { key: 'qty', label: '재고수량', required: true, syn: ['재고수량', '현재고', '재고', '수량', '기말재고', 'qty', 'quantity', 'stock'] },
        { key: 'amount', label: '재고금액(파일에 있으면)', required: false, syn: ['재고금액', '금액', '기말금액', 'amount'] }
      ]
    },
    productStock: {
      label: '제품 월말 재고',
      fields: [
        { key: 'code', label: '제품코드', required: true, syn: ['제품코드', '품번', '품목코드', '제품번호', '코드', 'itemcode', 'partno', 'code'] },
        { key: 'name', label: '제품명', required: false, syn: ['제품명', '품명', '품목명', 'name'] },
        { key: 'group', label: '고객사', required: true, syn: ['고객사', '거래처', '고객', '고객명', '납품처', 'customer'] },
        { key: 'qty', label: '재고수량', required: true, syn: ['재고수량', '현재고', '재고', '수량', '기말재고', 'qty', 'quantity', 'stock'] },
        { key: 'amount', label: '재고금액(파일에 있으면)', required: false, syn: ['재고금액', '금액', '기말금액', 'amount'] }
      ]
    },
    inbound: {
      label: '입고 이력',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '제품코드', '품목코드', '자재코드', '코드', 'itemcode', 'code'] },
        { key: 'date', label: '입고일', required: true, syn: ['입고일', '입고일자', '일자', '날짜', 'date'] },
        { key: 'qty', label: '입고수량', required: false, syn: ['입고수량', '수량', 'qty'] }
      ]
    },
    outbound: {
      label: '출고·사용 이력',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '제품코드', '품목코드', '자재코드', '코드', 'itemcode', 'code'] },
        { key: 'date', label: '출고일', required: true, syn: ['출고일', '출고일자', '사용일', '불출일', '일자', '날짜', 'date'] },
        { key: 'qty', label: '출고수량', required: false, syn: ['출고수량', '사용수량', '불출수량', '수량', 'qty'] }
      ]
    },
    price: {
      label: '단가표',
      fields: [
        { key: 'code', label: '품번', required: true, syn: ['품번', '제품코드', '품목코드', '자재코드', '코드', 'itemcode', 'code'] },
        { key: 'price', label: '단가', required: true, syn: ['단가', '표준단가', '이동평균단가', '평균단가', '입고단가', 'price', 'unitprice'] },
        { key: 'date', label: '적용일(있으면)', required: false, syn: ['적용일', '적용일자', '시작일', '기준일', 'date'] }
      ]
    }
  };

  // 올리는 자리(슬롯) 7개 — 원자재·제품 × 당월·전월, 입고·출고 이력, 단가표
  var SLOTS = [
    { id: 'rawCur', def: 'rawStock', label: '원자재 재고 — 당월' },
    { id: 'rawPrev', def: 'rawStock', label: '원자재 재고 — 전월' },
    { id: 'prodCur', def: 'productStock', label: '제품 재고 — 당월' },
    { id: 'prodPrev', def: 'productStock', label: '제품 재고 — 전월' },
    { id: 'inbound', def: 'inbound', label: '입고 이력' },
    { id: 'outbound', def: 'outbound', label: '출고·사용 이력' },
    { id: 'price', def: 'price', label: '단가표' }
  ];

  // 기준값의 처음 값. 회사 기준을 받기 전 「예시 값」입니다(기획서 10장 4·9번).
  function defaultSettings() {
    return {
      curDate: '',          // 당월 기준일(월말). 비우면 분석 불가
      prevDate: '',         // 전월 기준일. 비우면 당월 기준일의 전월 말일
      agingBounds: '90, 180, 365', // Aging 구간 경계(일)
      overDays: 180,        // 이 일수를 넘으면 「과잉」
      deadDays: 365,        // 이 일수를 넘으면 「불용」
      noOutPolicy: 'inbound', // 출고 이력 없는 품목: inbound=입고일로 대신, none=판정 보류
      amountSource: 'price',  // price=단가표 우선(없으면 파일 금액), file=파일 금액 우선
      topN: 10,             // 금액 증가 상위 N건
      turnoverMax: ''       // 회전율이 이 값 미만이면 저회전(비우면 적용 안 함)
    };
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
  function normHeader(s) { return String(s == null ? '' : s).replace(/[\s_\-()\[\]./]/g, '').toLowerCase(); }

  // ── 컬럼 짝짓기 ──────────────────────────────────────────────
  // 머리행 이름으로 필드를 짐작합니다. 같은 머리행을 두 필드에 주지 않습니다.
  function guessMapping(headers, defKey, saved) {
    var def = DEFS[defKey];
    var used = {};
    var map = {};
    var norm = headers.map(normHeader);
    // 1) 저장해 둔 짝이 이번 파일에도 있으면 그대로
    if (saved) def.fields.forEach(function (f) {
      var h = saved[f.key];
      if (h && headers.indexOf(h) >= 0 && !used[h]) { map[f.key] = h; used[h] = true; }
    });
    // 2) 이름이 똑같은 것 → 3) 이름이 들어 있는 것 순서로
    [true, false].forEach(function (exact) {
      def.fields.forEach(function (f) {
        if (map[f.key]) return;
        for (var s = 0; s < f.syn.length && !map[f.key]; s++) {
          var target = normHeader(f.syn[s]);
          for (var i = 0; i < headers.length; i++) {
            if (used[headers[i]] || !norm[i]) continue;
            if (exact ? norm[i] === target : norm[i].indexOf(target) >= 0) {
              map[f.key] = headers[i]; used[headers[i]] = true; break;
            }
          }
        }
      });
    });
    return map;
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
        var col = mapping[f.key];
        var v = col ? row[col] : '';
        if (f.key === 'code') { rec.code = normCode(v); if (!rec.code) { bad('코드 빈칸', rowNo); skip = true; } }
        else if (f.key === 'name' || f.key === 'group') rec[f.key] = v == null ? '' : String(v).trim();
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

  // ── 집계 도우미 ──────────────────────────────────────────────
  // 같은 품번이 여러 줄(창고·로트별)이면 수량·금액을 더합니다.
  function aggregateStock(records) {
    var map = {};
    var order = [];
    (records || []).forEach(function (r) {
      var m = map[r.code];
      if (!m) { m = map[r.code] = { code: r.code, name: r.name || '', group: r.group || '', qty: 0, fileAmount: null }; order.push(r.code); }
      if (!m.name && r.name) m.name = r.name;
      if ((!m.group || m.group === '(분류 없음)') && r.group) m.group = r.group;
      m.qty += r.qty || 0;
      if (r.amount != null) m.fileAmount = (m.fileAmount || 0) + r.amount;
    });
    return { map: map, order: order };
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

  // Aging 구간: 경계 [90,180,365] → 0~90일 / 91~180일 / 181~365일 / 365일 초과
  function parseBounds(text) {
    var list = String(text == null ? '' : text).split(/[,\s]+/).map(Number)
      .filter(function (n) { return isFinite(n) && n > 0; });
    list.sort(function (a, b) { return a - b; });
    return list.filter(function (n, i) { return i === 0 || n !== list[i - 1]; });
  }
  function bucketLabels(bounds) {
    var labels = [];
    var lo = 0;
    bounds.forEach(function (b) { labels.push(lo + '~' + b + '일'); lo = b + 1; });
    labels.push((bounds.length ? bounds[bounds.length - 1] : 0) + '일 초과');
    labels.push('날짜 없음');
    return labels;
  }
  function bucketOf(days, bounds) {
    var labels = bucketLabels(bounds);
    if (days == null) return labels[labels.length - 1];
    for (var i = 0; i < bounds.length; i++) if (days <= bounds[i]) return labels[i];
    return labels[bounds.length];
  }
  // 적정성: Aging(표시 기준) 일수로 나눕니다(기획서 5장).
  function fitnessOf(days, overDays, deadDays) {
    if (days == null) return '판정 보류';
    if (deadDays != null && days > deadDays) return '불용';
    if (overDays != null && days > overDays) return '과잉';
    return '적정';
  }

  function checkSettings(s) {
    var errors = [];
    var cur = parseDate(s.curDate);
    if (!cur) errors.push('당월 기준일을 입력해 주세요.');
    var prev = s.prevDate ? parseDate(s.prevDate) : (cur ? prevMonthEnd(cur) : null);
    if (s.prevDate && !prev) errors.push('전월 기준일 형식이 올바르지 않습니다.');
    if (cur && prev && prev >= cur) errors.push('전월 기준일은 당월 기준일보다 앞이어야 합니다.');
    var over = toNumber(s.overDays), dead = toNumber(s.deadDays);
    if (over == null || isNaN(over) || over < 0) errors.push('과잉 기준 일수를 0 이상 숫자로 입력해 주세요.');
    if (dead == null || isNaN(dead) || dead < 0) errors.push('불용 기준 일수를 0 이상 숫자로 입력해 주세요.');
    if (!errors.length && dead < over) errors.push('불용 기준 일수는 과잉 기준 일수보다 크거나 같아야 합니다.');
    if (!parseBounds(s.agingBounds).length) errors.push('Aging 구간 경계를 하나 이상 입력해 주세요(예: 90, 180, 365).');
    var topN = toNumber(s.topN);
    if (topN == null || isNaN(topN) || topN < 0) errors.push('증가 상위 건수를 0 이상 숫자로 입력해 주세요.');
    var tm = toNumber(s.turnoverMax);
    if (tm !== null && (isNaN(tm) || tm < 0)) errors.push('저회전 기준은 비우거나 0 이상 숫자로 입력해 주세요.');
    return {
      ok: !errors.length, errors: errors,
      cur: cur, prev: prev, bounds: parseBounds(s.agingBounds),
      overDays: over, deadDays: dead, topN: topN, turnoverMax: tm,
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
    var items = codes.map(function (code) {
      var c = cur.map[code], p = prev.map[code];
      var curQty = c ? c.qty : 0, prevQty = p ? p.qty : 0;
      var curAmt = amountOf(c, ctx.curPrice[code], ctx.amountSource);
      var prevAmt = amountOf(p, ctx.prevPrice[code], ctx.amountSource);
      var lastIn = ctx.lastIn[code] || '';
      var lastOut = ctx.lastOut[code] || '';
      var agingIn = lastIn ? daysBetween(parseDate(lastIn), ctx.cur) : null;
      var agingOut = lastOut ? daysBetween(parseDate(lastOut), ctx.cur) : null;
      var shown = agingOut, basis = '출고일';
      if (agingOut == null) {
        if (ctx.noOutPolicy === 'inbound' && agingIn != null) { shown = agingIn; basis = '입고일 대체'; }
        else { shown = null; basis = '없음'; }
      }
      var outQty = ctx.outQty[code] || 0;
      var avg = (curQty + prevQty) / 2;
      var turnover = avg > 0 ? outQty / avg : null;
      var change = !p || prevQty === 0 ? (curQty === 0 ? '유지' : '신규') : (!c || curQty === 0 ? '소멸' : '유지');
      return {
        code: code,
        name: (c && c.name) || (p && p.name) || '',
        group: (c && c.group) || (p && p.group) || '(분류 없음)',
        prevQty: prevQty, curQty: curQty, diffQty: curQty - prevQty, qtyRate: rate(prevQty, curQty),
        prevPrice: ctx.prevPrice[code] == null ? null : ctx.prevPrice[code],
        curPrice: ctx.curPrice[code] == null ? null : ctx.curPrice[code],
        prevAmt: prevAmt.value, curAmt: curAmt.value,
        diffAmt: (curAmt.value == null && prevAmt.value == null) ? null : (curAmt.value || 0) - (prevAmt.value || 0),
        amtRate: rate(prevAmt.value, curAmt.value),
        curAmtSource: c ? curAmt.source : '', prevAmtSource: p ? prevAmt.source : '',
        change: change,
        lastIn: lastIn, lastOut: lastOut, agingIn: agingIn, agingOut: agingOut,
        agingShown: shown, agingBasis: basis,
        bucket: bucketOf(shown, ctx.bounds),
        fitness: curQty > 0 ? fitnessOf(shown, ctx.overDays, ctx.deadDays) : '재고 없음',
        outQty: outQty, turnover: turnover == null ? null : round(turnover, 2)
      };
    });
    return { items: items, groups: groupSummary(items), buckets: bucketSummary(items, ctx.bounds), fitness: fitnessSummary(items) };
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

  function groupSummary(items) {
    var map = {}, order = [];
    var total = newGroup('합계');
    items.forEach(function (it) {
      var g = map[it.group];
      if (!g) { g = map[it.group] = newGroup(it.group); order.push(it.group); }
      [g, total].forEach(function (x) {
        x.itemCount += it.curQty !== 0 ? 1 : 0;
        x.prevQty += it.prevQty; x.curQty += it.curQty;
        x.prevAmt += it.prevAmt || 0; x.curAmt += it.curAmt || 0;
        if ((it.curQty !== 0 && it.curAmt == null) || (it.prevQty !== 0 && it.prevAmt == null)) x.noAmount++;
      });
    });
    order.sort();
    var rows = order.map(function (k) { return finishGroup(map[k]); });
    return { rows: rows, total: finishGroup(total) };
  }
  function newGroup(name) { return { group: name, itemCount: 0, prevQty: 0, curQty: 0, prevAmt: 0, curAmt: 0, noAmount: 0 }; }
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
  function unmatchedList(items, kindLabel) {
    var out = [];
    items.forEach(function (it) {
      var months = [];
      if (it.curQty !== 0 && it.curPrice == null) months.push('당월');
      if (it.prevQty !== 0 && it.prevPrice == null) months.push('전월');
      if (!months.length) return;
      var note = [];
      if (it.curQty !== 0 && it.curPrice == null) note.push(it.curAmtSource === '파일 금액' ? '당월은 파일 금액 사용' : '당월 금액 없음');
      if (it.prevQty !== 0 && it.prevPrice == null) note.push(it.prevAmtSource === '파일 금액' ? '전월은 파일 금액 사용' : '전월 금액 없음');
      out.push({ kind: kindLabel, code: it.code, name: it.name, group: it.group, months: months.join('·'), curQty: it.curQty, prevQty: it.prevQty, note: note.join(', ') });
    });
    return out;
  }

  // ── 전체 분석 ────────────────────────────────────────────────
  // data: { rawCur, rawPrev, prodCur, prodPrev, inbound, outbound, price } 각 레코드 배열
  function analyze(data, settings) {
    var s = checkSettings(settings || {});
    if (!s.ok) return { ok: false, errors: s.errors };
    data = data || {};
    var prices = data.price || [];
    var ctx = {
      cur: s.cur, prev: s.prev, bounds: s.bounds, overDays: s.overDays, deadDays: s.deadDays,
      topN: s.topN, turnoverMax: s.turnoverMax, noOutPolicy: s.noOutPolicy, amountSource: s.amountSource,
      curPrice: priceMapAt(prices, s.cur), prevPrice: priceMapAt(prices, s.prev),
      lastIn: lastDateByCode(data.inbound, s.cur), lastOut: lastDateByCode(data.outbound, s.cur),
      outQty: sumQtyByCode(data.outbound, s.prev, s.cur)
    };
    var raw = analyzeKind(data.rawCur, data.rawPrev, ctx);
    var prod = analyzeKind(data.prodCur, data.prodPrev, ctx);
    var targets = selectTargets(raw.items, '원자재', ctx).concat(selectTargets(prod.items, '제품', ctx));
    var unmatched = unmatchedList(raw.items, '원자재').concat(unmatchedList(prod.items, '제품'));
    return {
      ok: true, errors: [],
      curDate: toDateStr(s.cur), prevDate: toDateStr(s.prev), bounds: s.bounds,
      hasHistory: { inbound: !!(data.inbound && data.inbound.length), outbound: !!(data.outbound && data.outbound.length), price: !!prices.length },
      raw: raw, product: prod, targets: targets, unmatched: unmatched
    };
  }

  // ── 엑셀 시트로 ──────────────────────────────────────────────
  function pct(r) { return r == null ? '' : round(r * 100, 1); }
  function blank(v) { return v == null ? '' : v; }
  function changeRate(prev, cur, r) { return (prev === 0 && cur !== 0) ? '신규' : pct(r); }

  function groupSheet(kind, groupLabel) {
    var head = [groupLabel, '품목 수(당월)', '전월 수량', '당월 수량', '수량 증감', '수량 증감률(%)', '전월 금액', '당월 금액', '금액 증감', '금액 증감률(%)', '금액 미산정 품목'];
    var rows = kind.groups.rows.concat([kind.groups.total]).map(function (g) {
      return [g.group, g.itemCount, g.prevQty, g.curQty, g.diffQty, changeRate(g.prevQty, g.curQty, g.qtyRate), g.prevAmt, g.curAmt, g.diffAmt, changeRate(g.prevAmt, g.curAmt, g.amtRate), g.noAmount];
    });
    return [head].concat(rows);
  }
  function itemSheet(kind, codeLabel, groupLabel) {
    var head = [codeLabel, '품명', groupLabel, '구분', '전월 수량', '당월 수량', '수량 증감', '수량 증감률(%)',
      '전월 단가', '당월 단가', '전월 금액', '당월 금액', '금액 증감', '금액 증감률(%)', '당월 금액 출처',
      '최근 입고일', '최근 출고일', 'Aging(입고일 기준, 일)', 'Aging(출고일 기준, 일)', 'Aging 표시(일)', '표시 기준', 'Aging 구간', '적정성', '당월 출고수량', '회전율'];
    var rows = kind.items.map(function (it) {
      return [it.code, it.name, it.group, it.change, it.prevQty, it.curQty, it.diffQty, changeRate(it.prevQty, it.curQty, it.qtyRate),
        blank(it.prevPrice), blank(it.curPrice), blank(it.prevAmt), blank(it.curAmt), blank(it.diffAmt), changeRate(it.prevAmt || 0, it.curAmt || 0, it.amtRate),
        it.curAmtSource, it.lastIn, it.lastOut, blank(it.agingIn), blank(it.agingOut), blank(it.agingShown), it.agingBasis, it.bucket, it.fitness, it.outQty, blank(it.turnover)];
    });
    return [head].concat(rows);
  }
  function bucketSheet(res) {
    var head = ['구분', 'Aging 구간(출고일 기준 표시)', '품목 수', '재고수량', '재고금액'];
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
    var head = ['구분', '품번', '품명', '대분류·고객사', '선정 사유', '당월 수량', '당월 금액', '수량 증감', '금액 증감', 'Aging 표시(일)', '표시 기준', '최근 출고일', '적정성', '회전율', '원인(담당자 기입)', '개선방안(담당자 기입)'];
    return [head].concat(res.targets.map(function (t) {
      return [t.kind, t.code, t.name, t.group, t.reasons.join(', '), t.curQty, blank(t.curAmt), t.diffQty, blank(t.diffAmt), blank(t.agingShown), t.agingBasis, t.lastOut, t.fitness, blank(t.turnover), '', ''];
    }));
  }
  function unmatchedSheet(res) {
    var head = ['구분', '품번', '품명', '대분류·고객사', '단가 없는 달', '당월 수량', '전월 수량', '비고'];
    return [head].concat(res.unmatched.map(function (u) { return [u.kind, u.code, u.name, u.group, u.months, u.curQty, u.prevQty, u.note]; }));
  }
  function settingsSheet(res, settings, sample) {
    return [['항목', '값'],
      ['당월 기준일', res.curDate], ['전월 기준일', res.prevDate],
      ['Aging 구간 경계(일)', res.bounds.join(', ')],
      ['과잉 기준(일 초과)', settings.overDays], ['불용 기준(일 초과)', settings.deadDays],
      ['출고 이력 없는 품목', settings.noOutPolicy === 'none' ? '판정 보류' : '최근 입고일로 대신'],
      ['금액 산출', settings.amountSource === 'file' ? '파일 금액 우선, 없으면 단가표' : '단가표 우선, 없으면 파일 금액'],
      ['금액 증가 상위 건수', settings.topN], ['저회전 기준(회전율 미만)', settings.turnoverMax === '' ? '적용 안 함' : settings.turnoverMax],
      ['Aging 표시 기준', '최근 출고일 기준(기획서 1장 — 제출 원문 기준)'],
      ['회전율', '당월 출고수량 ÷ ((전월 수량 + 당월 수량) ÷ 2)'],
      ['자료', sample ? '예시 데이터(가상) — 실제 회사 자료가 아닙니다' : '사용자가 올린 자료']];
  }
  function buildSheets(res, settings, sample) {
    return {
      '원자재_대분류별': groupSheet(res.raw, '대분류'),
      '원자재_품목별': itemSheet(res.raw, '품번', '대분류'),
      '제품_고객사별': groupSheet(res.product, '고객사'),
      '제품_품목별': itemSheet(res.product, '제품코드', '고객사'),
      'Aging_적정성': bucketSheet(res),
      '관리대상': targetSheet(res),
      '단가_미매칭': unmatchedSheet(res),
      '기준': settingsSheet(res, settings, sample)
    };
  }

  var api = {
    DEFS: DEFS, SLOTS: SLOTS, defaultSettings: defaultSettings,
    toDateStr: toDateStr, parseDate: parseDate, daysBetween: daysBetween, prevMonthEnd: prevMonthEnd,
    toNumber: toNumber, normCode: normCode, guessMapping: guessMapping, missingRequired: missingRequired,
    tableToRows: tableToRows, applyMapping: applyMapping, aggregateStock: aggregateStock,
    lastDateByCode: lastDateByCode, sumQtyByCode: sumQtyByCode, priceMapAt: priceMapAt, rate: rate, round: round,
    parseBounds: parseBounds, bucketLabels: bucketLabels, bucketOf: bucketOf, fitnessOf: fitnessOf,
    checkSettings: checkSettings, analyze: analyze, buildSheets: buildSheets, pct: pct
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvLogic = api;
})(typeof window !== 'undefined' ? window : this);
