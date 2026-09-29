-- ============================================================================
-- 로컬 검증 전용 — data09-05 프로젝트별 검증 (운영 실행 금지, 가드 내장)
--
--  사용자 흉내: set role authenticated + request.jwt.claim.sub 에 uuid 를 넣으면
--  스텁의 auth.uid() 가 그 값을 돌려줍니다. anon 은 set role anon.
-- ============================================================================
do $guard$
begin
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator'))
     or exists (select 1 from pg_namespace where nspname = 'graphql') then
    raise exception '이 파일은 로컬 검증 전용입니다. 운영 데이터베이스에서 실행할 수 없습니다.';
  end if;
end;
$guard$;

-- 문장이 지정한 SQLSTATE 로 실패하는지 본다. (이름이 _assert 로 시작해 권한 검사에서 빠진다)
create or replace function public._assert_raises(p_sql text, p_state text, p_label text)
returns void language plpgsql set search_path = public as $fn$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
  end;
  if v_state is not distinct from p_state then raise notice '  OK   %', p_label;
  else raise exception 'FAIL  %  (기대 SQLSTATE %, 실제 %)', p_label, p_state, coalesce(v_state, '성공함');
  end if;
end;
$fn$;

-- 영향받은 행 수를 돌려준다 (RLS 로 가려진 UPDATE/DELETE 는 0 행)
create or replace function public._assert_rows(p_sql text, p_expected int, p_label text)
returns void language plpgsql set search_path = public as $fn$
declare v_n int;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  if v_n = p_expected then raise notice '  OK   %', p_label;
  else raise exception 'FAIL  %  (기대 % 행, 실제 % 행)', p_label, p_expected, v_n;
  end if;
end;
$fn$;

do $t$ begin raise notice '[프로젝트] 재실행 안전 · 정책 수'; end $t$;

-- 두 번 적용한 뒤에도 정책이 표마다 정확히 4개(중복 생성 없음)
do $t$
declare v_bad text;
begin
  select string_agg(c.relname || '=' || n, ', ') into v_bad from (
    select c.relname, count(p.oid) as n
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where s.nspname = 'public' and c.relkind = 'r'
     group by c.relname) c
   where n <> 4;
  perform public._assert(v_bad is null, '두 번 적용 후 표마다 정책 4개 (발견: ' || coalesce(v_bad, '없음') || ')');
  perform public._assert_eq(
    (select count(*) from pg_trigger where tgname like '%\_updated\_at' and not tgisinternal),
    12::bigint, '두 번 적용 후 updated_at 트리거 12개');
end $t$;

do $t$ begin raise notice '[프로젝트] 함수 권한(proacl)'; end $t$;

do $t$
declare v_acl text;
begin
  select array_to_string(proacl, ',') into v_acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and proname = 'set_updated_at';
  perform public._assert(v_acl is not null and v_acl not like '=X/%' and v_acl not like '%,=X/%',
    'set_updated_at: PUBLIC EXECUTE 없음 (' || coalesce(v_acl, 'null') || ')');
  perform public._assert(v_acl not like '%anon=%', 'set_updated_at: anon EXECUTE 없음');
  perform public._assert(v_acl like '%authenticated=X%', 'set_updated_at: authenticated EXECUTE 있음');
end $t$;

-- ----------------------------------------------------------------------------
-- 사용자 A 가 자료를 넣는다
-- ----------------------------------------------------------------------------
do $t$ begin raise notice '[프로젝트] 사용자 A — 자기 자료 쓰기·읽기'; end $t$;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

