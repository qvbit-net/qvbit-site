-- QVB I.T. CRM
-- Migration: normalized customer/contact email addresses
-- Safe/backward-compatible: legacy customers.email and contacts.email remain in place.

create table if not exists public.customer_emails (
  id uuid default gen_random_uuid() not null,
  customer_id uuid not null,
  email text not null,
  label text default 'Other' not null,
  is_primary boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint customer_emails_pkey primary key (id),
  constraint customer_emails_customer_fk
    foreign key (customer_id) references public.customers(id) on delete cascade,
  constraint customer_emails_email_not_blank check (length(btrim(email)) > 0),
  constraint customer_emails_label_not_blank check (length(btrim(label)) > 0)
);

create table if not exists public.contact_emails (
  id uuid default gen_random_uuid() not null,
  contact_id uuid not null,
  email text not null,
  label text default 'Other' not null,
  is_primary boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint contact_emails_pkey primary key (id),
  constraint contact_emails_contact_fk
    foreign key (contact_id) references public.contacts(id) on delete cascade,
  constraint contact_emails_email_not_blank check (length(btrim(email)) > 0),
  constraint contact_emails_label_not_blank check (length(btrim(label)) > 0)
);

create unique index if not exists customer_emails_one_primary_idx
  on public.customer_emails(customer_id)
  where is_primary = true;

create unique index if not exists contact_emails_one_primary_idx
  on public.contact_emails(contact_id)
  where is_primary = true;

create unique index if not exists customer_emails_customer_email_idx
  on public.customer_emails(customer_id, lower(btrim(email)));

create unique index if not exists contact_emails_contact_email_idx
  on public.contact_emails(contact_id, lower(btrim(email)));

create index if not exists customer_emails_customer_id_idx
  on public.customer_emails(customer_id);

create index if not exists contact_emails_contact_id_idx
  on public.contact_emails(contact_id);

alter table public.customer_emails enable row level security;
alter table public.contact_emails enable row level security;

drop policy if exists "Authenticated users can select customer emails" on public.customer_emails;
drop policy if exists "Authenticated users can insert customer emails" on public.customer_emails;
drop policy if exists "Authenticated users can update customer emails" on public.customer_emails;
drop policy if exists "Authenticated users can delete customer emails" on public.customer_emails;

create policy "Authenticated users can select customer emails"
  on public.customer_emails for select to authenticated using (true);
create policy "Authenticated users can insert customer emails"
  on public.customer_emails for insert to authenticated with check (true);
create policy "Authenticated users can update customer emails"
  on public.customer_emails for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete customer emails"
  on public.customer_emails for delete to authenticated using (true);

drop policy if exists "Authenticated users can select contact emails" on public.contact_emails;
drop policy if exists "Authenticated users can insert contact emails" on public.contact_emails;
drop policy if exists "Authenticated users can update contact emails" on public.contact_emails;
drop policy if exists "Authenticated users can delete contact emails" on public.contact_emails;

create policy "Authenticated users can select contact emails"
  on public.contact_emails for select to authenticated using (true);
create policy "Authenticated users can insert contact emails"
  on public.contact_emails for insert to authenticated with check (true);
create policy "Authenticated users can update contact emails"
  on public.contact_emails for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete contact emails"
  on public.contact_emails for delete to authenticated using (true);

grant select, insert, update, delete on table public.customer_emails to authenticated;
grant select, insert, update, delete on table public.contact_emails to authenticated;

grant all on table public.customer_emails to service_role;
grant all on table public.contact_emails to service_role;

-- Backfill legacy customer emails as primary addresses without creating duplicates.
insert into public.customer_emails (customer_id, email, label, is_primary)
select c.id, btrim(c.email), 'Primary', true
from public.customers c
where nullif(btrim(c.email), '') is not null
  and not exists (
    select 1
    from public.customer_emails ce
    where ce.customer_id = c.id
      and lower(btrim(ce.email)) = lower(btrim(c.email))
  );

-- Backfill legacy contact emails as primary addresses without repurposing contacts.is_primary.
insert into public.contact_emails (contact_id, email, label, is_primary)
select c.id, btrim(c.email), 'Primary', true
from public.contacts c
where nullif(btrim(c.email), '') is not null
  and not exists (
    select 1
    from public.contact_emails ce
    where ce.contact_id = c.id
      and lower(btrim(ce.email)) = lower(btrim(c.email))
  );

-- Keep the new tables as the source for additional addresses. Legacy email columns
-- remain for compatibility with the existing CRM until the UI migration is complete.
