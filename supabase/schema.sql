-- ============================================================================
-- data09-05 — 월별 원자재·제품 재고 분석 자동화
-- Supabase(PostgreSQL) 스키마 + RLS
--
--  무엇인가 : 지금 브라우저 localStorage(키 접두 'data09-05.')에 두는 자료를
--             DB 로 옮길 때 쓸 표 구조입니다. 앱 연결은 다음 단계입니다.
--  실행 위치 : 수강생 본인 Supabase 프로젝트의 SQL Editor 에서 실행
--  재실행    : 안전합니다 (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS 선행)
--  2026-09-29 : Aging 을 일 → 개월로, 공장(인천·대구) 칸, 자리마다 파일 여러 개, 증감 원인 메모 표.
--               예전 판을 이미 실행한 프로젝트에 다시 실행하면 1-B 절이 칸을 더하고 일 단위 설정을 개월로 바꿉니다.
--
--  본인 프로젝트에 올리는 것을 전제로 하므로 표 이름에 접두사를 붙이지 않았습니다.
--  회사 Supabase 주소·키는 이 파일 어디에도 없습니다.
--
--  표 목록
--    app_settings    기준 설정 (사용자당 1행)            ← localStorage 'settings'
--    column_mapping  자료 종류별 컬럼 짝                 ← localStorage 'map.<종류>'
--    upload_slot     올린 파일 하나(자리 7개 × 공장별)    ← localStorage 'data'.<자리>.parts[]
--    stock_item      월말 재고 레코드(원자재·제품)        ← parts[].records (rawCur/rawPrev/prodCur/prodPrev)
--    stock_movement  입고·출고 이력 레코드                ← parts[].records (inbound/outbound)
--    unit_price      단가표·품목 기준정보 레코드          ← parts[].records (price)
--    cause_memo      증감 원인 메모·AI 해설               ← localStorage 'memo.<기준일>.<공장 보기>'
--    dead_confirm    불용 확정 품목(관련부서 확정 후 체크)  ← localStorage 'dead'
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
  aging_months   text not null default '3, 6, 12',   -- (예비) 예전 Aging 구간 경계 — 앱은 개월별 분포로 바뀌어 쓰지 않음
  over_months    int not null default 6,             -- 과잉 구간을 켰을 때: 경과 개월이 넘으면 「과잉」
  dead_months    int not null default 12,            -- (예비) 예전 불용 기준 — 불용은 이제 사람이 확정(dead_confirm)
  long_raw_months  int not null default 12,          -- 원자재: 경과 개월이 이 값 이상이면 「장기재고」
  long_prod_months int not null default 6,           -- 제품: 경과 개월이 이 값 이상이면 「장기재고」
  aging_max_months int not null default 12,          -- 개월별 분포를 몇 개월까지 한 칸씩
  over_enabled   boolean not null default false,     -- 과잉 구간 쓰기(기본 끔)
  no_out_policy  text not null default 'inbound'
                 check (no_out_policy in ('inbound', 'none')),
  amount_source  text not null default 'file'
                 check (amount_source in ('price', 'file')),
  top_n          int not null default 10 check (top_n >= 0),
  turnover_max   numeric check (turnover_max is null or turnover_max >= 0),
  cause_top_n    int not null default 5,             -- 증감 원인: 대분류마다 기여 상위 몇 품목
  group_map      text not null default '',           -- 원자재 대분류 묶음표(한 줄에 「코드=보고서 대분류」)
  group_others   text not null default 'other',      -- 묶음표에 없는 대분류: other=기타로 / keep=그대로
  plant_view     text not null default '',           -- 공장 보기: '' 합계 / 인천 / 대구
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint app_settings_owner_key unique (owner_id),
  -- 화면(checkSettings)과 같은 규칙: 전월 < 당월 (개월 규칙은 1-B 절)
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