do $t$
declare v_up bigint; v_mv bigint; v_pr bigint; v_sf bigint;
begin
  insert into public.app_settings (cur_date, prev_date) values ('2026-08-31', '2026-07-31');
  insert into public.column_mapping (def_key, mapping) values ('rawStock', '{"code":"자재코드","qty":"현재고"}')
    on conflict (owner_id, def_key) do update set mapping = excluded.mapping;
  -- 같은 짝을 다시 저장해도 upsert 로 한 행만 남는다
  insert into public.column_mapping (def_key, mapping) values ('rawStock', '{"code":"품번","qty":"현재고"}')
    on conflict (owner_id, def_key) do update set mapping = excluded.mapping;
  perform public._assert_eq((select mapping->>'code' from public.column_mapping where def_key = 'rawStock'),
    '품번'::text, 'column_mapping upsert(onConflict owner_id,def_key)가 덮어쓴다');

  insert into public.upload_slot (slot_id, file_name, row_count) values ('rawCur', '원자재_8월.xlsx', 2) returning id into v_up;
  insert into public.upload_slot (slot_id, file_name, row_count) values ('inbound', '입고.xlsx', 1) returning id into v_mv;
  insert into public.upload_slot (slot_id, file_name, row_count) values ('price', '단가.xlsx', 1) returning id into v_pr;
  insert into public.stock_item (upload_id, code, name, group_name, qty) values
    (v_up, 'RM-1001', '예시원료 A', '원료', 1500), (v_up, 'RM-1001', '예시원료 A', '원료', 20);
  insert into public.stock_movement (upload_id, direction, code, date, qty) values (v_mv, 'inbound', 'RM-1001', '2026-08-20', 300);
  insert into public.unit_price (upload_id, code, price, date) values (v_pr, 'RM-1001', 3200, '2026-01-01');
  -- 같은 자리에 공장별 파일 두 개(part_key 가 다름)
  insert into public.upload_slot (slot_id, part_key, plant, file_name) values ('rawPrev', 'plant:인천', '인천', '본사.xlsx');
  insert into public.upload_slot (slot_id, part_key, plant, file_name) values ('rawPrev', 'plant:대구', '대구', '대구.xlsx');
  perform public._assert_eq((select count(*) from public.upload_slot where slot_id = 'rawPrev'), 2::bigint,
    '같은 자리에 공장별 파일 두 개를 둘 수 있다(part_key)');
  -- 증감 원인 메모 upsert
  insert into public.cause_memo (memo_key, kind, group_name, memo) values ('2026-08-31.all', 'raw', '하우징류', '첫 메모')
    on conflict (owner_id, memo_key, kind, group_name) do update set memo = excluded.memo;
  insert into public.cause_memo (memo_key, kind, group_name, memo) values ('2026-08-31.all', 'raw', '하우징류', '고친 메모')
    on conflict (owner_id, memo_key, kind, group_name) do update set memo = excluded.memo;
  perform public._assert_eq((select memo from public.cause_memo), '고친 메모'::text, 'cause_memo upsert 가 덮어쓴다(한 행)');
  insert into public.dead_confirm (kind, code) values ('raw', 'RM-1') on conflict (owner_id, kind, code) do nothing;
  perform public._assert_eq((select long_raw_months || '/' || long_prod_months || '/' || aging_max_months || '/' || over_enabled from public.app_settings),
    '12/6/36/false'::text, '장기재고 처음 값 원자재 12 · 반제품·제품 6 · 분포 36 · 과잉 끔');
  perform public._assert_eq((select long_raw_op || '/' || long_prod_op || '/' || aging_path || '/' || sales_scope || '/' || recon_tolerance from public.app_settings),
    'gt/ge/out/prod/1'::text, '3차 처음 값: 원자재 초과 · 반제품·제품 이상 · 최근 출고일 경로 · 판매현황 반제품·제품 · 허용 차이 1원');
  -- 반제품 자리 · 판매현황 · 보고서 · 확인함
  insert into public.upload_slot (slot_id, part_key, plant, file_name) values ('semiCur', 'plant:인천', '인천', '본사.xlsx');
  insert into public.cause_memo (memo_key, kind, group_name, memo) values ('2026-08-31.all', 'semi', '고객1', '반제품 메모');
  insert into public.dead_confirm (kind, code) values ('semi', 'SF-1');
  -- 같은 문장(CTE) 안에서 넣은 부모 행은 RLS 의 exists 에 안 보이므로 문장을 나눕니다(앱도 파일 → 품목 순서로 넣을 것)
  insert into public.sales_file (file_name, header_row, mapping, title_from, title_to, stamp_date, partial, min_date, max_date, row_count, used_rows)
    values ('판매현황(26.09).xlsx', 2, '{"code":"품목코드","date":"판매일자","qty":"수량"}', '2026-09-01', '2026-09-30', '2026-09-29', true, '2026-09-01', '2026-09-29', 5, 3) returning id into v_sf;
  insert into public.sales_month (sales_file_id, code, month, qty, last_day) values (v_sf, 'P1', '2026-09', 7, 15);
  insert into public.sales_file (file_name) values ('판매현황(26.09).xlsx')
    on conflict (owner_id, file_name) do update set header_row = 2;
  perform public._assert_eq((select count(*) from public.sales_file), 1::bigint, 'sales_file upsert(onConflict owner_id,file_name) — 같은 이름은 한 행');
  insert into public.report_file (file_name, file_plant, sections) values ('8월재고분석(본사).xlsx', '인천', '[{"sheet":"원자재","kind":"raw"}]');
  insert into public.recon_ack (ack_key) values ('2026-08-31|인천|raw|합계|7|금액') on conflict (owner_id, ack_key) do nothing;
  insert into public.recon_ack (ack_key) values ('2026-08-31|인천|raw|합계|7|금액') on conflict (owner_id, ack_key) do nothing;
  perform public._assert_eq((select count(*) from public.recon_ack), 1::bigint, 'recon_ack 같은 키는 한 행');
  perform public._assert_eq((select agg from (select string_agg(aging_months || '/' || over_months || '/' || dead_months, '') as agg from public.app_settings) q),
    '3, 6, 12/6/12'::text, '새로 만든 기준 설정은 개월 처음 값 3, 6, 12 / 6 / 12');

  perform public._assert_eq((select count(*) from public.stock_item), 2::bigint,
    'A 는 자기 재고 레코드 2건을 본다 (같은 품번 여러 줄 허용)');
  perform public._assert_eq((select owner_id from public.upload_slot where slot_id = 'rawCur'),
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'owner_id 가 auth.uid() 로 채워진다');
end $t$;

