alter table public.user_profiles add column if not exists email text;

update public.user_profiles up
set email = au.email
from auth.users au
where au.id = up.id
  and coalesce(up.email, '') <> coalesce(au.email, '');

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
begin
  insert into public.user_profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'read_only'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.user_profiles.display_name, excluded.display_name);
  return new;
end;
$function$;

create or replace function public.sync_user_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $function$
begin
  if new.email is distinct from old.email then
    update public.user_profiles
    set email = new.email,
        updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_email_updated_profile on auth.users;
create trigger on_auth_user_email_updated_profile
after update of email on auth.users
for each row
execute function public.sync_user_profile_email();

revoke all on function public.sync_user_profile_email() from public;
revoke all on function public.sync_user_profile_email() from anon;
revoke all on function public.sync_user_profile_email() from authenticated;

grant execute on function public.sync_user_profile_email() to postgres;
