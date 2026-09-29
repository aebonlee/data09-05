-- ============================================================================
-- 로컬 검증 전용 — 예전 판(2026-09-28, 일 단위·자리마다 파일 하나) 위에 새 schema.sql 을
-- 다시 실행했을 때 칸이 더해지고 일 단위 설정이 개월로 바뀌는지 본다. (운영 실행 금지, 가드 내장)
-- run.sh 가 v1_schema.local.sql → 이 파일의 「준비」 → schema.sql → 이 파일의 「검사」 순으로 부른다.
-- ============================================================================
do $guard$
begin
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator'))
     or exists (select 1 from pg_namespace where nspname = 'graphql') then
    raise exception '이 파일은 로컬 검증 전용입니다. 운영 데이터베이스에서 실행할 수 없습니다.';
  end if;
end;
$guard$;

\if :{?phase_check}
do $t$
declare r record;
begin
  select * into r from public.app_settings where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if r.aging_months is distinct from '3, 6, 12' or r.over_months <> 6 or r.dead_months <> 12 then
    raise exception 'FAIL  90·180·365일 → 3, 6, 12 / 6 / 12개월 변환 (실제 % / % / %)', r.aging_months, r.over_months, r.dead_months;
  end if;
  raise notice '  OK   예전 일 단위 설정(90·180·365, 과잉 180, 불용 365)이 개월(3, 6, 12 / 6 / 12)로 바뀐다';
  select * into r from public.app_settings where owner_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if r.aging_months is distinct from '1, 2' or r.over_months <> 2 or r.dead_months <> 4 then
    raise exception 'FAIL  30·45·60일 → 1, 2 (실제 % / % / %)', r.aging_months, r.over_months, r.dead_months;
  end if;
  raise notice '  OK   30·45·60일 → 1, 2개월(겹침 제거), 과잉 60일 → 2, 불용 120일 → 4';
  if exists (select 1 from pg_constraint where conname = 'upload_slot_owner_slot_key') then
    raise exception 'FAIL  예전 UNIQUE(owner_id, slot_id)가 남아 있다';
  end if;
  insert into public.upload_slot (owner_id, slot_id, part_key, plant, file_name)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'rawCur', 'plant:대구', '대구', '대구.xlsx');
  raise notice '  OK   예전 자리(rawCur) 옆에 공장별 파일을 더 넣을 수 있다';
  if (select count(*) from public.stock_item where plant = '') <> 1 then raise exception 'FAIL  예전 재고 행이 남아 있지 않다'; end if;
  raise notice '  OK   예전 재고 행은 그대로(공장 미지정)';
  insert into public.app_settings (owner_id) values ('aaaaaaaa-0000-0000-0000-000000000003');
  raise notice '  OK   예전 일 단위 칸의 NOT NULL 이 풀려 새 설정을 넣을 수 있다';
end $t$;
\else
-- 준비: 예전 판에 일 단위 설정과 자료를 넣어 둔다
insert into public.app_settings (owner_id, aging_bounds, over_days, dead_days)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '90, 180, 365', 180, 365),
         ('aaaaaaaa-0000-0000-0000-000000000002', '30, 45, 60', 60, 120);
with u as (insert into public.upload_slot (owner_id, slot_id, file_name)
           values ('aaaaaaaa-0000-0000-0000-000000000001', 'rawCur', 'old.xlsx') returning id)
insert into public.stock_item (owner_id, upload_id, code, qty) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'RM-1', 5 from u;
\endif
