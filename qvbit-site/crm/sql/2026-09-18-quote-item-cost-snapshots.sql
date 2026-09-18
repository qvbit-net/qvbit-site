alter table public.quote_items
  add column if not exists unit_cost numeric not null default 0;

alter table public.quote_items
  add column if not exists line_cost numeric generated always as (quantity * unit_cost) stored;

create index if not exists quote_items_quote_id_idx on public.quote_items (quote_id);
