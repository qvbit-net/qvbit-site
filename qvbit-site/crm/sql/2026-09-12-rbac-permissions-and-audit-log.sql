create table if not exists public.crm_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('owner','admin','manager','technician','billing','read_only')),
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, module)
);

create table if not exists public.crm_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  module text,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_crm_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role from public.user_profiles where id = auth.uid() and is_active = true), 'read_only');
$$;

create or replace function public.has_crm_permission(permission_module text, permission_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case when public.current_crm_role() = 'owner' then true else exists (
    select 1 from public.crm_permissions p
    where p.role = public.current_crm_role()
      and p.module = permission_module
      and case permission_action
        when 'view' then p.can_view
        when 'create' then p.can_create
        when 'update' then p.can_update
        when 'delete' then p.can_delete
        else false
      end
  ) end;
$$;

revoke all on public.crm_permissions from anon;
revoke all on public.crm_audit_log from anon;
grant select on public.crm_permissions to authenticated;
grant select, insert on public.crm_audit_log to authenticated;

alter table public.crm_permissions enable row level security;
alter table public.crm_audit_log enable row level security;

drop policy if exists "Authenticated users can read CRM permissions" on public.crm_permissions;
create policy "Authenticated users can read CRM permissions" on public.crm_permissions
for select to authenticated using (auth.uid() is not null);

drop policy if exists "Authenticated users can write audit entries" on public.crm_audit_log;
create policy "Authenticated users can write audit entries" on public.crm_audit_log
for insert to authenticated with check (actor_id = auth.uid());

drop policy if exists "Owners can read audit entries" on public.crm_audit_log;
create policy "Owners can read audit entries" on public.crm_audit_log
for select to authenticated using (public.current_crm_role() = 'owner');

insert into public.crm_permissions (role, module, can_view, can_create, can_update, can_delete)
values
('admin','dashboard',true,false,false,false),('admin','leads',true,true,true,false),('admin','opportunities',true,true,true,false),('admin','customers',true,true,true,false),('admin','quotes',true,true,true,false),('admin','jobs',true,true,true,false),('admin','invoices',true,true,true,false),('admin','accounts_receivable',true,true,true,false),('admin','expenses',true,true,true,false),('admin','inventory',true,true,true,false),('admin','services',true,true,true,false),('admin','tickets',true,true,true,false),('admin','profitability',true,false,false,false),('admin','time_tracking',true,true,true,false),('admin','calendar',true,true,true,false),('admin','documents',true,true,true,false),('admin','purchase_orders',true,true,true,false),('admin','activity',true,true,true,false),('admin','follow_ups',true,true,true,false),
('manager','dashboard',true,false,false,false),('manager','leads',true,true,true,false),('manager','opportunities',true,true,true,false),('manager','customers',true,true,true,false),('manager','quotes',true,true,true,false),('manager','jobs',true,true,true,false),('manager','tickets',true,true,true,false),('manager','calendar',true,true,true,false),('manager','follow_ups',true,true,true,false),
('technician','dashboard',true,false,false,false),('technician','customers',true,false,false,false),('technician','jobs',true,true,true,false),('technician','tickets',true,true,true,false),('technician','services',true,false,false,false),('technician','time_tracking',true,true,true,false),('technician','calendar',true,false,false,false),
('billing','dashboard',true,false,false,false),('billing','customers',true,true,true,false),('billing','quotes',true,true,true,false),('billing','invoices',true,true,true,false),('billing','accounts_receivable',true,true,true,false),('billing','expenses',true,true,true,false),('billing','profitability',true,true,true,false),
('read_only','dashboard',true,false,false,false),('read_only','customers',true,false,false,false),('read_only','leads',true,false,false,false),('read_only','jobs',true,false,false,false),('read_only','tickets',true,false,false,false)
on conflict (role, module) do update set can_view=excluded.can_view, can_create=excluded.can_create, can_update=excluded.can_update, can_delete=excluded.can_delete, updated_at=now();
