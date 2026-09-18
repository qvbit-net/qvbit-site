-- QVB I.T. CRM
-- Field services / infrastructure / managed IT foundation.
-- Intentionally does NOT modify customer_emails, contact_emails, email settings, or email UI.

create table if not exists public.technicians (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  email text,
  phone text,
  role text not null default 'technician'
    check (role in ('technician','network_engineer','field_engineer','dispatcher','subcontractor')),
  hourly_cost numeric(12,2) not null default 0,
  default_bill_rate numeric(12,2) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists technicians_user_id_idx on public.technicians(user_id) where user_id is not null;
create index if not exists technicians_active_idx on public.technicians(active);

create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  project_number text unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'planning'
    check (status in ('planning','scheduled','in_progress','on_hold','completed','cancelled')),
  start_date date,
  target_date date,
  completed_date date,
  estimated_revenue numeric(12,2) not null default 0,
  estimated_cost numeric(12,2) not null default 0,
  actual_revenue numeric(12,2) not null default 0,
  actual_cost numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_customer_id_idx on public.projects(customer_id);
create index if not exists projects_status_idx on public.projects(status);

create table if not exists public.project_jobs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, job_id)
);

create table if not exists public.job_assignments (
  id uuid default gen_random_uuid() primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  technician_id uuid not null references public.technicians(id) on delete restrict,
  assignment_role text not null default 'assigned'
    check (assignment_role in ('lead','assigned','helper','subcontractor')),
  status text not null default 'assigned'
    check (status in ('assigned','confirmed','in_progress','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, technician_id)
);

create index if not exists job_assignments_job_id_idx on public.job_assignments(job_id);
create index if not exists job_assignments_technician_id_idx on public.job_assignments(technician_id);

alter table public.jobs add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.jobs add column if not exists ticket_id uuid references public.tickets(id) on delete set null;
create index if not exists jobs_project_id_idx on public.jobs(project_id);
create index if not exists jobs_ticket_id_idx on public.jobs(ticket_id);

alter table public.services add column if not exists category text not null default 'field_services'
  check (category in ('field_services','network_engineering','managed_it','partner_services','hardware','other'));
alter table public.services add column if not exists billing_model text not null default 'one_time'
  check (billing_model in ('one_time','recurring','project','usage'));
alter table public.services add column if not exists default_cost numeric(12,2) not null default 0;
create index if not exists services_category_idx on public.services(category);
create index if not exists services_billing_model_idx on public.services(billing_model);

create table if not exists public.service_contract_items (
  id uuid default gen_random_uuid() primary key,
  contract_id uuid not null references public.service_contracts(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  line_amount numeric(12,2) generated always as (quantity * unit_price) stored,
  line_cost numeric(12,2) generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_contract_items_contract_id_idx on public.service_contract_items(contract_id);

alter table public.technicians enable row level security;
alter table public.projects enable row level security;
alter table public.project_jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.service_contract_items enable row level security;

drop policy if exists "Authenticated users can manage technicians" on public.technicians;
create policy "Authenticated users can manage technicians" on public.technicians for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage projects" on public.projects;
create policy "Authenticated users can manage projects" on public.projects for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage project jobs" on public.project_jobs;
create policy "Authenticated users can manage project jobs" on public.project_jobs for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage job assignments" on public.job_assignments;
create policy "Authenticated users can manage job assignments" on public.job_assignments for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can manage service contract items" on public.service_contract_items;
create policy "Authenticated users can manage service contract items" on public.service_contract_items for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.technicians to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_jobs to authenticated;
grant select, insert, update, delete on public.job_assignments to authenticated;
grant select, insert, update, delete on public.service_contract_items to authenticated;

grant all on public.technicians to service_role;
grant all on public.projects to service_role;
grant all on public.project_jobs to service_role;
grant all on public.job_assignments to service_role;
grant all on public.service_contract_items to service_role;

insert into public.crm_permissions (role, module, can_view, can_create, can_update, can_delete)
select r.role, 'projects', true, true, true, false
from (values ('owner'),('admin'),('manager'),('technician')) as r(role)
where not exists (select 1 from public.crm_permissions p where p.role = r.role and p.module = 'projects');

insert into public.crm_permissions (role, module, can_view, can_create, can_update, can_delete)
select r.role, 'dispatch', true, true, true, false
from (values ('owner'),('admin'),('manager'),('technician')) as r(role)
where not exists (select 1 from public.crm_permissions p where p.role = r.role and p.module = 'dispatch');
