begin;

-- Keep the oldest service row for each normalized service name.
-- Repoint every existing service foreign key before removing duplicate rows.
with ranked as (
  select id,
         first_value(id) over (
           partition by lower(trim(name))
           order by created_at, id
         ) as canonical_id,
         row_number() over (
           partition by lower(trim(name))
           order by created_at, id
         ) as rn
  from public.services
)
update public.quote_items qi
set service_id = r.canonical_id
from ranked r
where qi.service_id = r.id
  and r.rn > 1;

with ranked as (
  select id,
         first_value(id) over (
           partition by lower(trim(name))
           order by created_at, id
         ) as canonical_id,
         row_number() over (
           partition by lower(trim(name))
           order by created_at, id
         ) as rn
  from public.services
)
update public.invoice_items ii
set service_id = r.canonical_id
from ranked r
where ii.service_id = r.id
  and r.rn > 1;

with ranked as (
  select id,
         first_value(id) over (
           partition by lower(trim(name))
           order by created_at, id
         ) as canonical_id,
         row_number() over (
           partition by lower(trim(name))
           order by created_at, id
         ) as rn
  from public.services
)
update public.service_contract_items sci
set service_id = r.canonical_id
from ranked r
where sci.service_id = r.id
  and r.rn > 1;

with ranked as (
  select id,
         first_value(id) over (
           partition by lower(trim(name))
           order by created_at, id
         ) as canonical_id,
         row_number() over (
           partition by lower(trim(name))
           order by created_at, id
         ) as rn
  from public.services
)
update public.service_contracts sc
set service_id = r.canonical_id
from ranked r
where sc.service_id = r.id
  and r.rn > 1;

with ranked as (
  select id,
         row_number() over (
           partition by lower(trim(name))
           order by created_at, id
         ) as rn
  from public.services
)
delete from public.services s
using ranked r
where s.id = r.id
  and r.rn > 1;

-- Expand service units to support the recurring MSP model.
alter table public.services drop constraint if exists services_unit_check;
alter table public.services
  add constraint services_unit_check
  check (unit = any (array[
    'job'::text, 'run'::text, 'hour'::text, 'day'::text, 'each'::text,
    'user'::text, 'device'::text, 'site'::text, 'month'::text
  ]));

-- Normalize the surviving catalog into QVB I.T.'s intended service structure.
update public.services set category='field_services', billing_model='one_time', unit='job'
where lower(trim(name))='equipment staging';

update public.services set category='field_services', billing_model='one_time', unit='run', default_price=coalesce(default_price,149)
where lower(trim(name))='ethernet drop';

update public.services set category='managed_it', billing_model='recurring', unit='user'
where lower(trim(name))='managed it / network services';

update public.services set category='network_engineering', billing_model='one_time', unit='hour'
where lower(trim(name))='network configuration';

update public.services set category='network_engineering', billing_model='project', unit='job'
where lower(trim(name))='network installation';

update public.services set category='network_engineering', billing_model='project', unit='job'
where lower(trim(name))='network survey';

update public.services set category='field_services', billing_model='one_time', unit='hour'
where lower(trim(name))='remote hands';

update public.services set category='partner_services', billing_model='project', unit='job'
where lower(trim(name))='structured cabling';

update public.services set category='partner_services', billing_model='project', unit='each'
where lower(trim(name))='security camera cabling';

update public.services set category='partner_services', billing_model='project', unit='each'
where lower(trim(name))='wireless ap cabling';

create unique index if not exists services_normalized_name_uidx
  on public.services (lower(trim(name)));

commit;