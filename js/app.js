/*
 * 화면 — 해시 주소로 나눕니다.
 *   #/data        자료 올리기 · 컬럼 짝짓기 (7개 자리)
 *   #/settings    기준 설정 (기준일, Aging 구간, 적정·과잉·불용, 관리대상 기준)
 *   #/raw         원자재 분석 (대분류별 증감, Aging, 적정성, 품목별)
 *   #/product     제품 분석 (고객사별 증감, Aging, 적정성, 품목별)
 *   #/targets     관리대상 후보
 *   #/unmatched   단가 미매칭 목록
 */
(function () {
  'use strict';
  var L = window.InvLogic, S = window.InvStore, Sample = window.InvSample;
  var main = document.getElementById('main');
  var data = S.getData();           // { slotId: { fileName, sample, rowCount, records, problems, mapping } }
  var settings = S.getSettings(L.defaultSettings());
  var pending = {};                 // 올렸지만 아직 짝을 확정하지 않은 파일 { slotId: {...} }
  var itemFilter = { raw: {}, product: {} };
  var MAX_ROWS = 300;

  // ── 도우미 ────────────────────────────────────────────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  var toastTimer;
  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }
  function fmt(n) {
    if (n == null || n === '') return '';
    return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }
  function fmtSigned(n) {
    if (n == null) return '';
    return (n > 0 ? '+' : '') + fmt(n);
  }
  function fmtRate(prev, cur, r) {
    if ((prev === 0 || prev == null) && cur) return '신규';
    if (r == null) return '';
    var p = L.round(r * 100, 1);
    return (p > 0 ? '+' : '') + p + '%';
  }
  function sign(n) { return n > 0 ? 'up' : n < 0 ? 'down' : ''; }
  function isSample() {
    return Object.keys(data).some(function (k) { return data[k] && data[k].sample; });
  }
  function persist() {
    if (!S.setData(data)) toast('브라우저 저장 공간이 부족해 자료를 이번 창에서만 유지합니다. 새로 고치면 다시 올려 주세요.', true);
  }
  function records(slotId) { return data[slotId] ? data[slotId].records : []; }
  function currentData() {
    var o = {};
    L.SLOTS.forEach(function (s) { o[s.id] = records(s.id); });
    return o;
  }
  function result() { return L.analyze(currentData(), settings); }
  function hasStock() { return ['rawCur', 'prodCur'].some(function (k) { return data[k]; }); }

  function download(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── 머리 ─────────────────────────────────────────────────
  var NAV = [['data', '자료'], ['settings', '기준 설정'], ['raw', '원자재 분석'], ['product', '제품 분석'], ['targets', '관리대상'], ['unmatched', '단가 미매칭']];
  function renderHeader(route) {
    var nav = document.getElementById('nav');
    nav.textContent = '';
    NAV.forEach(function (it) {
      nav.appendChild(h('a', { href: '#/' + it[0], 'aria-current': route === it[0] ? 'page' : null }, it[1]));
    });
    document.getElementById('sampleBanner').hidden = !isSample();
  }

  document.getElementById('exportBtn').addEventListener('click', exportExcel);
  function exportExcel() {
    if (!hasStock()) { toast('먼저 「자료」에서 당월 재고 파일을 올려 주세요.', true); location.hash = '#/data'; return; }
    var res = result();
    if (!res.ok) { toast(res.errors[0], true); location.hash = '#/settings'; return; }
    var sheets = L.buildSheets(res, settings, isSample());
    var wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (name) {
      var ws = XLSX.utils.aoa_to_sheet(sheets[name]);
      ws['!cols'] = sheets[name][0].map(function (hd) { return { wch: Math.max(10, String(hd).length * 2) }; });
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var name = (isSample() ? '예시데이터_' : '') + '재고분석_' + res.curDate + '.xlsx';
    download(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    toast(name + ' 파일을 내려받았습니다.');
  }

  // ── 파일 읽기 ─────────────────────────────────────────────
  // CSV 는 인코딩을 직접 가립니다: UTF-8 로 읽어 보고 깨지면 EUC-KR(엑셀 한글 CSV 기본값)로 다시 읽습니다.
  function readFile(file, cb) {
    var fr = new FileReader();
    fr.onerror = function () { cb(new Error('파일을 읽지 못했습니다.')); };
    fr.onload = function () {
      try {
        var buf = new Uint8Array(fr.result);
        var wb;
        if (/\.(csv|txt)$/i.test(file.name)) {
          var text;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
          catch (e) { text = new TextDecoder('euc-kr').decode(buf); }
          if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
          wb = XLSX.read(text, { type: 'string', raw: true });
        } else {
          wb = XLSX.read(buf, { type: 'array' });
        }
        var sheets = {};
        wb.SheetNames.forEach(function (n) {
          sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
        });
        cb(null, { names: wb.SheetNames, sheets: sheets });
      } catch (e) { cb(new Error('엑셀·CSV 형식으로 읽지 못했습니다: ' + e.message)); }
    };
    fr.readAsArrayBuffer(file);
  }

  function preparePending(slot, fileName, book, sheetName, headerRow, sample) {
    var aoa = book.sheets[sheetName] || [];
    var tbl = L.tableToRows(aoa, headerRow);
    var p = {
      fileName: fileName, book: book, sheetName: sheetName, headerRow: headerRow, sample: !!sample,
      headers: tbl.headers, rows: tbl.rows,
      mapping: L.guessMapping(tbl.headers, slot.def, S.getMapping(slot.def))
    };
    pending[slot.id] = p;
    return p;
  }

  function confirmSlot(slot) {
    var p = pending[slot.id];
    var missing = L.missingRequired(p.mapping, slot.def);
    if (missing.length) { toast('짝을 지정해 주세요: ' + missing.join(', '), true); return false; }
    var r = L.applyMapping(p.rows, p.mapping, slot.def);
    data[slot.id] = {
      fileName: p.fileName, sample: p.sample, sheetName: p.sheetName, rowCount: p.rows.length,
      records: r.records, problems: r.problems, mapping: p.mapping
    };
    if (!p.sample) S.setMapping(slot.def, p.mapping);
    delete pending[slot.id];
    persist();
    return true;
  }

  function loadSample() {
    var t = Sample.build();
    data = {};
    pending = {};
    L.SLOTS.forEach(function (slot) {
      var book = { names: ['예시'], sheets: { '예시': t[slot.id] } };
      preparePending(slot, Sample.FILE_NAMES[slot.id], book, '예시', 1, true);
      confirmSlot(slot);
    });
    settings.curDate = Sample.CUR;
    settings.prevDate = Sample.PREV;
    S.setSettings(settings);
    toast('예시 데이터(가상)를 불러왔습니다. 기준일은 ' + Sample.CUR + ' 입니다.');
    render();
  }

  // ── 자료 화면 ─────────────────────────────────────────────
  function viewData() {
    var wrap = h('div', null,
      h('div', { class: 'page-head' }, h('h1', null, '자료 올리기 · 컬럼 짝짓기')),
      h('div', { class: 'card' },
        h('p', null, '월말 재고 파일과 입출고·단가 파일을 올립니다. 엑셀(xlsx·xls)과 CSV 를 읽습니다. 파일은 외부로 보내지 않고 이 브라우저 안에서만 계산합니다.'),
        h('p', { class: 'note' }, '컬럼 이름이 달라도 됩니다. 처음 한 번 「어느 컬럼이 품번·수량인지」 짝지어 두면, 다음 달 같은 형식 파일은 자동으로 짝지어집니다. 필수는 원자재 또는 제품의 당월 재고이고, 나머지는 있으면 해당 계산이 켜집니다.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: loadSample }, '예시 데이터 불러오기'),
          h('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
            if (!confirm('올린 자료를 모두 지웁니다. 기준 설정과 컬럼 짝은 남습니다. 계속할까요?')) return;
            data = {}; pending = {}; S.clearData(); render(); toast('자료를 지웠습니다.');
          } }, '올린 자료 모두 지우기'),
          h('a', { class: 'btn', href: '#/settings' }, '다음: 기준 설정'))),
      h('div', { class: 'slot-grid' }, L.SLOTS.map(slotCard)));
    return wrap;
  }

  var SLOT_HELP = {
    rawCur: '품번·대분류·재고수량 (필수)', rawPrev: '당월과 같은 형식. 없으면 모두 「신규」로 봅니다',
    prodCur: '제품코드·고객사·재고수량', prodPrev: '당월과 같은 형식',
    inbound: '품번·입고일 — 입고일 기준 Aging', outbound: '품번·출고일(·수량) — 최근 출고일 기준 Aging, 회전율',
    price: '품번·단가(·적용일) — 재고금액 산출'
  };

  function slotCard(slot) {
    var d = data[slot.id], p = pending[slot.id];
    var card = h('section', { class: 'card slot', 'data-slot': slot.id },
      h('h2', null, slot.label),
      h('p', { class: 'note' }, SLOT_HELP[slot.id]));
    var input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt', 'aria-label': slot.label + ' 파일 선택' });
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) return;
      readFile(f, function (err, book) {
        if (err) { toast(err.message, true); return; }
        preparePending(slot, f.name, book, book.names[0], 1, false);
        render();
      });
    });
    if (d && !p) {
      card.appendChild(h('div', { class: 'slot-status' },
        h('span', { class: 'ok-badge' }, '적용됨'),
        h('span', null, d.fileName + (d.sheetName && d.sheetName !== '예시' ? ' [' + d.sheetName + ']' : '')),
        h('span', { class: 'note' }, '읽은 행 ' + fmt(d.rowCount) + ' · 사용 ' + fmt(d.records.length))));
      if (d.problems && d.problems.length) {
        card.appendChild(h('ul', { class: 'problems' }, d.problems.map(function (pr) {
          return h('li', null, pr.code + ' ' + pr.count + '행 (예: ' + pr.rows.join(', ') + '번째 자료 행)');
        })));
      }
      card.appendChild(h('div', { class: 'btn-row' },
        h('label', { class: 'btn file-btn' }, '다른 파일로 바꾸기', input),
        h('button', { type: 'button', class: 'btn', onclick: function () { delete data[slot.id]; persist(); render(); } }, '비우기')));
    } else if (p) {
      card.appendChild(mappingForm(slot, p));
    } else {
      card.appendChild(h('label', { class: 'btn file-btn' }, '파일 선택', input));
    }
    return card;
  }

  function mappingForm(slot, p) {
    var def = L.DEFS[slot.def];
    var box = h('div', { class: 'mapping' });
    box.appendChild(h('p', { class: 'file-line' }, p.fileName));
    var opts = h('div', { class: 'form-grid' });
    if (p.book.names.length > 1) {
      var sel = h('select', { name: 'sheet' }, p.book.names.map(function (n) { return h('option', { value: n, selected: n === p.sheetName }, n); }));
      sel.addEventListener('change', function () { preparePending(slot, p.fileName, p.book, sel.value, p.headerRow, p.sample); render(); });
      opts.appendChild(h('label', { class: 'field' }, h('span', null, '시트'), sel));
    }
    var hr = h('input', { type: 'number', min: '1', name: 'headerRow', value: String(p.headerRow) });
    hr.addEventListener('change', function () {
      var n = Math.max(1, parseInt(hr.value, 10) || 1);
      preparePending(slot, p.fileName, p.book, p.sheetName, n, p.sample); render();
    });
    opts.appendChild(h('label', { class: 'field' }, h('span', null, '머리행 위치(몇 번째 줄)'), hr,
      h('small', { class: 'note' }, '맨 위에 제목 줄이 있으면 컬럼 이름이 있는 줄 번호로 바꿉니다.')));
    box.appendChild(opts);

    var grid = h('div', { class: 'form-grid map-grid' });
    def.fields.forEach(function (f) {
      var s = h('select', { name: 'map_' + f.key },
        h('option', { value: '' }, f.required ? '(선택해 주세요)' : '(없음)'),
        p.headers.map(function (hd) { return h('option', { value: hd, selected: p.mapping[f.key] === hd }, hd); }));
      s.addEventListener('change', function () { p.mapping[f.key] = s.value || undefined; });
      grid.appendChild(h('label', { class: 'field' + (f.required && !p.mapping[f.key] ? ' invalid' : '') },
        h('span', null, f.label + (f.required ? ' *' : '')), s));
    });
    box.appendChild(h('h3', null, '컬럼 짝짓기'));
    box.appendChild(grid);

    // 미리보기 3행
    var prev = p.rows.slice(0, 3);
    if (prev.length) {
      box.appendChild(h('p', { class: 'note' }, '미리보기 (앞 ' + prev.length + '행 / 전체 ' + fmt(p.rows.length) + '행)'));
      box.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'list compact' },
        h('thead', null, h('tr', null, p.headers.map(function (hd) { return h('th', null, hd); }))),
        h('tbody', null, prev.map(function (r) { return h('tr', null, p.headers.map(function (hd) { return h('td', null, String(r[hd])); })); })))));
    } else {
      box.appendChild(h('p', { class: 'alert warn' }, '머리행 아래에 자료 행이 없습니다. 시트나 머리행 위치를 확인해 주세요.'));
    }
    box.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        if (confirmSlot(slot)) { toast(slot.label + ' 자료를 적용했습니다.'); render(); }
      } }, '이 짝으로 적용'),
      h('button', { type: 'button', class: 'btn', onclick: function () { delete pending[slot.id]; render(); } }, '취소')));
    return box;
  }

  // ── 기준 설정 ─────────────────────────────────────────────
  function viewSettings() {
    function num(name, label, hint) {
      return h('label', { class: 'field', 'data-field': name }, h('span', null, label),
        h('input', { name: name, inputmode: 'decimal', value: String(settings[name] == null ? '' : settings[name]) }),
        hint ? h('small', { class: 'note' }, hint) : null);
    }
    var form = h('form', { class: 'card', novalidate: true },
      h('h2', null, '기준일'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, '당월 기준일(월말) *'), h('input', { type: 'date', name: 'curDate', value: settings.curDate }),
          h('small', { class: 'note' }, 'Aging 일수는 이 날짜에서 입고일·출고일을 뺀 값입니다.')),
        h('label', { class: 'field' }, h('span', null, '전월 기준일'), h('input', { type: 'date', name: 'prevDate', value: settings.prevDate }),
          h('small', { class: 'note' }, '비우면 당월 기준일의 전월 말일. 전월 단가 적용과 당월 출고수량(회전율) 기간에 씁니다.'))),
      h('h2', null, 'Aging · 적정성'),
      h('p', { class: 'alert info' }, 'Aging 은 입고일 기준과 최근 출고일 기준을 모두 계산하고, 화면 표시와 구간·적정성 판정은 최근 출고일 기준으로 합니다(제출 원문 기준). 아래 숫자는 처음 넣어 둔 예시 값입니다. 회사 기준으로 바꿔 주세요.'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field', 'data-field': 'agingBounds' }, h('span', null, 'Aging 구간 경계(일, 쉼표로 구분)'),
          h('input', { name: 'agingBounds', value: settings.agingBounds }), h('small', { class: 'note' }, '예: 90, 180, 365 → 0~90일 / 91~180일 / 181~365일 / 365일 초과')),
        h('label', { class: 'field' }, h('span', null, '출고 이력이 없는 품목'),
          h('select', { name: 'noOutPolicy' },
            h('option', { value: 'inbound', selected: settings.noOutPolicy !== 'none' }, '최근 입고일로 대신 계산'),
            h('option', { value: 'none', selected: settings.noOutPolicy === 'none' }, '판정 보류(날짜 없음)'))),
        num('overDays', '과잉 기준 — Aging 이 이 일수를 넘으면', '예시 값. 이하이면 「적정」'),
        num('deadDays', '불용 기준 — Aging 이 이 일수를 넘으면', '예시 값. 과잉 기준보다 크거나 같게')),
      h('h2', null, '재고금액 · 관리대상'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, '재고금액 산출'),
          h('select', { name: 'amountSource' },
            h('option', { value: 'price', selected: settings.amountSource !== 'file' }, '단가표 × 수량 우선 (단가 없으면 파일 금액)'),
            h('option', { value: 'file', selected: settings.amountSource === 'file' }, '재고 파일의 금액 우선 (없으면 단가표)'))),
        num('topN', '금액 증가 상위 몇 건을 관리대상으로', '0 이면 적용 안 함'),
        num('turnoverMax', '저회전 기준 — 회전율이 이 값 미만', '비우면 적용 안 함. 회전율 = 당월 출고수량 ÷ 평균재고(전월·당월 평균)')),
      h('div', { id: 'settingsErrors' }),
      h('div', { class: 'submit-bar' }, h('button', { type: 'submit', class: 'btn btn-primary btn-big' }, '기준 저장')));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var next = {};
      Object.keys(L.defaultSettings()).forEach(function (k) { next[k] = form.elements[k] ? form.elements[k].value.trim() : settings[k]; });
      var chk = L.checkSettings(next);
      var box = form.querySelector('#settingsErrors');
      box.textContent = '';
      if (!chk.ok) { box.appendChild(h('div', { class: 'alert warn' }, h('ul', null, chk.errors.map(function (m) { return h('li', null, m); })))); return; }
      settings = next;
      S.setSettings(settings);
      toast('기준을 저장했습니다.');
      location.hash = '#/raw';
    });
    return h('div', null, h('div', { class: 'page-head' }, h('h1', null, '기준 설정')), form);
  }

  // ── 분석 화면 공통 ────────────────────────────────────────
  function needData() {
    if (!hasStock()) {
      return h('div', { class: 'card' }, h('p', null, '아직 올린 재고 자료가 없습니다.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/data' }, '자료 올리러 가기'),
          h('button', { type: 'button', class: 'btn', onclick: loadSample }, '예시 데이터 불러오기')));
    }
    return null;
  }
  function needSettings(res) {
    if (res.ok) return null;
    return h('div', { class: 'card' }, h('div', { class: 'alert warn' }, h('ul', null, res.errors.map(function (m) { return h('li', null, m); }))),
      h('a', { class: 'btn btn-primary', href: '#/settings' }, '기준 설정으로'));
  }
  function stat(label, value, sub, cls) {
    return h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value ' + (cls || '') }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null);
  }
  function table(head, rows, opts) {
    opts = opts || {};
    return h('div', { class: 'table-wrap' }, h('table', { class: 'list' + (opts.cls ? ' ' + opts.cls : '') },
      h('thead', null, h('tr', null, head.map(function (x) { return h('th', { class: x.num ? 'num' : null }, x.label || x); }))),
      h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: String(head.length), class: 'empty' }, opts.empty || '해당 자료가 없습니다.')))));
  }
  function td(v, cls) { return h('td', { class: cls || null }, v == null ? '' : v); }
  function n(v) { return { label: v, num: true }; }

  function missingNotes(res, kindHasPrev) {
    var notes = [];
    if (!kindHasPrev) notes.push('전월 재고가 없어 모든 품목을 「신규」로 봅니다.');
    if (!res.hasHistory.price) notes.push('단가표가 없어 재고금액은 재고 파일의 금액 컬럼만 씁니다(없으면 비어 있음).');
    if (!res.hasHistory.outbound) notes.push('출고 이력이 없어 최근 출고일 기준 Aging 과 회전율을 계산하지 못합니다.');
    if (!res.hasHistory.inbound) notes.push('입고 이력이 없어 입고일 기준 Aging 을 계산하지 못합니다.');
    return notes.length ? h('div', { class: 'alert info' }, h('ul', null, notes.map(function (x) { return h('li', null, x); }))) : null;
  }

  function viewKind(kindKey) {
    var isRaw = kindKey === 'raw';
    var title = isRaw ? '원자재 분석' : '제품 분석';
    var groupLabel = isRaw ? '대분류' : '고객사';
    var codeLabel = isRaw ? '품번' : '제품코드';
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, title)));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    var k = res[kindKey];
    var curSlot = isRaw ? 'rawCur' : 'prodCur', prevSlot = isRaw ? 'rawPrev' : 'prodPrev';
    if (!data[curSlot]) {
      wrap.appendChild(h('div', { class: 'card' }, h('p', null, (isRaw ? '원자재' : '제품') + ' 당월 재고 파일을 아직 올리지 않았습니다.'), h('a', { class: 'btn btn-primary', href: '#/data' }, '자료 올리러 가기')));
      return wrap;
    }
    wrap.appendChild(h('p', { class: 'note' }, '기준일 ' + res.curDate + ' (전월 ' + res.prevDate + ') · Aging 표시는 최근 출고일 기준'));
    append(wrap, missingNotes(res, !!data[prevSlot]));

    var t = k.groups.total;
    wrap.appendChild(h('div', { class: 'stats' },
      stat('당월 재고수량', fmt(t.curQty), '전월 ' + fmt(t.prevQty)),
      stat('수량 증감', fmtSigned(t.diffQty), fmtRate(t.prevQty, t.curQty, t.qtyRate), sign(t.diffQty)),
      stat('당월 재고금액', fmt(t.curAmt), '전월 ' + fmt(t.prevAmt)),
      stat('금액 증감', fmtSigned(t.diffAmt), fmtRate(t.prevAmt, t.curAmt, t.amtRate), sign(t.diffAmt))));

    // 그룹별 증감
    wrap.appendChild(h('h2', null, groupLabel + '별 전월 대비 증감'));
    var gRows = k.groups.rows.concat([t]).map(function (g) {
      return h('tr', { class: g === t ? 'total' : null },
        td(g.group), td(fmt(g.itemCount), 'num'), td(fmt(g.prevQty), 'num'), td(fmt(g.curQty), 'num'),
        td(fmtSigned(g.diffQty), 'num ' + sign(g.diffQty)), td(fmtRate(g.prevQty, g.curQty, g.qtyRate), 'num'),
        td(fmt(g.prevAmt), 'num'), td(fmt(g.curAmt), 'num'), td(fmtSigned(g.diffAmt), 'num ' + sign(g.diffAmt)),
        td(fmtRate(g.prevAmt, g.curAmt, g.amtRate), 'num'), td(g.noAmount ? g.noAmount + '건' : '', 'num'));
    });
    wrap.appendChild(table([groupLabel, n('품목 수'), n('전월 수량'), n('당월 수량'), n('수량 증감'), n('증감률'), n('전월 금액'), n('당월 금액'), n('금액 증감'), n('증감률'), n('금액 미산정')], gRows));

    // Aging · 적정성
    wrap.appendChild(h('div', { class: 'two-col' },
      h('div', null, h('h2', null, 'Aging 구간 (출고일 기준 표시)'),
        table(['구간', n('품목 수'), n('재고수량'), n('재고금액')], k.buckets.map(function (b) {
          return h('tr', null, td(b.bucket), td(fmt(b.count), 'num'), td(fmt(b.qty), 'num'), td(fmt(b.amount), 'num'));
        }))),
      h('div', null, h('h2', null, '적정 · 과잉 · 불용'),
        table(['구분', n('품목 수'), n('재고수량'), n('재고금액')], k.fitness.map(function (f) {
          return h('tr', null, td(h('span', { class: 'fit ' + fitCls(f.fitness) }, f.fitness)), td(fmt(f.count), 'num'), td(fmt(f.qty), 'num'), td(fmt(f.amount), 'num'));
        })),
        h('p', { class: 'note' }, '적정: ' + settings.overDays + '일 이하 · 과잉: ' + settings.overDays + '일 초과 · 불용: ' + settings.deadDays + '일 초과 (기준 설정에서 변경)'))));

    // 품목별
    wrap.appendChild(h('h2', null, '품목별 증감 · Aging'));
    wrap.appendChild(itemTable(kindKey, k.items, codeLabel, groupLabel));
    return wrap;
  }

  function fitCls(f) { return f === '적정' ? 'ok' : f === '과잉' ? 'over' : f === '불용' ? 'dead' : 'hold'; }

  function itemTable(kindKey, items, codeLabel, groupLabel) {
    var f = itemFilter[kindKey];
    var groups = [];
    items.forEach(function (it) { if (groups.indexOf(it.group) < 0) groups.push(it.group); });
    groups.sort();
    var box = h('div');
    var form = h('form', { class: 'filters', onsubmit: function (e) { e.preventDefault(); } },
      h('label', { class: 'field' }, h('span', null, '검색(' + codeLabel + '·품명)'), h('input', { name: 'q', value: f.q || '' })),
      h('label', { class: 'field' }, h('span', null, groupLabel), h('select', { name: 'group' }, h('option', { value: '' }, '전체'),
        groups.map(function (g) { return h('option', { value: g, selected: f.group === g }, g); }))),
      h('label', { class: 'field' }, h('span', null, '구분'), h('select', { name: 'change' }, ['', '신규', '소멸', '유지'].map(function (c) {
        return h('option', { value: c, selected: (f.change || '') === c }, c || '전체');
      }))),
      h('label', { class: 'field' }, h('span', null, '적정성'), h('select', { name: 'fitness' }, ['', '적정', '과잉', '불용', '판정 보류', '재고 없음'].map(function (c) {
        return h('option', { value: c, selected: (f.fitness || '') === c }, c || '전체');
      }))),
      h('label', { class: 'field' }, h('span', null, '정렬'), h('select', { name: 'sort' }, [
        ['amt', '금액 증감 큰 순(절댓값)'], ['qty', '수량 증감 큰 순(절댓값)'], ['aging', 'Aging 긴 순'], ['code', codeLabel + ' 순']
      ].map(function (o) { return h('option', { value: o[0], selected: (f.sort || 'amt') === o[0] }, o[1]); }))));
    var holder = h('div');
    function draw() {
      ['q', 'group', 'change', 'fitness', 'sort'].forEach(function (k) { f[k] = form.elements[k].value; });
      var q = (f.q || '').trim().toLowerCase();
      var list = items.filter(function (it) {
        if (q && (it.code + ' ' + it.name).toLowerCase().indexOf(q) < 0) return false;
        if (f.group && it.group !== f.group) return false;
        if (f.change && it.change !== f.change) return false;
        if (f.fitness && it.fitness !== f.fitness) return false;
        return true;
      });
      var sortKey = f.sort || 'amt';
      list.sort(function (a, b) {
        if (sortKey === 'code') return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
        if (sortKey === 'aging') return (b.agingShown == null ? -1 : b.agingShown) - (a.agingShown == null ? -1 : a.agingShown);
        if (sortKey === 'qty') return Math.abs(b.diffQty) - Math.abs(a.diffQty);
        return Math.abs(b.diffAmt || 0) - Math.abs(a.diffAmt || 0);
      });
      holder.textContent = '';
      holder.appendChild(h('p', { class: 'list-meta' }, '품목 ' + fmt(list.length) + '건' + (list.length > MAX_ROWS ? ' — 앞 ' + MAX_ROWS + '건만 표시합니다. 전체는 엑셀로 내려받아 보세요.' : '')));
      var rows = list.slice(0, MAX_ROWS).map(function (it) {
        return h('tr', null,
          td(it.code, 'nowrap'), td(it.name), td(it.group), td(it.change),
          td(fmt(it.prevQty), 'num'), td(fmt(it.curQty), 'num'), td(fmtSigned(it.diffQty), 'num ' + sign(it.diffQty)), td(fmtRate(it.prevQty, it.curQty, it.qtyRate), 'num'),
          td(it.curPrice == null ? '없음' : fmt(it.curPrice), 'num'), td(fmt(it.curAmt), 'num'), td(fmtSigned(it.diffAmt), 'num ' + sign(it.diffAmt)),
          td(it.lastIn, 'nowrap'), td(it.lastOut, 'nowrap'), td(fmt(it.agingIn), 'num'), td(fmt(it.agingOut), 'num'),
          td(it.agingShown == null ? '' : fmt(it.agingShown) + (it.agingBasis === '입고일 대체' ? ' (입고일 대체)' : ''), 'num strong'),
          td(it.curQty ? h('span', { class: 'fit ' + fitCls(it.fitness) }, it.fitness) : it.fitness), td(it.turnover == null ? '' : fmt(it.turnover), 'num'));
      });
      holder.appendChild(table([codeLabel, '품명', groupLabel, '구분', n('전월 수량'), n('당월 수량'), n('수량 증감'), n('증감률'), n('당월 단가'), n('당월 금액'), n('금액 증감'),
        '최근 입고일', '최근 출고일', n('Aging 입고일'), n('Aging 출고일'), n('Aging 표시(일)'), '적정성', n('회전율')], rows, { cls: 'wide' }));
    }
    form.addEventListener('input', draw);
    form.addEventListener('change', draw);
    box.appendChild(form);
    box.appendChild(holder);
    draw();
    return box;
  }

  // ── 관리대상 ─────────────────────────────────────────────
  function viewTargets() {
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, '관리대상 후보')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    var rules = ['금액 증가 상위 ' + settings.topN + '건(원자재·제품 각각)', '과잉(Aging ' + settings.overDays + '일 초과)', '불용(Aging ' + settings.deadDays + '일 초과)'];
    rules.push(settings.turnoverMax === '' ? '저회전: 기준 미설정(적용 안 함)' : '저회전(회전율 ' + settings.turnoverMax + ' 미만)');
    wrap.appendChild(h('div', { class: 'alert info' }, '선정 규칙 — ' + rules.join(' · ') + '. 원인과 개선방안은 엑셀로 내려받아 담당자가 적습니다.'));
    ['원자재', '제품'].forEach(function (kind) {
      var list = res.targets.filter(function (t) { return t.kind === kind; });
      wrap.appendChild(h('h2', null, kind + ' (' + list.length + '건)'));
      wrap.appendChild(table(['품번', '품명', kind === '원자재' ? '대분류' : '고객사', '선정 사유', n('당월 수량'), n('당월 금액'), n('금액 증감'), n('Aging 표시(일)'), '최근 출고일', '적정성'],
        list.map(function (t) {
          return h('tr', null, td(t.code, 'nowrap'), td(t.name), td(t.group), td(t.reasons.join(', ')), td(fmt(t.curQty), 'num'), td(fmt(t.curAmt), 'num'),
            td(fmtSigned(t.diffAmt), 'num ' + sign(t.diffAmt)), td(t.agingShown == null ? '' : fmt(t.agingShown), 'num'), td(t.lastOut, 'nowrap'),
            td(h('span', { class: 'fit ' + fitCls(t.fitness) }, t.fitness)));
        }), { empty: '선정 규칙에 해당하는 품목이 없습니다.' }));
    });
    return wrap;
  }

  // ── 단가 미매칭 ──────────────────────────────────────────
  function viewUnmatched() {
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, '단가 미매칭 목록')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    wrap.appendChild(h('p', { class: 'note' }, '재고가 있는데 단가표에서 품번을 찾지 못한 품목입니다. 적용일이 있으면 각 기준일 이전의 가장 최근 단가를 씁니다. 품번 표기(앞자리 0, 공백, 대소문자)가 두 파일에서 같은지 먼저 확인해 주세요.'));
    if (!res.hasHistory.price) wrap.appendChild(h('div', { class: 'alert warn' }, '단가표를 올리지 않아 모든 품목이 미매칭입니다.'));
    wrap.appendChild(table(['구분', '품번', '품명', '대분류·고객사', '단가 없는 달', n('당월 수량'), n('전월 수량'), '비고'],
      res.unmatched.map(function (u) {
        return h('tr', null, td(u.kind), td(u.code, 'nowrap'), td(u.name), td(u.group), td(u.months), td(fmt(u.curQty), 'num'), td(fmt(u.prevQty), 'num'), td(u.note));
      }), { empty: '모든 품목의 단가를 찾았습니다.' }));
    return wrap;
  }

  // ── 라우터 ───────────────────────────────────────────────
  function render() {
    var hash = location.hash || '#/data';
    var route = hash.replace(/^#\//, '').split('/')[0] || 'data';
    var views = { data: viewData, settings: viewSettings, raw: function () { return viewKind('raw'); }, product: function () { return viewKind('product'); }, targets: viewTargets, unmatched: viewUnmatched };
    if (!views[route]) route = 'data';
    renderHeader(route);
    main.textContent = '';
    main.appendChild(views[route]());
    main.setAttribute('data-route', '#/' + route);
  }
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  if (!S.available()) setTimeout(function () { toast('이 브라우저는 저장소를 쓸 수 없어, 창을 닫으면 자료가 사라집니다.', true); }, 300);
  render();
})();