-- 올린 파일 하나 — 자리(slot) 7개 × 공장별. 앱과 같이 자리·공장마다 최신 파일 하나만 둡니다.
--   part_key: 앱의 파일 구분 키 — 'plant:인천' · 'plant:대구' · 'plant:'(공장 미지정) · 'col:<파일>:<시트>'(공장 칸으로 나누는 파일)
create table if not exists public.upload_slot (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  slot_id     text not null
              check (slot_id in ('rawCur', 'rawPrev', 'prodCur', 'prodPrev', 'inbound', 'outbound', 'price')),
  part_key    text not null default '',
  plant       text not null default '',              -- 이 파일에 지정한 공장('' = 미지정·공통)
  file_name   text not null,
  sheet_name  text,
  sample      boolean not null default false,        -- 예시(가상) 데이터로 채운 자리인가
  row_count   int not null default 0 check (row_count >= 0),
  mapping     jsonb not null default '{}'::jsonb,    -- 이번 파일에 쓴 짝
  problems    jsonb not null default '[]'::jsonb     -- [{code, count, rows}] 건너뛴 행 사유
              check (jsonb_typeof(problems) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠ upsert 시 onConflict: 'owner_id,slot_id,part_key'
  constraint upload_slot_owner_slot_part_key unique (owner_id, slot_id, part_key)
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
  price       numeric,                                          -- 파일에 있으면 재고단가(입고단가·완제품단가)
  in_qty      numeric,                                          -- 파일에 있으면 당월 입고수량
  out_qty     numeric,                                          -- 파일에 있으면 당월 출고·사용수량
  aging_file  int,                                              -- 파일의 경과 개월(재고잔량분석, 「12 개월초과」=13)
  aging_file_text text not null default '',                     -- 파일에 적힌 그대로
  plant       text not null default '',                         -- 인천·대구('' = 미지정)
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
  plant       text not null default '',                         -- '' 이면 두 공장 공통
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
  name        text not null default '',                         -- 기준정보의 품명(있으면)
  group_name  text not null default '',                         -- 기준정보의 대분류(재고 파일에 없을 때 씀)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists unit_price_upload_idx on public.unit_price (upload_id);
create index if not exists unit_price_code_idx   on public.unit_price (code, date desc);

-- 증감 원인 메모 · AI 해설 — 기준일·공장 보기·종류(원자재/제품)·대분류(고객사)마다 한 행
create table if not exists public.cause_memo (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  memo_key    text not null check (length(btrim(memo_key)) > 0),  -- '<당월 기준일>.<공장 보기 또는 all>'
  kind        text not null check (kind in ('raw', 'product')),
  group_name  text not null check (length(btrim(group_name)) > 0),
  memo        text not null default '',                           -- 담당자 원인 메모
  ai          text not null default '',                           -- 붙여 넣은 AI 해설
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠ upsert 시 onConflict: 'owner_id,memo_key,kind,group_name'
  constraint cause_memo_owner_key unique (owner_id, memo_key, kind, group_name)
);

-- 불용 확정 — 관련부서 확정 후 담당자가 품목마다 체크(도구가 판정하지 않음)
create table if not exists public.dead_confirm (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid(),
  kind        text not null check (kind in ('raw', 'product')),
  code        text not null check (length(btrim(code)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ⚠ upsert 시 onConflict: 'owner_id,kind,code'
  constraint dead_confirm_owner_key unique (owner_id, kind, code)
);

-- ----------------------------------------------------------------------------
-- 1-B. 2026-09-29 변경 — 예전 판(일 단위·자리마다 파일 하나)을 이미 실행한 프로젝트용.
--      새로 설치하면 위 CREATE 에 이미 있어 아무 일도 하지 않습니다(재실행 안전).
-- ----------------------------------------------------------------------------

alter table public.app_settings add column if not exists aging_months text;
alter table public.app_settings add column if not exists over_months  int;
alter table public.app_settings add column if not exists dead_months  int;
alter table public.app_settings add column if not exists cause_top_n  int;
alter table public.app_settings add column if not exists group_map    text;
alter table public.app_settings add column if not exists group_others text;
alter table public.app_settings add column if not exists plant_view   text;
alter table public.app_settings add column if not exists long_raw_months  int not null default 12;
alter table public.app_settings add column if not exists long_prod_months int not null default 6;
alter table public.app_settings add column if not exists aging_max_months int not null default 12;
alter table public.app_settings add column if not exists over_enabled boolean not null default false;

-- 일 단위 값이 남아 있으면 개월로 바꿉니다(앱 migrateSettings 와 같은 환산: 일 ÷ 30.4375 반올림).
do $mig$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'app_settings' and column_name = 'over_days') then
    execute $u$
      update public.app_settings s set
        aging_months = coalesce(s.aging_months, (
          select string_agg(m::text, ', ' order by m) from (
            select distinct greatest(1, round(x::numeric / 30.4375))::int as m
              from regexp_split_to_table(btrim(s.aging_bounds), '[,[:space:]]+') as x
             where x ~ '^[0-9]+(\.[0-9]+)?$' and x::numeric > 0) q)),
        over_months = coalesce(s.over_months, round(s.over_days / 30.4375)::int),
        dead_months = coalesce(s.dead_months, round(s.dead_days / 30.4375)::int)
    $u$;
    -- 예전 칸은 지우지 않고 필수·제약만 풉니다(앱이 더는 쓰지 않음)
    alter table public.app_settings alter column aging_bounds drop not null;
    alter table public.app_settings alter column over_days drop not null;
    alter table public.app_settings alter column dead_days drop not null;
    alter table public.app_settings drop constraint if exists app_settings_days_order;
  end if;
end;
$mig$;

update public.app_settings set
  aging_months = coalesce(aging_months, '3, 6, 12'), over_months = coalesce(over_months, 6), dead_months = coalesce(dead_months, 12),
  cause_top_n = coalesce(cause_top_n, 5), group_map = coalesce(group_map, ''), group_others = coalesce(group_others, 'other'),
  plant_view = coalesce(plant_view, '')
 where aging_months is null or over_months is null or dead_months is null or cause_top_n is null
    or group_map is null or group_others is null or plant_view is null;

alter table public.app_settings
  alter column aging_months set default '3, 6, 12', alter column aging_months set not null,
  alter column over_months  set default 6,          alter column over_months  set not null,
  alter column dead_months  set default 12,         alter column dead_months  set not null,
  alter column cause_top_n  set default 5,          alter column cause_top_n  set not null,
  alter column group_map    set default '',         alter column group_map    set not null,
  alter column group_others set default 'other',    alter column group_others set not null,
  alter column plant_view   set default '',         alter column plant_view   set not null,
  alter column amount_source set default 'file';

-- 화면(checkSettings)과 같은 개월 규칙
alter table public.app_settings drop constraint if exists app_settings_months_check;
alter table public.app_settings add constraint app_settings_months_check check (
  over_months >= 0 and cause_top_n >= 1
  and aging_months ~ '^[[:space:]]*[1-9][0-9]*([[:space:]]*,?[[:space:]]*[1-9][0-9]*)*[[:space:]]*$'
  and group_others in ('other', 'keep') and plant_view in ('', '인천', '대구')
  and long_raw_months >= 1 and long_prod_months >= 1 and aging_max_months between 1 and 36);

-- 자리마다 파일 여러 개(공장별)
alter table public.upload_slot add column if not exists part_key text not null default '';
alter table public.upload_slot add column if not exists plant    text not null default '';
alter table public.upload_slot drop constraint if exists upload_slot_owner_slot_key;
do $uq$
begin
  if not exists (select 1 from pg_constraint where conname = 'upload_slot_owner_slot_part_key') then
    alter table public.upload_slot add constraint upload_slot_owner_slot_part_key unique (owner_id, slot_id, part_key);
  end if;
end;
$uq$;

alter table public.stock_item add column if not exists price           numeric;
alter table public.stock_item add column if not exists in_qty          numeric;
alter table public.stock_item add column if not exists out_qty         numeric;
alter table public.stock_item add column if not exists aging_file      int;
alter table public.stock_item add column if not exists aging_file_text text not null default '';
alter table public.stock_item add column if not exists plant           text not null default '';
alter table public.stock_movement add column if not exists plant text not null default '';
alter table public.unit_price add column if not exists name       text not null default '';
alter table public.unit_price add column if not exists group_name text not null default '';

-- 공장: 분석 대상 밖(중국)은 앱이 읽을 때 빼므로 DB 에도 들어오지 않게 막습니다
alter table public.upload_slot    drop constraint if exists upload_slot_plant_check;
alter table public.upload_slot    add  constraint upload_slot_plant_check    check (plant in ('', '인천', '대구'));
alter table public.stock_item     drop constraint if exists stock_item_plant_check;
alter table public.stock_item     add  constraint stock_item_plant_check     check (plant <> '중국' and (aging_file is null or aging_file >= 0));
alter table public.stock_movement drop constraint if exists stock_movement_plant_check;
alter table public.stock_movement add  constraint stock_movement_plant_check check (plant <> '중국');

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
                           'stock_item','stock_movement','unit_price','cause_memo','dead_confirm']
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
alter table public.cause_memo     enable row level security;
alter table public.dead_confirm   enable row level security;

-- 부모가 없는 표: owner_id 만 봅니다
do $rls$
declare t text;
begin
  foreach t in array array['app_settings','column_mapping','upload_slot','cause_memo','dead_confirm']
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
