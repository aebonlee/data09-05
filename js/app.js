/*
 * 화면 — 해시 주소로 나눕니다.
 *   #/data        자료 올리기 · 컬럼 짝짓기 (9개 자리, 자리마다 공장별 파일 여러 개)
 *                 + 판매현황(출고) 여러 파일 한 번에(진행률, 작업자 스레드) + 회사 보고서(대조용)
 *   #/settings    기준 설정 (기준일, 장기재고 기준 개월, 개월별 분포 최대, 대분류 묶음표, 관리대상 기준)
 *   #/raw         원자재 분석 (공장별 요약, 대분류별 증감, Aging 개월별 분포, 정상·장기재고, 품목별·불용 확정)
 *   #/semi        반제품 분석 (고객사별 — 제품과 같은 화면)
 *   #/product     제품 분석 (고객사별 증감, Aging 개월별 분포, 정상·장기재고, 품목별·불용 확정)
 *   #/cause       증감 원인 (대분류 금액 증감 분해, 기여 상위 품목, 원인 메모, AI 해설 프롬프트)
 *                 #/cause/product 는 제품(고객사별)
 *   #/targets     관리대상 후보
 *   #/unmatched   단가 미매칭 목록
 *   #/recon       보고서 대조 · 차이 알람 (차이가 있으면 모든 화면 위에 경고 띠)
 * 분석 화면 위의 「공장 보기」(합계·인천·대구)는 모든 분석 화면과 엑셀에 함께 적용됩니다.
 */
