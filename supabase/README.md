# Supabase DB 스크립트 — data09-05 월간 재고 분석

이 폴더에는 월간 재고 분석 도구의 자료를 데이터베이스(Supabase)에 담을 때 쓸 표 구조(`schema.sql`)가 들어 있습니다.
지금 도구는 이 스크립트 없이도 그대로 동작합니다. 앱을 DB 에 연결하는 일은 다음 단계에서 합니다.

## 왜 DB 가 필요한가

지금 도구는 올린 자료와 설정을 브라우저 localStorage(키 앞에 `data09-05.`)에만 둡니다. 그래서 다음 한계가 있습니다.

- **용량** — 입출고 이력은 한 달에도 수천 행이 쌓입니다. 브라우저 저장 공간(보통 5MB 안팎)을 넘으면 도구가 「이번 창에서만 유지합니다」로 물러나고, 새로 고치면 자료가 사라집니다.
- **다른 PC·다른 담당자** — 컬럼 짝과 기준 설정(Aging 구간, 과잉·불용 일수)이 그 브라우저에만 남습니다. 담당자가 바뀌거나 PC 를 옮기면 같은 기준으로 분석하기 어렵습니다. 기획서가 말하는 「담당자가 바뀌어도 같은 기준」을 지키려면 기준을 한곳에 두어야 합니다.
- **월별 누적** — 기획서 5장의 확장 기능 「월별 추이 누적」은 여러 달 자료를 쌓아 두어야 가능합니다.

## 테이블

| 이름 | 용도 | localStorage 대응 |
|---|---|---|
| `app_settings` | 기준 설정 — 당월·전월 기준일, Aging 구간·과잉·불용 **개월**, 출고 이력 없는 품목 처리, 금액 기준, 증가 상위 건수, 저회전 기준, 증감 원인 상위 건수, 원자재 대분류 묶음표, 공장 보기. 사용자당 1행 | `data09-05.settings` |
| `column_mapping` | 자료 종류(원자재 재고·제품 재고·입고·출고·단가)별 컬럼 짝. 다음 달 파일에 그대로 씁니다 | `data09-05.map.<종류>` |
| `upload_slot` | 올린 파일 하나. 자리 7개(원자재·제품 × 당월·전월, 입고, 출고, 단가) × 공장(인천·대구)마다 1행(`part_key`). 파일 이름, 공장, 읽은 행 수, 건너뛴 행 사유 | `data09-05.data` 의 자리별 `parts` |
| `stock_item` | 월말 재고 레코드 — 품번, 품명, 대분류(원자재) 또는 고객사(제품), 재고수량, 재고금액·단가, 당월 입고·출고 수량, 파일의 경과 개월, 공장 | `data.rawCur`·`rawPrev`·`prodCur`·`prodPrev` 의 `records` |
| `stock_movement` | 입고·출고 이력 레코드 — 품번, 날짜, 수량 | `data.inbound`·`outbound` 의 `records` |
| `unit_price` | 단가표·품목 기준정보 레코드 — 품번, 단가, 적용일, 품명, 대분류 | `data.price` 의 `records` |
| `cause_memo` | 증감 원인 메모·AI 해설 — 기준일·공장 보기·종류·대분류(고객사)마다 1행 | `data09-05.memo.<기준일>.<보기>` |

필드 이름은 도구의 이름을 그대로 따릅니다. 다만 대분류·고객사를 담는 `group` 은 PostgreSQL 예약어라 `group_name` 으로 적었습니다.

## 보안

- 모든 표에 RLS(행 단위 보안)를 켰습니다. 각 행은 만든 사람(`owner_id`)만 보고 고치고 지울 수 있습니다.
- 로그인하지 않은 방문자(anon)는 아무것도 보거나 쓰지 못합니다.
- 이 도구에는 팀·관리자 구분이 없어 관리자 표를 두지 않았습니다. 기록성(로그·이력) 자료도 없어 로그 표를 두지 않았습니다.
- 화면의 입력 규칙 일부(불용 기준 ≥ 과잉 기준, 전월 < 당월, 자리 이름 7종 등)를 DB 의 CHECK 제약으로도 걸었습니다.

## 적용 방법

1. [supabase.com](https://supabase.com) 에 가입합니다.
2. **New project** 로 본인 프로젝트를 만듭니다.
3. 왼쪽 메뉴의 **SQL Editor** 를 엽니다.
4. `schema.sql` 내용을 모두 복사해 붙여 넣습니다.
5. **Run** 을 누릅니다.

여러 번 실행해도 안전합니다. 이미 있는 표는 건너뛰고, 정책과 트리거는 지우고 다시 만듭니다.

**2026-09-28 판을 이미 실행했다면** 새 `schema.sql` 을 그대로 한 번 더 실행하면 됩니다. 1-B 절이 새 칸(개월·공장 등)을 더하고, 저장돼 있던 일 단위 설정(예: 90·180·365일)을 개월(3·6·12)로 바꿉니다. 예전 일 단위 칸은 지우지 않고 남겨 둡니다.

## 확인 방법

- **Table Editor** 에 표 7개(`app_settings`, `column_mapping`, `upload_slot`, `stock_item`, `stock_movement`, `unit_price`, `cause_memo`)가 보이면 됩니다.
- 표마다 **RLS enabled** 표시가 있는지 확인합니다.
- SQL Editor 에서 아래를 실행해 정책이 표마다 4개(조회·추가·수정·삭제)인지 봅니다.

```sql
select tablename, count(*) from pg_policies where schemaname = 'public' group by tablename;
```

## 앱 연결은 다음 단계입니다

이 스크립트는 표를 준비해 두는 것까지입니다. 도구의 `js/store.js` 를 Supabase 에 읽고 쓰도록 바꾸는 일, 로그인 화면을 붙이는 일은 다음 단계에서 합니다.
그때 컬럼 짝과 자리 저장은 upsert 로 하고, 충돌 기준을 `owner_id,def_key`·`owner_id,slot_id,part_key`·`owner_id,memo_key,kind,group_name` 으로 지정해야 중복 행이 생기지 않습니다.

## 로컬 검증 방법

운영에 올리기 전에 내 PC 의 임시 PostgreSQL 에 실제로 적용해 검사합니다. PostgreSQL 이 설치되어 있어야 합니다(macOS: `brew install postgresql@17`).

```sh
./scripts/sqltest/run.sh
```

임시 데이터베이스를 만들어 `schema.sql` 을 두 번 적용하고, 사용자 A·B 격리, 비로그인 차단, 제약 조건, 함수 권한을 검사합니다. 이어서 예전 판(`v1_schema.local.sql`, 일 단위) 위에 새 `schema.sql` 을 실행해 칸 추가·개월 변환을 검사한 뒤 지웁니다. 마지막에 「SQL 검증 통과.」가 나오면 됩니다.
`scripts/sqltest/` 의 `*.local.sql` 파일은 검증 전용이라 Supabase SQL Editor 에서 실행하면 스스로 멈춥니다.
