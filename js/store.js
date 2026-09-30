/* 브라우저 저장소 — localStorage 를 쓰되, 막혀 있거나 가득 차면 메모리로만 동작합니다 */
(function (root) {
  'use strict';
  var PREFIX = 'data09-05.';
  var memory = {};
  var ok = true;
  function get(k) {
    try { var v = root.localStorage.getItem(PREFIX + k); return v == null && memory[k] != null ? memory[k] : v; }
    catch (e) { ok = false; return memory[k] == null ? null : memory[k]; }
  }
  function set(k, v) {
    memory[k] = v;
    try { root.localStorage.setItem(PREFIX + k, v); return true; }
    catch (e) { ok = false; return false; }
  }
  function del(k) {
    delete memory[k];
    try { root.localStorage.removeItem(PREFIX + k); } catch (e) { ok = false; }
  }
  function getJson(k, fallback) {
    var raw = get(k);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  root.InvStore = {
    // 기준 설정
    getSettings: function (defaults) {
      var s = getJson('settings', {});
      var out = {};
      Object.keys(defaults).forEach(function (k) { out[k] = s[k] == null ? defaults[k] : s[k]; });
      return out;
    },
    setSettings: function (s) { return set('settings', JSON.stringify(s)); },
    // 저장된 그대로(예전 일 단위 키 포함) — 개월 단위로 자동 변환할 때 씁니다
    getSettingsRaw: function () { return getJson('settings', null); },
    // 증감 원인 메모·AI 해설 — 기준일·공장 보기별로 따로 { raw: { 대분류: { memo, ai } }, product: {...} }
    // 불용 확정 품목 { raw: { 품번: true }, product: {...} } — 관련부서 확정 후 담당자가 체크
    getDead: function () { return getJson('dead', {}); },
    setDead: function (d) { return set('dead', JSON.stringify(d)); },
    getMemos: function (key) { return getJson('memo.' + key, {}); },
    setMemos: function (key, m) { return set('memo.' + key, JSON.stringify(m)); },
    // 자료 종류별 컬럼 짝 — 다음 달 파일에도 그대로 씁니다
    getMapping: function (defKey) { return getJson('map.' + defKey, null); },
    setMapping: function (defKey, m) { return set('map.' + defKey, JSON.stringify(m)); },
    // 올린 자료(짝지은 뒤의 레코드). 자리마다 { parts: [파일별 자료] }
    getData: function () { return getJson('data', {}); },
    setData: function (d) { return set('data', JSON.stringify(d)); },
    clearData: function () { del('data'); del('sales'); del('receipts'); },
    // 판매현황(출고) 파일별 요약 [{ fileName, … , byCode }] — 커서 자료와 따로 저장합니다(가득 차도 재고 자료는 남게)
    getSales: function () { return getJson('sales', []); },
    setSales: function (list) { return set('sales', JSON.stringify(list)); },
    // 구매현황(입고) 파일별 읽은 결과 [{ fileName, …, rows }] — 판매현황처럼 따로 저장(10차)
    getReceipts: function () { return getJson('receipts', []); },
    setReceipts: function (list) { return set('receipts', JSON.stringify(list)); },
    // 보고서 대조 차이 중 「확인함」으로 표시한 것 { 키: true }
    getReconAck: function () { return getJson('reconAck', {}); },
    setReconAck: function (a) { return set('reconAck', JSON.stringify(a)); },
    clearAll: function () {
      ['data', 'sales', 'receipts', 'reconAck', 'settings', 'map.rawStock', 'map.semiStock', 'map.productStock', 'map.inbound', 'map.outbound', 'map.price', 'map.receipt'].forEach(del);
    },
    available: function () { get('settings'); return ok; }
  };
})(window);
