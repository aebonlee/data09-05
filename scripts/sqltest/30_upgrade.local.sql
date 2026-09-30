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
  if (select long_raw_months from public.app_settings where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 12 then raise exception 'FAIL  장기재고 칸이 더해지지 않았다'; end if;
  raise notice '  OK   예전 설정 행에 장기재고 기준(원자재 12·제품 6) 칸이 더해진다';
  select * into r from public.app_settings where owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if r.aging_max_months <> 36 or r.long_raw_op <> 'gt' or r.long_prod_op <> 'ge' or r.sales_scope <> 'prod' then
    raise exception 'FAIL  3차 칸(분포 36·원자재 초과·반제품·제품 이상·판매현황 반제품·제품) (실제 % / % / % / %)', r.aging_max_months, r.long_raw_op, r.long_prod_op, r.sales_scope;
  end if;
  raise notice '  OK   예전 설정 행: 분포 최대 12 → 36, 원자재 「초과」·반제품·제품 「이상」 칸이 더해진다';
  -- 9차: 준비 단계에서 v0.5 처럼 recon_units 칸을 먼저 만들어 두었다(1번 행 빈칸, 2번 행 직접 적은 줄)
  if r.recon_units is distinct from E'총괄 금액=백만원\n* 금액=원' then raise exception 'FAIL  칸 단위가 빈칸이던 예전 행에 9차 처음 값이 들어가지 않았다 (실제 %)', r.recon_units; end if;
  raise notice '  OK   칸 단위가 빈칸이던 예전 행 → 「총괄 금액=백만원 / * 금액=원」';
  if (select recon_units from public.app_settings where owner_id = 'aaaaaaaa-0000-0000-0000-000000000002') is distinct from '대구 반제품 7월 금액=×10' then
    raise exception 'FAIL  직접 적어 둔 칸 단위가 바뀌었다';
  end if;
  raise notice '  OK   직접 적어 둔 칸 단위 줄은 그대로';
  if r.raw_china_sales <> 'on' or r.china_customers <> '' then raise exception 'FAIL  중국공장 칸(raw_china_sales·china_customers)이 더해지지 않았다'; end if;
  raise notice '  OK   예전 설정 행에 중국공장 판매 칸(켜짐·거래처 빈칸)이 더해진다';
  insert into public.upload_slot (owner_id, slot_id, part_key, plant, file_name)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'semiCur', 'plant:인천', '인천', '반제품.xlsx');
  raise notice '  OK   예전 판 위에서도 반제품 자리(semiCur)를 쓸 수 있다';
end $t$;
\else
-- 준비: 예전 판에 일 단위 설정과 자료를 넣어 둔다
insert into public.app_settings (owner_id, aging_bounds, over_days, dead_days)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '90, 180, 365', 180, 365),
         ('aaaaaaaa-0000-0000-0000-000000000002', '30, 45, 60', 60, 120);
-- v0.5(2026-09-30 오전) 판에만 있던 칸 단위 칸을 흉내: 1번 행 빈칸(처음 값 그대로), 2번 행 직접 적은 줄
alter table public.app_settings add column recon_units text not null default '';
update public.app_settings set recon_units = '대구 반제품 7월 금액=×10' where owner_id = 'aaaaaaaa-0000-0000-0000-000000000002';
with u as (insert into public.upload_slot (owner_id, slot_id, file_name)
           values ('aaaaaaaa-0000-0000-0000-000000000001', 'rawCur', 'old.xlsx') returning id)
insert into public.stock_item (owner_id, upload_id, code, qty) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'RM-1', 5 from u;
\endif
