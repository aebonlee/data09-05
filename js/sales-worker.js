/*
 * 판매현황(출고)·구매현황(입고) 파일 읽기 전용 작업자 스레드 — 파일이 커서(4~9MB × 22개) 화면이 멈추지 않도록 여기서 읽습니다.
 * 온라인 주소(https)나 간이 서버(http)로 열었을 때만 씁니다. index.html 을 파일로(file://) 열면 브라우저가
 * 작업자 스레드를 막으므로 화면 쪽(app.js)이 파일 사이사이 쉬어 가며 직접 읽습니다.
 */
/* global importScripts, XLSX, InvLogic */
importScripts('../vendor/xlsx.full.min.js', 'logic.js');
self.onmessage = function (e) {
  var d = e.data;
  var t = Date.now();
  try {
    // kind = 'receipt' 이면 구매현황(입고) 파일(10차), 아니면 판매현황
    var f = (d.kind === 'receipt' ? InvLogic.readReceiptWorkbook : InvLogic.readSalesWorkbook)(XLSX, new Uint8Array(d.buf), d.name, d.saved);
    f.readMs = Date.now() - t;
    self.postMessage({ id: d.id, ok: true, file: f });
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) });
  }
};
