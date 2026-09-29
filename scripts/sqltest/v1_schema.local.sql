-- ============================================================================
-- 로컬 검증 전용 — 2026-09-28 판 schema.sql 사본(업그레이드 검사의 출발점). 운영 실행 금지, 가드 내장.
-- run.sh ⑥ 단계가 이 판을 먼저 깔고 새 supabase/schema.sql 을 다시 실행해 칸 추가·개월 변환을 검사합니다.
-- ============================================================================
do $guard$
begin
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator'))
     or exists (select 1 from pg_namespace where nspname = 'graphql') then
    raise exception '이 파일은 로컬 검증 전용입니다. 운영 데이터베이스에서 실행할 수 없습니다.';
  end if;
end;
$guard$;

-- ============================================================================
-- data09-05 — 월별 원자재·제품 재고 분석 자동화
-- Supabase(PostgreSQL) 스키마 + RLS
--
--  무엇인가 : 지금 브라우저 localStorage(키 접두 'data09-05.')에 두는 자료를
--             DB 로 옮길 때 쓸 표 구조입니다. 앱 연결은 다음 단계입니다.
--  실행 위치 : 수강생 본인 Supabase 프로젝트의 SQL Editor 에서 실행
--  재실행    : 안전합니다 (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS 선행)
--
--  본인 프로젝트에 올리는 것을 전제로 하므로 표 이름에 접두사를 붙이지 않았습니다.
--  회사 Supabase 주소·키는 이 파일 어디에도 없습니다.
--
--  표 목록
--    app_settings    기준 설정 (사용자당 1행)            ← localStorage 'settings'
--    column_mapping  자료 종류별 컬럼 짝                 ← localStorage 'map.<종류>'
--    upload_slot     올린 파일 한 벌(자리 7개 중 하나)    ← localStorage 'data'.<자리>
--    stock_item      월말 재고 레코드(원자재·제품)        ← data.rawCur/rawPrev/prodCur/prodPrev.records
--    stock_movement  입고·출고 이력 레코드                ← data.inbound/outbound.records
--    unit_price      단가표 레코드                        ← data.price.records
--
--  보안
--    모든 표 RLS 켬. 행은 만든 사람(owner_id = auth.uid())만 보고 고칩니다.
--    이 도구에는 팀·관리자 역할이 없어 관리자 표를 두지 않았습니다.
--    이 도구에는 기록성(로그·이력) 자료가 없어 로그 표를 두지 않았습니다.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 테이블
-- ----------------------------------------------------------------------------

