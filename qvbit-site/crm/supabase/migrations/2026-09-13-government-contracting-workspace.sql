create table if not exists public.gov_contracting_profile (
  id boolean primary key default true check (id = true),
  legal_name text not null default 'Q-VENTURES BAY LLC',
  dba text not null default 'QVB I.T.',
  certification_type text not null default 'SDVOSB',
  certification_status text not null default 'active',
  certification_approval_date date,
  certification_expiration_date date,
  sam_status text not null default 'active',
  sam_expiration_date date,
  uei text,
  cage_code text,
  capabilities_statement_url text,
  primary_naics text,
  notes text,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.gov_prime_contractors (
  id uuid primary key default gen_random_uuid(), company_name text not null, website text, poc_name text, poc_email text,
  poc_phone text, relationship_status text not null default 'prospect' check (relationship_status in ('prospect','active','preferred','inactive')),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gov_opportunities (
  id uuid primary key default gen_random_uuid(), opportunity_number text, title text not null,
  source text not null default 'SAM.gov' check (source in ('SAM.gov','SUBNet','agency','prime','other')),
  pursuit_type text not null default 'prime' check (pursuit_type in ('prime','subcontract')),
  agency text, prime_contractor_id uuid references public.gov_prime_contractors(id) on delete set null,
  solicitation_url text, set_aside text, naics_code text, contract_type text, place_of_performance text,
  estimated_value numeric not null default 0, posted_date date, response_deadline timestamptz, site_visit_date timestamptz,
  status text not null default 'new' check (status in ('new','reviewing','qualified','bidding','submitted','won','lost','no_bid','closed')),
  probability numeric not null default 0 check (probability >= 0 and probability <= 100), next_action text, next_action_date date,
  description text, notes text, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gov_contracts (
  id uuid primary key default gen_random_uuid(), contract_number text, opportunity_id uuid references public.gov_opportunities(id) on delete set null,
  pursuit_type text not null default 'subcontract' check (pursuit_type in ('prime','subcontract')), agency text,
  prime_contractor_id uuid references public.gov_prime_contractors(id) on delete set null, title text not null,
  award_date date, start_date date, end_date date, contract_value numeric not null default 0, funded_amount numeric not null default 0,
  status text not null default 'active' check (status in ('draft','active','on_hold','completed','terminated')),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gov_compliance_items (
  id uuid primary key default gen_random_uuid(), name text not null,
  category text not null default 'general' check (category in ('certification','registration','insurance','bonding','contract','safety','other')),
  status text not null default 'active' check (status in ('active','due_soon','expired','not_applicable')),
  due_date date, owner_name text, reference_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into public.gov_contracting_profile (id, legal_name, dba, certification_type, certification_status, certification_approval_date, sam_status, uei, cage_code, notes, last_verified_at)
values (true, 'Q-VENTURES BAY LLC', 'QVB I.T.', 'SDVOSB', 'active', '2026-08-01', 'active', 'XWA3SL25N285', '224T6',
  'SBA VetCert SDVOSB certification reported by QVB I.T. in September 2026. Certification expiration and SAM renewal dates should be verified against current official records before being treated as deadlines.', now())
on conflict (id) do update set legal_name=excluded.legal_name, dba=excluded.dba, certification_type=excluded.certification_type,
  certification_status=excluded.certification_status, certification_approval_date=excluded.certification_approval_date,
  sam_status=excluded.sam_status, uei=excluded.uei, cage_code=excluded.cage_code, notes=excluded.notes,
  last_verified_at=excluded.last_verified_at, updated_at=now();

insert into public.gov_compliance_items (name, category, status, owner_name, notes)
select 'SBA VetCert SDVOSB certification', 'certification', 'active', 'QVB I.T.', 'Check current SBA certification listing before relying on eligibility.'
where not exists (select 1 from public.gov_compliance_items where name='SBA VetCert SDVOSB certification');

insert into public.gov_compliance_items (name, category, status, owner_name, notes)
select 'SAM.gov registration', 'registration', 'active', 'QVB I.T.', 'Keep SAM entity registration and representations current.'
where not exists (select 1 from public.gov_compliance_items where name='SAM.gov registration');

alter table public.gov_contracting_profile enable row level security;
alter table public.gov_prime_contractors enable row level security;
alter table public.gov_opportunities enable row level security;
alter table public.gov_contracts enable row level security;
alter table public.gov_compliance_items enable row level security;

create policy gov_profile_select on public.gov_contracting_profile for select to authenticated using (has_crm_permission('services','can_view'));
create policy gov_profile_insert on public.gov_contracting_profile for insert to authenticated with check (has_crm_permission('services','can_create'));
create policy gov_profile_update on public.gov_contracting_profile for update to authenticated using (has_crm_permission('services','can_update')) with check (has_crm_permission('services','can_update'));
create policy gov_primes_select on public.gov_prime_contractors for select to authenticated using (has_crm_permission('services','can_view'));
create policy gov_primes_insert on public.gov_prime_contractors for insert to authenticated with check (has_crm_permission('services','can_create'));
create policy gov_primes_update on public.gov_prime_contractors for update to authenticated using (has_crm_permission('services','can_update')) with check (has_crm_permission('services','can_update'));
create policy gov_primes_delete on public.gov_prime_contractors for delete to authenticated using (has_crm_permission('services','can_delete'));
create policy gov_opps_select on public.gov_opportunities for select to authenticated using (has_crm_permission('services','can_view'));
create policy gov_opps_insert on public.gov_opportunities for insert to authenticated with check (has_crm_permission('services','can_create'));
create policy gov_opps_update on public.gov_opportunities for update to authenticated using (has_crm_permission('services','can_update')) with check (has_crm_permission('services','can_update'));
create policy gov_opps_delete on public.gov_opportunities for delete to authenticated using (has_crm_permission('services','can_delete'));
create policy gov_contracts_select on public.gov_contracts for select to authenticated using (has_crm_permission('services','can_view'));
create policy gov_contracts_insert on public.gov_contracts for insert to authenticated with check (has_crm_permission('services','can_create'));
create policy gov_contracts_update on public.gov_contracts for update to authenticated using (has_crm_permission('services','can_update')) with check (has_crm_permission('services','can_update'));
create policy gov_contracts_delete on public.gov_contracts for delete to authenticated using (has_crm_permission('services','can_delete'));
create policy gov_compliance_select on public.gov_compliance_items for select to authenticated using (has_crm_permission('services','can_view'));
create policy gov_compliance_insert on public.gov_compliance_items for insert to authenticated with check (has_crm_permission('services','can_create'));
create policy gov_compliance_update on public.gov_compliance_items for update to authenticated using (has_crm_permission('services','can_update')) with check (has_crm_permission('services','can_update'));
create policy gov_compliance_delete on public.gov_compliance_items for delete to authenticated using (has_crm_permission('services','can_delete'));

create index if not exists gov_opportunities_deadline_idx on public.gov_opportunities(response_deadline);
create index if not exists gov_opportunities_status_idx on public.gov_opportunities(status);
create index if not exists gov_contracts_status_idx on public.gov_contracts(status);
create index if not exists gov_compliance_due_date_idx on public.gov_compliance_items(due_date);
