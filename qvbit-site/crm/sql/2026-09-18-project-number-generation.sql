-- QVB I.T. CRM
-- Generate project numbers such as PRJ-2026-0001.
-- Does not modify email tables or email settings.

create sequence if not exists public.project_number_seq start 1;

create or replace function public.set_project_number()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if nullif(btrim(new.project_number), '') is null then
    new.project_number := 'PRJ-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-' || lpad(nextval('public.project_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_project_number on public.projects;
create trigger trg_projects_project_number
before insert on public.projects
for each row execute function public.set_project_number();
