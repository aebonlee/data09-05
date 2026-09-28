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
    6::bigint, '두 번 적용 후 updated_at 트리거 6개');
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
declare v_up bigint; v_mv bigint; v_pr bigint;
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
  foreach t in array array['app_settings','column_mapping','upload_slot','stock_item','stock_movement','unit_price']
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

-- ----------------------------------------------------------------------------
-- anon(비로그인)은 아무것도 못 보고 못 쓴다
-- ----------------------------------------------------------------------------
do $t$ begin raise notice '[프로젝트] anon — 읽기·쓰기 불가'; end $t$;

set role anon;
set request.jwt.claim.sub = '';
do $t$
declare t text;
begin
  foreach t in array array['app_settings','column_mapping','upload_slot','stock_item','stock_movement','unit_price']
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
  perform public._assert_raises(format('insert into public.app_settings (owner_id, over_days, dead_days) values (%L, 400, 300)', gen_random_uuid()),
    '23514', '불용 기준 < 과잉 기준은 CHECK 가 막는다');
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
