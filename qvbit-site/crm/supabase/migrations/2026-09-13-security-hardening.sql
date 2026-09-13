begin;

-- Restrict internal SECURITY DEFINER helpers from the unauthenticated API role.
revoke execute on function public.audit_crm_record_change() from anon;
revoke execute on function public.convert_quote_to_job_and_invoice(uuid, boolean) from anon;
revoke execute on function public.list_ticket_assignment_users() from anon;
revoke execute on function public.next_service_contract_number() from anon;
revoke execute on function public.set_msp_updated_at() from anon;
revoke execute on function public.sync_invoice_payment_rollup() from anon;
revoke execute on function public.validate_ticket_assignment() from anon;

-- Pin the ticket-number trigger function to trusted schemas so its function
-- body cannot resolve objects through a mutable search_path.
alter function public.assign_qvb_ticket_number() set search_path = public, pg_catalog;

commit;
