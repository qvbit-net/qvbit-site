-- QVB I.T. CRM: prepare for Supabase's October 30, 2026 Data API change.
-- Existing tables retain their current grants. These statements only change
-- default privileges for future objects created by the postgres role.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role, public;

alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;