-- 트리거는 now()(트랜잭션 시작 시각)를 쓰므로 INSERT 와 다른 문장(트랜잭션)에서 고쳐야 차이가 난다
update public.app_settings set top_n = 5;
do $t$ begin
  perform public._assert((select updated_at > created_at from public.app_settings), 'UPDATE 하면 updated_at 이 갱신된다');
end $t$;

-- ----------------------------------------------------------------------------
-- 사용자 B 는 A 의 자료를 못 본다 · 못 고친다
-- ----------------------------------------------------------------------------
do $t$ begin raise notice '[프로젝트] 사용자 B — A 와 격리'; end $t$;

set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

do $t$
declare t text;
begin
  foreach t in array array['app_settings','column_mapping','upload_slot','stock_item','stock_movement','unit_price','cause_memo','dead_confirm','sales_file','sales_month','report_file','recon_ack']
  loop
    perform public._assert_rows(format('select 1 from public.%I', t), 0, 'B 에게 A 의 ' || t || ' 가 안 보인다');
    perform public._assert_rows(format('update public.%I set updated_at = now()', t), 0, 'B 는 A 의 ' || t || ' 를 못 고친다');
    perform public._assert_rows(format('delete from public.%I', t), 0, 'B 는 A 의 ' || t || ' 를 못 지운다');
  end loop;
end $t$;

do $t$ begin
  perform public._assert_raises(
    $q$insert into public.upload_slot (owner_id, slot_id, file_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'rawPrev', 'x')$q$,
    '42501', 'B 가 owner_id 를 A 로 속여 넣으면 RLS 가 막는다');
  -- A 의 upload_slot id 를 알아내도 거기에 레코드를 끼워 넣지 못한다
  perform public._assert((select min(id) from public.upload_slot) is null,
    'B 에게는 A 의 upload_slot id 자체가 보이지 않는다');
end $t$;

reset role;
do $t$
declare v_up bigint;
begin
  select id into v_up from public.upload_slot where slot_id = 'rawCur';
  execute 'set local role authenticated';
  perform public._assert_raises(
    format('insert into public.stock_item (upload_id, code, qty) values (%s, %L, 1)', v_up, 'X'),
    '42501', 'B 가 A 의 upload_id 를 알아도 레코드를 붙이지 못한다');
end $t$;
reset role;
do $t$
declare v_sf bigint;
begin
  select id into v_sf from public.sales_file limit 1;
  execute 'set local role authenticated';
  perform public._assert_raises(
    format('insert into public.sales_month (sales_file_id, code, month, last_day) values (%s, %L, %L, 1)', v_sf, 'X', '2026-09'),
    '42501', 'B 가 A 의 sales_file id 를 알아도 판매현황 행을 붙이지 못한다');
end $t$;

-- ----------------------------------------------------------------------------
-- anon(비로그인)은 아무것도 못 보고 못 쓴다
-- ----------------------------------------------------------------------------
do $t$ begin raise notice '[프로젝트] anon — 읽기·쓰기 불가'; end $t$;