-- 기준 설정 — js/logic.js defaultSettings() 의 필드를 그대로 옮겼습니다.
create table if not exists public.app_settings (
  id             bigint generated always as identity primary key,
  owner_id       uuid not null default auth.uid(),
  cur_date       date,                               -- 당월 기준일(월말)
  prev_date      date,                               -- 전월 기준일(비우면 당월의 전월 말일)
  aging_bounds   text not null default '90, 180, 365', -- Aging 구간 경계(일), 쉼표 구분
  over_days      numeric not null default 180 check (over_days >= 0),  -- 넘으면 「과잉」
  dead_days      numeric not null default 365 check (dead_days >= 0),  -- 넘으면 「불용」
  no_out_policy  text not null default 'inbound'
                 check (no_out_policy in ('inbound', 'none')),
  amount_source  text not null default 'price'
                 check (amount_source in ('price', 'file')),
  top_n          int not null default 10 check (top_n >= 0),
  turnover_max   numeric check (turnover_max is null or turnover_max >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint app_settings_owner_key unique (owner_id),
  -- 화면(checkSettings)과 같은 규칙: 불용 기준 ≥ 과잉 기준, 전월 < 당월
  constraint app_settings_days_order check (dead_days >= over_days),
  constraint app_settings_date_order check (prev_date is null or cur_date is null or prev_date < cur_date)
);

-- 자료 종류별 컬럼 짝 — { 필드키: 머리행 이름 }
create table if not exists public.column_mapping (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  def_key     text not null
              check (def_key in ('rawStock', 'productStock', 'inbound', 'outbound', 'price')),
  mapping     jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠ 프런트에서 upsert 할 때 onConflict: 'owner_id,def_key' 를 반드시 지정할 것
  constraint column_mapping_owner_def_key unique (owner_id, def_key)
);

-- 올린 파일 한 벌 — 자리(slot) 7개마다 한 행. 앱과 같이 자리마다 최신 한 벌만 둡니다.
create table if not exists public.upload_slot (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  slot_id     text not null
              check (slot_id in ('rawCur', 'rawPrev', 'prodCur', 'prodPrev', 'inbound', 'outbound', 'price')),
  file_name   text not null,
  sheet_name  text,
  sample      boolean not null default false,        -- 예시(가상) 데이터로 채운 자리인가
  row_count   int not null default 0 check (row_count >= 0),
  mapping     jsonb not null default '{}'::jsonb,    -- 이번 파일에 쓴 짝
  problems    jsonb not null default '[]'::jsonb     -- [{code, count, rows}] 건너뛴 행 사유
              check (jsonb_typeof(problems) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠ upsert 시 onConflict: 'owner_id,slot_id'
  constraint upload_slot_owner_slot_key unique (owner_id, slot_id)
);

-- 월말 재고 레코드 — 원자재(대분류)·제품(고객사) 공용.
-- 앱의 필드명 group 은 PostgreSQL 예약어라 group_name 으로 적었습니다.
create table if not exists public.stock_item (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  upload_id   bigint not null references public.upload_slot(id) on delete cascade,
  code        text not null check (length(btrim(code)) > 0),   -- 품번 / 제품코드
  name        text not null default '',
  group_name  text not null default '(분류 없음)',              -- 대분류 / 고객사
  qty         numeric not null,                                 -- 재고수량(필수)
  amount      numeric,                                          -- 파일에 있으면 재고금액
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
  -- 같은 품번이 창고·로트별로 여러 줄일 수 있어(앱 aggregateStock) 품번에 UNIQUE 를 걸지 않습니다.
);
create index if not exists stock_item_upload_idx on public.stock_item (upload_id);
create index if not exists stock_item_code_idx   on public.stock_item (code);

-- 입고·출고 이력 레코드
create table if not exists public.stock_movement (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  upload_id   bigint not null references public.upload_slot(id) on delete cascade,
  direction   text not null check (direction in ('inbound', 'outbound')),
  code        text not null check (length(btrim(code)) > 0),
  date        date not null,                                    -- 입고일 / 출고일(필수)
  qty         numeric,                                          -- 있으면 수량
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists stock_movement_upload_idx on public.stock_movement (upload_id);
create index if not exists stock_movement_code_idx   on public.stock_movement (code, date desc);

-- 단가표 레코드 — 적용일이 기준일 이전인 것 중 가장 최근을 씁니다(앱 priceMapAt)
create table if not exists public.unit_price (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  upload_id   bigint not null references public.upload_slot(id) on delete cascade,
  code        text not null check (length(btrim(code)) > 0),
  price       numeric not null,
  date        date,                                             -- 적용일(있으면)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists unit_price_upload_idx on public.unit_price (upload_id);
create index if not exists unit_price_code_idx   on public.unit_price (code, date desc);

-- ----------------------------------------------------------------------------
-- 2. 함수 · 트리거
--
--  search_path 를 고정합니다. 고정하지 않으면 호출자의 search_path 에 따라
--  엉뚱한 스키마의 객체를 잡을 수 있습니다.
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $trg$
declare t text;
begin
  foreach t in array array['app_settings','column_mapping','upload_slot',
                           'stock_item','stock_movement','unit_price']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end;
$trg$;

-- ----------------------------------------------------------------------------
-- 3. RLS — 본인 행만
-- ----------------------------------------------------------------------------

alter table public.app_settings   enable row level security;
alter table public.column_mapping enable row level security;
alter table public.upload_slot    enable row level security;
alter table public.stock_item     enable row level security;
alter table public.stock_movement enable row level security;
alter table public.unit_price     enable row level security;

-- 부모가 없는 표: owner_id 만 봅니다
do $rls$
declare t text;
begin
  foreach t in array array['app_settings','column_mapping','upload_slot']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())', t || '_delete', t);
  end loop;
end;
$rls$;

-- 레코드 표: 본인 행이면서, 붙는 upload_slot 도 본인 것이어야 합니다.
-- (남의 upload_id 를 알아내 거기에 행을 끼워 넣는 것을 막습니다)
do $rls$
declare t text;
  v_own  text := 'owner_id = auth.uid()';
  v_par  text := 'owner_id = auth.uid() and exists (select 1 from public.upload_slot u where u.id = upload_id and u.owner_id = auth.uid())';
begin
  foreach t in array array['stock_item','stock_movement','unit_price']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, v_own);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, v_par);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, v_own, v_par);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_delete', t, v_own);
  end loop;
end;
$rls$;

-- ----------------------------------------------------------------------------
-- 4. 함수 실행 권한
--
--  GRANT 만으로는 제한되지 않습니다. 권한이 두 겹으로 미리 붙습니다.
--    ① PostgreSQL 이 함수 생성 시 PUBLIC 에 EXECUTE 기본 부여
--    ② Supabase 가 ALTER DEFAULT PRIVILEGES 로 신규 함수마다
--       anon·authenticated·service_role 에 자동 부여
--  PUBLIC 만 지우면 anon 이 남아 비로그인 호출이 그대로 뚫립니다.
-- ----------------------------------------------------------------------------

revoke all on function public.set_updated_at() from public, anon;
-- 트리거 전용 함수는 authenticated 를 남깁니다. 트리거 발화 시 호출자 EXECUTE 를
-- 검사한다면 끊는 순간 수정이 막힙니다. 직접 호출하면 "can only be called as trigger" 로 죽어 무해합니다.
grant execute on function public.set_updated_at() to authenticated;

-- ----------------------------------------------------------------------------
-- 끝.
-- ----------------------------------------------------------------------------
