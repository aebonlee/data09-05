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
 // 「=」로 시작하는 후보는 이름이 똑같을 때만 짝짓습니다(「합계」가 「합계금액」에 잡히지 않게 — 본사 7월 제품 시트의 수량 칸 이름이 「합계」)
    stockQty: ['재고수량', '수량', '=합계', '기말재고수량', '당월재고수량', '현재고', '기말재고', '당월재고', '기말수량', '재고량', '재고', 'qty', 'quantity', 'stock'],
    stockAmt: ['금액(재고수량*입고단가)', '재고금액', '기말재고금액', '당월재고금액', '기말금액', '합계금액', '금액', 'amount'],
    prodAmt: ['재고*완제품단가', '합계금액', '금액(재고수량*입고단가)', '재고금액', '기말재고금액', '당월재고금액', '기말금액', '금액', 'amount'],
    stockPrice: ['입고단가', '재고단가', '단가', '평균단가', '이동평균단가', 'unitprice', 'price'],
    prodPrice: ['완제품단가', '재고단가', '단가', '입고단가', 'unitprice', 'price'],
    // 반제품(2026-09-29 3차): 실데이터 금액 칸 — 인천 본사 반제품 시트는 「합계금액」, 대구는 「재고*반제품단가」가
    // 보고용 「반제품」 요약표의 금액과 같습니다(로컬 대조). 「재고*완제품단가」는 완제품 단가로 잰 값이라 쓰지 않습니다.
    semiAmt: ['합계금액', '재고*반제품단가', '금액(재고수량*입고단가)', '재고금액', '기말재고금액', '당월재고금액', '기말금액', 'amount'],
    semiPrice: ['반제품단가', '재고단가', '단가', '입고단가', 'unitprice', 'price'],
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
    semiStock: {
      label: '반제품 월말 재고',
      fields: [
        { key: 'code', label: '반제품코드', required: true, syn: ['품목코드', '품번', '반제품코드', '제품코드', '코드', '행 레이블', 'itemcode', 'partno', 'code'] },
        { key: 'name', label: '품명', required: false, syn: ['품목명', '품명', '제품명', 'name'] },
        { key: 'group', label: '고객사', required: true, syn: ['고객사', '거래처', '고객', '고객명', '납품처', 'customer'] },
        { key: 'qty', label: '재고수량', required: true, syn: COL.stockQty },
        { key: 'amount', label: '재고금액(파일에 있으면)', required: false, syn: COL.semiAmt },
        { key: 'price', label: '재고단가(파일에 있으면)', required: false, syn: COL.semiPrice },
        { key: 'inQty', label: '당월 입고수량(파일에 있으면)', required: false, syn: COL.inQty },
        { key: 'outQty', label: '당월 출고수량(파일에 있으면)', required: false, syn: COL.outQty },
        { key: 'agingFile', label: '재고 경과 개월(파일에 있으면 — 재고잔량 등)', required: false, syn: COL.aging },
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
        // 「판매일자」: 2026-09-29 받은 판매현황(ERP 판매현황내역) 22개 파일의 출고일 칸 — 「주문일자」보다 먼저 잡히도록 「일자」 앞에 둡니다
        { key: 'date', label: '출고일(최근 출고일)', required: true, syn: ['최근출고일', '최종출고일', '마지막출고일', '판매일자', '출고일', '출고일자', '납품일자', '사용일', '불출일', '일자', '날짜', 'date'] },
        { key: 'qty', label: '출고수량', required: false, syn: ['출고수량', '판매수량', '사용수량', '불출수량', '수량', 'qty'] },
        // 거래처(9차): 판매현황의 「거래처명」 — 중국공장 판매를 가려 원자재 Aging 에 씁니다(기준 설정 「중국공장 거래처」)
        { key: 'customer', label: '거래처(있으면 — 중국공장 판매 구분)', required: false, syn: ['거래처명', '거래처', '거래처코드', '납품처', '판매처', '고객사', '고객명', 'customer'] },
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
  var NO_PLANT = '';
  var STOCK_SLOT = /^(raw|semi|prod)(Cur|Prev)$/;   // 재고 자리(공장별로 거르는 자리)   // 공장을 지정하지 않은 자료(예전 자료·예시 이력). 화면에는 「공장 미지정」

  // 올리는 자리(슬롯) 7개 — 원자재·제품 × 당월·전월, 입고·출고 이력, 단가표.
  // 자리마다 파일을 여러 개(공장별로) 올릴 수 있습니다.
  var SLOTS = [
    { id: 'rawCur', def: 'rawStock', label: '원자재 재고 — 당월' },
    { id: 'rawPrev', def: 'rawStock', label: '원자재 재고 — 전월' },
    { id: 'semiCur', def: 'semiStock', label: '반제품 재고 — 당월' },
    { id: 'semiPrev', def: 'semiStock', label: '반제품 재고 — 전월' },
    { id: 'prodCur', def: 'productStock', label: '제품 재고 — 당월' },
    { id: 'prodPrev', def: 'productStock', label: '제품 재고 — 전월' },
    { id: 'inbound', def: 'inbound', label: '입고 이력' },
    { id: 'outbound', def: 'outbound', label: '출고현황 · 출고 이력' },
    { id: 'price', def: 'price', label: '단가표 · 품목 기준정보' }
  ];

  var RECON_UNITS_DEFAULT = '총괄 금액=백만원\n* 금액=원';
  // 기준값의 처음 값. 회사 기준을 받기 전 「예시 값」입니다(기획서 10장 4·9번).
  // Aging 은 2026-09-29 요청으로 「일」이 아니라 「개월」 단위입니다. 처음 값 3·6·12개월은
  // 예전 일 단위 예시 값 90·180·365일을 월로 환산한 것입니다(daysToMonths).
  function defaultSettings() {
    return {
      curDate: '',          // 당월 기준일(월말). 비우면 분석 불가
      prevDate: '',         // 전월 기준일. 비우면 당월 기준일의 전월 말일
      // 판정 체계(2026-09-29 수강생 답변): 세부는 Aging 으로 「정상 / 장기재고」, 총괄은 「정상 / 불용」 2단계.
      // 불용은 관련부서 확정 후 판정하므로 도구가 정하지 않고, 품목마다 사람이 「불용 확정」을 체크합니다.
      // 2026-09-29 3차 답변: 원자재는 12개월 「초과」(이상 아님), 반제품·제품은 6개월 「이상」 — 둘 다 설정에서 바꿀 수 있습니다.
      longRawMonths: 12,    // 원자재 장기재고 기준 개월 (향후 24로 바꿀 예정)
      longRawOp: 'gt',      // gt = 기준 개월 「초과」, ge = 「이상」
      longProdMonths: 6,    // 반제품·제품 장기재고 기준 개월
      longProdOp: 'ge',
      agingMaxMonths: 36,   // 개월별 분포를 몇 개월까지 한 칸씩 보일지 — 넘는 것은 「N개월 초과」 한 칸 (1~36, 3차 답변으로 처음 값 36)
      // Aging 경로: out = 최근 출고일 기준(판매현황·출고 이력) → 없으면 재고잔량분석 칸 → (설정 시) 입고일
      //            file = 예전 경로(재고잔량분석 칸 먼저, 없으면 최근 출고일)
      agingPath: 'out',
      // 판매현황 최근 출고일을 적용할 대상: prod = 반제품·제품만(처음 값), all = 원자재까지.
      // 원자재는 생산에 투입(자재 출고)되지 판매되지 않아, 판매현황에는 유상사급 판매분만 나옵니다. 실데이터 대조에서
      // 재고잔량분석 칸이 0개월인 원자재가 판매 기준으로는 1년 넘게로 잡히는 경우가 많아 처음 값은 반제품·제품만입니다(기획서 11.8).
      salesScope: 'prod',
      // 원자재 = 중국공장 판매(2026-09-30 오후 답변 1): 「원자재 투입은 한국생산이 줄어 중국공장 판매로 봐도 무방, 생산투입현황은
      // BOM 구성이 맞지 않아 신뢰성이 떨어짐」 → 자재 출고(생산 투입) 내역은 쓰지 않고, 판매현황 중 거래처가 중국공장인 줄의
      // 최근 판매일로 원자재 Aging 을 셉니다. 판매현황에는 공장·국가 칸이 없고 「거래처명」만 있어, 어느 거래처가 중국공장인지
      // 아래 chinaCustomers 에 적어야 켜집니다(처음 값 빈칸 = 꺼짐과 같음). salesScope 가 all 이면 원자재도 전체 판매를 씁니다.
      rawChinaSales: 'on',  // on = 중국공장 거래처를 적어 두면 원자재에 그 판매만 씀(처음 값), off = 쓰지 않음
      chinaCustomers: '',   // 중국공장으로 볼 거래처명·거래처코드 — 한 줄(또는 쉼표)에 하나, 「*」는 아무 글자
      reconTolerance: 1,    // 보고서 대조: 이 금액(원) 이하 차이는 알람 없음(수량은 0.5 — 보고서 수량이 정수로 표시돼 소수 수량 반올림 차이는 뺌)
      plantAlias: '',       // 보고서 구역 이름 → 공장 (한 줄에 「구역이름=대구」). 회사 고유 이름이라 처음 값은 비워 둡니다
      // 보고서 칸 단위(2026-09-30 답변 「단위가 다릅니다」): 보고서 값이 도구(원) 값과 단위가 다른 칸을 적습니다.
      // 한 줄에 「대구 반제품 7월 금액=×10」(보고서 = 도구 × 10) 또는 「인천 * 금액=천원」(보고서가 천원 단위).
      // 적지 않아도 정확히 10·100·1000…배(또는 그 역수) 차이는 「단위 차이」로 따로 보이고 알람에는 올리지 않습니다.
      // 2026-09-30 오후 답변 3: 「총괄현황 SHEET 은 백만원, 나머지 SHEET 는 원 단위」 → 처음 값으로 확정.
      // 「총괄 …」 줄은 총괄(현황) 시트에만, 나머지 줄은 원자재·반제품·제품 시트에만 적용됩니다.
      // 「* 금액=원」 으로 단위를 확정한 칸은 10배 차이를 자동으로 「단위 차이」로 돌리지 않고 알람(자릿수 입력 오류 의심)으로 올립니다.
      reconUnits: RECON_UNITS_DEFAULT,
      overEnabled: '',      // 과잉 구간 쓰기(기본 끔). 'on' 이면 경과 개월이 overMonths 를 넘고 장기재고 미만인 품목을 「과잉」
      overMonths: 6,
      noOutPolicy: 'inbound', // 출고 이력 없는 품목: inbound=입고일로 대신, none=판정 보류
      amountSource: 'file',   // file=재고 파일 금액 우선(없으면 단가표), price=단가표 우선 — 실데이터 재고 파일에 금액 칸이 있어 file 이 기본
      topN: 10,             // 금액 증가 상위 N건
      turnoverMax: '',      // 회전율이 이 값 미만이면 저회전(비우면 적용 안 함)
      causeTopN: 5,         // 증감 원인 — 대분류마다 기여 상위 몇 품목을 보일지
      // 원자재 대분류 묶음표 — ERP 대분류 코드(HSG·TML …)를 보고서 대분류(하우징류·터미널류 …)로 묶습니다.
      // 실데이터 본사 「원자재」 요약 시트와 같은 값이 나오는 짝을 처음 값으로 넣었습니다(기획서 11장 확인 목록).
      // 두 공장 공통 하나(2026-09-29 답변: 대구·인천 통일). 인천 요약표 기준으로 클립류·스위치를 따로 두고,
      // 파크라케이블(CI184)은 인천공장 품목만(답변 3번).
      groupMap: 'HSG=하우징류\nSEAL=씰류\nTML=터미널류\nTUBE=튜브류\nWIRE=와이어류\nCLIP=클립류\nSWITCH=스위치\n인천:품번:CI184-*=파크라케이블(CI184)',
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
    // 예전 Aging 구간 경계(90·180·365일 또는 3·6·12개월)는 이제 쓰지 않습니다 — 개월별 분포(0·1·2…개월)로 보입니다.
    if (saved.agingBounds != null || saved.agingMonths != null) migrated = true;
    // 예전 불용 기준(일 또는 개월)은 원자재 장기재고 기준으로 옮기지 않습니다(판정 체계가 바뀜 — 기본 12개월 이상).
    if (saved.overMonths == null && saved.overDays != null && saved.overDays !== '' && isFinite(Number(saved.overDays))) { out.overMonths = daysToMonths(saved.overDays); migrated = true; }
    if (saved.deadDays != null || saved.deadMonths != null) migrated = true;
    // 3차(2026-09-29 저녁): 원자재 장기재고가 「이상」→「초과」로, 개월별 분포 처음 값이 12 → 36 으로 바뀌었습니다.
    // 기준 방식(longRawOp)이 저장돼 있지 않은 예전 설정이면: 원자재는 새 기본(초과)을 쓰고, 분포 최대가 예전 처음 값 12 그대로면 36 으로 올립니다.
    var round3 = false;
    if (saved.longRawOp == null && Object.keys(saved).length) {
      round3 = true;
      if (saved.agingMaxMonths == null || Number(saved.agingMaxMonths) === 12) out.agingMaxMonths = defaults.agingMaxMonths;
    }
    // 9차(2026-09-30 오후): 보고서 칸 단위 처음 값이 빈칸 → 「총괄 금액=백만원 / * 금액=원」. 중국공장 칸(chinaCustomers)이 없는
    // 예전 설정에서, 칸 단위를 비워 두었으면 새 처음 값을 넣고, 직접 적어 둔 줄이 있으면 그대로 두고 알립니다.
    var round9 = '';
    if (saved.chinaCustomers == null && Object.keys(saved).length) {
      if (saved.reconUnits == null || String(saved.reconUnits).trim() === '') { out.reconUnits = defaults.reconUnits; round9 = 'set'; }
      else round9 = 'kept';
    }
    return { settings: out, migrated: migrated, round3: round3, round9: round9 };
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
  // 「12 개월초과」처럼 정확한 개월 수를 모르고 「그보다 많다」만 아는 값인지
  function isOpenAging(v) { return v != null && typeof v !== 'number' && /초과\s*$/.test(String(v)); }
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
          var exactOnly = f.syn[s].charAt(0) === '=';
          if (exactOnly && !exact) continue;
          var target = normHeader(exactOnly ? f.syn[s].slice(1) : f.syn[s]);
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
  //   「원자재」처럼 달이 없는 요약 시트보다 달이 맞는 시트가 앞섭니다. 반제품은 제품으로 보지 않고, 반제품 자리는 「반제품」 시트만(「반제품 단가변동」 제외).
  // month: 이 자리의 달(1~12, 모르면 null). 돌려주는 값: { name, sure }
  function guessSheet(names, slotId, month) {
    var raw = /^raw/.test(slotId), semi = /^semi/.test(slotId);
    var best = null, bestScore = -1;
    (names || []).forEach(function (n, i) {
      var t = String(n).replace(/\s+/g, '');
      var sc = 0;
      if (raw ? /원자재|자재|원재료/.test(t) : semi ? /반제품/.test(t) && !/단가/.test(t) : (/제품/.test(t) && !/반제품/.test(t))) sc += 2;
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
        else if (f.key === 'agingFile') { rec.agingFile = parseAgingMonths(v); rec.agingFileOpen = rec.agingFile != null && isOpenAging(v); rec.agingFileText = v == null ? '' : String(v).trim(); }
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
      var stock = STOCK_SLOT.test(k);
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
      if (!m) { m = map[r.code] = { code: r.code, name: r.name || '', group: r.group || '', qty: 0, fileAmount: null, inQty: null, outQty: null, agingFile: null, agingFileOpen: false, agingFileText: '', plants: [] }; order.push(r.code); }
      if (!m.name && r.name) m.name = r.name;
      if ((!m.group || m.group === '(분류 없음)') && r.group) m.group = r.group;
      m.qty += r.qty || 0;
      var amt = r.amount != null ? r.amount : (r.price != null && r.qty != null ? round(r.qty * r.price, 2) : null);
      if (amt != null) m.fileAmount = round((m.fileAmount || 0) + amt, 2);
      if (r.inQty != null) m.inQty = (m.inQty || 0) + r.inQty;
      if (r.outQty != null) m.outQty = (m.outQty || 0) + r.outQty;
      if (r.plant && m.plants.indexOf(r.plant) < 0) m.plants.push(r.plant);
      // 여러 줄이면 가장 오래된(큰) 경과 개월
      if (r.agingFile != null && (m.agingFile == null || r.agingFile > m.agingFile)) { m.agingFile = r.agingFile; m.agingFileOpen = !!r.agingFileOpen; m.agingFileText = r.agingFileText; }
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

  // Aging 분포(개월): 실제 경과 개월 0·1·2 … max 를 한 칸씩, max 를 넘으면 「max개월 초과」 한 칸(3차 답변: max 처음 값 36).
  // open=true 는 파일의 「12 개월초과」처럼 「그보다 많다」만 아는 값입니다(months = 13 으로 읽음).
  //   max 가 12 이상이면 정확한 칸에 넣을 수 없어 「12개월 초과(개월 미상)」 칸을 따로 둡니다.
  function overLabel(max) { return max + '개월 초과'; }
  function openLabel(months) { return (months - 1) + '개월 초과(개월 미상)'; }
  function bucketOf(months, max, open) {
    if (months == null) return '날짜 없음';
    if (open && months - 1 < max) return openLabel(months);
    return months <= max ? months + '개월' : overLabel(max);
  }
  function bucketLabels(max) {
    var out = [];
    for (var m = 0; m <= max; m++) out.push(m + '개월');
    out.push(overLabel(max));
    out.push('날짜 없음');
    return out;
  }
  // 장기재고 판정: op = 'gt'(기준 개월 초과) 또는 'ge'(이상). 3차 답변 — 원자재 12개월 초과, 반제품·제품 6개월 이상
  function isLong(months, longMonths, op) {
    if (months == null || longMonths == null) return false;
    return op === 'gt' ? months > longMonths : months >= longMonths;
  }
  function longLabel(longMonths, op) { return longMonths + '개월 ' + (op === 'gt' ? '초과' : '이상'); }
  // 판정: 장기재고 기준(초과/이상), 과잉은 켰을 때만(넘으면)
  function fitnessOf(months, longMonths, overMonths, op) {
    if (months == null) return '판정 보류';
    if (isLong(months, longMonths, op || 'ge')) return '장기재고';
    if (overMonths != null && months > overMonths) return '과잉';
    return '정상';
  }
  function isInt(n, min, max) { return n != null && !isNaN(n) && Math.floor(n) === n && n >= min && (max == null || n <= max); }

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
      // 「인천:품번:CI184-*=…」처럼 앞에 공장을 붙이면 그 공장 품목에만 씁니다
      var cm = key.match(/^(?:([^:：]+)\s*[:：]\s*)?품번\s*[:：]\s*(.+)$/);
      if (cm) out.byCode.push({ plant: cm[1] ? normalizePlant(cm[1]) : '', prefix: cm[2].replace(/\*$/, '').trim().toUpperCase(), name: name });
      else out.byGroup[key.toUpperCase()] = name;
      out.count++;
    });
    return out;
  }
  // 품목 하나의 보고서 대분류. 묶음표가 비어 있으면 적힌 그대로 둡니다.
  // plants: 그 품목이 있는 공장들(공장을 붙인 품번 규칙에 씀)
  function mapGroup(group, code, gm, others, plants) {
    if (!gm || !gm.count) return group;
    var c = String(code || '').toUpperCase();
    for (var i = 0; i < gm.byCode.length; i++) {
      var r = gm.byCode[i];
      if (c.indexOf(r.prefix) === 0 && (!r.plant || (plants || []).indexOf(r.plant) >= 0)) return r.name;
    }
    var g = String(group || '').trim().toUpperCase();
    if (gm.byGroup[g]) return gm.byGroup[g];
    // 이미 보고서 대분류 이름이면(예: 예시 데이터) 그대로
    var names = Object.keys(gm.byGroup).map(function (k) { return gm.byGroup[k]; }).concat(gm.byCode.map(function (x) { return x.name; }));
    if (names.indexOf(String(group || '').trim()) >= 0) return String(group).trim();
    return others === 'keep' ? (group || '(분류 없음)') : '기타';
  }

  // 보고서 구역 이름 → 공장. 한 줄에 「구역이름=대구」. 공장은 인천·대구만
  function parsePlantAlias(text) {
    var out = { map: {}, errors: [] };
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line, i) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') return;
      var eq = t.lastIndexOf('=');
      var p = eq > 0 ? normalizePlant(t.slice(eq + 1)) : '';
      if (eq <= 0 || !isPlant(p)) { out.errors.push((i + 1) + '번째 줄은 「구역이름=인천」 또는 「구역이름=대구」 형식이어야 합니다.'); return; }
      out.map[normHeader(t.slice(0, eq))] = p;
    });
    return out;
  }
  // 보고서 칸 단위 설정 읽기. 왼쪽 = 공장·구분·달·항목(빠진 것은 모두), 오른쪽 = 배수(보고서 값 ÷ 도구 값).
  //   「×10」「10배」「10」 → 10 (보고서가 10배 크게 적힘)
  //   「원」「10원」「100원」「천원」「만원」「백만원」 → 보고서 금액의 단위 → 배수 1 · 0.1 · 0.01 · 0.001 · 0.0001 · 0.000001
  var UNIT_WORDS = { '원': 1, '10원': 10, '십원': 10, '100원': 100, '백원': 100, '천원': 1000, '1000원': 1000, '만원': 10000, '백만원': 1000000 };
  function parseUnitFactor(v) {
    var t = String(v == null ? '' : v).replace(/\s+/g, '').replace(/,/g, '');
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(UNIT_WORDS, t)) return 1 / UNIT_WORDS[t];
    var m = t.match(/^(?:[x×*])?(\d+(?:\.\d+)?)배?$/i) || t.match(/^[÷\/](\d+(?:\.\d+)?)$/);
    if (!m) return null;
    var f = Number(m[1]);
    if (!(f > 0)) return null;
    return /^[÷\/]/.test(t) ? 1 / f : f;
  }
  function parseReconUnits(text) {
    var out = { rules: [], errors: [] };
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line, i) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') return;
      var eq = t.lastIndexOf('=');
      var f = eq > 0 ? parseUnitFactor(t.slice(eq + 1)) : null;
      if (eq <= 0 || f == null) { out.errors.push((i + 1) + '번째 줄은 「대구 반제품 7월 금액=×10」 또는 「인천 * 금액=천원」 형식이어야 합니다.'); return; }
      var rule = { sheet: '', plant: '', kind: '', month: null, field: '', factor: f, line: t };
      var bad = '';
      t.slice(0, eq).split(/[\s|,·]+/).forEach(function (w) {
        if (!w || w === '*' || w === '전체' || w === '모두') return;
        var mo = w.match(/^(\d{1,2})월$/);
        if (mo && +mo[1] >= 1 && +mo[1] <= 12) rule.month = +mo[1];
        else if (SUMMARY_SHEET.test(w)) rule.sheet = 'summary';
        else if (w === '자재') rule.kind = 'raw';
        else if (REPORT_KIND[w]) rule.kind = REPORT_KIND[w];
        else if (w === '금액' || w === '수량') rule.field = w;
        else if (isPlant(normalizePlant(w))) rule.plant = normalizePlant(w);
        else bad = bad || w;
      });
      if (bad) { out.errors.push((i + 1) + '번째 줄의 「' + bad + '」를 알 수 없습니다(총괄·공장·원자재/반제품/제품·N월·금액/수량).'); return; }
      out.rules.push(rule);
    });
    return out;
  }
  // 칸에 맞는 단위 규칙 — 조건을 더 많이 적은 줄이 먼저, 같으면 뒤에 적은 줄.
  // sheet: 'summary' = 총괄(현황) 시트 칸 → 「총괄」을 적은 줄만, '' = 원자재·반제품·제품 시트 칸 → 「총괄」이 없는 줄만 적용합니다
  // (9차 답변: 총괄은 백만원, 나머지는 원 — 「* 금액=원」 이 총괄 칸까지 덮지 않도록 두 묶음을 나눴습니다).
  function unitRuleFor(rules, plant, kind, month, field, sheet) {
    var best = null, bestN = -1;
    (rules || []).forEach(function (r) {
      if ((r.sheet || '') !== (sheet || '')) return;
      if ((r.plant && r.plant !== plant) || (r.kind && r.kind !== kind) || (r.month && r.month !== month) || (r.field && r.field !== field)) return;
      var n = (r.plant ? 1 : 0) + (r.kind ? 1 : 0) + (r.month ? 1 : 0) + (r.field ? 1 : 0);
      if (n >= bestN) { best = r; bestN = n; }
    });
    return best;
  }
  // 배수 표시: 10 → 「×10」, 0.001 → 「÷1,000(천원 단위)」
  function factorLabel(f) {
    if (f >= 1) return '×' + String(round(f, 6)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var inv = round(1 / f, 6);
    var word = Object.keys(UNIT_WORDS).filter(function (k) { return UNIT_WORDS[k] === inv && !/^\d/.test(k); })[0];
    return '÷' + String(inv).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (word ? '(' + word + ' 단위)' : '');
  }
  // 보고서 값이 도구 값의 정확히 10의 거듭제곱 배(×10 ~ ×1,000,000 또는 그 역수)인지 — 반올림 오차(보고서 단위의 절반)까지 허용
  var UNIT_FACTORS = [10, 100, 1000, 10000, 100000, 1000000, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001];
  // 보고서 값 → 도구 단위(원·개). 배수가 1보다 작으면(천원·백만원) 역수를 곱합니다(0.5 ÷ 0.000001 같은 나눗셈 오차를 피함)
  function unitToTool(report, f) { return f < 1 ? round(report * Math.round(1 / f), 6) : report / f; }
  // 보고서 단위의 절반(반올림 오차 한도): 백만원 → 500,000원, 천원 → 500원, ×10 → 0.05
  function halfUnit(f) { return f < 1 ? Math.round(1 / f) / 2 : 0.5 / f; }
  function detectUnitFactor(report, tool, tol) {
    if (report == null || tool == null || !report || !tool || (report > 0) !== (tool > 0)) return null;
    // 여러 배수가 반 단위 안에 들면(값이 아주 작을 때) 바꾼 값이 도구 값에 가장 가까운 배수를 고릅니다
    var best = null, bestD = Infinity;
    for (var i = 0; i < UNIT_FACTORS.length; i++) {
      var f = UNIT_FACTORS[i], d = Math.abs(unitToTool(report, f) - tool);
      if (d <= Math.max(tol, halfUnit(f)) + 1e-6 && d < bestD) { best = f; bestD = d; }
    }
    return best;
  }
  function checkSettings(s) {
    var errors = [];
    var cur = parseDate(s.curDate);
    if (!cur) errors.push('당월 기준일을 입력해 주세요.');
    var prev = s.prevDate ? parseDate(s.prevDate) : (cur ? prevMonthEnd(cur) : null);
    if (s.prevDate && !prev) errors.push('전월 기준일 형식이 올바르지 않습니다.');
    if (cur && prev && prev >= cur) errors.push('전월 기준일은 당월 기준일보다 앞이어야 합니다.');
    var longRaw = toNumber(s.longRawMonths), longProd = toNumber(s.longProdMonths), maxM = toNumber(s.agingMaxMonths);
    var overOn = s.overEnabled === 'on' || s.overEnabled === true;
    var over = toNumber(s.overMonths);
    if (!isInt(longRaw, 1)) errors.push('원자재 장기재고 기준 개월을 1 이상 정수로 입력해 주세요.');
    if (!isInt(longProd, 1)) errors.push('반제품·제품 장기재고 기준 개월을 1 이상 정수로 입력해 주세요.');
    var tol = s.reconTolerance == null || s.reconTolerance === '' ? 1 : toNumber(s.reconTolerance);
    if (tol == null || isNaN(tol) || tol < 0) errors.push('보고서 대조 허용 차이를 0 이상 숫자로 입력해 주세요.');
    var alias = parsePlantAlias(s.plantAlias);
    if (alias.errors.length) errors.push('보고서 구역 이름 ' + alias.errors[0]);
    var units = parseReconUnits(s.reconUnits);
    if (units.errors.length) errors.push('보고서 칸 단위 ' + units.errors[0]);
    if (!isInt(maxM, 1, 36)) errors.push('개월별 분포 최대 개월은 1~36 사이 정수로 입력해 주세요.');
    if (overOn && !isInt(over, 0)) errors.push('과잉 기준 개월을 0 이상 정수로 입력해 주세요.');
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
      cur: cur, prev: prev, agingMax: maxM, longRaw: longRaw, longProd: longProd,
      longRawOp: s.longRawOp === 'ge' ? 'ge' : 'gt', longProdOp: s.longProdOp === 'gt' ? 'gt' : 'ge',
      agingPath: s.agingPath === 'file' ? 'file' : 'out', salesScope: s.salesScope === 'all' ? 'all' : 'prod',
      reconTolerance: tol, plantAlias: alias.map, reconUnits: units.rules,
      rawChinaSales: s.rawChinaSales === 'off' ? 'off' : 'on', chinaRules: parseChinaCustomers(s.chinaCustomers),
      overMonths: overOn ? over : null, topN: topN, turnoverMax: tm, causeTopN: ctn,
      groupMap: gm, groupOthers: s.groupOthers === 'keep' ? 'keep' : 'other',
      plantView: isPlant(pv) ? pv : '',
      noOutPolicy: s.noOutPolicy === 'none' ? 'none' : 'inbound',
      amountSource: s.amountSource === 'file' ? 'file' : 'price'
    };
  }

  // ── 한 종류(원자재·반제품·제품) 분석 ───────────────────────
  // ctx.kind: 'raw' | 'semi' | 'product'
  var KIND_LABEL = { raw: '원자재', semi: '반제품', product: '제품' };
  function laterDate(a, b) { return !a ? (b || '') : !b ? a : (a > b ? a : b); }
  function analyzeKind(curRecs, prevRecs, ctx) {
    var kind = ctx.kind, isRaw = kind === 'raw';
    var longM = isRaw ? ctx.longRaw : ctx.longProd, longOp = isRaw ? ctx.longRawOp : ctx.longProdOp;
    // 판매현황(출고) 최근 출고일을 이 종류에 쓰는지 — 설정 「판매현황 적용 대상」
    //  반제품·제품: 전체 판매. 원자재: 적용 대상이 「모두」면 전체 판매, 아니면 중국공장 거래처를 적어 두었을 때 그 판매만(9차 답변 1)
    var salesMode = !ctx.hasSales ? '' : (!isRaw || ctx.salesScope === 'all') ? 'all' : (ctx.china ? 'china' : '');
    var useSales = !!salesMode;
    var sLast = salesMode === 'china' ? ctx.china.last : ctx.lastSales, sQty = salesMode === 'china' ? ctx.china.qty : ctx.salesQty,
      sQtyPrev = salesMode === 'china' ? ctx.china.qtyPrev : ctx.salesQtyPrev;
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
      // 최근 출고일 = 출고 이력 자리와 판매현황 중 늦은 날짜(둘 다 기준일 이전만)
      var lastOutHist = ctx.lastOut[code] || '', lastSale = useSales ? (sLast[code] || '') : '';
      var lastOut = laterDate(lastOutHist, lastSale);
      var lastOutSource = !lastOut ? '' : (lastSale && lastOut === lastSale ? '판매현황' : '출고 이력');
      // Aging — 경과 개월(monthsBetween). 일수는 참고용으로 함께 둡니다.
      var dIn = lastIn ? parseDate(lastIn) : null, dOut = lastOut ? parseDate(lastOut) : null;
      var agingIn = dIn ? monthsBetween(dIn, ctx.cur) : null;
      var agingOut = dOut ? monthsBetween(dOut, ctx.cur) : null;
      var agingInDays = dIn ? daysBetween(dIn, ctx.cur) : null;
      var agingOutDays = dOut ? daysBetween(dOut, ctx.cur) : null;
      var agingFile = c && c.agingFile != null ? c.agingFile : null;
      var agingFileOpen = !!(c && c.agingFileOpen);
      // 표시 경로(설정 agingPath)
      //  out(처음 값): 최근 출고일 → (없으면) 재고 파일 경과 개월 칸(재고잔량분석) → (설정 시) 최근 입고일
      //  file(예전) : 재고 파일 경과 개월 칸 → 최근 출고일 → (설정 시) 최근 입고일
      function pick(path) {
        var order = path === 'file' ? ['file', 'out'] : ['out', 'file'];
        for (var i = 0; i < order.length; i++) {
          if (order[i] === 'out' && agingOut != null) return { m: agingOut, d: agingOutDays, basis: '출고일', open: false };
          if (order[i] === 'file' && agingFile != null) return { m: agingFile, d: null, basis: '파일 경과 개월', open: agingFileOpen };
        }
        if (ctx.noOutPolicy === 'inbound' && agingIn != null) return { m: agingIn, d: agingInDays, basis: '입고일 대체', open: false };
        return { m: null, d: null, basis: '없음', open: false };
      }
      var sh = pick(ctx.agingPath), alt = pick(ctx.agingPath === 'file' ? 'out' : 'file');
      // 당월 입고·출고 수량: 재고 파일에 칸이 있으면 그 값, 없으면 입·출고 이력(과 판매현황)에서 (전월 기준일, 당월 기준일] 합계
      var hasOutSrc = ctx.hasOutbound || useSales;
      var inQty = c && c.inQty != null ? c.inQty : (ctx.hasInbound ? ctx.inQty[code] || 0 : null);
      var outQty = c && c.outQty != null ? c.outQty : (hasOutSrc ? (ctx.outQty[code] || 0) + (useSales ? sQty[code] || 0 : 0) : null);
      var flowSource = (c && (c.inQty != null || c.outQty != null)) ? '재고 파일' : (ctx.hasInbound || hasOutSrc ? '입출고 이력' : '');
      if (inQty != null || outQty != null) hasFlow = true;
      var avg = (curQty + prevQty) / 2;
      var turnover = avg > 0 && outQty != null ? outQty / avg : null;
      var change = !p || prevQty === 0 ? (curQty === 0 ? '유지' : '신규') : (!c || curQty === 0 ? '소멸' : '유지');
      var groupRaw = (c && c.group && c.group !== '(분류 없음)' ? c.group : '') || (p && p.group && p.group !== '(분류 없음)' ? p.group : '') || ms.group || '';
      var group = isRaw ? mapGroup(groupRaw, code, ctx.groupMap, ctx.groupOthers, mergePlants(c, p)) : (groupRaw || '(분류 없음)');
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
        lastIn: lastIn, lastOut: lastOut, lastOutSource: lastOutSource, salesChina: salesMode === 'china' && lastOutSource === '판매현황', agingIn: agingIn, agingOut: agingOut,
        agingInDays: agingInDays, agingOutDays: agingOutDays, agingFile: agingFile, agingFileOpen: agingFileOpen, agingFileText: c ? c.agingFileText : '',
        agingShown: sh.m, agingShownOpen: sh.open, agingShownDays: sh.d, agingBasis: sh.basis,
        bucket: bucketOf(sh.m, ctx.agingMax, sh.open),
        fitness: curQty > 0 ? fitnessOf(sh.m, longM, ctx.overMonths, longOp) : '재고 없음',
        // 다른 경로로 계산했을 때(기준 비교용)
        agingAlt: alt.m, agingAltOpen: alt.open, agingAltBasis: alt.basis, bucketAlt: bucketOf(alt.m, ctx.agingMax, alt.open),
        fitnessAlt: curQty > 0 ? fitnessOf(alt.m, longM, ctx.overMonths, longOp) : '재고 없음',
        deadConfirmed: !!(ctx.dead && ctx.dead[kind] && ctx.dead[kind][code]),
        inQty: inQty, outQty: outQty, flowSource: flowSource,
        inQtyPrev: ctx.hasInbound ? ctx.inQtyPrev[code] || 0 : null,
        outQtyPrev: hasOutSrc ? (ctx.outQtyPrev[code] || 0) + (useSales ? sQtyPrev[code] || 0 : 0) : null,
        turnover: turnover == null ? null : round(turnover, 2)
      };
      decompose(it);
      return it;
    });
    var order = isRaw ? ctx.groupOrder : null;
    return {
      kind: kind, items: items, groups: groupSummary(items, order),
      buckets: bucketSummary(items, ctx.agingMax, longM, longOp, false),
      bucketsAlt: bucketSummary(items, ctx.agingMax, longM, longOp, true),
      fitness: fitnessSummary(items), overall: overallSummary(items),
      longMonths: longM, longOp: longOp, longText: longLabel(longM, longOp), useSales: useSales, salesMode: salesMode,
      cause: causeSummary(items, ctx.causeTopN, order), hasFlow: hasFlow
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
  // 개월별 분포 — 0·1·…·max 개월 + 「max개월 초과」 + (있으면) 「N개월 초과(개월 미상)」 + 날짜 없음.
  // long: 그 칸이 장기재고인가(초과/이상 규칙). alt=true 면 다른 경로(기준 비교용)로 계산한 칸으로 셉니다.
  // tick: 그래프 눈금 글자
  function bucketSummary(items, max, longMonths, longOp, alt) {
    var labels = bucketLabels(max);
    var map = {};
    labels.forEach(function (l, i) {
      var month = i <= max + 1 ? i : null;
      map[l] = { bucket: l, month: month, open: false, tick: month == null ? '' : (i === max + 1 ? '>' + max : String(i)), count: 0, qty: 0, amount: 0,
        long: month != null && (i === max + 1 ? isLong(max + 1, longMonths, longOp) : isLong(i, longMonths, longOp)) };
    });
    var opens = [];
    items.forEach(function (it) {
      if (it.curQty === 0) return;
      var label = alt ? it.bucketAlt : it.bucket;
      var b = map[label];
      if (!b) {
        // 「12개월 초과(개월 미상)」 — 최소 개월(13)로 장기재고를 판정합니다(13 > 12 이므로 「12개월 초과」 규칙에 듭니다)
        var m = alt ? it.agingAlt : it.agingShown;
        b = map[label] = { bucket: label, month: m - 0.5, open: true, tick: '>' + (m - 1) + '?', count: 0, qty: 0, amount: 0, long: isLong(m, longMonths, longOp) };
        opens.push(label);
      }
      b.count++; b.qty += it.curQty; b.amount += it.curAmt || 0;
    });
    var all = labels.concat(opens).map(function (l) { map[l].amount = round(map[l].amount, 2); map[l].qty = round(map[l].qty, 4); return map[l]; });
    // 개월 순서(미상 칸은 그 최소 개월 바로 앞), 날짜 없음은 맨 뒤
    return all.sort(function (x, y) { return (x.month == null ? 1e9 : x.month) - (y.month == null ? 1e9 : y.month); });
  }
  function fitnessSummary(items) {
    var labels = ['정상', '과잉', '장기재고', '판정 보류'];
    var map = {};
    labels.forEach(function (l) { map[l] = { fitness: l, count: 0, qty: 0, amount: 0 }; });
    items.forEach(function (it) {
      var f = map[it.fitness];
      if (!f) return; // 재고 없음은 세지 않음
      f.count++; f.qty += it.curQty; f.amount += it.curAmt || 0;
    });
    return labels.map(function (l) { map[l].amount = round(map[l].amount, 2); return map[l]; });
  }
  // 총괄 2단계: 정상 / 불용(사람이 확정한 품목만)
  // prevAmount: 같은 품목 구분(불용 확정 여부)으로 전월 금액을 더한 값 — 총괄 시트의 전월 칸
  //   (불용 확정은 기준일과 무관하게 품번으로 저장되므로 전월 칸도 「지금 확정한 품목」 기준입니다)
  function overallSummary(items) {
    var out = { '정상': { label: '정상', count: 0, qty: 0, amount: 0, prevAmount: 0, longAmount: 0 }, '불용': { label: '불용(확정)', count: 0, qty: 0, amount: 0, prevAmount: 0, longAmount: 0 } };
    items.forEach(function (it) {
      var o = out[it.deadConfirmed ? '불용' : '정상'];
      o.prevAmount += it.prevAmt || 0;
      if (it.curQty === 0) return;
      o.count++; o.qty += it.curQty; o.amount += it.curAmt || 0;
      if (it.fitness === '장기재고') o.longAmount += it.curAmt || 0;
    });
    return [out['정상'], out['불용']].map(function (o) { o.amount = round(o.amount, 2); o.prevAmount = round(o.prevAmount, 2); o.longAmount = round(o.longAmount, 2); return o; });
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
      if (it.fitness === '장기재고') add(it, '장기재고(Aging ' + (kindLabel === '원자재' ? longLabel(ctx.longRaw, ctx.longRawOp) : longLabel(ctx.longProd, ctx.longProdOp)) + ')');
      else if (it.fitness === '과잉') add(it, '과잉');
      if (it.deadConfirmed) add(it, '불용 확정');
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
  // opts.dead: 사람이 「불용 확정」한 품목 { raw: { 품번: true }, product: { ... } }
  function analyze(data, settings, opts) {
    var s = checkSettings(settings || {});
    if (!s.ok) return { ok: false, errors: s.errors };
    s.dead = (opts && opts.dead) || {};
    var all = data || {};
    var res = analyzeFiltered(filterByPlant(all, s.plantView), s);
    res.plantView = s.plantView;
    res.plants = plantSummary(all, s);
    res.recon = reconcile(res, all.report || [], s, (opts && opts.reconAck) || {});
    res.salesFiles = (all.sales || []).map(function (f) { var m = {}; Object.keys(f).forEach(function (k) { if (k !== 'byCode') m[k] = f[k]; }); return m; });
    res.salesDiff = salesHeaderDiff(all.sales || []);
    res.salesCoverage = salesCoverage(res);
    return res;
  }

  // ── 보고서 대조 · 차이 알람 (3차) ───────────────────────────
  // 회사가 쓰는 월간 재고분석 통합문서의 보고용 시트(원자재·반제품·제품)를 읽어, 도구가 계산한 공장별 합계와 맞대 봅니다.
  // 보고용 시트 구조(실데이터, 값 없이): 구역 제목 줄(「○○기준」) → 머리행(「재고현황(07월)」 「07월 재고현황」 「26년 07월 재고현황」
  // 처럼 달이 적힌 칸이 둘) → 아랫줄 「수량」「금액」 → 대분류(원자재) 또는 고객사(반제품·제품) 줄 → 「합계」 「총합계」.
  var REPORT_KIND = { '원자재': 'raw', '반제품': 'semi', '제품': 'product' };
  var SUMMARY_SHEET = /^총괄(현황)?(시트|sheet)?$/i;
  var MONTH_HEAD = /(\d{1,2})\s*월\s*재고\s*현황|재고\s*현황\s*\(\s*(\d{1,2})\s*월/;
  function parseReportBook(book, opts) {
    opts = opts || {};
    var out = { fileName: opts.fileName || '', filePlant: opts.filePlant || '', sections: [] };
    (book.names || []).forEach(function (name) {
      if (/^총괄/.test(String(name).replace(/\s+/g, ''))) { var sm = parseSummarySheet(book.sheets[name] || [], name); if (sm) out.sections.push(sm); return; }
      var kind = REPORT_KIND[String(name).replace(/\s+/g, '')];
      if (!kind) return;
      var aoa = book.sheets[name] || [];
      var title = '', sec = null;
      for (var r = 0; r < aoa.length; r++) {
        var row = (aoa[r] || []).map(function (v) { return v == null ? '' : v; });
        var texts = row.filter(function (v) { return String(v).trim() !== ''; });
        // 구역 제목 줄: 칸 하나에 「…기준」
        if (texts.length === 1 && /기준\s*$/.test(String(texts[0]).trim())) { title = String(texts[0]).trim().replace(/\s*기준\s*$/, ''); sec = null; continue; }
        var months = [];
        // 「수량 증감 비교 (08월재고현황 - 07월재고현황)」 같은 증감 칸은 달 칸이 아닙니다. 같은 달은 처음 칸만
        row.forEach(function (v, c) {
          var t = String(v), m = t.match(MONTH_HEAD);
          if (!m || /증감|비교|원인|차이/.test(t)) return;
          var mo = +(m[1] || m[2]);
          if (!months.some(function (x) { return x.month === mo; })) months.push({ month: mo, col: c });
        });
        if (months.length >= 2) {
          var sub = aoa[r + 1] || [];
          var labelCol = kind === 'raw' && row.map(function (v) { return String(v).trim(); }).indexOf('대분류') >= 0 ? row.map(function (v) { return String(v).trim(); }).indexOf('대분류') : 0;
          sec = { sheet: name, kind: kind, name: title, months: months.map(function (x) { return x.month; }), rows: [] };
          sec.cols = months.map(function (x) {
            var qc = x.col, ac = x.col + 1;
            if (/금액/.test(String(sub[qc] || '')) && /수량/.test(String(sub[ac] || ''))) { qc = x.col + 1; ac = x.col; }
            return { month: x.month, qty: qc, amt: ac };
          });
          sec.labelCol = labelCol;
          out.sections.push(sec);
          r++;   // 「수량·금액」 줄
          continue;
        }
        if (!sec) continue;
        var label = String(row[sec.labelCol] == null ? '' : row[sec.labelCol]).trim();
        if (!label) continue;
        var total = /^(총\s*)?합\s*계$/.test(label);
        var v = {};
        var any = false;
        sec.cols.forEach(function (c) {
          var q = toNumber(row[c.qty]), a = toNumber(row[c.amt]);
          v[c.month] = { qty: q == null || isNaN(q) ? null : q, amt: a == null || isNaN(a) ? null : a };
          if (v[c.month].qty != null || v[c.month].amt != null) any = true;
        });
        if (any) sec.rows.push({ label: label, total: total, v: v });
        if (total) sec = null;   // 합계 줄 아래(메모 등)는 읽지 않습니다
      }
    });
    out.sections.forEach(function (x) { delete x.cols; delete x.labelCol; });
    return out;
  }
  // 총괄(현황) 시트 — 9차(2026-09-30 오후) 답변 3 「총괄현황 SHEET 은 백만원」으로 대조 대상에 넣었습니다.
  // 회사 총괄표 구조(값 없이, 11.3): 공장(합계·인천·대구) × 구분(자재·반제품·제품) × 정상/불용 줄, 달이 적힌 칸(월별 추이).
  // 실제 칸 배치는 받지 못해 넓게 읽습니다:
  //  · 달 머리행 = 「07월」「26년 07월」「2026.07」처럼 달이 적힌 칸이 둘 이상인 줄(증감·비교·차이 칸 제외). 새 머리행이 나오면 바꿔 읽음
  //  · 달 칸 왼쪽의 글자 칸에서 공장(인천·본사·대구, 「합계」「인천+대구」= 합계) · 구분(자재·원자재/반제품/제품) · 정상/불용을 찾고,
  //    빈칸이면 윗줄 값을 이어 씁니다(병합 셀). 숫자가 없는 줄에 공장 이름만 있으면 구역 제목으로 봅니다.
  //  · (공장·구분)마다 달별 금액 = 정상 + 불용(구분 소계 줄이 따로 있으면 그 값). 「계」(구분 합계) 줄은 읽지 않습니다.
  // 도구 쪽 값은 공장·구분의 재고금액 합계(정상+불용 = 전체)입니다 — 불용은 사람이 확정하는 값이라 정상/불용 나눔은 맞대지 않습니다.
  // 숫자 칸(금액 14.8 등)은 달로 보지 않습니다. 「2026.07」은 네 자리 해만, 「26.07」은 끝에 「월」이 있을 때만 달입니다.
  var SUM_MONTH = [/^(?:(?:\d{2}|\d{4})\s*년\s*)?(\d{1,2})\s*월(?:\s*말)?(?:\s*재고)?(?:\s*현황)?(?:\s*\(.*\))?$/, /^\d{4}\s*[.\/\-]\s*(\d{1,2})\s*(?:월)?$/, /^\d{2}\s*[.\/\-]\s*(\d{1,2})\s*월$/];
  function summaryMonth(v) {
    if (typeof v !== 'string') return null;
    var t = v.trim();
    if (!t || /증감|비교|차이|원인|대비/.test(t)) return null;
    for (var i = 0; i < SUM_MONTH.length; i++) { var m = t.match(SUM_MONTH[i]); if (m && +m[1] >= 1 && +m[1] <= 12) return +m[1]; }
    return null;
  }
  function summaryKind(t) {
    t = String(t == null ? '' : t).replace(/\s+/g, '');
    if (/^(원)?자재$/.test(t)) return 'raw';
    if (/^반제품$/.test(t)) return 'semi';
    if (/^(완)?제품$/.test(t)) return 'product';
    return '';
  }
  function summaryPlant(t) {
    t = String(t == null ? '' : t).replace(/\s+/g, '');
    if (!t) return null;
    if (/\+|전체|총계|^합계$|합계$/.test(t) && !/^(소계|계)$/.test(t)) {
      var p0 = normalizePlant(t.replace(/합계$|기준$/, ''));
      return /\+/.test(t) || !isPlant(p0) ? '합계' : p0;
    }
    var p = normalizePlant(t.replace(/기준$|공장$/, ''));
    if (isExcludedPlant(p)) return '(제외)';   // 중국공장 구역 — 분석 대상이 아니라 맞대지 않습니다
    return isPlant(p) ? p : null;
  }
  function parseSummarySheet(aoa, name) {
    var sec = { sheet: name, kind: 'summary', name: '총괄', months: [], rows: [] };
    var cols = null, plant = '', kind = '', acc = {}, order = [];
    function cellsLeft(row) { var first = Math.min.apply(null, cols.map(function (c) { return c.col; })); return row.slice(0, first).map(function (v) { return String(v == null ? '' : v).trim(); }); }
    function add(p, k, v, sub) {
      var key = p + '|' + k;
      var a = acc[key];
      if (!a) { a = acc[key] = { plant: p, kindKey: k, status: {}, sub: null }; order.push(key); }
      if (sub) { a.sub = v; return; }
      cols.forEach(function (c) { if (v[c.month] != null) a.status[c.month] = round((a.status[c.month] || 0) + v[c.month], 6); });
    }
    for (var r = 0; r < aoa.length; r++) {
      var row = (aoa[r] || []).map(function (v) { return v == null ? '' : v; });
      var ms = [];
      row.forEach(function (v, c) { var mo = summaryMonth(v); if (mo != null && !ms.some(function (x) { return x.month === mo; })) ms.push({ month: mo, col: c }); });
      if (ms.length >= 2) { cols = ms; ms.forEach(function (x) { if (sec.months.indexOf(x.month) < 0) sec.months.push(x.month); }); continue; }
      if (!cols) continue;
      var left = cellsLeft(row);
      var vals = {}, any = false;
      cols.forEach(function (c) { var a = toNumber(row[c.col]); vals[c.month] = a == null || isNaN(a) ? null : a; if (vals[c.month] != null) any = true; });
      var kHere = '', status = '', pHere = null, isTotal = false;
      left.forEach(function (t) {
        var k = summaryKind(t); if (k) { kHere = k; return; }
        var z = t.replace(/\s+/g, '');
        if (z === '정상' || z === '불용') { status = z; return; }
        if (/^(소계|계)$/.test(z)) { isTotal = true; return; }
        var p = summaryPlant(t); if (p) pHere = p;
      });
      if (!any) { if (pHere && !kHere && !status) { plant = pHere; kind = ''; } continue; }
      if (!kHere && !status) continue;   // 「계」·메모 줄 등
      if (pHere && (kHere || status)) { if (pHere !== plant) kind = ''; plant = pHere; }
      if (kHere) kind = kHere;
      if (!kind || isTotal) continue;
      add(plant, kind, vals, !status);
    }
    order.forEach(function (key) {
      var a = acc[key], v = {};
      sec.months.forEach(function (m) {
        var amt = a.sub && a.sub[m] != null ? a.sub[m] : (a.status[m] != null ? a.status[m] : null);
        v[m] = { qty: null, amt: amt == null ? null : round(amt, 6) };
      });
      sec.rows.push({ label: '총괄 ' + ({ raw: '자재', semi: '반제품', product: '제품' })[a.kindKey], plant: a.plant, kindKey: a.kindKey, total: true, v: v });
    });
    return sec.rows.length ? sec : null;
  }
  // 구역 이름 → 공장: 공장 별칭(설정) → 이름에 인천·본사·대구 → 한 시트에 구역이 하나뿐이면 파일의 공장
  function resolveSectionPlant(sec, file, alias) {
    var key = normHeader(sec.name);
    if (key && alias && alias[key]) return alias[key];
    var p = normalizePlant(sec.name);
    if (isPlant(p)) return p;
    var same = file.sections.filter(function (x) { return x.sheet === sec.sheet; });
    if (same.length === 1 && isPlant(file.filePlant)) return file.filePlant;
    return '';
  }
  // 도구 값과 보고서 값을 맞대어 차이를 찾습니다.
  //  합계 줄(공장·구분·달별 수량·금액)의 차이 = 알람(경고 띠·보고서 시트)
  //  대분류·고객사 줄의 차이 = 참고(대분류 묶음·고객사 표기가 달라 생길 수 있어 알람으로 올리지 않음)
  // ack: 사람이 「확인함」으로 표시한 차이 { key: true } — 알람에서 빼고 「확인함」으로 남깁니다
  function reconcile(res, files, s, ack) {
    var out = { hasReport: !!(files && files.length), compared: 0, alarms: [], acked: [], infos: [], units: [], unitsOk: 0, unresolved: [], tolerance: s.reconTolerance };
    if (!out.hasReport) return out;
    var curM = s.cur.getMonth() + 1, prevM = s.prev.getMonth() + 1;
    var seen = {};
    var byPlant = {};
    res.plants.rows.forEach(function (r) { byPlant[r.plant] = r.detail; });
    byPlant['합계'] = res.plants.total.detail;
    // 단위 규칙을 적용해 item 을 채웁니다. 돌려주는 값: false = 차이 없음(또는 단위 설정으로 같음 — 이미 units 에 넣음), true = 계속 판정
    //  · 설정 배수 ≠ 1 : 보고서 값 ÷ 배수 로 바꿔 비교. 같으면 「단위 차이(설정)」, 다르면 알람
    //  · 설정 배수 = 1 (「원」으로 확정): 자동 찾기를 하지 않고 알람. 정확히 10배 등이면 「자릿수 입력 오류 의심」을 덧붙입니다
    //  · 설정 없음 : 정확히 10·100·1000…배면 unitSource='auto'(단위 차이 — 알람 아님)
    function applyUnit(item, rule, rvv, tv, tol, where) {
      if (rule && rule.factor !== 1) {
        // 백만원(배수 0.000001)처럼 1보다 작은 배수는 역수(1,000,000)를 곱해 바꿉니다 — 나눗셈 부동소수 오차로 경계(반 단위)가 흔들리지 않게
        var conv = unitToTool(rvv, rule.factor);
        item.factor = rule.factor; item.reportConv = round(conv, 2); item.diff = round(tv - round(conv, 2), 2);
        if (Math.abs(item.diff) <= Math.max(tol, halfUnit(rule.factor)) + 1e-6) {
          item.unitSource = 'setting'; item.note = '단위 설정 ' + factorLabel(rule.factor) + ' 적용 — 단위를 맞추면 같음';
          // 대분류·고객사 줄과 총괄 칸(시트 전체가 백만원이라 칸마다 적으면 목록만 길어짐)은 맞으면 따로 적지 않고 「단위 맞춰 같음」 수만 셉니다
          if (item.total && !item.summary) out.units.push(item); else if (item.summary) out.unitsOk++;
          return false;
        }
        item.note = '단위 설정 ' + factorLabel(rule.factor) + ' 적용 후에도 차이';
        return true;
      }
      if (Math.abs(item.diff) <= tol) return false;
      var uf = detectUnitFactor(rvv, tv, tol);
      if (!uf) return true;
      if (rule) { item.note = '단위가 확정된 칸(설정 「' + rule.line + '」)인데 보고서 = 도구 ' + factorLabel(uf) + ' — 자릿수 입력 오류 의심'; return true; }
      item.factor = uf; item.unitSource = 'auto'; item.reportConv = round(unitToTool(rvv, uf), 2);
      item.suggest = where + '=' + (uf >= 1 ? '×' + uf : '÷' + round(1 / uf, 6));
      item.note = '단위 차이(보고서 = 도구 ' + factorLabel(uf) + ')';
      return true;
    }
    // 총괄(현황) 시트: (공장·구분)별 달 금액 ↔ 도구의 그 공장·구분 재고금액 합계. 공장을 못 찾으면 파일의 공장(파일 이름)으로
    function reconcileSummary(sec, f) {
      sec.rows.forEach(function (row) {
        var plant = row.plant;
        if (plant === '(제외)') return;
        if (!plant) {
          if (isPlant(f.filePlant)) plant = f.filePlant;
          else { var u = f.fileName + ' 「' + sec.sheet + '」 (공장 이름 없음)'; if (out.unresolved.indexOf(u) < 0) out.unresolved.push(u); return; }
        } else if (s.plantAlias && s.plantAlias[normHeader(plant)]) plant = s.plantAlias[normHeader(plant)];
        var det = byPlant[plant];
        if (!det) return;
        var g = det[row.kindKey].groups.total;
        sec.months.forEach(function (m) {
          var period = m === curM ? 'cur' : m === prevM ? 'prev' : null;
          var rvv = (row.v[m] || {}).amt;
          if (!period || rvv == null) return;
          var key = [toDateStr(s.cur), plant, 'summary', row.kindKey, m, '금액'].join('|');
          if (seen[key]) return;
          seen[key] = true;
          var tv = g[period + 'Amt'];
          var item = { key: key, plant: plant, kind: row.kindKey, kindLabel: KIND_LABEL[row.kindKey], label: '총괄', total: true, summary: true,
            period: period === 'cur' ? '당월' : '전월', month: m, field: '금액', report: rvv, tool: tv == null ? null : round(tv, 2),
            diff: tv == null ? null : round(tv - rvv, 2), file: f.fileName, sheet: sec.sheet };
          out.compared++;
          if (tv == null) return;
          var rule = unitRuleFor(s.reconUnits, plant === '합계' ? '' : plant, row.kindKey, m, '금액', 'summary');
          if (!applyUnit(item, rule, rvv, tv, out.tolerance, '총괄 ' + (plant === '합계' ? '' : plant + ' ') + KIND_LABEL[row.kindKey] + ' ' + m + '월 금액')) return;
          if (item.unitSource === 'auto') { out.units.push(item); return; }
          if (ack[key]) { item.acked = true; out.acked.push(item); } else out.alarms.push(item);
        });
      });
    }
    files.forEach(function (f) {
      f.sections.forEach(function (sec) {
        if (sec.kind === 'summary') { reconcileSummary(sec, f); return; }
        var plant = resolveSectionPlant(sec, f, s.plantAlias);
        if (!plant) { var u = f.fileName + ' 「' + sec.sheet + '」 ' + (sec.name || '(구역 이름 없음)'); if (out.unresolved.indexOf(u) < 0) out.unresolved.push(u); return; }
        var det = byPlant[plant];
        if (!det) return;
        var kind = det[sec.kind];
        var tool = {};
        kind.groups.rows.forEach(function (g) { tool[g.group] = g; });
        var reported = {};
        sec.rows.forEach(function (row) {
          var g = row.total ? kind.groups.total : tool[row.label];
          if (!row.total) reported[row.label] = true;
          sec.months.forEach(function (m) {
            var period = m === curM ? 'cur' : m === prevM ? 'prev' : null;
            if (!period) return;
            var rv = row.v[m] || {};
            [['수량', 'qty', 0.5], ['금액', 'amt', out.tolerance]].forEach(function (fd) {
              if (rv[fd[1]] == null) return;
              var key = [toDateStr(s.cur), plant, sec.kind, row.total ? '합계' : row.label, m, fd[0]].join('|');
              if (seen[key]) return;
              seen[key] = true;
              var tv = g ? g[period + (fd[1] === 'qty' ? 'Qty' : 'Amt')] : null;
              var item = { key: key, plant: plant, kind: sec.kind, kindLabel: KIND_LABEL[sec.kind], label: row.total ? '합계' : row.label, total: row.total,
                period: period === 'cur' ? '당월' : '전월', month: m, field: fd[0], report: rv[fd[1]], tool: tv == null ? null : round(tv, 2),
                diff: tv == null ? null : round(tv - rv[fd[1]], 2), file: f.fileName, sheet: sec.sheet };
              out.compared++;
              if (tv == null) { item.note = '도구에 없는 ' + (sec.kind === 'raw' ? '대분류' : '고객사'); out.infos.push(item); return; }
              // 보고서 칸 단위(설정): 보고서 값 ÷ 배수 = 도구 단위(원·개)로 바꿔 비교. 반올림 오차는 보고서 단위의 절반까지
              var rule = unitRuleFor(s.reconUnits, plant, sec.kind, m, fd[0], '');
              if (!applyUnit(item, rule, rv[fd[1]], tv, fd[2], plant + ' ' + KIND_LABEL[sec.kind] + ' ' + m + '월 ' + fd[0])) return;
              if (item.unitSource === 'auto') { if (row.total) out.units.push(item); else out.infos.push(item); return; }
              if (!row.total) { out.infos.push(item); return; }
              if (ack[key]) { item.acked = true; out.acked.push(item); } else out.alarms.push(item);
            });
          });
        });
        if (sec.kind === 'raw') kind.groups.rows.forEach(function (g) {
          if (!reported[g.group] && (g.curQty || g.prevQty)) {
            var key = [toDateStr(s.cur), plant, 'raw', g.group, 'missing'].join('|');
            if (seen[key]) return;
            seen[key] = true;
            out.infos.push({ key: key, plant: plant, kind: 'raw', kindLabel: '원자재', label: g.group, period: '', field: '', report: null, tool: g.curAmt, diff: null, file: f.fileName, sheet: sec.sheet, note: '보고서에 없는 대분류(도구 묶음표에만 있음)' });
          }
        });
      });
    });
    return out;
  }
  function analyzeFiltered(data, s) {
    var prices = data.price || [];
    var prevPrev = prevMonthEnd(s.prev);
    var chinaOn = s.rawChinaSales === 'on' && s.chinaRules.length > 0;
    var sales = salesIndex(data.sales || [], s.cur, s.prev, prevPrev, chinaOn ? s.chinaRules : null);
    var ctx = {
      cur: s.cur, prev: s.prev, agingMax: s.agingMax, longRaw: s.longRaw, longProd: s.longProd, longRawOp: s.longRawOp, longProdOp: s.longProdOp,
      overMonths: s.overMonths, dead: s.dead, agingPath: s.agingPath, salesScope: s.salesScope,
      topN: s.topN, turnoverMax: s.turnoverMax, noOutPolicy: s.noOutPolicy, amountSource: s.amountSource, causeTopN: s.causeTopN,
      groupMap: s.groupMap, groupOthers: s.groupOthers, groupOrder: groupOrderOf(s.groupMap),
      curPrice: priceMapAt(prices, s.cur), prevPrice: priceMapAt(prices, s.prev), master: masterMap(prices),
      lastIn: lastDateByCode(data.inbound, s.cur), lastOut: lastDateByCode(data.outbound, s.cur),
      hasInbound: !!(data.inbound && data.inbound.length), hasOutbound: !!(data.outbound && data.outbound.length),
      inQty: sumQtyByCode(data.inbound, s.prev, s.cur), outQty: sumQtyByCode(data.outbound, s.prev, s.cur),
      inQtyPrev: sumQtyByCode(data.inbound, prevPrev, s.prev), outQtyPrev: sumQtyByCode(data.outbound, prevPrev, s.prev),
      hasSales: sales.fileCount > 0, lastSales: sales.last, salesQty: sales.qty, salesQtyPrev: sales.qtyPrev,
      china: sales.china || null
    };
    ctx.kind = 'raw';
    var raw = analyzeKind(data.rawCur, data.rawPrev, ctx);
    ctx.kind = 'semi';
    var semi = analyzeKind(data.semiCur, data.semiPrev, ctx);
    ctx.kind = 'product';
    var prod = analyzeKind(data.prodCur, data.prodPrev, ctx);
    var targets = selectTargets(raw.items, '원자재', ctx).concat(selectTargets(semi.items, '반제품', ctx), selectTargets(prod.items, '제품', ctx));
    var unmatched = unmatchedList(raw.items, '원자재', ctx.amountSource).concat(unmatchedList(semi.items, '반제품', ctx.amountSource), unmatchedList(prod.items, '제품', ctx.amountSource));
    return {
      ok: true, errors: [],
      curDate: toDateStr(s.cur), prevDate: toDateStr(s.prev), agingMax: s.agingMax, longRaw: s.longRaw, longProd: s.longProd,
      longRawOp: s.longRawOp, longProdOp: s.longProdOp, agingPath: s.agingPath,
      hasHistory: { inbound: ctx.hasInbound, outbound: ctx.hasOutbound, sales: ctx.hasSales, price: !!prices.length },
      sales: { fileCount: sales.fileCount, codes: sales.codeCount, codesAsOf: Object.keys(sales.last).length, minDate: sales.minDate, maxDate: sales.maxDate,
        china: sales.china ? { customers: sales.china.customers, rows: sales.china.rows, codesAsOf: Object.keys(sales.china.last).length, filesNoCustomer: sales.china.filesNoCustomer } : null },
      raw: raw, semi: semi, product: prod, targets: targets, unmatched: unmatched
    };
  }
  var KINDS = ['raw', 'semi', 'product'];
  // 공장별 요약 — 인천·대구(와 공장 미지정 자료가 있으면 그것까지) 각각의 합계 줄 + 전체 합계.
  // detail: 그 공장만으로 분석한 결과 전체(보고용 시트·보고서 대조에 씁니다)
  function plantSummary(data, s) {
    var seen = {};
    ['rawCur', 'rawPrev', 'semiCur', 'semiPrev', 'prodCur', 'prodPrev'].forEach(function (k) { (data[k] || []).forEach(function (r) { seen[r.plant || NO_PLANT] = true; }); });
    var ids = PLANTS.map(function (p) { return p.id; });
    Object.keys(seen).forEach(function (p) { if (ids.indexOf(p) < 0) ids.push(p); });
    var rows = ids.map(function (p) {
      var sub = {};
      Object.keys(data).forEach(function (k) {
        var stock = STOCK_SLOT.test(k);
        sub[k] = (data[k] || []).filter(function (r) { return (r.plant || NO_PLANT) === p || (!stock && !r.plant); });
      });
      var r = analyzeFiltered(sub, s);
      return { plant: p, label: plantLabel(p), has: !!seen[p], raw: r.raw.groups.total, semi: r.semi.groups.total, product: r.product.groups.total, detail: r };
    });
    var t = analyzeFiltered(data, s);
    return { rows: rows, total: { plant: '합계', label: '합계', has: true, raw: t.raw.groups.total, semi: t.semi.groups.total, product: t.product.groups.total, detail: t } };
  }

  // ── 판매현황(출고) 여러 파일 ─────────────────────────────────
  // 새로 읽은 파일을 기존 목록에 합칩니다. 같은 이름이거나 제목 기간(예: 2026/09/01 ~ 2026/09/30)이 같은 파일은 바꿔 넣습니다 —
  // 월 중간분(26.09, 9/29 출력)을 월말까지 다시 내려받으면 파일 이름이 달라도 같은 달 파일로 보고 교체합니다(2026-09-30 답변 2).
  // 예시 파일(sample)은 실제 파일을 올리면 뺍니다. 돌려주는 값: { files, replaced: [{ from, to }] }
  function mergeSalesFiles(existing, added) {
    var replaced = [];
    function period(f) { return f.titleFrom && f.titleTo ? f.titleFrom + '~' + f.titleTo : ''; }
    var keep = (existing || []).filter(function (f) {
      if (f.sample) return false;
      var hit = (added || []).filter(function (a) { return a.fileName === f.fileName || (period(a) && period(a) === period(f)); })[0];
      if (hit) { replaced.push({ from: f.fileName, to: hit.fileName, fromPartial: !!f.partial, toPartial: !!hit.partial }); return false; }
      return true;
    });
    return { files: keep.concat(added || []), replaced: replaced };
  }
  // 2026-09-29 받은 판매현황 22개(25.01~26.09, 파일당 4~9MB) 구조: 1행 제목 「회사명 : … / 2025/01/01 ~ 2025/01/31」,
  // 2행 머리행(주문일자·프로젝트명·판매일자·대분류·품목코드·품목명(규격)·수량·단가·공급가액·거래처명 …),
  // 판매일자는 「2025/01/02 -1」(날짜 + 전표 순번), 맨 아래 「2025/01  계」「총합계」 줄과 출력 일시 줄. 공장 칸은 없습니다.
  // 파일마다 머리행·열 짝을 따로 짐작하므로 달마다 열 순서·이름이 달라도 읽습니다(달라진 열은 salesHeaderDiff 로 알림).
  function cellValue(c) { return c != null && typeof c === 'object' && !(c instanceof Date) ? c.v : c; }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthEndOfKey(k) { var y = +k.slice(0, 4), m = +k.slice(5, 7); return new Date(y, m, 0); }
  // 제목 줄의 기간 「2025/08/16  ~ 2025/08/31」
  function rangeFromTitle(aoa) {
    for (var r = 0; r < Math.min(3, (aoa || []).length); r++) {
      var line = (aoa[r] || []).map(cellValue).join(' ');
      var m = line.match(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\s*~\s*(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
      if (m) return { from: toDateStr(parseDate(m[1] + '-' + m[2] + '-' + m[3])), to: toDateStr(parseDate(m[4] + '-' + m[5] + '-' + m[6])) };
    }
    return { from: '', to: '' };
  }
  // rows: 시트의 행 배열(칸은 값 또는 SheetJS 셀 {v}). dense 로 읽은 시트를 그대로 넘기면 필요한 칸(품목코드·출고일·수량·공장)만 봅니다.
  // opts: { fileName, sheetName, saved(저장해 둔 짝) }
  function scanSales(rows, opts) {
    opts = opts || {};
    var head = [];
    for (var r0 = 0; r0 < Math.min(15, rows.length); r0++) head.push((rows[r0] || []).map(cellValue));
    var hr = guessHeaderRow(head, 'outbound');
    var headers = tableToRows([head[hr - 1] || []], 1).headers;
    var mapping = guessMapping(headers.map(function (h) { return /^\(빈 머리/.test(h) ? '' : h; }), 'outbound', opts.saved);
    var idx = {};
    ['code', 'date', 'qty', 'plant', 'customer'].forEach(function (k) { idx[k] = mapping[k] ? headers.indexOf(mapping[k]) : -1; });
    var out = {
      fileName: opts.fileName || '', sheetName: opts.sheetName || '', headerRow: hr, headers: headers, mapping: mapping,
      missing: missingRequired(mapping, 'outbound'), plantColumn: idx.plant >= 0,
      // 거래처별 요약(9차): { 거래처: { 품목: { 'YYYY-MM': [수량 합, 마지막 일] } } } · 거래처별 줄 수. 거래처 칸이 없으면 비어 있습니다.
      // 중국공장 거래처 설정을 나중에 바꿔도 파일을 다시 올리지 않도록 모든 거래처를 남깁니다(저장 크기는 byCode 와 비슷하게 늘어남).
      customerColumn: idx.customer >= 0, byCust: {}, custRows: {},
      rowCount: 0, used: 0, skipped: {}, minDate: '', maxDate: '', stampDate: '', byCode: {}, codeCount: 0
    };
    var t = rangeFromTitle(head);
    out.titleFrom = t.from; out.titleTo = t.to;
    if (out.missing.length) return out;
    function skip(k) { out.skipped[k] = (out.skipped[k] || 0) + 1; }
    for (var r = hr; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var code = normCode(cellValue(row[idx.code]));
      if (!code) {
        var first = String(cellValue(row[0]) == null ? '' : cellValue(row[0])).trim();
        if (!first) continue;
        out.rowCount++;
        if (STAMP_ROW.test(first) && /(오전|오후|am|pm|\d:\d\d)/i.test(first)) { var sd = parseDate(first); if (sd) out.stampDate = toDateStr(sd); skip('출력 일시 줄'); }
        else skip('합계·소계 줄(품목코드 빈칸)');
        continue;
      }
      out.rowCount++;
      if (TOTAL_ROW.test(code) || STAMP_ROW.test(code)) { skip('합계·소계 줄'); continue; }
      var d = parseDate(cellValue(row[idx.date]));
      if (!d) { skip('출고일 날짜 아님'); continue; }
      if (idx.plant >= 0 && isExcludedPlant(normalizePlant(cellValue(row[idx.plant])))) { skip('분석 제외 공장(중국 등)'); continue; }
      var q = idx.qty >= 0 ? toNumber(cellValue(row[idx.qty])) : 0;
      if (q == null || isNaN(q)) q = 0;
      var ds = toDateStr(d), mk = ds.slice(0, 7);
      // 저장 크기를 줄이려고 달 안의 마지막 「일」만 숫자로 둡니다: { 품목: { 'YYYY-MM': [수량 합, 마지막 일] } }
      var e = out.byCode[code] || (out.byCode[code] = {});
      var cell = e[mk] || (e[mk] = [0, 0]);
      cell[0] = round(cell[0] + q, 4);
      if (cell[1] < d.getDate()) cell[1] = d.getDate();
      if (idx.customer >= 0) {
        var cu = String(cellValue(row[idx.customer]) == null ? '' : cellValue(row[idx.customer])).trim() || '(거래처 빈칸)';
        out.custRows[cu] = (out.custRows[cu] || 0) + 1;
        var ce = (out.byCust[cu] || (out.byCust[cu] = {}));
        var cc = ce[code] || (ce[code] = {});
        var ccell = cc[mk] || (cc[mk] = [0, 0]);
        ccell[0] = round(ccell[0] + q, 4);
        if (ccell[1] < d.getDate()) ccell[1] = d.getDate();
      }
      if (!out.minDate || ds < out.minDate) out.minDate = ds;
      if (ds > out.maxDate) out.maxDate = ds;
      out.used++;
    }
    out.codeCount = Object.keys(out.byCode).length;
    // 월 중간분: 제목 기간 끝보다 출력 일시가 앞이면(예: 26.09 — 9/1~9/30 인데 9/29 에 내려받음) 그 뒤 출고는 아직 없습니다
    out.partial = !!(out.titleTo && out.stampDate && out.stampDate < out.titleTo);
    return out;
  }
  // SheetJS 시트를 행 배열로(값 복사 없이). dense 로 읽은 시트는 ws['!data'](0.19+) 또는 ws[행](0.18) 에 행 배열이 있습니다.
  function sheetRows(XLSX, ws) {
    if (ws['!data']) return ws['!data'];
    if (Array.isArray(ws[0]) || (ws['!ref'] && Array.isArray(ws[XLSX.utils.decode_range(ws['!ref']).s.r]))) {
      var n = XLSX.utils.decode_range(ws['!ref']).e.r + 1, out = new Array(n);
      for (var i = 0; i < n; i++) out[i] = ws[i];
      return out;
    }
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  }
  // 판매현황 통합문서 하나 읽기(화면·작업자 스레드 공용). 필요 없는 서식·수식·글자 변환은 읽지 않고(dense, cellText 등 끔),
  // 시트는 판매일자·품목코드 머리행이 잡히는 시트를 고릅니다. 행은 품목코드·출고일·수량·공장 칸만 봅니다(scanSales).
  var SALES_READ_OPTS = { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellText: false, cellStyles: false, cellNF: false, sheetStubs: false, bookVBA: false };
  function readSalesWorkbook(XLSX, buf, fileName, saved) {
    var wb = XLSX.read(buf, SALES_READ_OPTS);
    var best = null;
    wb.SheetNames.forEach(function (n) {
      var f = scanSales(sheetRows(XLSX, wb.Sheets[n]), { fileName: fileName, sheetName: n, saved: saved });
      if (!best || (best.missing.length && !f.missing.length) || (!f.missing.length && f.used > best.used)) best = f;
    });
    return best;
  }
  // 파일 사이 열 차이: 가장 이른 파일의 머리행을 기준으로, 없어진 열·새로 생긴 열·짝이 바뀐 필드
  function salesHeaderDiff(files) {
    var list = (files || []).slice().sort(function (a, b) { return (a.minDate || '9') < (b.minDate || '9') ? -1 : 1; });
    if (!list.length) return [];
    var base = list[0];
    var real = function (hs) { return (hs || []).filter(function (h) { return !/^\(빈 머리/.test(h); }); };
    return list.slice(1).map(function (f) {
      var bh = real(base.headers), fh = real(f.headers);
      var changed = ['code', 'date', 'qty', 'plant'].filter(function (k) { return (base.mapping[k] || '') !== (f.mapping[k] || ''); })
        .map(function (k) { return k + ': ' + (base.mapping[k] || '(없음)') + ' → ' + (f.mapping[k] || '(없음)'); });
      var moved = bh.filter(function (h) { return fh.indexOf(h) >= 0 && fh.indexOf(h) !== bh.indexOf(h); }).length;
      return { fileName: f.fileName, missing: bh.filter(function (h) { return fh.indexOf(h) < 0; }), added: fh.filter(function (h) { return bh.indexOf(h) < 0; }), mappingChanged: changed, moved: moved };
    }).filter(function (d) { return d.missing.length || d.added.length || d.mappingChanged.length || d.moved; });
  }
  // 여러 파일을 합쳐 품목별 최근 출고일(기준일 이전) · 기간 출고수량.
  // 기간 수량은 달 단위로 모아 두었으므로 월말 기준일을 전제로 「그 달 말일이 (from, to] 안인 달」을 더합니다.
  // chinaRules(9차): 중국공장 거래처 규칙(parseChinaCustomers) — 주면 그 거래처 줄만 모은 out.china { last, qty, qtyPrev, customers, rows } 도 만듭니다.
  function salesIndex(files, asOf, prev, prevPrev, chinaRules) {
    var out = { fileCount: (files || []).length, last: {}, lastAny: {}, qty: {}, qtyPrev: {}, codeCount: 0, minDate: '', maxDate: '' };
    var asOfStr = asOf ? toDateStr(asOf) : '';
    function fold(dst, byCode, trackAny) {
      Object.keys(byCode || {}).forEach(function (code) {
        var mm = byCode[code];
        Object.keys(mm).forEach(function (k) {
          var q = mm[k][0], d = typeof mm[k][1] === 'number' ? k + '-' + pad(mm[k][1]) : mm[k][1];
          if (trackAny && (!dst.lastAny[code] || dst.lastAny[code] < d)) dst.lastAny[code] = d;
          if ((!asOfStr || d <= asOfStr) && (!dst.last[code] || dst.last[code] < d)) dst.last[code] = d;
          var me = monthEndOfKey(k);
          if (prev && asOf && me > prev && me <= asOf) dst.qty[code] = round((dst.qty[code] || 0) + q, 4);
          if (prevPrev && prev && me > prevPrev && me <= prev) dst.qtyPrev[code] = round((dst.qtyPrev[code] || 0) + q, 4);
        });
      });
    }
    var cn = chinaRules && chinaRules.length ? { last: {}, qty: {}, qtyPrev: {}, customers: [], rows: 0, filesNoCustomer: [] } : null;
    (files || []).forEach(function (f) {
      if (f.minDate && (!out.minDate || f.minDate < out.minDate)) out.minDate = f.minDate;
      if (f.maxDate && f.maxDate > out.maxDate) out.maxDate = f.maxDate;
      fold(out, f.byCode, true);
      if (!cn) return;
      if (!f.customerColumn) { cn.filesNoCustomer.push(f.fileName); return; }
      Object.keys(f.byCust || {}).forEach(function (cu) {
        if (!matchCustomer(chinaRules, cu)) return;
        if (cn.customers.indexOf(cu) < 0) cn.customers.push(cu);
        cn.rows += (f.custRows || {})[cu] || 0;
        fold(cn, f.byCust[cu], false);
      });
    });
    out.codeCount = Object.keys(out.lastAny).length;
    if (cn) { cn.customers.sort(); out.china = cn; }
    return out;
  }
  // 중국공장 거래처 목록 읽기: 한 줄(또는 쉼표)에 거래처명·거래처코드 하나. 「*」는 아무 글자(예: 「*중국*」). 대소문자·띄어쓰기 무시.
  // 「*」가 없으면 거래처 칸 값 전체가 같아야 합니다(「중국」 한 낱말이 다른 거래처까지 잡지 않게).
  function parseChinaCustomers(text) {
    var out = [];
    String(text == null ? '' : text).split(/\r?\n|,/).forEach(function (line) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') return;
      var norm = t.replace(/\s+/g, '').toLowerCase();
      var re = new RegExp('^' + norm.split('*').map(function (x) { return x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }).join('.*') + '$');
      out.push({ text: t, re: re });
    });
    return out;
  }
  function matchCustomer(rules, name) {
    var n = String(name == null ? '' : name).replace(/\s+/g, '').toLowerCase();
    if (!n) return false;
    for (var i = 0; i < (rules || []).length; i++) if (rules[i].re.test(n)) return true;
    return false;
  }
  // 판매현황의 거래처 목록(줄 수 많은 순) + 중국공장 후보(이름에 중국·china·CN·中国 등이 든 거래처) — 설정 화면에서 골라 적도록 보여 줍니다
  var CHINA_HINT = /중국|china|中国|中國|天津|\bcn\b|\(cn\)|청도|칭다오|천진|톈진|웨이하이|연태|옌타이|쑤저우|상하이|심양|선양|대련|다롄/i;
  function salesCustomers(files, chinaRules) {
    var map = {};
    (files || []).forEach(function (f) { Object.keys(f.custRows || {}).forEach(function (cu) { map[cu] = (map[cu] || 0) + f.custRows[cu]; }); });
    return Object.keys(map).map(function (cu) { return { name: cu, rows: map[cu], hint: CHINA_HINT.test(cu), matched: matchCustomer(chinaRules, cu) }; })
      .sort(function (a, b) { return b.rows - a.rows || (a.name < b.name ? -1 : 1); });
  }
  // 재고 품목 중 최근 출고일(판매현황)을 찾은 품목 수 — 종류별(당월 재고가 있는 품목)
  function salesCoverage(res) {
    var out = {};
    KINDS.forEach(function (k) {
      var items = res[k].items.filter(function (it) { return it.curQty > 0; });
      out[k] = { stock: items.length, withSale: items.filter(function (it) { return it.lastOutSource === '판매현황'; }).length, used: res[k].useSales, mode: res[k].salesMode };
    });
    return out;
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
      '최근 입고일', '최근 출고일', '최근 출고일 출처', 'Aging 입고일 기준(개월)', 'Aging 출고일 기준(개월)', '파일 경과 개월', 'Aging 표시(개월)', '표시 기준', '경과 일수(표시 기준, 참고)', 'Aging 분포 칸', '판정(Aging)', '다른 경로 Aging 칸', '다른 경로 판정', '불용 확정',
      '당월 입고수량', '당월 출고수량', '회전율', '수량 효과(입고)', '수량 효과(출고·사용)', '수량 효과(조정·기타)', '단가 효과', '신규·소멸·미산정', '가장 큰 요인'];
    var rows = kind.items.map(function (it) {
      var e = it.effects;
      return [it.code, it.name, it.group, it.groupRaw, it.plants.join('·'), it.change, it.prevQty, it.curQty, it.diffQty, changeRate(it.prevQty, it.curQty, it.qtyRate),
        blank(it.prevPrice), blank(it.curPrice), blank(it.prevAmt), blank(it.curAmt), blank(it.diffAmt), changeRate(it.prevAmt || 0, it.curAmt || 0, it.amtRate),
        it.curAmtSource, it.lastIn, it.lastOut, it.lastOutSource, blank(it.agingIn), blank(it.agingOut), blank(it.agingFileText || it.agingFile), blank(it.agingShown), it.agingBasis, blank(it.agingShownDays), it.bucket, it.fitness, it.bucketAlt, it.fitnessAlt, it.deadConfirmed ? '확정' : '',
        blank(it.inQty), blank(it.outQty), blank(it.turnover), e.inflow, e.outflow, e.adjust, e.price, round(e.newItem + e.goneItem + e.noAmount, 2), it.driver];
    });
    return [head].concat(rows);
  }
  var KIND_ROWS = [['원자재', 'raw'], ['반제품', 'semi'], ['제품', 'product']];
  function bucketSheet(res) {
    var other = res.agingPath === 'file' ? '최근 출고일 우선' : '재고잔량분석 칸 우선(예전 경로)';
    var head = ['구분', '경과 개월(표시 기준)', '품목 수', '재고수량', '재고금액', '판정', '비교: ' + other + ' 품목 수', '비교: 재고금액'];
    var rows = [];
    KIND_ROWS.forEach(function (k) {
      var alt = {};
      res[k[1]].bucketsAlt.forEach(function (b) { alt[b.bucket] = b; });
      var labels = res[k[1]].buckets.map(function (b) { return b.bucket; });
      res[k[1]].bucketsAlt.forEach(function (b) { if (labels.indexOf(b.bucket) < 0) labels.push(b.bucket); });
      var cur = {};
      res[k[1]].buckets.forEach(function (b) { cur[b.bucket] = b; });
      labels.forEach(function (l) {
        var b = cur[l] || { count: 0, qty: 0, amount: 0, month: null }, a = alt[l] || { count: 0, amount: 0 };
        if (!b.count && !a.count && (b.month == null || b.month > res.agingMax)) return;
        rows.push([k[0], l, b.count, b.qty, b.amount, b.month == null ? '' : (b.long ? '장기재고' : '정상'), a.count, a.amount]);
      });
    });
    rows.push([]);
    rows.push(['구분', '세부 판정(Aging)', '품목 수', '재고수량', '재고금액', '', '', '']);
    KIND_ROWS.forEach(function (k) {
      res[k[1]].fitness.forEach(function (f) { rows.push([k[0], f.fitness, f.count, f.qty, f.amount, '', '', '']); });
    });
    rows.push([]);
    rows.push(['구분', '총괄(정상/불용)', '품목 수', '재고수량', '재고금액', '', '', '']);
    KIND_ROWS.forEach(function (k) {
      res[k[1]].overall.forEach(function (f) { rows.push([k[0], f.label, f.count, f.qty, f.amount, '', '', '']); });
    });
    return [head].concat(rows);
  }
  function targetSheet(res) {
    var head = ['구분', '품번', '품명', '대분류·고객사', '선정 사유', '당월 수량', '당월 금액', '수량 증감', '금액 증감', 'Aging 표시(개월)', '표시 기준', '최근 출고일', '판정(Aging)', '회전율', '원인(담당자 기입)', '개선방안(담당자 기입)'];
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
    var head = ['공장'];
    KIND_ROWS.forEach(function (k) { head.push(k[0] + ' 전월 수량', k[0] + ' 당월 수량', k[0] + ' 전월 금액', k[0] + ' 당월 금액', k[0] + ' 금액 증감'); });
    return [head].concat(res.plants.rows.filter(function (r) { return r.has; }).concat([res.plants.total]).map(function (r) {
      var line = [r.label];
      KIND_ROWS.forEach(function (k) { var t = r[k[1]]; line.push(t.prevQty, t.curQty, t.prevAmt, t.curAmt, t.diffAmt); });
      return line;
    }));
  }
  function settingsSheet(res, settings, sample) {
    return [['항목', '값'],
      ['보기(공장)', res.plantView || '합계(인천+대구)'],
      ['당월 기준일', res.curDate], ['전월 기준일', res.prevDate],
      ['Aging 표시', '개월별 분포 0~' + res.agingMax + '개월, 그 위는 「' + overLabel(res.agingMax) + '」 한 칸. 파일의 「12 개월초과」처럼 정확한 개월을 모르는 값은 「12개월 초과(개월 미상)」 칸'],
      ['장기재고 기준(원자재)', longLabel(res.longRaw, res.longRawOp)], ['장기재고 기준(반제품·제품)', longLabel(res.longProd, res.longProdOp)],
      ['Aging 경로', res.agingPath === 'file' ? '재고잔량분석 칸 → 최근 출고일 → (설정 시) 최근 입고일' : '최근 출고일(판매현황·출고 이력) → 재고잔량분석 칸 → (설정 시) 최근 입고일'],
      ['판매현황 적용 대상', settings.salesScope === 'all' ? '원자재·반제품·제품(전체 판매)' : '반제품·제품(전체 판매)' +
        (res.raw && res.raw.salesMode === 'china' ? ' + 원자재(중국공장 거래처 판매만)' : '(원자재는 재고잔량분석 칸' + (settings.rawChinaSales !== 'off' && !String(settings.chinaCustomers || '').trim() ? ' — 중국공장 거래처를 적으면 그 판매로 계산' : '') + ')')],
      ['중국공장 거래처(원자재 Aging)', settings.rawChinaSales === 'off' ? '쓰지 않음' : (String(settings.chinaCustomers || '').split(/\r?\n|,/).map(function (x) { return x.trim(); }).filter(Boolean).join(' / ') || '(비어 있음 — 꺼짐과 같음)')],
      ['보고서 칸 단위', String(settings.reconUnits || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean).join(' / ') || '(없음 — 10배 등 차이는 자동으로 「단위 차이」)'],
      ['보고서 대조 허용 차이', '금액 ' + (res.recon ? res.recon.tolerance : settings.reconTolerance) + '원 이하, 수량 0.5 이하는 알람 없음'],
      ['과잉 구간', settings.overEnabled === 'on' ? settings.overMonths + '개월 초과 ~ 장기재고 미만' : '쓰지 않음'],
      ['불용', '관련부서 확정 후 품목별 「불용 확정」 체크(도구가 판정하지 않음)'],
      ['경과 개월 계산', '달력 월 차이. 기준일의 일이 시작일의 일보다 작으면 1을 빼되, 기준일이 말일이면 빼지 않음'],
      ['출고 이력 없는 품목', '재고 파일의 경과 개월 칸 → ' + (settings.noOutPolicy === 'none' ? '판정 보류' : '최근 입고일로 대신')],
      ['금액 산출', settings.amountSource === 'price' ? '단가표 우선, 없으면 파일 금액' : '파일 금액 우선, 없으면 단가표'],
      ['원자재 대분류 묶음표', String(settings.groupMap || '').split(/\r?\n/).filter(Boolean).join(' / ') || '(없음 — 적힌 그대로)'],
      ['묶음표에 없는 대분류', settings.groupOthers === 'keep' ? '적힌 그대로' : '기타로 모음'],
      ['금액 증가 상위 건수', settings.topN], ['저회전 기준(회전율 미만)', settings.turnoverMax === '' ? '적용 안 함' : settings.turnoverMax],
      ['회전율', '당월 출고수량 ÷ ((전월 수량 + 당월 수량) ÷ 2)'],
      ['증감 원인 분해', '금액 증감 = 입고 + 출고·사용 + 조정·기타(여기까지 전월 단가 × 수량) + 단가 변동(당월 수량 × 단가 차이) + 신규 + 소멸 + 금액 미산정'],
      ['자료', sample ? '예시 데이터(가상) — 실제 회사 자료가 아닙니다' : '사용자가 올린 자료']];
  }
  // ── 보고용 시트 4개(3차: 회사 파일의 「총괄·원자재·반제품·제품」과 같은 틀) ──
  function mmOf(d) { return String(d || '').slice(5, 7) + '월'; }
  function yymmOf(d) { return String(d || '').slice(2, 4) + '년 ' + String(d || '').slice(5, 7) + '월'; }
  // 공장별 구역: 합계 보기면 자료가 있는 공장마다 + 「인천+대구 합계」, 공장 보기면 그 공장 하나
  function reportSections(res) {
    if (res.plantView) return [{ title: res.plantView + ' 기준', det: res, plant: res.plantView }];
    var out = res.plants.rows.filter(function (r) { return r.has; }).map(function (r) { return { title: plantLabel(r.plant) + ' 기준', det: r.detail, plant: r.plant }; });
    if (out.length > 1) out.push({ title: '인천+대구 합계', det: res, plant: '' });
    return out.length ? out : [{ title: '합계', det: res, plant: '' }];
  }
  function alarmRows(recon, withInfo) {
    var list = recon.alarms.map(function (a) { return [a, '차이']; }).concat(recon.acked.map(function (a) { return [a, '확인함']; }),
      (recon.units || []).map(function (a) { return [a, '단위 차이']; }));
    if (withInfo) list = list.concat(recon.infos.map(function (a) { return [a, '참고']; }));
    return list.map(function (x) {
      var a = x[0];
      return [plantLabel(a.plant), a.kindLabel, a.label, a.month ? a.month + '월(' + a.period + ')' : '', a.field, blank(a.report), blank(a.tool), blank(a.diff), a.file + (a.sheet ? ' [' + a.sheet + ']' : ''), x[1] + (a.note ? ' — ' + a.note : '')];
    });
  }
  var ALARM_HEAD = ['공장', '구분', '줄', '달', '항목', '보고서 값', '도구 값', '차이(도구 − 보고서)', '보고서 파일', '상태'];
  function summarySheet(res) {
    var t = res.plants.total.detail;
    // 9차(2026-09-30 오후) 답변 3: 회사 총괄현황 시트는 백만원 단위 → 금액을 백만원(소수 첫째 자리)으로 적습니다. 원 단위 값은 「공장별_요약」 시트.
    // 아래 「대조 차이 알람」 구역은 비교한 값 그대로(보고서 값은 보고서 단위, 도구 값·차이는 원)입니다.
    var M = function (v) { return round((v || 0) / 1000000, 1); };
    var head = ['공장', '구분', '항목', yymmOf(res.prevDate) + ' (백만원)', yymmOf(res.curDate) + ' (백만원)', '증감 (백만원)', '비고'];
    var rows = [['단위: 백만원(소수 첫째 자리 반올림 — 원 단위 금액은 「공장별_요약」 시트) · 기준일 ' + res.curDate + ' · 정상/불용 2단계(불용 = 「불용 확정」 품목)']];
    rows.push(head);
    var blocks = [{ label: '합계', det: t }].concat(res.plants.rows.filter(function (r) { return r.has; }).map(function (r) { return { label: plantLabel(r.plant), det: r.detail }; }));
    blocks.forEach(function (b) {
      var sumPrev = 0, sumCur = 0;
      [['자재', 'raw'], ['반제품', 'semi'], ['제품', 'product']].forEach(function (k, ki) {
        var kd = b.det[k[1]];
        kd.overall.forEach(function (o, oi) {
          sumPrev += o.prevAmount; sumCur += o.amount;
          var note = oi === 0 && kd.overall[0].longAmount + kd.overall[1].longAmount ? '(참고) 장기재고(Aging ' + kd.longText + ') ' + M(kd.overall[0].longAmount + kd.overall[1].longAmount) + '백만원' : '';
          rows.push([ki === 0 && oi === 0 ? b.label : '', oi === 0 ? k[0] : '', oi === 0 ? '정상' : '불용', M(o.prevAmount), M(o.amount), M(o.amount - o.prevAmount), note]);
        });
      });
      rows.push(['', '계', '', M(sumPrev), M(sumCur), M(sumCur - sumPrev), '']);
    });
    rows.push([]);
    var rc = res.recon || { hasReport: false, alarms: [], acked: [], infos: [] };
    rows.push(['대조 차이 알람 — 회사 보고서의 합계 줄과 도구 계산 비교 (금액 단위: 보고서 값은 보고서에 적힌 단위, 도구 값·차이는 원)']);
    if (!rc.hasReport) rows.push(['보고서 대조 자료 없음 — 「자료」의 「회사 보고서(대조용)」 자리에 월간 재고분석 통합문서를 올리면 합계를 맞대 봅니다.']);
    else if (!rc.alarms.length && !rc.acked.length && !(rc.units || []).length) rows.push(['차이 없음 — 비교한 ' + rc.compared + '개 값이 허용 차이(금액 ' + rc.tolerance + '원) 안입니다.']);
    else { rows.push(['차이 ' + rc.alarms.length + '건' + (rc.acked.length ? ', 확인함 ' + rc.acked.length + '건' : '') + ((rc.units || []).length ? ', 단위 차이 ' + rc.units.length + '건(알람 아님)' : '')]); rows.push(ALARM_HEAD); rows = rows.concat(alarmRows(rc, false)); }
    return rows;
  }
  function rawReportSheet(res, memosByPlant) {
    var pm = mmOf(res.prevDate), cm = mmOf(res.curDate);
    var rows = [];
    reportSections(res).forEach(function (sec, si) {
      var k = sec.det.raw, memo = ((memosByPlant || {})[sec.plant] || {}).raw || {};
      if (si) rows.push([]);
      rows.push([sec.title]);
      rows.push(['구분', '대분류', '재고현황(' + pm + ')', '', '재고현황(' + cm + ')', '', '수량 증감 비교 (' + cm + ' − ' + pm + ')', '금액 증감 비교 (' + cm + ' − ' + pm + ')', '원인분석', '', '비고(원인 메모)', '자동 요약(도구)']);
      rows.push(['', '', '수량', '금액', '수량', '금액', '', '', pm + ' 재고현황', cm + ' 재고현황', '', '']);
      var causes = {};
      k.cause.rows.concat([k.cause.total]).forEach(function (c) { causes[c.group] = c; });
      k.groups.rows.concat([k.groups.total]).forEach(function (g, i) {
        rows.push([i === 0 ? '원자재' : '', g.group, g.prevQty, g.prevAmt, g.curQty, g.curAmt, g.diffQty, g.diffAmt, g.prevItemCount + '종', g.itemCount + '종',
          (memo[g.group] || {}).memo || '', causes[g.group] ? causeSentence(causes[g.group]) : '']);
      });
    });
    return rows;
  }
  function custReportSheet(res, kindKey) {
    var rows = [];
    reportSections(res).forEach(function (sec, si) {
      var k = sec.det[kindKey];
      var labels = k.buckets.filter(function (b) { return b.month != null ? (b.month <= res.agingMax + 1 || b.count) : b.count; }).map(function (b) { return b.bucket; });
      var byG = {};
      k.items.forEach(function (it) {
        if (!it.curQty) return;
        var g = byG[it.group] || (byG[it.group] = {});
        g[it.bucket] = round((g[it.bucket] || 0) + it.curQty, 4);
      });
      if (si) rows.push([]);
      rows.push([sec.title]);
      var h1 = ['구분', yymmOf(res.prevDate) + ' 재고현황', '', yymmOf(res.curDate) + ' 재고현황', '', '', '재고잔량분석(당월 재고수량, 경과 개월 — ' + (res.agingPath === 'file' ? '재고잔량분석 칸 우선' : '최근 출고일 기준') + ')'];
      rows.push(h1);
      rows.push(['', '수량', '금액', '수량', '금액', ''].concat(labels, ['총 합계']));
      var totals = {};
      k.groups.rows.concat([k.groups.total]).forEach(function (g) {
        var isT = g === k.groups.total;
        var bq = isT ? totals : (byG[g.group] || {});
        var line = [isT ? '총합계' : g.group, g.prevQty, g.prevAmt, g.curQty, g.curAmt, ''];
        labels.forEach(function (l) {
          var q = bq[l] || 0;
          if (!isT) totals[l] = round((totals[l] || 0) + q, 4);
          line.push(q ? q : '');
        });
        line.push(g.curQty);
        rows.push(line);
      });
    });
    return rows;
  }
  function reconSheet(res) {
    var rc = res.recon || { hasReport: false, alarms: [], acked: [], infos: [] };
    if (!rc.hasReport) return [['상태'], ['보고서 대조 자료 없음']];
    var rows = [ALARM_HEAD].concat(alarmRows(rc, true));
    if (rc.unresolved.length) { rows.push([]); rows.push(['공장을 정하지 못한 구역(기준 설정의 「보고서 구역 이름」에 적어 주세요)']); rc.unresolved.forEach(function (u) { rows.push([u]); }); }
    return rows;
  }
  function salesSheet(res) {
    var head = ['파일', '시트', '머리행', '제목 기간', '첫 출고일', '마지막 출고일', '읽은 행', '사용 행', '품목 수', '월 중간분(출력일)', '품목코드 칸', '출고일 칸', '수량 칸', '공장 칸', '건너뛴 줄'];
    var rows = (res.salesFiles || []).map(function (f) {
      return [f.fileName, f.sheetName, f.headerRow, (f.titleFrom || '') + (f.titleTo ? ' ~ ' + f.titleTo : ''), f.minDate, f.maxDate, f.rowCount, f.used, f.codeCount,
        f.partial ? '예(' + f.stampDate + ' 출력)' : '', f.mapping.code || '', f.mapping.date || '', f.mapping.qty || '', f.mapping.plant || '(없음)',
        Object.keys(f.skipped || {}).map(function (k) { return k + ' ' + f.skipped[k]; }).join(', ')];
    });
    var out = [head].concat(rows);
    if (res.salesDiff && res.salesDiff.length) {
      out.push([]);
      out.push(['열 구성이 다른 파일', '없어진 열', '새 열', '짝이 바뀐 필드', '순서가 바뀐 열 수']);
      res.salesDiff.forEach(function (d) { out.push([d.fileName, d.missing.join(', '), d.added.join(', '), d.mappingChanged.join(', '), d.moved]); });
    }
    return out;
  }
  // memos: 지금 보기(공장 보기)의 메모 { raw: {...}, product: {...} }
  // memosByPlant: 공장별 메모 { '': 합계 보기, '인천': …, '대구': … } — 보고용 「원자재」 시트의 공장 구역마다 씁니다
  function buildSheets(res, settings, sample, memos, memosByPlant) {
    memos = memos || {};
    memosByPlant = memosByPlant || {};
    if (memosByPlant[res.plantView || ''] == null) memosByPlant[res.plantView || ''] = memos;
    var out = {
      // 보고용 4개
      '총괄': summarySheet(res),
      '원자재': rawReportSheet(res, memosByPlant),
      '반제품': custReportSheet(res, 'semi'),
      '제품': custReportSheet(res, 'product'),
      // 백데이터
      '대조_차이알람': reconSheet(res),
      '공장별_요약': plantSheet(res),
      '원자재_대분류별': groupSheet(res.raw, '대분류'),
      '원자재_증감원인': causeSheet(res.raw, '대분류', memos.raw),
      '원자재_증감기여': contribSheet(res.raw, '대분류', '품번'),
      '원자재_품목별': itemSheet(res.raw, '품번', '대분류'),
      '반제품_고객사별': groupSheet(res.semi, '고객사'),
      '반제품_증감원인': causeSheet(res.semi, '고객사', memos.semi),
      '반제품_품목별': itemSheet(res.semi, '품번', '고객사'),
      '제품_고객사별': groupSheet(res.product, '고객사'),
      '제품_증감원인': causeSheet(res.product, '고객사', memos.product),
      '제품_품목별': itemSheet(res.product, '제품코드', '고객사'),
      'Aging_개월별': bucketSheet(res),
      '판매현황_파일': salesSheet(res),
      '관리대상': targetSheet(res),
      '단가_미매칭': unmatchedSheet(res),
      '기준': settingsSheet(res, settings, sample)
    };
    return out;
  }
  var REPORT_SHEETS = ['총괄', '원자재', '반제품', '제품'];

  var api = {
    KINDS: KINDS, KIND_LABEL: KIND_LABEL, scanSales: scanSales, readSalesWorkbook: readSalesWorkbook, sheetRows: sheetRows, salesHeaderDiff: salesHeaderDiff, salesIndex: salesIndex, salesCoverage: salesCoverage,
    parseReportBook: parseReportBook, reconcile: reconcile, parsePlantAlias: parsePlantAlias,
    parseReconUnits: parseReconUnits, parseChinaCustomers: parseChinaCustomers, matchCustomer: matchCustomer, salesCustomers: salesCustomers, parseSummarySheet: parseSummarySheet, parseUnitFactor: parseUnitFactor, unitToTool: unitToTool, halfUnit: halfUnit, detectUnitFactor: detectUnitFactor, factorLabel: factorLabel, mergeSalesFiles: mergeSalesFiles, isLong: isLong, longLabel: longLabel, overLabel: overLabel,
    bucketSummary: bucketSummary, isOpenAging: isOpenAging, cellValue: cellValue, STOCK_SLOT: STOCK_SLOT,
    DEFS: DEFS, SLOTS: SLOTS, PLANTS: PLANTS, EXCLUDED_PLANTS: EXCLUDED_PLANTS, EFFECT_KEYS: EFFECT_KEYS, EFFECT_LABELS: EFFECT_LABELS,
    defaultSettings: defaultSettings, daysToMonths: daysToMonths, migrateSettings: migrateSettings, migrateSlotData: migrateSlotData,
    toDateStr: toDateStr, parseDate: parseDate, daysBetween: daysBetween, prevMonthEnd: prevMonthEnd, isMonthEnd: isMonthEnd, monthsBetween: monthsBetween,
    toNumber: toNumber, normCode: normCode, parseAgingMonths: parseAgingMonths, guessMapping: guessMapping, missingRequired: missingRequired,
    guessHeaderRow: guessHeaderRow, guessSheet: guessSheet, dateFromTitle: dateFromTitle,
    tableToRows: tableToRows, applyMapping: applyMapping, importTable: importTable, aggregateStock: aggregateStock,
    normalizePlant: normalizePlant, plantFromFileName: plantFromFileName, isPlant: isPlant, plantLabel: plantLabel, assignPlant: assignPlant, filterByPlant: filterByPlant,
    parseGroupMap: parseGroupMap, mapGroup: mapGroup,
    lastDateByCode: lastDateByCode, sumQtyByCode: sumQtyByCode, priceMapAt: priceMapAt, rate: rate, round: round,
    bucketLabels: bucketLabels, bucketOf: bucketOf, fitnessOf: fitnessOf,
    checkSettings: checkSettings, analyze: analyze, decompose: decompose, causeSentence: causeSentence, buildCausePrompt: buildCausePrompt,
    buildSheets: buildSheets, REPORT_SHEETS: REPORT_SHEETS, pct: pct
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvLogic = api;
})(typeof window !== 'undefined' ? window : this);