set role anon;
set request.jwt.claim.sub = '';
do $t$
declare t text;
begin
  foreach t in array array['app_settings','column_mapping','upload_slot','stock_item','stock_movement','unit_price','cause_memo','dead_confirm','sales_file','sales_month','report_file','recon_ack']
  loop
    perform public._assert_rows(format('select 1 from public.%I', t), 0, 'anon 에게 ' || t || ' 가 안 보인다');
  end loop;
  perform public._assert_raises(
    $q$insert into public.upload_slot (slot_id, file_name) values ('rawCur', 'x')$q$,
    '42501', 'anon 은 upload_slot 에 쓰지 못한다');
  perform public._assert_raises(
    $q$insert into public.app_settings (cur_date) values ('2026-08-31')$q$,
    '42501', 'anon 은 app_settings 에 쓰지 못한다');
  perform public._assert_raises('select public.set_updated_at()', '42501', 'anon 은 set_updated_at 을 실행하지 못한다');
end $t$;
reset role;

-- ----------------------------------------------------------------------------
-- CHECK · UNIQUE (postgres 로 — RLS 와 무관하게 제약만 본다)
-- ----------------------------------------------------------------------------
do $t$ begin raise notice '[프로젝트] CHECK · UNIQUE 제약'; end $t$;

do $t$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; v_up bigint;
begin
  select id into v_up from public.upload_slot where owner_id = a and slot_id = 'rawCur';
  perform public._assert_raises(format('insert into public.upload_slot (owner_id, slot_id, file_name) values (%L, %L, %L)', a, 'rawCur', 'dup'),
    '23505', '같은 사용자·같은 자리(slot_id) 두 번은 UNIQUE 가 막는다');
  perform public._assert_raises(format('insert into public.app_settings (owner_id) values (%L)', a),
    '23505', '기준 설정은 사용자당 1행');
  perform public._assert_raises(format('insert into public.column_mapping (owner_id, def_key) values (%L, %L)', a, 'rawStock'),
    '23505', '같은 자료 종류의 컬럼 짝은 1행');
  perform public._assert_raises(format('insert into public.upload_slot (owner_id, slot_id, file_name) values (%L, %L, %L)', a, 'etc', 'x'),
    '23514', '없는 자리 이름(slot_id)은 CHECK 가 막는다');
  perform public._assert_raises(format('insert into public.column_mapping (owner_id, def_key) values (%L, %L)', a, 'unknown'),
    '23514', '없는 자료 종류(def_key)는 CHECK 가 막는다');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, long_raw_months) values (%L, 0)', gen_random_uuid()),
    '23514', '장기재고 기준은 1개월 이상');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, aging_max_months) values (%L, 37)', gen_random_uuid()),
    '23514', '개월별 분포 최대는 36개월까지');
  perform public._assert_raises(format('insert into public.dead_confirm (owner_id, kind, code) values (%L, %L, %L)', a, 'raw', 'RM-1'),
    '23505', '불용 확정은 품목마다 한 행');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, aging_months) values (%L, %L)', gen_random_uuid(), '3, 6.5'),
    '23514', 'Aging 구간은 정수 개월만');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, plant_view) values (%L, %L)', gen_random_uuid(), '중국'),
    '23514', '공장 보기는 합계·인천·대구만');
  perform public._assert_raises(format('insert into public.upload_slot (owner_id, slot_id, part_key, plant, file_name) values (%L, %L, %L, %L, %L)', a, 'rawPrev', 'plant:인천', '인천', 'dup'),
    '23505', '같은 자리·같은 공장 파일 두 번은 UNIQUE 가 막는다');
  perform public._assert_raises(format('insert into public.upload_slot (owner_id, slot_id, part_key, plant, file_name) values (%L, %L, %L, %L, %L)', a, 'rawPrev', 'plant:중국', '중국', 'x'),
    '23514', '중국공장 파일은 CHECK 가 막는다');
  perform public._assert_raises(format('insert into public.stock_item (owner_id, upload_id, code, qty, plant) values (%L, %s, %L, 1, %L)', a, v_up, 'RM-8', '중국'),
    '23514', '중국공장 재고 행은 CHECK 가 막는다');
  perform public._assert_raises(format('insert into public.cause_memo (owner_id, memo_key, kind, group_name) values (%L, %L, %L, %L)', a, 'k', 'etc', 'g'),
    '23514', '증감 원인 메모 종류는 raw/semi/product 만');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, long_raw_op) values (%L, %L)', gen_random_uuid(), 'gte'),
    '23514', '장기재고 방식은 gt(초과)/ge(이상) 만');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, recon_tolerance) values (%L, -1)', gen_random_uuid()),
    '23514', '대조 허용 차이는 음수 불가');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, sales_scope) values (%L, %L)', gen_random_uuid(), 'raw'),
    '23514', '판매현황 적용 대상은 prod/all 만');
  perform public._assert_raises(format('insert into public.sales_month (owner_id, sales_file_id, code, month, last_day) values (%L, %s, %L, %L, 1)', a, (select id from public.sales_file where owner_id = a), 'P2', '2026-13'),
    '23514', '판매현황 달은 YYYY-MM(01~12)');
  perform public._assert_raises(format('insert into public.sales_month (owner_id, sales_file_id, code, month, last_day) values (%L, %s, %L, %L, 32)', a, (select id from public.sales_file where owner_id = a), 'P2', '2026-09'),
    '23514', '마지막 출고일(일)은 1~31');
  perform public._assert_raises(format('insert into public.sales_month (owner_id, sales_file_id, code, month, last_day) values (%L, %s, %L, %L, 3)', a, (select id from public.sales_file where owner_id = a), 'P1', '2026-09'),
    '23505', '같은 파일·품목·달은 한 행');
  perform public._assert_raises(format('insert into public.report_file (owner_id, file_name, file_plant) values (%L, %L, %L)', a, 'x.xlsx', '중국'),
    '23514', '보고서 파일 공장은 인천·대구·미지정만');
  perform public._assert_raises(format('insert into public.sales_file (owner_id, file_name, min_date, max_date) values (%L, %L, %L, %L)', a, 'y.xlsx', '2026-09-30', '2026-09-01'),
    '23514', '판매현황 첫 출고일 ≤ 마지막 출고일');
  delete from public.sales_file where owner_id = a;
  perform public._assert_eq((select count(*) from public.sales_month where owner_id = a), 0::bigint, '판매현황 파일을 빼면 품목·달 행도 지워진다 (on delete cascade)');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, cur_date, prev_date) values (%L, %L, %L)', gen_random_uuid(), '2026-07-31', '2026-08-31'),
    '23514', '전월 기준일이 당월보다 늦으면 CHECK 가 막는다');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, no_out_policy) values (%L, %L)', gen_random_uuid(), 'guess'),
    '23514', '출고 이력 없음 처리(no_out_policy)는 inbound/none 만');
  perform public._assert_raises(format('insert into public.app_settings (owner_id, top_n) values (%L, -1)', gen_random_uuid()),
    '23514', '증가 상위 건수는 음수 불가');
  perform public._assert_raises(format('insert into public.stock_item (owner_id, upload_id, code, qty) values (%L, %s, %L, 1)', a, v_up, '  '),
    '23514', '빈 품번은 CHECK 가 막는다');
  perform public._assert_raises(format('insert into public.stock_item (owner_id, upload_id, code) values (%L, %s, %L)', a, v_up, 'RM-9'),
    '23502', '재고수량 없는 재고 레코드는 NOT NULL 이 막는다');
  perform public._assert_raises(format('insert into public.stock_movement (owner_id, upload_id, direction, code, date) values (%L, %s, %L, %L, %L)', a, v_up, 'sideways', 'RM-1', '2026-08-01'),
    '23514', '입출고 구분은 inbound/outbound 만');
  perform public._assert_raises(format('insert into public.stock_movement (owner_id, upload_id, direction, code) values (%L, %s, %L, %L)', a, v_up, 'inbound', 'RM-1'),
    '23502', '날짜 없는 입출고 이력은 NOT NULL 이 막는다');

  -- 자리를 지우면 딸린 레코드도 함께 지워진다(앱의 「비우기」)
  delete from public.upload_slot where id = v_up;
  perform public._assert_eq((select count(*) from public.stock_item where upload_id = v_up), 0::bigint,
    '자리를 비우면 딸린 재고 레코드도 지워진다 (on delete cascade)');
end $t$;

do $t$ begin raise notice ''; raise notice '전부 통과했습니다.'; end $t$;
