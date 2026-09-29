/*
 * 화면 — 해시 주소로 나눕니다.
 *   #/data        자료 올리기 · 컬럼 짝짓기 (7개 자리, 자리마다 공장별 파일 여러 개)
 *   #/settings    기준 설정 (기준일, Aging 개월 구간, 적정·과잉·불용, 대분류 묶음표, 관리대상 기준)
 *   #/raw         원자재 분석 (공장별 요약, 대분류별 증감, Aging, 적정성, 품목별)
 *   #/product     제품 분석 (고객사별 증감, Aging, 적정성, 품목별)
 *   #/cause       증감 원인 (대분류 금액 증감 분해, 기여 상위 품목, 원인 메모, AI 해설 프롬프트)
 *                 #/cause/product 는 제품(고객사별)
 *   #/targets     관리대상 후보
 *   #/unmatched   단가 미매칭 목록
 * 분석 화면 위의 「공장 보기」(합계·인천·대구)는 모든 분석 화면과 엑셀에 함께 적용됩니다.
 */
(function () {
  'use strict';
  var L = window.InvLogic, S = window.InvStore, Sample = window.InvSample;
  var main = document.getElementById('main');
  // 올린 자료 { slotId: { parts: [{ fileName, sheetName, plant, sample, rowCount, records, problems, mapping }] } }
  // 예전(자리마다 파일 하나) 형식으로 저장된 자료는 여기서 새 형식으로 바꿉니다.
  var data = L.migrateSlotData(S.getData());
  // 기준 — 예전 「일」 단위(90·180·365일 등)로 저장된 설정은 「개월」로 자동 변환합니다.
  var mig = L.migrateSettings(S.getSettingsRaw(), L.defaultSettings());
  var settings = mig.settings;
  if (mig.migrated) {
    S.setSettings(settings);
    setTimeout(function () { toast('저장돼 있던 Aging 기준(일)을 개월로 바꿨습니다: 구간 ' + settings.agingMonths + '개월, 과잉 ' + settings.overMonths + '개월, 불용 ' + settings.deadMonths + '개월. 「기준 설정」에서 확인해 주세요.'); }, 300);
  }
  var pending = {};                 // 올렸지만 아직 짝을 확정하지 않은 파일 { slotId: {...} }
  var itemFilter = { raw: {}, product: {} };
  var MAX_ROWS = 300;
  var PLANT_IDS = L.PLANTS.map(function (p) { return p.id; });

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
    toastTimer = setTimeout(function () { el.hidden = true; }, 4200);
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
  function parts(slotId) { return data[slotId] && data[slotId].parts ? data[slotId].parts : []; }
  function isSample() {
    return Object.keys(data).some(function (k) { return parts(k).some(function (p) { return p.sample; }); });
  }
  function persist() {
    if (!S.setData(data)) toast('브라우저 저장 공간이 부족해 자료를 이번 창에서만 유지합니다. 새로 고치면 다시 올려 주세요.', true);
  }
  function saveSettings() { S.setSettings(settings); }
  function records(slotId) {
    var out = [];
    parts(slotId).forEach(function (p) { out = out.concat(p.records || []); });
    return out;
  }
  function currentData() {
    var o = {};
    L.SLOTS.forEach(function (s) { o[s.id] = records(s.id); });
    return o;
  }
  function result() { return L.analyze(currentData(), settings); }
  function hasStock() { return ['rawCur', 'prodCur'].some(function (k) { return parts(k).length; }); }
  function plantText() { return settings.plantView ? settings.plantView + ' 공장' : '인천+대구 합계'; }
  function memoKey() { return (settings.curDate || '기준일없음') + '.' + (settings.plantView || 'all'); }

  function download(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── 머리 ─────────────────────────────────────────────────
  var NAV = [['data', '자료'], ['settings', '기준 설정'], ['raw', '원자재 분석'], ['product', '제품 분석'], ['cause', '증감 원인'], ['targets', '관리대상'], ['unmatched', '단가 미매칭']];
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
    var sheets = L.buildSheets(res, settings, isSample(), S.getMemos(memoKey()));
    var wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (name) {
      var ws = XLSX.utils.aoa_to_sheet(sheets[name]);
      ws['!cols'] = sheets[name][0].map(function (hd) { return { wch: Math.max(10, Math.min(40, String(hd).length * 2)) }; });
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var name = (isSample() ? '예시데이터_' : '') + '재고분석_' + res.curDate + '_' + (settings.plantView || '합계') + '.xlsx';
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

  // 자리의 달(당월 = 기준일의 달, 전월 = 그 앞 달). 재고 자리가 아니면 null
  function slotMonth(slotId) {
    var d = L.parseDate(settings.curDate);
    if (!d || !/^(raw|prod)/.test(slotId)) return null;
    var m = d.getMonth() + 1;
    return /Prev$/.test(slotId) ? (m === 1 ? 12 : m - 1) : m;
  }
  function otherMonth(slotId) {
    var m = slotMonth(slotId);
    if (m == null) return null;
    return /Prev$/.test(slotId) ? (m === 12 ? 1 : m + 1) : (m === 1 ? 12 : m - 1);
  }

  // sheetName·headerRow 가 null 이면 짐작합니다. plant 가 undefined 면 파일 이름으로 짐작합니다.
  function preparePending(slot, fileName, book, sheetName, headerRow, sample, plant) {
    var sheetSure = true;
    if (!sheetName) {
      if (/^(raw|prod)/.test(slot.id) && book.names.length > 1) {
        var g = L.guessSheet(book.names, slot.id, slotMonth(slot.id));
        sheetName = g.name; sheetSure = g.sure;
      } else sheetName = book.names[0];
    }
    var aoa = book.sheets[sheetName] || [];
    if (!headerRow) headerRow = L.guessHeaderRow(aoa, slot.def);
    var tbl = L.tableToRows(aoa, headerRow);
    var p = {
      fileName: fileName, book: book, sheetName: sheetName, sheetSure: sheetSure, headerRow: headerRow, sample: !!sample,
      plant: plant === undefined ? L.plantFromFileName(fileName) : plant,
      headers: tbl.headers, rows: tbl.rows,
      mapping: L.guessMapping(tbl.headers, slot.def, S.getMapping(slot.def), { avoidMonth: otherMonth(slot.id) })
    };
    pending[slot.id] = p;
    return p;
  }

  // 파일 제목 줄(「… / 2026/08/31 / 재고현황」)에서 기준일을 찾아, 비어 있으면 채웁니다
  function fillDateFromBook(slot, book, sheetName) {
    if (settings.curDate || !/Cur$/.test(slot.id)) return;
    var d = L.dateFromTitle(book.sheets[sheetName] || []);
    if (!d) return;
    var dt = L.parseDate(d);
    settings.curDate = L.toDateStr(new Date(dt.getFullYear(), dt.getMonth() + 1, 0));
    saveSettings();
    toast('파일 제목 줄의 날짜로 당월 기준일을 ' + settings.curDate + ' 로 넣었습니다. 「기준 설정」에서 바꿀 수 있습니다.');
  }

  function confirmSlot(slot) {
    var p = pending[slot.id];
    var missing = L.missingRequired(p.mapping, slot.def);
    if (missing.length) { toast('짝을 지정해 주세요: ' + missing.join(', '), true); return false; }
    var r = L.applyMapping(p.rows, p.mapping, slot.def);
    var pl = L.assignPlant(r.records, slot.id === 'price' ? '' : p.plant);
    var problems = r.problems.slice();
    if (pl.excluded) problems.push({ code: '분석 제외 공장(중국 등) 행', count: pl.excluded, rows: [] });
    var part = {
      fileName: p.fileName, sample: p.sample, sheetName: p.sheetName, plant: slot.id === 'price' ? '' : p.plant,
      plantColumn: !!p.mapping.plant, rowCount: p.rows.length, records: pl.records, problems: problems, mapping: p.mapping, otherPlants: pl.otherPlants
    };
    // 같은 자리에 같은 공장 파일이 이미 있으면 바꿉니다(공장 칸으로 나누는 파일은 파일 이름으로 구분)
    var key = function (x) { return x.plantColumn ? 'col:' + x.fileName + ':' + x.sheetName : 'plant:' + x.plant; };
    var list = parts(slot.id).filter(function (x) { return key(x) !== key(part); });
    list.push(part);
    list.sort(function (a, b) { return PLANT_IDS.indexOf(a.plant) - PLANT_IDS.indexOf(b.plant); });
    data[slot.id] = { parts: list };
    if (!p.sample) S.setMapping(slot.def, p.mapping);
    delete pending[slot.id];
    persist();
    return true;
  }

  function loadSample() {
    var plan = Sample.build();
    data = {};
    pending = {};
    settings.curDate = Sample.CUR;
    settings.prevDate = Sample.PREV;
    settings.plantView = '';
    L.SLOTS.forEach(function (slot) {
      plan[slot.id].forEach(function (part) {
        var book = { names: part.names, sheets: part.sheets };
        preparePending(slot, part.fileName, book, part.sheetName, null, true);
        confirmSlot(slot);
      });
    });
    saveSettings();
    toast('예시 데이터(가상)를 불러왔습니다 — 인천·대구 두 공장, 7월·8월. 기준일은 ' + Sample.CUR + ' 입니다.');
    render();
  }

  // ── 자료 화면 ─────────────────────────────────────────────
  function viewData() {
    var wrap = h('div', null,
      h('div', { class: 'page-head' }, h('h1', null, '자료 올리기 · 컬럼 짝짓기')),
      h('div', { class: 'card' },
        h('p', null, '월말 재고 파일과 입출고·단가 파일을 올립니다. 엑셀(xlsx·xls)과 CSV 를 읽습니다. 파일은 외부로 보내지 않고 이 브라우저 안에서만 계산합니다.'),
        h('p', { class: 'note' }, '인천·대구처럼 공장별로 파일이 나뉘어 있으면 같은 자리에 파일을 하나씩 더 올려 주세요. 파일마다 공장을 지정합니다(파일 이름에 「본사」「인천」「대구」가 있으면 자동으로 골라 둡니다). 중국공장 행은 분석에서 뺍니다.'),
        h('p', { class: 'note' }, '한 통합문서에 7월·8월 시트가 함께 있으면, 당월 자리와 전월 자리에 같은 파일을 올리고 시트만 달리 고르면 됩니다(달 이름이 든 시트를 자동으로 골라 둡니다). 한 시트에 「7월재고수량」「8월재고수량」처럼 두 달 칸이 나란히 있어도 자리마다 칸만 달리 짝지으면 됩니다.'),
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
    rawCur: '품번·재고수량 필수. 대분류·금액(또는 단가)·경과 개월(재고잔량분석) 칸이 있으면 함께 씁니다',
    rawPrev: '당월과 같은 형식. 없으면 모두 「신규」로 봅니다',
    prodCur: '제품코드·고객사·재고수량', prodPrev: '당월과 같은 형식',
    inbound: '품번·입고일(·수량) — 입고일 기준 Aging, 증감 원인의 「입고」', outbound: '품번·출고일(·수량) — 최근 출고일 기준 Aging, 회전율, 증감 원인의 「출고·사용」',
    price: '품번·단가(·적용일·품명·대분류) — 재고 파일에 금액이 없을 때 금액 산출, 대분류가 빈 품목 채우기'
  };

  function slotCard(slot) {
    var list = parts(slot.id), p = pending[slot.id];
    var card = h('section', { class: 'card slot', 'data-slot': slot.id },
      h('h2', null, slot.label),
      h('p', { class: 'note' }, SLOT_HELP[slot.id]));
    var input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt', 'aria-label': slot.label + ' 파일 선택' });
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) return;
      readFile(f, function (err, book) {
        if (err) { toast(err.message, true); return; }
        var pp = preparePending(slot, f.name, book, null, null, false);
        fillDateFromBook(slot, book, pp.sheetName);
        if (settings.curDate && /^(raw|prod)/.test(slot.id) && !pp.sheetSure && book.names.length > 1) preparePending(slot, f.name, book, null, null, false);
        render();
      });
    });
    if (list.length) {
      card.appendChild(h('ul', { class: 'part-list' }, list.map(function (d) {
        return h('li', null,
          h('span', { class: 'ok-badge' }, '적용됨'),
          slot.id === 'price' ? null : h('span', { class: 'plant-badge' }, d.plantColumn ? '공장 칸으로 구분' : L.plantLabel(d.plant)),
          h('span', { class: 'part-name' }, d.fileName + (d.sheetName && d.sheetName !== '예시' ? ' [' + d.sheetName + ']' : '')),
          h('span', { class: 'note' }, '읽은 행 ' + fmt(d.rowCount) + ' · 사용 ' + fmt(d.records.length)),
          h('button', { type: 'button', class: 'btn', onclick: function () {
            data[slot.id] = { parts: parts(slot.id).filter(function (x) { return x !== d; }) };
            if (!data[slot.id].parts.length) delete data[slot.id];
            persist(); render();
          } }, '빼기'),
          d.problems && d.problems.length ? h('ul', { class: 'problems' }, d.problems.map(function (pr) {
            return h('li', null, pr.code + ' ' + pr.count + '행' + (pr.rows && pr.rows.length ? ' (예: ' + pr.rows.join(', ') + '번째 자료 행)' : ''));
          })) : null,
          d.otherPlants && d.otherPlants.length ? h('p', { class: 'note' }, '공장 칸에 인천·대구가 아닌 값이 있습니다: ' + d.otherPlants.join(', ') + ' — 공장 보기에서는 「' + d.otherPlants[0] + '」처럼 따로 잡힙니다.') : null);
      })));
    }
    if (p) {
      card.appendChild(mappingForm(slot, p));
    } else {
      card.appendChild(h('div', { class: 'btn-row' }, h('label', { class: 'btn file-btn' }, list.length ? (slot.id === 'price' ? '파일 추가' : '다른 공장 파일 추가 · 바꾸기') : '파일 선택', input)));
    }
    return card;
  }

  function mappingForm(slot, p) {
    var def = L.DEFS[slot.def];
    var box = h('div', { class: 'mapping' });
    box.appendChild(h('p', { class: 'file-line' }, p.fileName));
    if (!p.sheetSure) box.appendChild(h('p', { class: 'alert warn' }, '이 자리(' + slot.label + ')에 맞는 시트를 이름으로 찾지 못했습니다. 시트를 직접 골라 주세요.' + (!settings.curDate ? ' 「기준 설정」에서 당월 기준일을 먼저 넣으면 달 이름으로 시트를 골라 둡니다.' : '')));
    var opts = h('div', { class: 'form-grid' });
    if (p.book.names.length > 1) {
      var sel = h('select', { name: 'sheet' }, p.book.names.map(function (n) { return h('option', { value: n, selected: n === p.sheetName }, n); }));
      sel.addEventListener('change', function () { var q = preparePending(slot, p.fileName, p.book, sel.value, null, p.sample, p.plant); q.sheetSure = true; render(); });
      opts.appendChild(h('label', { class: 'field' }, h('span', null, '시트'), sel));
    }
    var hr = h('input', { type: 'number', min: '1', name: 'headerRow', value: String(p.headerRow) });
    hr.addEventListener('change', function () {
      var n = Math.max(1, parseInt(hr.value, 10) || 1);
      var q = preparePending(slot, p.fileName, p.book, p.sheetName, n, p.sample, p.plant); q.sheetSure = true; render();
    });
    opts.appendChild(h('label', { class: 'field' }, h('span', null, '머리행 위치(몇 번째 줄)'), hr,
      h('small', { class: 'note' }, '자동으로 짐작해 둡니다. 맨 위 제목 줄 때문에 틀리면 컬럼 이름이 있는 줄 번호로 바꿔 주세요.')));
    if (slot.id !== 'price') {
      var ps = h('select', { name: 'plant' },
        PLANT_IDS.map(function (id) { return h('option', { value: id, selected: p.plant === id }, id + ' 공장'); }),
        h('option', { value: '', selected: !p.plant }, '지정 안 함(공장 칸이 있거나 공통 자료)'));
      ps.addEventListener('change', function () { p.plant = ps.value; });
      opts.appendChild(h('label', { class: 'field' }, h('span', null, '이 파일의 공장'), ps,
        h('small', { class: 'note' }, '파일에 「공장」 칸을 짝지으면 그 칸 값이 먼저입니다. 입·출고 이력을 공장 지정 없이 올리면 두 공장 공통으로 씁니다.')));
    }
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
        if (confirmSlot(slot)) { toast(slot.label + ' 자료를 적용했습니다' + (slot.id !== 'price' ? ' (' + L.plantLabel(p.plant) + ').' : '.')); render(); }
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
          h('small', { class: 'note' }, 'Aging 경과 개월은 이 날짜와 입고일·출고일의 달력 월 차이입니다.')),
        h('label', { class: 'field' }, h('span', null, '전월 기준일'), h('input', { type: 'date', name: 'prevDate', value: settings.prevDate }),
          h('small', { class: 'note' }, '비우면 당월 기준일의 전월 말일. 전월 단가 적용과 당월 입·출고 수량(회전율·증감 원인) 기간에 씁니다.'))),
      h('h2', null, 'Aging · 적정성 (개월)'),
      h('div', { class: 'alert info' },
        h('p', null, 'Aging 은 「개월」 단위입니다. 표시·구간·적정성 판정 순서: 최근 출고일 → (출고 이력이 없으면) 재고 파일의 경과 개월 칸(재고잔량분석 등) → (설정 시) 최근 입고일.'),
        h('p', null, '경과 개월 = 기준일과 날짜의 달력 월 차이입니다. 기준일의 「일」이 날짜의 「일」보다 작으면 한 달이 덜 찬 것으로 1을 빼고, 기준일이 그 달 말일이면 빼지 않습니다. 예: 기준일 8월 31일이면 8월 중 출고 = 0개월, 7월 중 = 1개월, 2월 1일 = 6개월. 1월 31일 → 2월 28일(말일) = 1개월.'),
        h('p', null, '「12 개월초과」로 적힌 파일 값은 13개월로 봅니다. 처음 값(3·6·12개월, 과잉 6, 불용 12)은 예전 일 단위 예시 값(90·180·365일)을 월로 바꾼 것입니다. 불용 12개월 초과는 보내 주신 총괄표의 정상·불용 구분과 같습니다.')),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field', 'data-field': 'agingMonths' }, h('span', null, 'Aging 구간 경계(개월, 쉼표로 구분)'),
          h('input', { name: 'agingMonths', value: settings.agingMonths }), h('small', { class: 'note' }, '예: 3, 6, 12 → 0~3개월 / 4~6개월 / 7~12개월 / 12개월 초과')),
        h('label', { class: 'field' }, h('span', null, '출고 이력도 경과 개월 칸도 없는 품목'),
          h('select', { name: 'noOutPolicy' },
            h('option', { value: 'inbound', selected: settings.noOutPolicy !== 'none' }, '최근 입고일로 대신 계산'),
            h('option', { value: 'none', selected: settings.noOutPolicy === 'none' }, '판정 보류(날짜 없음)'))),
        num('overMonths', '과잉 기준 — 경과 개월이 이 값을 넘으면', '정수. 이하이면 「적정」'),
        num('deadMonths', '불용 기준 — 경과 개월이 이 값을 넘으면', '정수. 과잉 기준보다 크거나 같게')),
      h('h2', null, '원자재 대분류 묶음표'),
      h('p', { class: 'note' }, 'ERP 대분류 코드를 보고서 대분류로 묶습니다. 한 줄에 「코드=보고서 대분류」. 품번으로 묶으려면 「품번:CI184-*=파크라케이블(CI184)」처럼 적습니다(품번 규칙이 먼저). 비우면 파일에 적힌 대분류 그대로 씁니다.'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, '묶음표'), h('textarea', { name: 'groupMap', rows: '8' }, settings.groupMap)),
        h('label', { class: 'field' }, h('span', null, '묶음표에 없는 대분류'),
          h('select', { name: 'groupOthers' },
            h('option', { value: 'other', selected: settings.groupOthers !== 'keep' }, '「기타」로 모음 (보고서 방식)'),
            h('option', { value: 'keep', selected: settings.groupOthers === 'keep' }, '적힌 코드 그대로 보이기')),
          h('small', { class: 'note' }, '처음 값은 인천 본사 「원자재」 요약표와 같은 숫자가 나오는 짝입니다. 대구 요약표는 클립류·스위치를 기타에 넣고 있어, 대구만 볼 때 두 줄을 지우면 대구 표와 같아집니다.'))),
      h('h2', null, '재고금액 · 관리대상 · 증감 원인'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, '재고금액 산출'),
          h('select', { name: 'amountSource' },
            h('option', { value: 'file', selected: settings.amountSource !== 'price' }, '재고 파일의 금액 우선 (없으면 파일 단가 × 수량, 그다음 단가표)'),
            h('option', { value: 'price', selected: settings.amountSource === 'price' }, '단가표 × 수량 우선 (단가 없으면 파일 금액)'))),
        num('topN', '금액 증가 상위 몇 건을 관리대상으로', '0 이면 적용 안 함'),
        num('turnoverMax', '저회전 기준 — 회전율이 이 값 미만', '비우면 적용 안 함. 회전율 = 당월 출고수량 ÷ 평균재고(전월·당월 평균)'),
        num('causeTopN', '증감 원인 — 대분류마다 기여 상위 몇 품목', '예: 5')),
      h('div', { id: 'settingsErrors' }),
      h('div', { class: 'submit-bar' }, h('button', { type: 'submit', class: 'btn btn-primary btn-big' }, '기준 저장')));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var next = {};
      Object.keys(L.defaultSettings()).forEach(function (k) {
        var el = form.elements[k];
        next[k] = el ? (k === 'groupMap' ? el.value : el.value.trim()) : settings[k];
      });
      var chk = L.checkSettings(next);
      var box = form.querySelector('#settingsErrors');
      box.textContent = '';
      if (!chk.ok) { box.appendChild(h('div', { class: 'alert warn' }, h('ul', null, chk.errors.map(function (m) { return h('li', null, m); })))); return; }
      settings = next;
      saveSettings();
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

  // 공장 보기 — 합계·인천·대구
  function plantBar() {
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': '공장 보기' });
    [['', '합계(인천+대구)']].concat(PLANT_IDS.map(function (id) { return [id, id]; })).forEach(function (o) {
      seg.appendChild(h('button', { type: 'button', 'aria-pressed': (settings.plantView || '') === o[0] ? 'true' : 'false', onclick: function () {
        settings.plantView = o[0]; saveSettings(); render();
      } }, o[1]));
    });
    return h('div', { class: 'plant-bar' }, h('strong', null, '공장 보기'), seg);
  }
  // 공장·달별로 자료가 빠진 곳 알림 (예: 인천 전월 원자재가 없으면 인천 품목이 모두 「신규」로 잡힘)
  function coverageNotes(kindKey) {
    var cur = kindKey === 'raw' ? 'rawCur' : 'prodCur', prev = kindKey === 'raw' ? 'rawPrev' : 'prodPrev';
    var notes = [];
    function has(slot, plant) { return records(slot).some(function (r) { return r.plant === plant; }); }
    var plants = settings.plantView ? [settings.plantView] : PLANT_IDS;
    plants.forEach(function (pl) {
      var c = has(cur, pl), p = has(prev, pl);
      if (c && !p) notes.push(pl + ' 공장의 전월 자료가 없어 ' + pl + ' 품목은 모두 「신규」로 잡힙니다. 전월 파일(또는 전월 시트)을 「전월」 자리에 올려 주세요.');
      if (!c && p) notes.push(pl + ' 공장의 당월 자료가 없어 ' + pl + ' 품목은 모두 「소멸」로 잡힙니다.');
    });
    if (records(cur).some(function (r) { return !r.plant; })) notes.push('공장을 지정하지 않은 재고 자료가 있습니다. 합계에는 들어가고, 인천·대구 보기에서는 빠집니다. 「자료」에서 파일의 공장을 지정해 주세요.');
    return notes;
  }
  function missingNotes(res, kindKey) {
    var prevSlot = kindKey === 'raw' ? 'rawPrev' : 'prodPrev';
    var notes = coverageNotes(kindKey);
    if (!parts(prevSlot).length) notes.push('전월 재고가 없어 모든 품목을 「신규」로 봅니다.');
    if (!res.hasHistory.outbound) notes.push('출고 이력이 없어 최근 출고일 기준 Aging 과 회전율은 계산하지 못합니다. 재고 파일의 경과 개월 칸이 있으면 그 값으로 Aging 을 표시합니다.');
    if (!res.hasHistory.inbound) notes.push('입고 이력이 없어 입고일 기준 Aging 을 계산하지 못합니다.');
    return notes.length ? h('div', { class: 'alert info' }, h('ul', null, notes.map(function (x) { return h('li', null, x); }))) : null;
  }
  function plantSummaryTable(res, kindKey) {
    var rows = res.plants.rows.filter(function (r) { return r.has; }).concat([res.plants.total]);
    return table(['공장', n('전월 수량'), n('당월 수량'), n('수량 증감'), n('전월 금액'), n('당월 금액'), n('금액 증감'), n('증감률')], rows.map(function (r) {
      var t = r[kindKey];
      return h('tr', { class: r === res.plants.total ? 'total' : null }, td(r.label), td(fmt(t.prevQty), 'num'), td(fmt(t.curQty), 'num'), td(fmtSigned(t.diffQty), 'num ' + sign(t.diffQty)),
        td(fmt(t.prevAmt), 'num'), td(fmt(t.curAmt), 'num'), td(fmtSigned(t.diffAmt), 'num ' + sign(t.diffAmt)), td(fmtRate(t.prevAmt, t.curAmt, t.amtRate), 'num'));
    }));
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
    var curSlot = isRaw ? 'rawCur' : 'prodCur';
    wrap.appendChild(plantBar());
    if (!parts(curSlot).length) {
      wrap.appendChild(h('div', { class: 'card' }, h('p', null, (isRaw ? '원자재' : '제품') + ' 당월 재고 파일을 아직 올리지 않았습니다.'), h('a', { class: 'btn btn-primary', href: '#/data' }, '자료 올리러 가기')));
      return wrap;
    }
    wrap.appendChild(h('p', { class: 'note' }, plantText() + ' · 기준일 ' + res.curDate + ' (전월 ' + res.prevDate + ') · Aging 은 개월 단위, 표시는 최근 출고일 기준(없으면 파일 경과 개월)'));
    append(wrap, missingNotes(res, kindKey));

    var t = k.groups.total;
    wrap.appendChild(h('div', { class: 'stats' },
      stat('당월 재고수량', fmt(t.curQty), '전월 ' + fmt(t.prevQty)),
      stat('수량 증감', fmtSigned(t.diffQty), fmtRate(t.prevQty, t.curQty, t.qtyRate), sign(t.diffQty)),
      stat('당월 재고금액', fmt(t.curAmt), '전월 ' + fmt(t.prevAmt)),
      stat('금액 증감', fmtSigned(t.diffAmt), fmtRate(t.prevAmt, t.curAmt, t.amtRate), sign(t.diffAmt))));

    if (!settings.plantView) {
      wrap.appendChild(h('h2', null, '공장별 요약'));
      wrap.appendChild(plantSummaryTable(res, kindKey === 'raw' ? 'raw' : 'product'));
    }

    // 그룹별 증감
    wrap.appendChild(h('h2', null, groupLabel + '별 전월 대비 증감'));
    var gRows = k.groups.rows.concat([t]).map(function (g) {
      return h('tr', { class: g === t ? 'total' : null },
        td(g.group), td(fmt(g.prevItemCount) + '→' + fmt(g.itemCount), 'num'), td(fmt(g.prevQty), 'num'), td(fmt(g.curQty), 'num'),
        td(fmtSigned(g.diffQty), 'num ' + sign(g.diffQty)), td(fmtRate(g.prevQty, g.curQty, g.qtyRate), 'num'),
        td(fmt(g.prevAmt), 'num'), td(fmt(g.curAmt), 'num'), td(fmtSigned(g.diffAmt), 'num ' + sign(g.diffAmt)),
        td(fmtRate(g.prevAmt, g.curAmt, g.amtRate), 'num'), td(g.noAmount ? g.noAmount + '건' : '', 'num'));
    });
    wrap.appendChild(table([groupLabel, n('품목 수(전월→당월)'), n('전월 수량'), n('당월 수량'), n('수량 증감'), n('증감률'), n('전월 금액'), n('당월 금액'), n('금액 증감'), n('증감률'), n('금액 미산정')], gRows));
    wrap.appendChild(h('p', null, h('a', { href: '#/cause' + (isRaw ? '' : '/product') }, groupLabel + '별 증감 원인(입고·출고·단가·신규·소멸 분해) 보기')));

    // Aging · 적정성
    wrap.appendChild(h('div', { class: 'two-col' },
      h('div', null, h('h2', null, 'Aging 구간 (개월)'),
        table(['구간', n('품목 수'), n('재고수량'), n('재고금액')], k.buckets.map(function (b) {
          return h('tr', null, td(b.bucket), td(fmt(b.count), 'num'), td(fmt(b.qty), 'num'), td(fmt(b.amount), 'num'));
        }))),
      h('div', null, h('h2', null, '적정 · 과잉 · 불용'),
        table(['구분', n('품목 수'), n('재고수량'), n('재고금액')], k.fitness.map(function (f) {
          return h('tr', null, td(h('span', { class: 'fit ' + fitCls(f.fitness) }, f.fitness)), td(fmt(f.count), 'num'), td(fmt(f.qty), 'num'), td(fmt(f.amount), 'num'));
        })),
        h('p', { class: 'note' }, '적정: ' + settings.overMonths + '개월 이하 · 과잉: ' + settings.overMonths + '개월 초과 · 불용: ' + settings.deadMonths + '개월 초과 (기준 설정에서 변경)'))));

    // 품목별
    wrap.appendChild(h('h2', null, '품목별 증감 · Aging'));
    wrap.appendChild(itemTable(kindKey, k.items, codeLabel, groupLabel));
    return wrap;
  }

  function fitCls(f) { return f === '적정' ? 'ok' : f === '과잉' ? 'over' : f === '불용' ? 'dead' : 'hold'; }
  function agingCell(it) {
    if (it.agingShown == null) return '';
    var s = fmt(it.agingShown) + '개월';
    if (it.agingBasis === '입고일 대체') s += ' (입고일 대체)';
    if (it.agingBasis === '파일 경과 개월') s = (it.agingFileText || s) + ' (파일)';
    return s;
  }

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
          td(it.code, 'nowrap'), td(it.name), td(it.group + (it.groupRaw && it.groupRaw !== it.group ? ' (' + it.groupRaw + ')' : '')), td(it.plants.join('·')), td(it.change),
          td(fmt(it.prevQty), 'num'), td(fmt(it.curQty), 'num'), td(fmtSigned(it.diffQty), 'num ' + sign(it.diffQty)), td(fmtRate(it.prevQty, it.curQty, it.qtyRate), 'num'),
          td(fmt(it.curAmt), 'num'), td(fmtSigned(it.diffAmt), 'num ' + sign(it.diffAmt)),
          td(it.lastIn, 'nowrap'), td(it.lastOut, 'nowrap'), td(it.agingIn == null ? '' : fmt(it.agingIn), 'num'), td(it.agingOut == null ? '' : fmt(it.agingOut), 'num'),
          td(agingCell(it), 'num strong'),
          td(it.curQty ? h('span', { class: 'fit ' + fitCls(it.fitness) }, it.fitness) : it.fitness), td(it.turnover == null ? '' : fmt(it.turnover), 'num'));
      });
      holder.appendChild(table([codeLabel, '품명', groupLabel, '공장', '구분', n('전월 수량'), n('당월 수량'), n('수량 증감'), n('증감률'), n('당월 금액'), n('금액 증감'),
        '최근 입고일', '최근 출고일', n('입고일 기준(개월)'), n('출고일 기준(개월)'), n('Aging 표시'), '적정성', n('회전율')], rows, { cls: 'wide' }));
    }
    form.addEventListener('input', draw);
    form.addEventListener('change', draw);
    box.appendChild(form);
    box.appendChild(holder);
    draw();
    return box;
  }

  // ── 증감 원인 ────────────────────────────────────────────
  var maskNames = true;
  function viewCause(kindKey) {
    var isRaw = kindKey === 'raw';
    var groupLabel = isRaw ? '대분류' : '고객사';
    var kindLabel = isRaw ? '원자재' : '제품';
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, kindLabel + ' 증감 원인 — ' + groupLabel + '별 전월 대비')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    wrap.appendChild(plantBar());
    wrap.appendChild(h('p', null,
      h('a', { href: '#/cause', 'aria-current': isRaw ? 'page' : null }, '원자재(대분류별)'), ' · ',
      h('a', { href: '#/cause/product', 'aria-current': isRaw ? null : 'page' }, '제품(고객사별)')));
    var k = res[kindKey];
    wrap.appendChild(h('div', { class: 'alert info' },
      h('p', null, '금액 증감을 데이터로 계산할 수 있는 요인으로 나눕니다. 두 달 모두 재고가 있는 품목은 「전월 단가 × 수량 변화」(입고 + 출고·사용 + 조정·기타)와 「당월 수량 × 단가 변화」(단가 변동)로 나누고, 새로 생긴 품목은 신규, 없어진 품목은 소멸로 따로 셉니다. 요인을 모두 더하면 금액 증감과 정확히 같습니다.'),
      h('p', null, '조정·기타 = 당월 수량 − (전월 수량 + 입고 − 출고)에 전월 단가를 곱한 값입니다. 입·출고 이력이 없으면 수량 변화가 모두 여기에 잡힙니다. 발주량·생산계획 변경처럼 데이터에 없는 원인은 아래 메모에 적어 주세요.')));
    append(wrap, missingNotes(res, kindKey));
    if (!k.hasFlow) wrap.appendChild(h('p', { class: 'alert warn' }, '입고·출고 수량 자료가 없어 수량 변화를 입고와 출고로 나누지 못했습니다(모두 「조정·기타」). 재고 파일에 당월 입고·출고 수량 칸이 있으면 짝지어 주시고, 없으면 입·출고 이력 파일을 올려 주세요.'));

    var c = k.cause, E = L.EFFECT_KEYS;
    var gcount = {};
    k.groups.rows.concat([k.groups.total]).forEach(function (g) { gcount[g.group] = g; });
    wrap.appendChild(h('h2', null, groupLabel + '별 금액 증감 분해'));
    var head = [groupLabel, n('품목 수(전월→당월)'), n('전월 금액'), n('당월 금액'), n('금액 증감'), n('증감률')].concat(E.map(function (key) { return n(L.EFFECT_LABELS[key].replace(/\(.*\)$/, '')); }));
    wrap.appendChild(table(head, c.rows.concat([c.total]).map(function (g) {
      var gc = gcount[g.group] || {};
      return h('tr', { class: g === c.total ? 'total' : null }, td(g.group), td(fmt(gc.prevItemCount) + '→' + fmt(gc.itemCount), 'num'), td(fmt(g.prevAmt), 'num'), td(fmt(g.curAmt), 'num'),
        td(fmtSigned(g.diffAmt), 'num ' + sign(g.diffAmt)), td(fmtRate(g.prevAmt, g.curAmt, g.amtRate), 'num'),
        E.map(function (key) { return td(g.effects[key] ? fmtSigned(g.effects[key]) : '', 'num ' + sign(g.effects[key])); }));
    }), { cls: 'wide' }));

    var memos = S.getMemos(memoKey());
    var kindMemos = memos[kindKey] || (memos[kindKey] = {});
    function saveMemo(group, field, value) {
      memos = S.getMemos(memoKey());
      memos[kindKey] = memos[kindKey] || {};
      memos[kindKey][group] = memos[kindKey][group] || {};
      memos[kindKey][group][field] = value;
      S.setMemos(memoKey(), memos);
    }
    wrap.appendChild(h('h2', null, groupLabel + '별 기여 상위 품목 · 원인 메모'));
    wrap.appendChild(h('p', { class: 'note' }, '메모와 AI 해설은 이 브라우저에 기준일·공장 보기별로 저장되고, 엑셀 「' + kindLabel + '_증감원인」 시트에 함께 들어갑니다.'));
    var maskBox = h('input', { type: 'checkbox', checked: maskNames });
    maskBox.addEventListener('change', function () { maskNames = maskBox.checked; });
    wrap.appendChild(h('label', { class: 'check' }, maskBox, 'AI 프롬프트에서 품번·품명을 「품목1」처럼 가리기(회사 밖 AI 에 붙여 넣을 때 권장)'));

    c.rows.forEach(function (g) {
      var m = kindMemos[g.group] || {};
      var card = h('section', { class: 'cause-card' },
        h('h3', null, g.group),
        h('p', { class: 'cause-line' }, L.causeSentence(g, function (x) { return fmt(L.round(x, 0)); })),
        g.top.length ? table([n('순위'), isRaw ? '품번' : '제품코드', '품명', '구분', n('수량 전월→당월'), n('금액 증감'), n('입고 전월→당월'), n('출고 전월→당월'), n('수량 효과'), n('단가 효과'), '가장 큰 요인'],
          g.top.map(function (it, i) {
            return h('tr', null, td(i + 1, 'num'), td(it.code, 'nowrap'), td(it.name), td(it.change), td(fmt(it.prevQty) + '→' + fmt(it.curQty), 'num'),
              td(fmtSigned(it.diffAmt), 'num ' + sign(it.diffAmt)),
              td(it.inQty == null ? '-' : fmt(it.inQtyPrev) + '→' + fmt(it.inQty), 'num'), td(it.outQty == null ? '-' : fmt(it.outQtyPrev) + '→' + fmt(it.outQty), 'num'),
              td(fmtSigned(it.qtyEffect), 'num'), td(fmtSigned(it.effects.price), 'num'), td(it.driver));
          })) : h('p', { class: 'note' }, '금액이 바뀐 품목이 없습니다.'));
      var memo = h('textarea', { name: 'memo', rows: '4', placeholder: '예: ○○ 외 n종 수출 출하 / 생산계획 변경으로 사용량 감소' }, m.memo || '');
      memo.addEventListener('input', function () { saveMemo(g.group, 'memo', memo.value); });
      var ai = h('textarea', { name: 'ai', rows: '4', placeholder: 'AI 답을 여기에 붙여 넣어 주세요' }, m.ai || '');
      ai.addEventListener('input', function () { saveMemo(g.group, 'ai', ai.value); });
      var promptOut = h('textarea', { class: 'prompt-box', readonly: true, hidden: true, 'aria-label': g.group + ' AI 해설 프롬프트' });
      var copyBtn = h('button', { type: 'button', class: 'btn', hidden: true, onclick: function () {
        promptOut.select();
        var done = function () { toast('프롬프트를 복사했습니다. ChatGPT 등에 붙여 넣고, 답을 「AI 해설」 칸에 붙여 넣어 주세요.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(promptOut.value).then(done, function () { document.execCommand('copy'); done(); });
        else { document.execCommand('copy'); done(); }
      } }, '프롬프트 복사');
      card.appendChild(h('div', { class: 'memo-grid' },
        h('label', { class: 'field' }, h('span', null, '원인 메모(담당자)'), memo),
        h('label', { class: 'field' }, h('span', null, 'AI 해설(붙여 넣기)'), ai)));
      card.appendChild(h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () {
          promptOut.value = L.buildCausePrompt(g, { groupLabel: groupLabel, kindLabel: kindLabel, curDate: res.curDate, prevDate: res.prevDate, plant: settings.plantView ? settings.plantView + ' 공장' : '', memo: memo.value, mask: maskNames });
          promptOut.hidden = false; copyBtn.hidden = false;
        } }, 'AI 해설 프롬프트 만들기'), copyBtn));
      card.appendChild(promptOut);
      wrap.appendChild(card);
    });
    return wrap;
  }

  // ── 관리대상 ─────────────────────────────────────────────
  function viewTargets() {
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, '관리대상 후보')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    wrap.appendChild(plantBar());
    var rules = ['금액 증가 상위 ' + settings.topN + '건(원자재·제품 각각)', '과잉(Aging ' + settings.overMonths + '개월 초과)', '불용(Aging ' + settings.deadMonths + '개월 초과)'];
    rules.push(settings.turnoverMax === '' ? '저회전: 기준 미설정(적용 안 함)' : '저회전(회전율 ' + settings.turnoverMax + ' 미만)');
    wrap.appendChild(h('div', { class: 'alert info' }, plantText() + ' · 선정 규칙 — ' + rules.join(' · ') + '. 원인과 개선방안은 엑셀로 내려받아 담당자가 적습니다.'));
    ['원자재', '제품'].forEach(function (kind) {
      var list = res.targets.filter(function (t) { return t.kind === kind; });
      wrap.appendChild(h('h2', null, kind + ' (' + list.length + '건)'));
      wrap.appendChild(table(['품번', '품명', kind === '원자재' ? '대분류' : '고객사', '선정 사유', n('당월 수량'), n('당월 금액'), n('금액 증감'), n('Aging 표시(개월)'), '최근 출고일', '적정성'],
        list.slice(0, MAX_ROWS).map(function (t) {
          return h('tr', null, td(t.code, 'nowrap'), td(t.name), td(t.group), td(t.reasons.join(', ')), td(fmt(t.curQty), 'num'), td(fmt(t.curAmt), 'num'),
            td(fmtSigned(t.diffAmt), 'num ' + sign(t.diffAmt)), td(t.agingShown == null ? '' : fmt(t.agingShown), 'num'), td(t.lastOut, 'nowrap'),
            td(h('span', { class: 'fit ' + fitCls(t.fitness) }, t.fitness)));
        }), { empty: '선정 규칙에 해당하는 품목이 없습니다.' }));
      if (list.length > MAX_ROWS) wrap.appendChild(h('p', { class: 'list-meta' }, '앞 ' + MAX_ROWS + '건만 표시합니다. 전체는 엑셀로 내려받아 보세요.'));
    });
    return wrap;
  }

  // ── 단가 미매칭 ──────────────────────────────────────────
  function viewUnmatched() {
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, '단가 미매칭 목록')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    wrap.appendChild(plantBar());
    wrap.appendChild(h('p', { class: 'note' }, settings.amountSource === 'price'
      ? '재고가 있는데 단가표에서 품번을 찾지 못한 품목입니다. 적용일이 있으면 각 기준일 이전의 가장 최근 단가를 씁니다. 품번 표기(앞자리 0, 공백, 대소문자)가 두 파일에서 같은지 먼저 확인해 주세요.'
      : '재고가 있는데 재고 파일에 금액(또는 단가)이 없고 단가표·기준정보에서도 단가를 찾지 못해 금액을 구하지 못한 품목입니다.'));
    wrap.appendChild(table(['구분', '품번', '품명', '대분류·고객사', '단가 없는 달', n('당월 수량'), n('전월 수량'), '비고'],
      res.unmatched.slice(0, MAX_ROWS).map(function (u) {
        return h('tr', null, td(u.kind), td(u.code, 'nowrap'), td(u.name), td(u.group), td(u.months), td(fmt(u.curQty), 'num'), td(fmt(u.prevQty), 'num'), td(u.note));
      }), { empty: '모든 품목의 금액을 구했습니다.' }));
    return wrap;
  }

  // ── 라우터 ───────────────────────────────────────────────
  function render() {
    var hash = location.hash || '#/data';
    var segs = hash.replace(/^#\//, '').split('/');
    var route = segs[0] || 'data';
    var views = {
      data: viewData, settings: viewSettings,
      raw: function () { return viewKind('raw'); }, product: function () { return viewKind('product'); },
      cause: function () { return viewCause(segs[1] === 'product' ? 'product' : 'raw'); },
      targets: viewTargets, unmatched: viewUnmatched
    };
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
