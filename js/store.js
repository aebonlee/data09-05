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
    // 자료 종류별 컬럼 짝 — 다음 달 파일에도 그대로 씁니다
    getMapping: function (defKey) { return getJson('map.' + defKey, null); },
    setMapping: function (defKey, m) { return set('map.' + defKey, JSON.stringify(m)); },
    // 올린 자료(짝지은 뒤의 레코드)
    getData: function () { return getJson('data', {}); },
    setData: function (d) { return set('data', JSON.stringify(d)); },
    clearData: function () { del('data'); },
    clearAll: function () {
      ['data', 'settings', 'map.rawStock', 'map.productStock', 'map.inbound', 'map.outbound', 'map.price'].forEach(del);
    },
    available: function () { get('settings'); return ok; }
  };
})(window);