(function () {
  'use strict';
  var L = window.InvLogic, S = window.InvStore, Sample = window.InvSample;
  var main = document.getElementById('main');
  // 올린 자료 { slotId: { parts: [{ fileName, sheetName, plant, sample, rowCount, records, problems, mapping }] } }
  // 예전(자리마다 파일 하나) 형식으로 저장된 자료는 여기서 새 형식으로 바꿉니다.
  var data = L.migrateSlotData(S.getData());
  var sales = S.getSales();          // 판매현황(출고) 파일별 요약 — 재고 자료와 따로 저장
  var receipts = S.getReceipts();    // 구매현황(입고) 파일별 읽은 결과 — 입고 FIFO Aging(10차)
  // 기준 — 예전 「일」 단위(90·180·365일 등)로 저장된 설정은 「개월」로 자동 변환합니다.
  var mig = L.migrateSettings(S.getSettingsRaw(), L.defaultSettings());
  var settings = mig.settings;
  if (mig.migrated || mig.round3 || mig.round9 || mig.round10) {
    S.setSettings(settings);
    setTimeout(function () {
      toast(mig.round10 && !mig.round9 && !mig.round3 && !mig.migrated
        ? 'Aging 기준을 구분(원자재·반제품·제품)마다 고르게 바뀌었습니다. 예전에 고른 「재고잔량분석 칸 먼저」를 세 구분에 그대로 두었습니다 — 「기준 설정」에서 확인해 주세요.'
        : mig.round9 === 'set' && !mig.round3 && !mig.migrated
        ? '보고서 칸 단위를 9/30 답변대로 넣었습니다: 총괄(현황) 시트는 백만원, 나머지 시트는 원입니다. 원 단위 칸의 10배 차이는 이제 「단위 차이」가 아니라 알람(자릿수 입력 오류 의심)으로 보입니다.'
        : mig.round9 === 'kept' && !mig.round3 && !mig.migrated
        ? '9/30 답변으로 보고서 칸 단위 처음 값이 「총괄 금액=백만원 / * 금액=원」이 되었습니다. 직접 적어 두신 줄이 있어 그대로 두었습니다 — 「기준 설정 → 보고서 칸 단위」에서 두 줄을 더해 주세요.'
        : mig.round3
        ? '기준이 바뀌었습니다(9/29 답변): 원자재는 ' + L.longLabel(settings.longRawMonths, settings.longRawOp) + ', 반제품·제품은 ' + L.longLabel(settings.longProdMonths, settings.longProdOp) + '을 장기재고로 보고, 개월별 분포는 0~' + settings.agingMaxMonths + '개월 + 「' + L.overLabel(settings.agingMaxMonths) + '」으로 보입니다. 「기준 설정」에서 확인해 주세요.'
        : 'Aging 기준이 바뀌었습니다: 개월별 분포(0·1·2…개월)로 보이고, 불용은 품목마다 「불용 확정」으로 체크합니다. 「기준 설정」에서 확인해 주세요.');
    }, 300);
  }
  var pending = {};                 // 올렸지만 아직 짝을 확정하지 않은 파일 { slotId: {...} }
  var itemFilter = { raw: {}, semi: {}, product: {} };
  var KIND_TEXT = { raw: '원자재', semi: '반제품', product: '제품' };
  var KIND_SLOT = { raw: ['rawCur', 'rawPrev'], semi: ['semiCur', 'semiPrev'], product: ['prodCur', 'prodPrev'] };
  var salesJob = null;               // 판매현황·구매현황 읽는 중 상태 { kind, total, done, name, started, el }
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
    return Object.keys(data).some(function (k) { return parts(k).some(function (p) { return p.sample; }); }) || sales.some(function (f) { return f.sample; }) || receipts.some(function (f) { return f.sample; });
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
    o.sales = sales;
    o.receipts = receipts;
    o.report = data.report && data.report.parts ? data.report.parts : [];
    return o;
  }
  // 한 번 그리는 동안 분석은 한 번만(경고 띠·화면이 같은 결과를 씁니다). render() 가 비웁니다.
  var cachedRes = null;
  function result() { return cachedRes || (cachedRes = L.analyze(currentData(), settings, { dead: S.getDead(), reconAck: S.getReconAck() })); }
  function hasStock() { return ['rawCur', 'semiCur', 'prodCur'].some(function (k) { return parts(k).length; }); }
  function plantText() { return settings.plantView ? settings.plantView + ' 공장' : '인천+대구 합계'; }
  function memoKey() { return (settings.curDate || '기준일없음') + '.' + (settings.plantView || 'all'); }

  function download(name, blob) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── 머리 ─────────────────────────────────────────────────
  var NAV = [['data', '자료'], ['settings', '기준 설정'], ['raw', '원자재 분석'], ['semi', '반제품 분석'], ['product', '제품 분석'], ['cause', '증감 원인'], ['targets', '관리대상'], ['unmatched', '단가 미매칭'], ['recon', '대조·알람']];
  function renderHeader(route) {
    var nav = document.getElementById('nav');
    nav.textContent = '';
    NAV.forEach(function (it) {
      nav.appendChild(h('a', { href: '#/' + it[0], 'aria-current': route === it[0] ? 'page' : null }, it[1]));
    });
    document.getElementById('sampleBanner').hidden = !isSample();
    // 차이 알람 띠 — 회사 보고서를 올렸고, 합계 줄 차이 중 「확인함」으로 표시하지 않은 것이 있을 때
    var ab = document.getElementById('alarmBanner');
    ab.textContent = '';
    var res = hasStock() ? result() : null;
    var n = res && res.ok && res.recon ? res.recon.alarms.length : 0;
    ab.hidden = !n;
    if (n) ab.appendChild(h('span', null, '보고서 대조 차이 ' + n + '건 — 회사 보고서의 합계와 도구 계산이 다릅니다. ',
      route === 'recon' ? '아래 표를 확인해 주세요.' : h('a', { href: '#/recon' }, '대조·알람 화면에서 확인해 주세요')));
  }

  document.getElementById('exportBtn').addEventListener('click', exportExcel);
  function exportExcel() {
    if (!hasStock()) { toast('먼저 「자료」에서 당월 재고 파일을 올려 주세요.', true); location.hash = '#/data'; return; }
    var res = result();
    if (!res.ok) { toast(res.errors[0], true); location.hash = '#/settings'; return; }
    // 공장별 메모 — 보고용 「원자재」 시트의 공장 구역마다 그 공장 보기에서 적은 원인 메모를 씁니다
    var byPlant = {};
    [''].concat(PLANT_IDS).forEach(function (p) { byPlant[p] = S.getMemos((settings.curDate || '기준일없음') + '.' + (p || 'all')); });
    var sheets = L.buildSheets(res, settings, isSample(), S.getMemos(memoKey()), byPlant);
    var wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (name) {
      var ws = XLSX.utils.aoa_to_sheet(sheets[name]);
      var width = [];
      sheets[name].slice(0, 4).forEach(function (row) { row.forEach(function (hd, i) { width[i] = Math.max(width[i] || 10, Math.min(40, String(hd == null ? '' : hd).length * 2)); }); });
      ws['!cols'] = width.map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var name = (isSample() ? '예시데이터_' : '') + '재고분석_' + res.curDate + '_' + (settings.plantView || '합계') + '.xlsx';
    download(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    toast(name + ' 파일을 내려받았습니다 — 앞 4개 시트(총괄·원자재·반제품·제품)가 보고용, 나머지는 백데이터입니다.');
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
    if (!d || !/^(raw|semi|prod)/.test(slotId)) return null;
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
      if (/^(raw|semi|prod)/.test(slot.id) && book.names.length > 1) {
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
    // 판매현황(가상) 3개 — 실제 파일과 같은 흐름(scanSales)으로 읽습니다
    var books = Sample.salesBooks();
    sales = Object.keys(books).map(function (fn) { var f = L.scanSales(books[fn]['판매현황내역'], { fileName: fn, sheetName: '판매현황내역' }); f.sample = true; return f; });
    S.setSales(sales);
    // 구매현황(가상) 5개 — 실제 파일과 같은 흐름(scanReceipts)으로 읽습니다(빈 달 26.03·겹친 달 26.06 시연)
    var rb = Sample.receiptBooks();
    receipts = Object.keys(rb).map(function (fn) { var f = L.scanReceipts(rb[fn]['구매현황내역'], { fileName: fn, sheetName: '구매현황내역' }); f.sample = true; return f; });
    S.setReceipts(receipts);
    // 회사 보고서(대조용) — 예시 재고분석 통합문서 두 개의 보고용 시트
    var wbs = Sample.workbooks();
    data.report = { parts: Sample.REPORT_FILES.map(function (fn) {
      var r = L.parseReportBook({ names: Object.keys(wbs[fn]), sheets: wbs[fn] }, { fileName: fn, filePlant: L.plantFromFileName(fn) });
      r.sample = true; return r;
    }) };
    settings.curDate = Sample.CUR;
    settings.prevDate = Sample.PREV;
    settings.plantView = '';
    L.SLOTS.forEach(function (slot) {
      (plan[slot.id] || []).forEach(function (part) {
        var book = { names: part.names, sheets: part.sheets };
        preparePending(slot, part.fileName, book, part.sheetName, null, true);
        confirmSlot(slot);
      });
    });
    saveSettings();
    toast('예시 데이터(가상)를 불러왔습니다 — 인천·대구 두 공장, 7월·8월, 원자재·반제품·제품, 판매현황 3개, 구매현황 5개, 보고서 대조용 파일. 기준일은 ' + Sample.CUR + ' 입니다.');
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
            data = {}; pending = {}; sales = []; receipts = []; S.clearData(); render(); toast('자료를 지웠습니다.');
          } }, '올린 자료 모두 지우기'),
          h('a', { class: 'btn', href: '#/settings' }, '다음: 기준 설정'))),
      salesCard(),
      receiptCard(),
      h('div', { class: 'slot-grid' }, L.SLOTS.map(slotCard)),
      reportCard());
    return wrap;
  }

  var SLOT_HELP = {
    rawCur: '품번·재고수량 필수. 대분류·금액(또는 단가)·경과 개월(재고잔량분석) 칸이 있으면 함께 씁니다',
    rawPrev: '당월과 같은 형식. 없으면 모두 「신규」로 봅니다',
    semiCur: '품목코드·고객사·재고수량. 금액은 「합계금액」(인천) 또는 「재고*반제품단가」(대구) 칸을 먼저 씁니다', semiPrev: '당월과 같은 형식',
    prodCur: '제품코드·고객사·재고수량', prodPrev: '당월과 같은 형식',
    inbound: '품번·입고일(·수량) — 입고일 기준 Aging, 증감 원인의 「입고」', outbound: '출고현황(품번·최근 출고일) 또는 출고 내역(품번·출고일·수량)을 파일 하나로 올릴 때. 월별 판매현황 여러 개는 위의 「판매현황(출고) 여러 파일」에 한 번에 올려 주세요',
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
        if (settings.curDate && /^(raw|semi|prod)/.test(slot.id) && !pp.sheetSure && book.names.length > 1) preparePending(slot, f.name, book, null, null, false);
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

  // ── 판매현황(출고) 여러 파일 ─────────────────────────────
  // 월별 판매현황 파일을 한꺼번에 골라 올립니다. 파일마다 머리행·열 짝을 따로 짐작하고(달마다 열이 달라도 됨),
  // 품목코드·출고일·수량(·공장) 칸만 읽어 「품목별 달별 출고수량 + 그 달 마지막 출고일」만 남깁니다.
  // 온라인(https)·간이 서버(http)에서는 작업자 스레드에서 읽어 화면이 멈추지 않고, 파일(file://)로 열었으면
  // 브라우저가 작업자 스레드를 막으므로 파일 사이사이 쉬어 가며 읽습니다(파일 하나를 읽는 동안은 잠깐 멈춥니다).
  function salesCard() {
    var card = h('section', { class: 'card sales-card', 'data-slot': 'sales' },
      h('h2', null, '판매현황(출고) 여러 파일 — 최근 출고일'),
      h('p', { class: 'note' }, '월별 판매현황 파일(예: 판매현황(25.01)~(26.09))을 한 번에 여러 개 골라 올려 주세요. 품목코드·판매일자·수량 칸만 읽어 품목별 최근 출고일을 구하고, 기준일 이전 가장 최근 출고일로 Aging 을 다시 계산합니다. 출고 이력이 없는 품목은 예전처럼 재고잔량분석 칸을 씁니다.'),
      h('p', { class: 'note' }, '같은 이름이거나 제목 기간이 같은 파일(예: 월 중간분을 월말까지 다시 내려받은 파일)을 올리면 바꿔 넣습니다. 파일은 외부로 보내지 않습니다.'));
    var input = h('input', { type: 'file', multiple: true, accept: '.xlsx,.xls,.csv', 'aria-label': '판매현황 파일 여러 개 선택' });
    input.addEventListener('change', function () { var fs = [].slice.call(input.files || []); if (fs.length) loadSalesFiles(fs); });
    if (salesJob && salesJob.kind !== 'receipt') {
      var bar = h('progress', { max: String(salesJob.total), value: String(salesJob.done), class: 'sales-progress' });
      var txt = h('p', { class: 'note', 'aria-live': 'polite' }, salesProgressText());
      salesJob.el = { bar: bar, txt: txt };
      card.appendChild(h('div', { class: 'progress-box' }, bar, txt));
      return card;
    }
    card.appendChild(h('div', { class: 'btn-row' },
      h('label', { class: 'btn btn-primary file-btn' }, sales.length ? '판매현황 파일 더 올리기 · 바꾸기' : '판매현황 파일 여러 개 선택', input),
      sales.length ? h('button', { type: 'button', class: 'btn', onclick: function () {
        if (!confirm('올린 판매현황 ' + sales.length + '개를 모두 뺍니다. 계속할까요?')) return;
        sales = []; S.setSales(sales); render(); toast('판매현황을 모두 뺐습니다.');
      } }, '판매현황 모두 빼기') : null));
    if (!sales.length) return card;
    var diff = L.salesHeaderDiff(sales);
    var codes = L.salesIndex(sales).codeCount;
    var first = sales.reduce(function (a, f) { return !a || (f.minDate && f.minDate < a) ? f.minDate : a; }, '');
    var last = sales.reduce(function (a, f) { return f.maxDate > a ? f.maxDate : a; }, '');
    card.appendChild(h('p', null, h('strong', null, '판매현황 ' + sales.length + '개'), ' · 출고일 ' + first + ' ~ ' + last + ' · 출고된 품목 ' + fmt(codes) + '개'));
    if (hasStock() && settings.curDate) {
      var res = result();
      if (res.ok) {
        var cov = res.salesCoverage;
        card.appendChild(h('p', { class: 'note' }, '당월 재고 품목 중 기준일(' + res.curDate + ') 이전 최근 출고일을 찾은 품목 — ' + L.KINDS.map(function (k) {
          var c = cov[k];
          return KIND_TEXT[k] + ' ' + (c.used ? fmt(c.withSale) + ' / ' + fmt(c.stock) : '적용 안 함(기준 설정)');
        }).join(' · ')));
      }
    }
    card.appendChild(customerBox());
    var partial = sales.filter(function (f) { return f.partial; });
    if (partial.length) card.appendChild(h('p', { class: 'alert info' }, partial.map(function (f) { return f.fileName; }).join(', ') + ' — 제목 기간(' + partial[0].titleTo + '까지)보다 앞선 ' + partial[0].stampDate + ' 에 내려받은 파일이라 그 뒤 출고는 아직 없습니다(월 중간분). 지금은 이 기준으로 봅니다 — 마감 뒤 월말까지 다시 내려받아 올리면 같은 달 파일로 바꿔 넣습니다.'));
    if (diff.length) card.appendChild(h('div', { class: 'alert info' }, h('p', null, '열 구성이 다른 파일이 있습니다 — 파일마다 짝을 따로 잡아 읽었습니다.'),
      h('ul', null, diff.map(function (d) {
        return h('li', null, d.fileName + ': ' + [d.missing.length ? '없어진 열 ' + d.missing.join(', ') : '', d.added.length ? '새 열 ' + d.added.join(', ') : '',
          d.mappingChanged.length ? '짝 바뀜 ' + d.mappingChanged.join(', ') : '', d.moved ? '순서 바뀐 열 ' + d.moved + '개' : ''].filter(Boolean).join(' · '));
      }))));
    var bad = sales.filter(function (f) { return f.missing && f.missing.length; });
    if (bad.length) card.appendChild(h('p', { class: 'alert warn' }, '품목코드·출고일 칸을 찾지 못한 파일: ' + bad.map(function (f) { return f.fileName; }).join(', ')));
    var list = sales.slice().sort(function (a, b) { return (a.minDate || '') < (b.minDate || '') ? -1 : 1; });
    card.appendChild(h('details', null, h('summary', null, '파일별 읽은 결과'),
      table(['파일', '제목 기간', n('첫 출고일'), n('마지막 출고일'), n('읽은 행'), n('사용 행'), n('품목 수'), '짝(품목코드·출고일·수량)', '비고', ''], list.map(function (f) {
        return h('tr', null, td(f.fileName), td((f.titleFrom || '') + (f.titleTo ? ' ~ ' + f.titleTo : ''), 'nowrap'), td(f.minDate, 'nowrap'), td(f.maxDate, 'nowrap'),
          td(fmt(f.rowCount), 'num'), td(fmt(f.used), 'num'), td(fmt(f.codeCount), 'num'),
          td([f.mapping.code, f.mapping.date, f.mapping.qty].map(function (x) { return x || '(없음)'; }).join(' · ')),
          td([f.partial ? '월 중간분' : '', f.plantColumn ? '공장 칸 있음' : '', f.readMs != null ? (f.readMs / 1000).toFixed(1) + '초' : ''].filter(Boolean).join(' · ')),
          td(h('button', { type: 'button', class: 'btn', onclick: function () { sales = sales.filter(function (x) { return x !== f; }); S.setSales(sales); render(); } }, '빼기')));
      }), { cls: 'wide' })));
    return card;
  }
  // 판매현황의 거래처 목록 — 중국공장 거래처를 기준 설정에 적도록 돕습니다(9/30 답변 1)
  function customerBox() {
    var rules = L.parseChinaCustomers(settings.chinaCustomers);
    var noCol = sales.filter(function (f) { return !f.customerColumn; });
    var list = L.salesCustomers(sales, rules);
    var box = h('details', { class: 'customer-box', open: !rules.length && list.some(function (c) { return c.hint; }) ? true : null },
      h('summary', null, '거래처 ' + list.length + '곳 — 중국공장 거래처 ' + (rules.length ? list.filter(function (c) { return c.matched; }).length + '곳 설정됨' : '미설정(원자재는 재고잔량분석 칸)')));
    if (noCol.length) box.appendChild(h('p', { class: 'alert info' }, '거래처 칸을 저장하지 않은 파일 ' + noCol.length + '개(예전에 올렸거나 거래처 칸이 없음) — 중국공장 판매를 가리려면 다시 올려 주세요.'));
    if (!list.length) return box;
    var hints = list.filter(function (c) { return c.hint && !c.matched; });
    if (hints.length) box.appendChild(h('div', { class: 'btn-row' }, h('span', { class: 'note' }, '이름에 중국·China 등이 든 거래처(후보): ' + hints.map(function (c) { return c.name; }).join(', ')),
      h('button', { type: 'button', class: 'btn', onclick: function () {
        var cur = String(settings.chinaCustomers || '').trim();
        settings.chinaCustomers = (cur ? cur + '\n' : '') + hints.map(function (c) { return c.name; }).join('\n');
        saveSettings(); render(); toast('후보 거래처를 「중국공장 거래처」에 넣었습니다 — 맞는지 「기준 설정」에서 확인해 주세요.');
      } }, '후보를 중국공장 거래처로 넣기')));
    box.appendChild(table(['거래처', n('판매 줄 수'), '중국공장'], list.slice(0, 200).map(function (c) {
      return h('tr', null, td(c.name), td(fmt(c.rows), 'num'), td(c.matched ? '설정됨' : c.hint ? '후보' : ''));
    }), { empty: '거래처가 없습니다.' }));
    if (list.length > 200) box.appendChild(h('p', { class: 'note' }, '줄 수가 많은 200곳만 보입니다.'));
    return box;
  }
  function salesProgressText() {
    var j = salesJob;
    var sec = ((Date.now() - j.started) / 1000).toFixed(1);
    return j.done + ' / ' + j.total + ' 파일 읽음' + (j.name ? ' · ' + j.name + ' 읽는 중' : '') + ' · ' + sec + '초' + (j.mode ? ' · ' + j.mode : '');
  }
  function updateSalesProgress() {
    if (!salesJob || !salesJob.el) return;
    salesJob.el.bar.value = salesJob.done;
    salesJob.el.txt.textContent = salesProgressText();
  }
  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error(file.name + ' 파일을 읽지 못했습니다.')); };
      fr.onload = function () { resolve(fr.result); };
      fr.readAsArrayBuffer(file);
    });
  }
  // 작업자 스레드 — file:// 에서는 만들 때 막히거나(SecurityError) 곧바로 오류가 나므로 그때는 null
  function makeWorker() {
    if (location.protocol === 'file:' || typeof Worker === 'undefined') return null;
    try { return new Worker('js/sales-worker.js'); } catch (e) { return null; }
  }
  // kind: 'sales'(처음 값) 또는 'receipt'(구매현황 — 10차). 읽기 흐름(진행률·작업자 스레드·file:// 대체)은 같습니다.
  function loadSalesFiles(files, kind) {
    kind = kind || 'sales';
    var isRc = kind === 'receipt';
    var reader = isRc ? L.readReceiptWorkbook : L.readSalesWorkbook;
    var saved = S.getMapping(isRc ? 'receipt' : 'outbound');
    salesJob = { kind: kind, total: files.length, done: 0, name: '', started: Date.now(), mode: '' };
    render();
    var worker = makeWorker();
    var results = [], errors = [];
    var seq = 0, waiting = {};
    if (worker) {
      salesJob.mode = '작업자 스레드';
      worker.onmessage = function (e) { var w = waiting[e.data.id]; delete waiting[e.data.id]; if (w) (e.data.ok ? w.resolve(e.data.file) : w.reject(new Error(e.data.error))); };
      worker.onerror = function (e) { e.preventDefault && e.preventDefault(); Object.keys(waiting).forEach(function (k) { waiting[k].reject(new Error('worker')); delete waiting[k]; }); worker = null; };
    } else salesJob.mode = '화면에서 차례로 읽음(파일로 열었을 때)';
    function parseOne(file, buf) {
      if (worker) {
        return new Promise(function (resolve, reject) {
          var id = ++seq;
          waiting[id] = { resolve: resolve, reject: reject };
          worker.postMessage({ id: id, buf: buf, name: file.name, saved: saved, kind: kind }, [buf]);
        }).catch(function (err) {
          if (err.message !== 'worker') throw err;
          // 작업자 스레드가 막혔으면 화면에서 다시 읽습니다
          salesJob.mode = '화면에서 차례로 읽음';
          return readBuffer(file).then(function (b2) { return parseMain(file, b2); });
        });
      }
      return parseMain(file, buf);
    }
    function parseMain(file, buf) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {   // 진행률을 먼저 그리고 읽습니다
          try { var t = Date.now(); var f = reader(XLSX, new Uint8Array(buf), file.name, saved); f.readMs = Date.now() - t; resolve(f); }
          catch (e) { reject(new Error(file.name + ': ' + e.message)); }
        }, 30);
      });
    }
    var i = 0;
    function next() {
      if (i >= files.length) return finish();
      var file = files[i++];
      salesJob.name = file.name; updateSalesProgress();
      return readBuffer(file).then(function (buf) { return parseOne(file, buf); })
        .then(function (f) { results.push(f); }, function (err) { errors.push(err.message); })
        .then(function () { salesJob.done++; updateSalesProgress(); return next(); });
    }
    function finish() {
      if (worker) worker.terminate();
      var took = ((Date.now() - salesJob.started) / 1000).toFixed(1);
      if (isRc) return finishReceipts(results, errors, took);
      var merged = L.mergeSalesFiles(sales, results);
      sales = merged.files;
      var swapped = merged.replaced.filter(function (x) { return x.from !== x.to; });
      var okFile = results.filter(function (f) { return !f.missing.length; })[0];
      if (okFile) S.setMapping('outbound', okFile.mapping);
      salesJob = null;
      var stored = S.setSales(sales);
      render();
      toast('판매현황 ' + results.length + '개를 ' + took + '초에 읽었습니다' + (errors.length ? ' — 읽지 못한 파일 ' + errors.length + '개: ' + errors[0] : '.') + (swapped.length ? ' 같은 기간 파일을 바꿔 넣었습니다: ' + swapped.map(function (x) { return x.from + ' → ' + x.to; }).join(', ') + '.' : '') + (stored ? '' : ' 브라우저 저장 공간이 부족해 이번 창에서만 유지합니다.'), !!errors.length || !stored);
    }
    next();
  }

  // 구매현황 읽기 끝 — 같은 이름·같은 제목 기간 파일은 바꿔 넣고(판매현황과 같은 규칙), 겹친 줄은 분석 때 한 번만 셉니다
  function finishReceipts(results, errors, took) {
    var merged = L.mergeSalesFiles(receipts, results);
    receipts = merged.files;
    var swapped = merged.replaced.filter(function (x) { return x.from !== x.to; });
    var okFile = results.filter(function (f) { return !f.missing.length; })[0];
    if (okFile) S.setMapping('receipt', okFile.mapping);
    salesJob = null;
    var stored = S.setReceipts(receipts);
    var ri = L.receiptIndex(receipts, { asOf: L.parseDate(settings.curDate) });
    render();
    toast('구매현황 ' + results.length + '개를 ' + took + '초에 읽었습니다' + (errors.length ? ' — 읽지 못한 파일 ' + errors.length + '개: ' + errors[0] : '.') +
      (swapped.length ? ' 같은 기간 파일을 바꿔 넣었습니다: ' + swapped.map(function (x) { return x.from + ' → ' + x.to; }).join(', ') + '.' : '') +
      (ri.gaps.length ? ' 빈 달 ' + ri.gaps.length + '개(' + ri.gaps.slice(0, 4).join(', ') + (ri.gaps.length > 4 ? ' …' : '') + ') — 「자료」 화면에서 확인해 주세요.' : '') +
      (stored ? '' : ' 브라우저 저장 공간이 부족해 이번 창에서만 유지합니다.'), !!errors.length || !stored || !!ri.gaps.length);
  }
  // 구매현황(입고) 여러 파일 — 입고 FIFO Aging(10차). 판매현황과 같은 방식으로 한꺼번에 올립니다.
  // 필요한 칸(입고일·품목코드·수량·단가·대분류·거래처코드·발주번호·적요)만 읽고, 달마다 입고 줄 수를 세어 빈 달을 보입니다.
  function receiptCard() {
    var card = h('section', { class: 'card sales-card', 'data-slot': 'receipts' },
      h('h2', null, '구매현황(입고) 여러 파일 — 입고 FIFO Aging'),
      h('p', { class: 'note' }, '구매현황 파일(예: 구매현황(25.01~12), (26.01)~(26.09))을 한 번에 여러 개 골라 올려 주세요. 품목마다 최근 입고부터 거꾸로 쌓아 당월 현재고를 덮을 때까지 더하고, 덮는 데 쓴 입고일로 재고를 개월 칸에 나눕니다(입고 FIFO). 입고 이력으로 다 덮지 못한 수량은 「이력 없음(첫 달 이전)」입니다.'),
      h('p', { class: 'note' }, '기간이 겹치는 파일을 함께 올려도 같은 줄은 한 번만 셉니다. 같은 이름이거나 제목 기간이 같은 파일은 바꿔 넣습니다. 입고 이력 자리가 비어 있으면 증감 원인의 「입고」 수량도 구매현황으로 셉니다. 파일은 외부로 보내지 않습니다.'));
    var input = h('input', { type: 'file', multiple: true, accept: '.xlsx,.xls,.csv', 'aria-label': '구매현황 파일 여러 개 선택' });
    input.addEventListener('change', function () { var fs = [].slice.call(input.files || []); if (fs.length) loadSalesFiles(fs, 'receipt'); });
    if (salesJob && salesJob.kind === 'receipt') {
      var bar = h('progress', { max: String(salesJob.total), value: String(salesJob.done), class: 'sales-progress' });
      var txt = h('p', { class: 'note', 'aria-live': 'polite' }, salesProgressText());
      salesJob.el = { bar: bar, txt: txt };
      card.appendChild(h('div', { class: 'progress-box' }, bar, txt));
      return card;
    }
    card.appendChild(h('div', { class: 'btn-row' },
      h('label', { class: 'btn btn-primary file-btn' }, receipts.length ? '구매현황 파일 더 올리기 · 바꾸기' : '구매현황 파일 여러 개 선택', input),
      receipts.length ? h('button', { type: 'button', class: 'btn', onclick: function () {
        if (!confirm('올린 구매현황 ' + receipts.length + '개를 모두 뺍니다. 계속할까요?')) return;
        receipts = []; S.setReceipts(receipts); render(); toast('구매현황을 모두 뺐습니다.');
      } }, '구매현황 모두 빼기') : null));
    if (!receipts.length) return card;
    var ri = L.receiptIndex(receipts, { asOf: L.parseDate(settings.curDate), exclude: L.parseChinaCustomers(settings.receiptExclude) });
    card.appendChild(h('p', null, h('strong', null, '구매현황 ' + receipts.length + '개'), ' · 입고일 ' + ri.minDate + ' ~ ' + ri.maxDate + ' · 입고 품목 ' + fmt(ri.codeCount) + '개 · 읽은 줄 ' + fmt(ri.read) +
      (ri.overlap ? ' · 겹쳐 한 번만 센 줄 ' + fmt(ri.overlap) : '') + (ri.excluded ? ' · 적요로 뺀 줄 ' + fmt(ri.excluded) : '') + (ri.negative ? ' · 반품(음수) ' + fmt(ri.negative) + '줄은 쌓지 않음' : '')));
    if (ri.gaps.length) card.appendChild(h('div', { class: 'alert warn', 'data-gaps': '' },
      h('p', null, '입고 줄이 하나도 없는 달이 있습니다: ' + ri.gaps.join(', ') + '.'),
      h('p', null, '그 달 구매현황 파일이 있으면 올려 주세요. 빈 달이 있으면 그 달 입고가 빠져, 현재고를 덮는 입고가 더 오래된 달로 밀리거나 「이력 없음」으로 잡힙니다.')));
    else card.appendChild(h('p', { class: 'note', 'data-gaps': '' }, '빈 달 없음 — ' + ri.monthList.length + '개월(' + ri.monthList[0].month + ' ~ ' + ri.monthList[ri.monthList.length - 1].month + ')이 모두 있습니다.'));
    if (ri.partialFiles.length) card.appendChild(h('p', { class: 'alert info' }, ri.partialFiles.join(', ') + ' — 제목 기간 끝 날(또는 그 전)에 내려받은 파일이라 그 달 마감 전 입고만 들어 있을 수 있습니다. 기준일이 그 달보다 앞이면 영향이 없습니다.'));
    if (hasStock() && settings.curDate) {
      var res = result();
      if (res.ok) card.appendChild(h('p', { class: 'note' }, '당월 재고 품목 중 입고로 현재고를 다 덮은 품목 — ' + L.KINDS.map(function (k) {
        var st = res[k].fifoStats;
        return KIND_TEXT[k] + ' ' + (st ? fmt(st.full) + ' / ' + fmt(st.stock) : '-');
      }).join(' · ') + ' (반제품·제품은 생산으로 들어와 구매현황에 거의 없습니다)'));
    }
    card.appendChild(h('details', null, h('summary', null, '달별 입고 줄 수'),
      h('div', { class: 'month-grid' }, ri.monthList.map(function (m) {
        return h('span', { class: 'month-cell' + (m.rows ? '' : ' gap') }, m.month + ' ' + (m.rows ? fmt(m.rows) : '빈 달'));
      }))));
    var list = receipts.slice().sort(function (a, b) { return (a.minDate || '') < (b.minDate || '') ? -1 : 1; });
    card.appendChild(h('details', null, h('summary', null, '파일별 읽은 결과'),
      table(['파일', '제목 기간', n('첫 입고일'), n('마지막 입고일'), n('읽은 행'), n('사용 행'), n('품목 수'), '짝(품목코드·입고일·수량)', '비고', ''], list.map(function (f) {
        return h('tr', null, td(f.fileName), td((f.titleFrom || '') + (f.titleTo ? ' ~ ' + f.titleTo : ''), 'nowrap'), td(f.minDate, 'nowrap'), td(f.maxDate, 'nowrap'),
          td(fmt(f.rowCount), 'num'), td(fmt(f.used), 'num'), td(fmt(f.codeCount), 'num'),
          td([f.mapping.code, f.mapping.date, f.mapping.qty].map(function (x) { return x || '(없음)'; }).join(' · ')),
          td([f.partial ? '마감 전 내려받음' : '', f.negative ? '반품 ' + f.negative + '줄' : '', f.missing && f.missing.length ? '칸 못 찾음: ' + f.missing.join(', ') : '', f.readMs != null ? (f.readMs / 1000).toFixed(1) + '초' : ''].filter(Boolean).join(' · ')),
          td(h('button', { type: 'button', class: 'btn', onclick: function () { receipts = receipts.filter(function (x) { return x !== f; }); S.setReceipts(receipts); render(); } }, '빼기')));
      }), { cls: 'wide' })));
    return card;
  }

  // ── 회사 보고서(대조용) ───────────────────────────────────
  // 회사가 쓰는 월간 재고분석 통합문서(보고용 「원자재」「반제품」「제품」 시트가 든 파일)를 올리면
  // 공장·구분·달별 합계를 도구 계산과 맞대 차이를 알람으로 보입니다. 파일 전체가 아니라 보고용 시트의 표만 저장합니다.
  function reportCard() {
    var list = data.report && data.report.parts ? data.report.parts : [];
    var card = h('section', { class: 'card', 'data-slot': 'report' },
      h('h2', null, '회사 보고서(대조용, 선택) — 차이 알람'),
      h('p', { class: 'note' }, '매달 쓰시는 월간 재고분석 파일(「총괄·원자재·반제품·제품」 시트가 든 통합문서)을 올리면, 보고용 시트의 공장별 합계(수량·금액, 전월·당월)를 도구 계산과 맞대 봅니다. 차이가 있으면 모든 화면 위에 경고 띠가 뜨고 「대조·알람」 화면과 엑셀 「총괄」 시트 아래에 나옵니다.'));
    var input = h('input', { type: 'file', accept: '.xlsx,.xls', 'aria-label': '회사 보고서 파일 선택' });
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) return;
      readFile(f, function (err, book) {
        if (err) { toast(err.message, true); return; }
        var r = L.parseReportBook(book, { fileName: f.name, filePlant: L.plantFromFileName(f.name) });
        if (!r.sections.length) { toast('보고용 시트(원자재·반제품·제품)에서 「재고현황(MM월)」 머리행을 찾지 못했습니다.', true); return; }
        data.report = { parts: list.filter(function (x) { return x.fileName !== f.name && !x.sample; }).concat([r]) };
        persist(); render();
        toast(f.name + ' — 보고용 구역 ' + r.sections.length + '개를 읽었습니다.');
      });
    });
    if (list.length) card.appendChild(h('ul', { class: 'part-list' }, list.map(function (r) {
      return h('li', null, h('span', { class: 'ok-badge' }, '적용됨'), h('span', { class: 'part-name' }, r.fileName),
        h('span', { class: 'note' }, r.sections.map(function (x) { return x.sheet + (x.name ? '·' + x.name : ''); }).join(', ')),
        h('button', { type: 'button', class: 'btn', onclick: function () {
          data.report = { parts: list.filter(function (x) { return x !== r; }) };
          if (!data.report.parts.length) delete data.report;
          persist(); render();
        } }, '빼기'));
    })));
    card.appendChild(h('div', { class: 'btn-row' }, h('label', { class: 'btn file-btn' }, list.length ? '보고서 파일 더 올리기' : '보고서 파일 선택', input)));
    return card;
  }

  // ── 기준 설정 ─────────────────────────────────────────────
  function viewSettings() {
    function opSelect(name, label, hint) {
      return h('label', { class: 'field', 'data-field': name }, h('span', null, label),
        h('select', { name: name },
          h('option', { value: 'gt', selected: settings[name] === 'gt' }, '초과 (기준 개월보다 많으면)'),
          h('option', { value: 'ge', selected: settings[name] !== 'gt' }, '이상 (기준 개월부터)')),
        hint ? h('small', { class: 'note' }, hint) : null);
    }
    // Aging 기준(10차) — 구분마다. 처음 값은 모두 「최근 출고일」(실데이터 검증 결과 — 기획서 11.15)
    function basisSelect(name, label) {
      var v = settings[name] || 'sale';
      return h('label', { class: 'field', 'data-field': name }, h('span', null, label),
        h('select', { name: name },
          h('option', { value: 'sale', selected: v === 'sale' }, '최근 출고일 (판매현황 → 없으면 재고잔량분석 칸)'),
          h('option', { value: 'receipt', selected: v === 'receipt' }, '입고 FIFO (구매현황을 최근부터 쌓아 현재고를 덮음)'),
          h('option', { value: 'file', selected: v === 'file' }, '재고잔량분석 칸 (회사 파일 값 → 없으면 최근 출고일)')),
        h('small', { class: 'note' }, '분석 화면 위에 어떤 기준으로 셌는지 보이고, 「기준 비교」 표에 다른 경로(재고잔량분석 칸 등)의 분포가 함께 나옵니다.'));
    }
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
      h('h2', null, 'Aging · 정상/장기재고 (개월)'),
      h('div', { class: 'alert info' },
        h('p', null, 'Aging 기준은 원자재·반제품·제품마다 고릅니다. 「최근 출고일」(처음 값)은 판매현황의 품목별 최근 출고일부터 기준일까지 경과 개월이고, 출고 이력이 없는 품목은 재고 파일의 「재고잔량분석」 칸으로 대체합니다. 「입고 FIFO」는 구매현황을 최근 입고부터 거꾸로 쌓아 현재고를 덮은 가장 오래된 입고일로 셉니다(덮지 못하면 「이력 없음」). 「재고잔량분석 칸」은 회사 파일 값을 그대로 씁니다. 모두 없으면 아래 설정에 따라 최근 입고일로 대신합니다. 품목마다 어느 기준으로 계산했는지 분석 화면에 표시합니다.'),
        h('p', null, '경과 개월 = 기준일과 날짜의 달력 월 차이입니다. 기준일의 「일」이 날짜의 「일」보다 작으면 한 달이 덜 찬 것으로 1을 빼고, 기준일이 그 달 말일이면 빼지 않습니다. 파일의 「12 개월초과」는 정확한 개월을 몰라 「12개월 초과(개월 미상)」 칸에 따로 둡니다.'),
        h('p', null, '판정: 세부는 Aging 으로 「정상 / 장기재고」, 총괄은 「정상 / 불용」 2단계입니다. 원자재는 12개월 「초과」, 반제품·제품은 6개월 「이상」이 처음 값입니다(9/29 답변). 총괄 불용은 아래 「총괄 불용 자동 판정」 기준(처음 값: 원자재 12개월 초과 · 제품 6개월 이상 — 9/30 답 B, 반제품은 없음)에 드는 품목과, 품목별로 「불용 확정」을 체크한 품목입니다.')),
      h('div', { class: 'form-grid' },
        num('longRawMonths', '원자재 장기재고 기준 개월', '처음 값 12. 24개월로 바꿀 때 여기만 고치면 됩니다'),
        opSelect('longRawOp', '원자재 — 기준 개월을', '처음 값 「초과」: 12개월이면 13개월부터 장기재고'),
        num('longProdMonths', '반제품·제품 장기재고 기준 개월', '처음 값 6'),
        opSelect('longProdOp', '반제품·제품 — 기준 개월을', '처음 값 「이상」: 6개월부터 장기재고'),
        num('agingMaxMonths', '개월별 분포 — 몇 개월까지 한 칸씩 보일지', '처음 값 36 → 0~36개월 + 「36개월 초과」. 1~36'),
        basisSelect('agingBasisRaw', '원자재 Aging 기준'),
        basisSelect('agingBasisSemi', '반제품 Aging 기준'),
        basisSelect('agingBasisProd', '제품 Aging 기준'),
        h('label', { class: 'field', 'data-field': 'receiptExclude' }, h('span', null, '구매현황에서 빼고 쌓을 적요(입고 FIFO)'),
          h('textarea', { name: 'receiptExclude', rows: '2', placeholder: '예: ○○수출*' }, settings.receiptExclude || ''),
          h('small', { class: 'note' }, '한국 재고로 들어오지 않는 입고(예: 다른 공장 몫으로 산 자재)의 적요를 한 줄에 하나씩 적으면 입고 FIFO 에서 뺍니다. 「*」는 아무 글자입니다. 처음 값은 비어 있습니다.')),
        h('label', { class: 'field' }, h('span', null, '판매현황 최근 출고일을 쓸 대상'),
          h('select', { name: 'salesScope' },
            h('option', { value: 'prod', selected: settings.salesScope !== 'all' }, '반제품·제품 (원자재는 아래 중국공장 판매 — 없으면 재고잔량분석 칸)'),
            h('option', { value: 'all', selected: settings.salesScope === 'all' }, '원자재·반제품·제품 모두 (거래처 구분 없이 전체 판매)')),
          h('small', { class: 'note' }, '원자재는 판매가 아니라 생산에 투입되므로 판매현황에는 유상사급 판매분도 섞여 나옵니다. 그래서 원자재는 중국공장 판매만 따로 봅니다(9/30 답변).')),
        h('label', { class: 'field', 'data-field': 'rawChinaSales' }, h('span', null, '원자재 Aging — 중국공장 판매 기준'),
          h('select', { name: 'rawChinaSales' },
            h('option', { value: 'on', selected: settings.rawChinaSales !== 'off' }, '씀 — 아래 거래처를 적으면 그 판매의 최근 판매일로'),
            h('option', { value: 'off', selected: settings.rawChinaSales === 'off' }, '쓰지 않음 (원자재는 재고잔량분석 칸)')),
          h('small', { class: 'note' }, '9/30 답변: 한국 생산이 줄어 원자재는 중국공장 판매로 봐도 되고, 생산투입현황(자재 출고)은 BOM 구성이 맞지 않아 쓰지 않습니다. 거래처 칸이 비어 있으면 꺼진 것과 같습니다.')),
        h('label', { class: 'field', 'data-field': 'chinaCustomers' }, h('span', null, '중국공장 거래처(판매현황 「거래처명」)'),
          h('textarea', { name: 'chinaCustomers', rows: '3', placeholder: '예: ○○(중국)유한공사' }, settings.chinaCustomers || ''),
          h('small', { class: 'note' }, '판매현황에는 공장·국가 칸이 없어, 중국공장으로 보는 거래처명(또는 거래처코드)을 한 줄에 하나씩 적어 주세요. 「*」는 아무 글자입니다(예: 「*중국*」). 「자료 → 판매현황」 아래에 파일에 나온 거래처 목록과 후보가 보입니다. 회사 거래처 이름이라 처음 값은 비어 있고, 이 브라우저에만 저장됩니다.')),
        h('label', { class: 'field' }, h('span', null, '출고 이력도 경과 개월 칸도 없는 품목'),
          h('select', { name: 'noOutPolicy' },
            h('option', { value: 'inbound', selected: settings.noOutPolicy !== 'none' }, '최근 입고일로 대신 계산'),
            h('option', { value: 'none', selected: settings.noOutPolicy === 'none' }, '판정 보류(날짜 없음)'))),
        h('label', { class: 'field' }, h('span', null, '과잉 구간(선택)'),
          h('select', { name: 'overEnabled' },
            h('option', { value: '', selected: settings.overEnabled !== 'on' }, '쓰지 않음 (정상 / 장기재고만)'),
            h('option', { value: 'on', selected: settings.overEnabled === 'on' }, '씀 — 아래 개월을 넘고 장기재고 미만이면 「과잉」'))),
        num('overMonths', '과잉 기준 — 경과 개월이 이 값을 넘으면(과잉 구간을 쓸 때만)', '정수')),
      h('h2', null, '총괄 불용 자동 판정 (개월)'),
      h('p', { class: 'note' }, '총괄의 「정상 / 불용」에서 불용 = 아래 기준에 드는 품목 + 품목별 「불용 확정」 체크. 개월을 비우면 그 구분은 체크한 품목만 불용입니다. 9/30 답 「6개월 이상의 제품은 불용」으로 제품 처음 값은 6개월 이상, 원자재는 장기재고 기준과 같은 12개월 초과입니다.'),
      h('div', { class: 'form-grid' },
        num('deadRawMonths', '원자재 불용 기준 개월', '처음 값 12 (비우면 체크만)'),
        opSelect('deadRawOp', '원자재 — 기준 개월을', '처음 값 「초과」'),
        num('deadSemiMonths', '반제품 불용 기준 개월', '처음 값 비움(답을 받지 못함 — 체크만)'),
        opSelect('deadSemiOp', '반제품 — 기준 개월을'),
        num('deadProdMonths', '제품 불용 기준 개월', '처음 값 6 (답 B)'),
        opSelect('deadProdOp', '제품 — 기준 개월을', '처음 값 「이상」: 6개월부터 불용'),
        h('label', { class: 'field', 'data-field': 'deadBasis' }, h('span', null, '불용을 셀 개월'),
          h('select', { name: 'deadBasis' },
            h('option', { value: 'file', selected: settings.deadBasis !== 'shown' }, '재고잔량분석 칸 (회사 총괄과 같은 기준, 칸이 없으면 표시 기준)'),
            h('option', { value: 'shown', selected: settings.deadBasis === 'shown' }, '그 구분의 Aging 표시 기준 (위의 Aging 기준)')),
          h('small', { class: 'note' }, '8월 실데이터로 맞대 보니 재고잔량분석 칸으로 셀 때 총괄 시트의 자재·제품 불용 금액과 거의 같았습니다(기획서 11.16).'))),
      h('h2', null, '보고서 대조 · 차이 알람'),
      h('p', { class: 'note' }, '「자료」의 「회사 보고서(대조용)」에 월간 재고분석 파일을 올리면 보고용 시트의 공장별 합계와 도구 계산을 맞대 봅니다.'),
      h('div', { class: 'form-grid' },
        num('reconTolerance', '허용 차이(원) — 이 금액 이하 차이는 알람 없음', '처음 값 1원. 수량은 0.5 이하 차이(소수 수량 반올림)를 뺍니다'),
        h('label', { class: 'field' }, h('span', null, '보고서 구역 이름 → 공장'), h('textarea', { name: 'plantAlias', rows: '3', placeholder: '예: ○○EO=대구' }, settings.plantAlias || ''),
          h('small', { class: 'note' }, '보고용 시트의 「○○기준」 구역 이름에 인천·본사·대구가 없으면 한 줄에 「구역이름=대구」처럼 적어 주세요. 회사 고유 이름이라 처음 값은 비어 있고, 이 브라우저에만 저장됩니다.')),
        h('label', { class: 'field' }, h('span', null, '보고서 칸 단위'), h('textarea', { name: 'reconUnits', rows: '3', placeholder: '총괄 금액=백만원\n* 금액=원' }, settings.reconUnits || ''),
          h('small', { class: 'note' }, '처음 값은 9/30 답변대로 「총괄 금액=백만원」(총괄현황 시트)과 「* 금액=원」(원자재·반제품·제품 시트)입니다. 「총괄」로 시작하는 줄은 총괄 시트에만, 나머지 줄은 원자재·반제품·제품 시트에만 적용됩니다. 한 줄에 「(총괄) 공장 구분 달 항목=배수」 — 「×10」은 10배로 적힌 칸, 「천원」「백만원」은 그 단위 칸, 「원」은 단위가 같다고 확정한 칸입니다. 확정한 칸에서 정확히 10배 차이가 나면 알람(자릿수 입력 오류 의심)으로, 적지 않은 칸의 10·100·1000배 차이는 「단위 차이」로 따로 보입니다.'))),
      h('h2', null, '원자재 대분류 묶음표'),
      h('p', { class: 'note' }, 'ERP 대분류 코드를 보고서 대분류로 묶습니다. 한 줄에 「코드=보고서 대분류」. 품번으로 묶으려면 「품번:CI184-*=파크라케이블(CI184)」처럼 적습니다(품번 규칙이 먼저). 비우면 파일에 적힌 대분류 그대로 씁니다.'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', null, '묶음표'), h('textarea', { name: 'groupMap', rows: '8' }, settings.groupMap)),
        h('label', { class: 'field' }, h('span', null, '묶음표에 없는 대분류'),
          h('select', { name: 'groupOthers' },
            h('option', { value: 'other', selected: settings.groupOthers !== 'keep' }, '「기타」로 모음 (보고서 방식)'),
            h('option', { value: 'keep', selected: settings.groupOthers === 'keep' }, '적힌 코드 그대로 보이기')),
          h('small', { class: 'note' }, '처음 값은 두 공장 공통 통일안입니다(인천 요약표 기준 — 대구도 클립류·스위치를 따로 봅니다). 파크라케이블(CI184)은 인천 품목의 CI184 품번 전체를 묶습니다(「인천:품번:CI184-*」 — 9/29 확정).'))),
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
        next[k] = el ? (k === 'groupMap' || k === 'plantAlias' || k === 'reconUnits' || k === 'chinaCustomers' || k === 'receiptExclude' ? el.value : el.value.trim()) : settings[k];
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
    var cur = KIND_SLOT[kindKey][0], prev = KIND_SLOT[kindKey][1];
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
    var prevSlot = KIND_SLOT[kindKey][1];
    var notes = coverageNotes(kindKey);
    if (!parts(prevSlot).length) notes.push('전월 재고가 없어 모든 품목을 「신규」로 봅니다.');
    if (!res.hasHistory.outbound && !res.hasHistory.sales) notes.push('판매현황(출고)을 올리지 않아 최근 출고일 기준 Aging 과 회전율은 계산하지 못합니다. 재고 파일의 경과 개월 칸(재고잔량분석)이 있으면 그 값으로 Aging 을 표시합니다.');
    else if (res.hasHistory.sales && !res[kindKey].useSales) notes.push('판매현황 최근 출고일은 기준 설정에 따라 ' + KIND_TEXT[kindKey] + '에 쓰지 않습니다(재고잔량분석 칸 사용).' + (kindKey === 'raw' && settings.rawChinaSales !== 'off' ? ' 원자재를 중국공장 판매로 보려면 「기준 설정 → 중국공장 거래처」에 거래처명을 적어 주세요.' : ''));
    else if (kindKey === 'raw' && res.raw.salesMode === 'china') {
      var cn = res.sales.china || {};
      notes.push('원자재 Aging 은 중국공장 거래처(' + (cn.customers && cn.customers.length ? cn.customers.join(', ') : '판매현황에서 찾지 못함') + ') 판매의 최근 판매일 기준입니다(9/30 답변). 그 판매가 없는 품목은 재고잔량분석 칸으로 봅니다.');
      if (cn.filesNoCustomer && cn.filesNoCustomer.length) notes.push('거래처 칸을 저장하지 않은 예전 판매현황 ' + cn.filesNoCustomer.length + '개(' + cn.filesNoCustomer.slice(0, 3).join(', ') + (cn.filesNoCustomer.length > 3 ? ' 등' : '') + ')는 중국공장 판매를 가릴 수 없습니다 — 「자료」에서 다시 올려 주세요.');
    }
    if (res[kindKey].basis === 'receipt' && !res.hasHistory.receipts) notes.push(KIND_TEXT[kindKey] + ' Aging 기준을 「입고 FIFO」로 정했지만 구매현황을 올리지 않아 최근 출고일 → 재고잔량분석 칸으로 셉니다. 「자료 → 구매현황(입고) 여러 파일」에 올려 주세요.');
    if (res.receipts && res.receipts.gaps.length) notes.push('구매현황에 입고 줄이 없는 달이 있습니다(' + res.receipts.gaps.join(', ') + '). 입고 FIFO 결과가 실제보다 오래되거나 「이력 없음」으로 잡힐 수 있습니다.');
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
    var kindText = KIND_TEXT[kindKey];
    var title = kindText + ' 분석';
    var groupLabel = isRaw ? '대분류' : '고객사';
    var codeLabel = kindKey === 'product' ? '제품코드' : '품번';
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, title)));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    var k = res[kindKey];
    var curSlot = KIND_SLOT[kindKey][0];
    wrap.appendChild(plantBar());
    if (!parts(curSlot).length) {
      wrap.appendChild(h('div', { class: 'card' }, h('p', null, kindText + ' 당월 재고 파일을 아직 올리지 않았습니다.'), h('a', { class: 'btn btn-primary', href: '#/data' }, '자료 올리러 가기')));
      return wrap;
    }
    wrap.appendChild(h('p', { class: 'note' }, plantText() + ' · 기준일 ' + res.curDate + ' (전월 ' + res.prevDate + ') · Aging 은 개월 단위 · 장기재고 ' + k.longText));
    wrap.appendChild(h('p', { class: 'basis-line', 'data-basis-line': k.basis }, h('strong', null, kindText + ' Aging 기준: '), k.basisUsed, ' ', h('a', { href: '#/settings' }, '(기준 설정에서 바꾸기)')));
    append(wrap, missingNotes(res, kindKey));

    var t = k.groups.total;
    wrap.appendChild(h('div', { class: 'stats' },
      stat('당월 재고수량', fmt(t.curQty), '전월 ' + fmt(t.prevQty)),
      stat('수량 증감', fmtSigned(t.diffQty), fmtRate(t.prevQty, t.curQty, t.qtyRate), sign(t.diffQty)),
      stat('당월 재고금액', fmt(t.curAmt), '전월 ' + fmt(t.prevAmt)),
      stat('금액 증감', fmtSigned(t.diffAmt), fmtRate(t.prevAmt, t.curAmt, t.amtRate), sign(t.diffAmt))));

    if (!settings.plantView) {
      wrap.appendChild(h('h2', null, '공장별 요약'));
      wrap.appendChild(plantSummaryTable(res, kindKey));
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
    wrap.appendChild(h('p', null, h('a', { href: '#/cause' + (isRaw ? '' : '/' + kindKey) }, groupLabel + '별 증감 원인(입고·출고·단가·신규·소멸 분해) 보기')));

    // Aging 개월별 분포 · 판정
    var longM = k.longMonths;
    wrap.appendChild(h('h2', null, 'Aging 개월별 분포'));
    wrap.appendChild(agingBasisNote(k, res));
    var metric = { v: 'amount' };
    var chartBox = h('div', { class: 'chart-box' });
    function drawChart() { chartBox.textContent = ''; chartBox.appendChild(agingChart(k.buckets, k.longText, metric.v, L.BASIS_LABEL[k.basis])); }
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': '그래프 값' });
    [['amount', '재고금액'], ['qty', '재고수량'], ['count', '품목 수']].forEach(function (o) {
      var b = h('button', { type: 'button', 'aria-pressed': o[0] === metric.v ? 'true' : 'false', onclick: function () {
        metric.v = o[0]; [].forEach.call(seg.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); drawChart();
      } }, o[1]);
      seg.appendChild(b);
    });
    wrap.appendChild(h('div', { class: 'plant-bar' }, h('strong', null, '그래프'), seg));
    wrap.appendChild(chartBox);
    drawChart();
    wrap.appendChild(h('div', { class: 'two-col' },
      h('div', null, h('h3', null, '개월별 표'),
        table(['경과 개월', n('품목 수'), n('재고수량'), n('재고금액'), '판정'], k.buckets.filter(function (b) { return b.count || (b.month != null && !b.open); }).map(function (b) {
          return h('tr', null, td(b.bucket), td(fmt(b.count), 'num'), td(fmt(b.qty), 'num'), td(fmt(b.amount), 'num'),
            td(b.month == null ? '' : h('span', { class: 'fit ' + (b.long ? 'dead' : 'ok') }, b.long ? '장기재고' : '정상')));
        }))),
      h('div', null, h('h3', null, '세부 판정 (Aging)'),
        table(['구분', n('품목 수'), n('재고수량'), n('재고금액')], k.fitness.filter(function (f) { return f.fitness !== '과잉' || settings.overEnabled === 'on'; }).map(function (f) {
          return h('tr', null, td(h('span', { class: 'fit ' + fitCls(f.fitness) }, f.fitness)), td(fmt(f.count), 'num'), td(fmt(f.qty), 'num'), td(fmt(f.amount), 'num'));
        })),
        h('p', { class: 'note' }, '장기재고: 경과 ' + k.longText + ' (' + (isRaw ? '원자재' : '반제품·제품') + ' 기준, 「기준 설정」에서 변경)' + (settings.overEnabled === 'on' ? ' · 과잉: ' + settings.overMonths + '개월 초과' : '')),
        h('h3', null, '총괄 (정상 / 불용)'),
        table(['구분', n('품목 수'), n('재고수량'), n('재고금액')], k.overall.map(function (f) {
          return h('tr', null, td(f.label), td(fmt(f.count), 'num'), td(fmt(f.qty), 'num'), td(fmt(f.amount), 'num'));
        })),
        h('p', { class: 'note' }, '불용 = ' + (k.deadRuleText ? '자동(' + k.deadRuleText + ', ' + (settings.deadBasis === 'shown' ? 'Aging 표시 기준' : '재고잔량분석 칸') + ') ' + fmt(k.overall[1].autoCount || 0) + '품목 + ' : '') + '「불용 확정」 체크 ' + fmt(k.overall[1].confirmedCount || 0) + '품목. 기준은 「기준 설정 → 총괄 불용 자동 판정」.'))));

    // 기준 비교 — 판매현황(출고)이 있으면 예전 경로(재고잔량분석 칸)와 최근 출고일 경로의 분포를 나란히
    var cmp = compareTable(k, res);
    if (cmp) { wrap.appendChild(h('h3', null, 'Aging 기준 비교 — 경로에 따라 분포가 어떻게 달라지는지')); wrap.appendChild(cmp); }
    append(wrap, fifoSection(k, res, kindText, codeLabel));

    // 품목별
    wrap.appendChild(h('h2', null, '품목별 증감 · Aging'));
    wrap.appendChild(itemTable(kindKey, k.items, codeLabel, groupLabel));
    return wrap;
  }

  // 입고 FIFO(10차) — 층별 분포 + 회사 재고잔량분석 칸과 품목별 비교(검증). 구매현황을 올렸을 때만.
  function fifoSection(k, res, kindText, codeLabel) {
    if (!k.fifoBuckets) return null;
    var st = k.fifoStats, fv0 = k.fifoVsFile, tot0 = fv0 ? fv0.same + fv0.newer + fv0.older : 0;
    // 표시 기준이 입고 FIFO 가 아니면 접어 둔 참고 상자로(반제품·제품은 구매현황에 거의 없어 대부분 「이력 없음」)
    var ref = k.basis !== 'receipt';
    var box = h(ref ? 'details' : 'section', { class: 'fifo-box', 'data-fifo': k.kind });
    box.appendChild(h(ref ? 'summary' : 'h3', null, '입고 FIFO' + (ref ? '(참고)' : '') + ' — 현재고를 덮은 입고의 개월별 분포(구매현황) · 다 덮음 ' + fmt(st.full) + ' / ' + fmt(st.stock) + '품목' +
      (tot0 ? ' · 재고잔량분석 칸과 같음 ' + L.round(fv0.same / tot0 * 100, 1) + '%' : '')));
    box.appendChild(h('p', { class: 'note' }, '품목마다 구매현황 입고를 최근 → 과거 순으로 더해 당월 현재고를 덮을 때까지 쌓고, 덮은 수량을 그 입고의 경과 개월 칸에 나눴습니다(금액은 품목 금액을 수량 비율로). ' +
      '현재고 품목 ' + fmt(st.stock) + '개 중 다 덮음 ' + fmt(st.full) + ' · 일부만 ' + fmt(st.partial) + ' · 입고 없음 ' + fmt(st.none) + '. ' +
      (k.basis === 'receipt' ? '지금 이 분포가 Aging 표시 기준입니다.' : '지금 표시 기준은 「' + L.BASIS_LABEL[k.basis] + '」이고, 이 표는 참고용입니다.')));
    box.appendChild(table(['경과 개월(입고)', n('품목 수(그 칸에 층이 있는)'), n('재고수량'), n('재고금액'), '판정'], k.fifoBuckets.filter(function (b) { return b.qty; }).map(function (b) {
      return h('tr', { class: b.open ? 'total' : null }, td(b.bucket), td(fmt(b.items), 'num'), td(fmt(b.qty), 'num'), td(fmt(b.amount), 'num'), td(h('span', { class: 'fit ' + (b.long ? 'dead' : 'ok') }, b.long ? '장기재고' : '정상')));
    }), { empty: '현재고를 덮은 입고가 없습니다.' }));
    var fv = k.fifoVsFile;
    if (fv && (fv.both || fv.onlyShown)) {
      var tot = fv.same + fv.newer + fv.older;
      box.appendChild(h('h3', null, '입고 FIFO ↔ 재고잔량분석 칸(회사 계산) — 품목별 개월 비교'));
      box.appendChild(h('p', { class: 'note' }, '두 값이 모두 있는 품목 ' + fmt(tot) + '개 중 같음 ' + fmt(fv.same) + (tot ? ' (' + L.round(fv.same / tot * 100, 1) + '%)' : '') + ' · 입고 FIFO 가 더 최근 ' + fmt(fv.newer) + ' · 더 오래됨 ' + fmt(fv.older) +
        (fv.onlyShown ? ' · 재고잔량분석 칸 없음 ' + fmt(fv.onlyShown) : '') + '. 「12개월 초과」와 입고 FIFO 13개월 이상·이력 없음은 같음으로 셉니다.'));
      if (fv.diffs.length) box.appendChild(h('details', null, h('summary', null, '다른 품목 — 금액 큰 순 ' + Math.min(50, fv.diffs.length) + '개'),
        table([codeLabel, '품명', n('당월 수량'), n('당월 금액'), n('입고 FIFO'), n('재고잔량분석'), '방향'], fv.diffs.slice(0, 50).map(function (d) {
          return h('tr', null, td(d.code, 'nowrap'), td(d.name), td(fmt(d.curQty), 'num'), td(fmt(d.curAmt), 'num'),
            td(d.shownOpen ? res.noHistLabel : fmt(d.shown) + '개월', 'num'), td(d.altOpen ? (d.altText || '12개월 초과') : fmt(d.alt) + '개월', 'num'), td(d.dir === 'newer' ? 'FIFO 가 더 최근' : 'FIFO 가 더 오래됨'));
        }), { cls: 'wide' })));
    }
    return box;
  }
  function fitCls(f) { return f === '정상' ? 'ok' : f === '과잉' ? 'over' : f === '장기재고' ? 'dead' : 'hold'; }

  // Aging 표시 기준이 무엇이었는지 품목 수로 알림(품목마다의 기준은 품목별 표의 「Aging 표시」 칸에 적힘)
  function agingBasisNote(k, res) {
    var c = {};
    k.items.forEach(function (it) { if (it.curQty) { var key = it.agingBasis === '출고일' ? '출고일·' + it.lastOutSource : it.agingBasis; c[key] = (c[key] || 0) + 1; } });
    var parts = [];
    if (c['출고일·판매현황']) parts.push('판매현황 최근 출고일 ' + fmt(c['출고일·판매현황']) + '품목');
    if (c['출고일·출고 이력']) parts.push('출고 이력 최근 출고일 ' + fmt(c['출고일·출고 이력']) + '품목');
    if (c['파일 경과 개월']) parts.push('재고잔량분석 칸 ' + fmt(c['파일 경과 개월']) + '품목');
    if (c['입고 FIFO']) parts.push('입고 FIFO ' + fmt(c['입고 FIFO']) + '품목');
    if (c['입고일 대체']) parts.push('최근 입고일로 대체 ' + fmt(c['입고일 대체']) + '품목');
    if (c['없음']) parts.push('날짜 없음 ' + fmt(c['없음']) + '품목');
    var msg = 'Aging 기준 — ' + (parts.join(' · ') || '해당 품목 없음') + '.';
    if (!res.hasHistory.outbound && !res.hasHistory.sales) msg += ' 판매현황(출고) 파일을 「자료」에 올리면 최근 출고일 기준으로 바뀝니다.';
    return h('p', { class: 'note', 'data-basis': '' }, msg);
  }
  // 두 경로의 개월별 분포(품목 수·금액) 비교 표. 두 경로가 같은 결과면(판매현황·출고 이력이 없으면) 그리지 않습니다.
  function compareTable(k, res) {
    if (!k.items.some(function (it) { return it.curQty && it.bucket !== it.bucketAlt; })) return null;
    var alt = {}, labels = [];
    k.buckets.forEach(function (b) { if (b.count) labels.push(b.bucket); });
    k.bucketsAlt.forEach(function (b) { alt[b.bucket] = b; if (b.count && labels.indexOf(b.bucket) < 0) labels.push(b.bucket); });
    var cur = {};
    k.buckets.forEach(function (b) { cur[b.bucket] = b; });
    var order = k.buckets.concat(k.bucketsAlt).map(function (b) { return b.bucket; });
    labels.sort(function (a, b) { var ma = (cur[a] || alt[a]).month, mb = (cur[b] || alt[b]).month; return (ma == null ? 1e9 : ma) - (mb == null ? 1e9 : mb) || order.indexOf(a) - order.indexOf(b); });
    var nowName = L.BASIS_LABEL[k.basis] + '(지금)';
    var altName = k.basis === 'file' ? '최근 출고일' : '재고잔량분석 칸';
    function longOf(list) { return list.filter(function (it) { return it.curQty > 0; }); }
    var items = longOf(k.items);
    var longNow = items.filter(function (it) { return it.fitness === '장기재고'; }), longAlt = items.filter(function (it) { return it.fitnessAlt === '장기재고'; });
    var sum = function (l) { return l.reduce(function (a, it) { return a + (it.curAmt || 0); }, 0); };
    var rows = labels.map(function (l) {
      var a = cur[l] || { count: 0, amount: 0 }, b = alt[l] || { count: 0, amount: 0 };
      return h('tr', null, td(l), td(fmt(b.count), 'num'), td(fmt(a.count), 'num'), td(fmtSigned(a.count - b.count), 'num ' + sign(a.count - b.count)), td(fmt(L.round(b.amount, 0)), 'num'), td(fmt(L.round(a.amount, 0)), 'num'));
    });
    rows.push(h('tr', { class: 'total' }, td('장기재고(' + k.longText + ')'), td(fmt(longAlt.length), 'num'), td(fmt(longNow.length), 'num'), td(fmtSigned(longNow.length - longAlt.length), 'num'), td(fmt(L.round(sum(longAlt), 0)), 'num'), td(fmt(L.round(sum(longNow), 0)), 'num')));
    return table(['경과 개월', n(altName + ' 품목 수'), n(nowName + ' 품목 수'), n('품목 수 차이'), n(altName + ' 금액'), n(nowName + ' 금액')], rows);
  }
  // 개월별 분포 막대그래프(SVG). 장기재고 경계에 세로 점선을 긋습니다.
  function agingChart(buckets, longText, metric, path) {
    var NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text != null) e.textContent = text;
      return e;
    }
    var bars = buckets.filter(function (b) { return b.month != null; });
    var W = 760, H = 280, L0 = 16, R0 = 16, T0 = 28, B0 = 60;
    var cw = (W - L0 - R0) / bars.length;
    var max = Math.max.apply(null, bars.map(function (b) { return b[metric]; }).concat([0])) || 1;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'aging-chart', role: 'img', 'aria-label': 'Aging 개월별 ' + (metric === 'amount' ? '재고금액' : metric === 'qty' ? '재고수량' : '품목 수') + ' 분포, ' + longText + ' 장기재고' });
    var every = bars.length > 24 ? 3 : 1;   // 칸이 많으면(0~36) 눈금 글자는 3칸마다
    svg.appendChild(el('line', { x1: L0, x2: W - R0, y1: H - B0, y2: H - B0, class: 'axis' }));
    bars.forEach(function (b, i) {
      var v = b[metric], bh = (H - T0 - B0) * v / max;
      var x = L0 + i * cw + cw * 0.15, w = cw * 0.7;
      var r = el('rect', { x: x, y: H - B0 - bh, width: w, height: Math.max(0, bh), class: b.long ? 'bar long' : 'bar' });
      r.appendChild(el('title', null, b.bucket + ': ' + fmt(v) + (metric === 'amount' ? '원' : metric === 'qty' ? '' : '품목')));
      svg.appendChild(r);
      if (b.open || i === bars.length - 1 || b.month % every === 0) svg.appendChild(el('text', { x: L0 + i * cw + cw / 2, y: H - B0 + (b.open ? 30 : 16), class: 'tick' + (b.open ? ' open' : '') }, b.tick));
    });
    var bi = -1;
    for (var i = 0; i < bars.length; i++) if (bars[i].long) { bi = i; break; }
    if (bi >= 0) {
      var lx = L0 + bi * cw;
      svg.appendChild(el('line', { x1: lx, x2: lx, y1: T0 - 18, y2: H - B0, class: 'cut' }));
      svg.appendChild(el('text', { x: lx + 4, y: T0 - 8, class: 'cut-label', 'text-anchor': lx > W * 0.7 ? 'end' : 'start', dx: lx > W * 0.7 ? -8 : 0 }, '장기재고 ' + longText));
    }
    svg.appendChild(el('text', { x: W / 2, y: H - 4, class: 'axis-label' }, '경과 개월(' + path + ') · 「>36」은 그 초과, 「>12?」는 「12개월 초과」·「이력 없음」(개월 미상)'));
    return svg;
  }
  function agingCell(it) {
    if (it.agingShown == null) return '';
    var s = fmt(it.agingShown) + '개월';
    if (it.agingBasis === '입고일 대체') s += ' (입고일 대체)';
    if (it.agingBasis === '입고 FIFO') s = it.agingShownOpen ? it.bucket + ' (입고 FIFO · 덮지 못한 수량 ' + fmt(it.fifo.uncovered) + ')' : s + ' (입고 FIFO · ' + it.fifo.oldest + ' 입고까지)';
    if (it.agingBasis === '파일 경과 개월') s = (it.agingFileText || s) + ' (재고잔량분석)';
    if (it.agingBasis === '출고일') s += it.lastOutSource === '판매현황' ? (it.salesChina ? ' (판매현황·중국공장)' : ' (판매현황)') : ' (출고 이력)';
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
      h('label', { class: 'field' }, h('span', null, '판정'), h('select', { name: 'fitness' }, ['', '정상', '장기재고', '과잉', '판정 보류', '재고 없음', '불용(자동·확정)', '불용 확정'].map(function (c) {
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
        if (f.fitness === '불용 확정') { if (!it.deadConfirmed) return false; }
        else if (f.fitness === '불용(자동·확정)') { if (!it.dead) return false; }
        else if (f.fitness && it.fitness !== f.fitness) return false;
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
          td(it.curQty ? h('span', { class: 'fit ' + fitCls(it.fitness) }, it.fitness) : it.fitness), td(it.turnover == null ? '' : fmt(it.turnover), 'num'),
          td(it.curQty ? deadBox(kindKey, it) : ''));
      });
      holder.appendChild(table([codeLabel, '품명', groupLabel, '공장', '구분', n('전월 수량'), n('당월 수량'), n('수량 증감'), n('증감률'), n('당월 금액'), n('금액 증감'),
        '최근 입고일', '최근 출고일', n('입고일 기준(개월)'), n('출고일 기준(개월)'), n('Aging 표시'), '판정', n('회전율'), '불용 확정'], rows, { cls: 'wide' }));
    }
    form.addEventListener('input', draw);
    form.addEventListener('change', draw);
    box.appendChild(form);
    box.appendChild(holder);
    draw();
    return box;
  }

  // 불용 확정 체크 — 관련부서 확정 후 담당자가 품목마다 체크(기준일과 무관하게 품번으로 저장)
  function deadBox(kindKey, it) {
    var cb = h('input', { type: 'checkbox', checked: it.deadConfirmed, 'aria-label': it.code + ' 불용 확정' });
    cb.addEventListener('change', function () {
      var d = S.getDead();
      d[kindKey] = d[kindKey] || {};
      if (cb.checked) d[kindKey][it.code] = true; else delete d[kindKey][it.code];
      S.setDead(d);
      toast(it.code + (cb.checked ? ' 불용 확정' : ' 불용 확정 해제') + ' — 총괄 표에는 화면을 다시 열면 반영됩니다.');
    });
    return h('span', null, h('label', { class: 'check' }, cb, '확정'), it.deadAuto && !it.deadConfirmed ? h('span', { class: 'fit dead', title: 'Aging 기준으로 자동 불용' }, '자동 불용') : null);
  }

  // ── 증감 원인 ────────────────────────────────────────────
  var maskNames = true;
  function viewCause(kindKey) {
    var isRaw = kindKey === 'raw';
    var groupLabel = isRaw ? '대분류' : '고객사';
    var kindLabel = KIND_TEXT[kindKey];
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, kindLabel + ' 증감 원인 — ' + groupLabel + '별 전월 대비')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    wrap.appendChild(plantBar());
    wrap.appendChild(h('p', null,
      h('a', { href: '#/cause', 'aria-current': isRaw ? 'page' : null }, '원자재(대분류별)'), ' · ',
      h('a', { href: '#/cause/semi', 'aria-current': kindKey === 'semi' ? 'page' : null }, '반제품(고객사별)'), ' · ',
      h('a', { href: '#/cause/product', 'aria-current': kindKey === 'product' ? 'page' : null }, '제품(고객사별)')));
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
    wrap.appendChild(h('p', { class: 'note' }, '메모와 AI 해설은 이 브라우저에 기준일·공장 보기별로 저장되고, 엑셀 ' + '「' + kindLabel + '_증감원인」 시트' + (isRaw ? '와 보고용 「원자재」 시트의 비고 칸' : '') + '에 함께 들어갑니다' + '.'));
    var maskBox = h('input', { type: 'checkbox', checked: maskNames });
    maskBox.addEventListener('change', function () { maskNames = maskBox.checked; });
    wrap.appendChild(h('label', { class: 'check' }, maskBox, 'AI 프롬프트에서 품번·품명을 「품목1」처럼 가리기(회사 밖 AI 에 붙여 넣을 때 권장)'));

    c.rows.forEach(function (g) {
      var m = kindMemos[g.group] || {};
      var card = h('section', { class: 'cause-card' },
        h('h3', null, g.group),
        h('p', { class: 'cause-line' }, L.causeSentence(g, function (x) { return fmt(L.round(x, 0)); })),
        g.top.length ? table([n('순위'), kindKey === 'product' ? '제품코드' : '품번', '품명', '구분', n('수량 전월→당월'), n('금액 증감'), n('입고 전월→당월'), n('출고 전월→당월'), n('수량 효과'), n('단가 효과'), '가장 큰 요인'],
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
    var rules = ['금액 증가 상위 ' + settings.topN + '건(원자재·반제품·제품 각각)', '장기재고(원자재 ' + L.longLabel(res.longRaw, res.longRawOp) + '·반제품·제품 ' + L.longLabel(res.longProd, res.longProdOp) + ')', '불용 확정 품목'];
    if (settings.overEnabled === 'on') rules.push('과잉(' + settings.overMonths + '개월 초과)');
    rules.push(settings.turnoverMax === '' ? '저회전: 기준 미설정(적용 안 함)' : '저회전(회전율 ' + settings.turnoverMax + ' 미만)');
    wrap.appendChild(h('div', { class: 'alert info' }, plantText() + ' · 선정 규칙 — ' + rules.join(' · ') + '. 원인과 개선방안은 엑셀로 내려받아 담당자가 적습니다.'));
    ['원자재', '반제품', '제품'].forEach(function (kind) {
      var list = res.targets.filter(function (t) { return t.kind === kind; });
      wrap.appendChild(h('h2', null, kind + ' (' + list.length + '건)'));
      wrap.appendChild(table(['품번', '품명', kind === '원자재' ? '대분류' : '고객사', '선정 사유', n('당월 수량'), n('당월 금액'), n('금액 증감'), n('Aging 표시(개월)'), '최근 출고일', '판정'],
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

  // ── 보고서 대조 · 차이 알람 ─────────────────────────────
  function viewRecon() {
    var wrap = h('div', null, h('div', { class: 'page-head' }, h('h1', null, '보고서 대조 · 차이 알람')));
    var nd = needData(); if (nd) { wrap.appendChild(nd); return wrap; }
    var res = result();
    var ns = needSettings(res); if (ns) { wrap.appendChild(ns); return wrap; }
    var rc = res.recon;
    wrap.appendChild(h('div', { class: 'alert info' },
      h('p', null, '회사 보고서의 보고용 시트(총괄현황·원자재·반제품·제품)에 적힌 공장별 합계(수량·금액, ' + res.prevDate.slice(5, 7) + '월·' + res.curDate.slice(5, 7) + '월)를 도구가 상세 시트로 계산한 값과 맞대 봅니다. 합계 줄이 다르면 「차이」로 알람을 띄웁니다(허용 차이: 금액 ' + fmt(rc.tolerance) + '원, 수량 0.5).'),
      h('p', null, '총괄현황 시트는 백만원 단위라(9/30 답변) 원으로 바꿔 공장·구분(자재·반제품·제품)별 정상+불용 금액을 도구의 재고금액 합계와 맞댑니다. 반올림 때문에 50만원(백만원의 절반)까지는 같음으로 봅니다. 원자재·반제품·제품 시트는 원 단위로 확정되어, 정확히 10배 차이가 나도 알람(자릿수 입력 오류 의심)입니다.'),
      h('p', null, '대분류·고객사 줄의 차이는 묶음표·고객사 표기 차이로도 생기므로 알람 대신 「참고」로만 보입니다. 알고 있는 차이는 「확인함」을 체크하면 알람에서 빠집니다(기준일마다 따로 저장).')));
    if (!rc.hasReport) {
      wrap.appendChild(h('div', { class: 'card' }, h('p', null, '아직 올린 회사 보고서가 없습니다.'), h('a', { class: 'btn btn-primary', href: '#/data' }, '「자료」에서 회사 보고서 올리기')));
      return wrap;
    }
    if (rc.unresolved.length) wrap.appendChild(h('div', { class: 'alert warn' }, h('p', null, '공장을 정하지 못해 대조하지 않은 구역이 있습니다. 「기준 설정 → 보고서 구역 이름 → 공장」에 「구역이름=대구」처럼 적어 주세요.'),
      h('ul', null, rc.unresolved.map(function (u) { return h('li', null, u); }))));
    wrap.appendChild(h('div', { class: 'stats' },
      stat('비교한 값', fmt(rc.compared), '공장·구분·달·수량/금액'),
      stat('차이(알람)', fmt(rc.alarms.length), '합계 줄', rc.alarms.length ? 'down' : ''),
      stat('확인함', fmt(rc.acked.length), '알람에서 뺀 차이'),
      stat('단위 차이', fmt(rc.units.length), '알람 아님 — 단위를 맞추면 같음'),
      stat('총괄(백만원)', fmt(rc.unitsOk || 0), '단위 설정으로 맞춰 같은 칸'),
      stat('참고', fmt(rc.infos.length), '대분류·고객사 줄')));
    function rowsOf(list, status) {
      return list.map(function (a) {
        var cb = null;
        if (status !== '참고') {
          cb = h('input', { type: 'checkbox', checked: !!a.acked, 'aria-label': a.plant + ' ' + a.kindLabel + ' ' + a.month + '월 ' + a.field + ' 확인함' });
          cb.addEventListener('change', function () {
            var ack = S.getReconAck();
            // 수강생 답으로 미리 확인함인 칸(L.PRESET_ACK)은 체크를 풀면 false 로 남겨 다시 알람이 되게 합니다
            if (cb.checked) { if (L.PRESET_ACK[a.key]) delete ack[a.key]; else ack[a.key] = true; } else if (L.PRESET_ACK[a.key]) ack[a.key] = false; else delete ack[a.key];
            S.setReconAck(ack); render();
          });
        }
        return h('tr', { class: status === '차이' ? 'alarm-row' : null }, td(L.plantLabel(a.plant)), td(a.kindLabel), td(a.label), td(a.month ? a.month + '월(' + a.period + ')' : ''), td(a.field),
          td(fmt(a.report), 'num'), td(fmt(a.tool), 'num'), td(a.diff == null ? '' : fmtSigned(a.diff), 'num ' + sign(a.diff)), td(a.file + (a.sheet ? ' [' + a.sheet + ']' : '')),
          td(status + (a.note ? ' — ' + a.note : '') + (a.ackPreset ? ' — ' + a.ackPreset : '')), td(cb ? h('label', { class: 'check' }, cb, '확인함') : ''));
      });
    }
    var head = ['공장', '구분', '줄', '달', '항목', n('보고서 값'), n('도구 값'), n('차이(도구 − 보고서)'), '보고서 파일', '상태', ''];
    wrap.appendChild(h('h2', null, '합계 줄 차이'));
    wrap.appendChild(table(head, rowsOf(rc.alarms, '차이').concat(rowsOf(rc.acked, '확인함')), { cls: 'wide', empty: '합계 줄은 모두 허용 차이 안입니다.' }));
    wrap.appendChild(h('h2', null, '단위 차이 — 알람 아님'));
    wrap.appendChild(h('p', { class: 'note' }, '보고서 값이 도구 값의 정확히 10·100·1000…배(또는 그 역수)인 칸, 또는 「기준 설정 → 보고서 칸 단위」에 적은 단위로 바꾸면 같은 칸입니다. 자동으로 찾은 칸은 「제안 설정」 줄을 기준 설정에 적으면 단위가 확정됩니다(그 뒤로 단위를 맞춰도 다르면 알람).'));
    wrap.appendChild(table(['공장', '구분', '줄', '달', '항목', n('보고서 값'), n('도구 값'), n('보고서 값(단위 맞춤)'), '단위', '보고서 파일', '제안 설정'], rc.units.map(function (a) {
      return h('tr', null, td(L.plantLabel(a.plant)), td(a.kindLabel), td(a.label), td(a.month + '월(' + a.period + ')'), td(a.field),
        td(fmt(a.report), 'num'), td(fmt(a.tool), 'num'), td(fmt(a.reportConv), 'num'), td(L.factorLabel(a.factor) + (a.unitSource === 'auto' ? ' (자동으로 찾음)' : ' (설정)')),
        td(a.file + (a.sheet ? ' [' + a.sheet + ']' : '')), td(a.suggest ? h('code', null, a.suggest) : ''));
    }), { cls: 'wide', empty: '단위가 다른 칸이 없습니다.' }));
    wrap.appendChild(h('details', null, h('summary', null, '참고 — 대분류·고객사 줄 차이 ' + rc.infos.length + '건'),
      table(head, rowsOf(rc.infos, '참고'), { cls: 'wide', empty: '없습니다.' })));
    return wrap;
  }

  // ── 라우터 ───────────────────────────────────────────────
  function render() {
    cachedRes = null;
    var hash = location.hash || '#/data';
    var segs = hash.replace(/^#\//, '').split('/');
    var route = segs[0] || 'data';
    var views = {
      data: viewData, settings: viewSettings,
      raw: function () { return viewKind('raw'); }, semi: function () { return viewKind('semi'); }, product: function () { return viewKind('product'); },
      cause: function () { return viewCause(segs[1] === 'product' ? 'product' : segs[1] === 'semi' ? 'semi' : 'raw'); },
      targets: viewTargets, unmatched: viewUnmatched, recon: viewRecon
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
