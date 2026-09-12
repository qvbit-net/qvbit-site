create or replace function public.audit_crm_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  old_json jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else to_jsonb(OLD) end;
  new_json jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else to_jsonb(NEW) end;
  changed_columns jsonb := '[]'::jsonb;
  record_id_text text;
  audit_action text;
begin
  record_id_text := coalesce(new_json ->> 'id', old_json ->> 'id');

  if TG_OP = 'INSERT' then
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
      into changed_columns
    from jsonb_object_keys(new_json) as key
    where key not in ('id', 'created_at', 'updated_at');
    audit_action := 'create_record';
  elsif TG_OP = 'UPDATE' then
    select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb)
      into changed_columns
    from jsonb_each(new_json) as n(key, value)
    join jsonb_each(old_json) as o(key, value) using (key)
    where n.key not in ('id', 'created_at', 'updated_at')
      and n.value is distinct from o.value;
    if changed_columns = '[]'::jsonb then
      return new;
    end if;
    audit_action := 'update_record';
  else
    audit_action := 'delete_record';
  end if;

  insert into public.crm_audit_log(actor_id, action, module, record_id, details)
  values (
    auth.uid(),
    audit_action,
    TG_ARGV[0],
    record_id_text,
    jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'operation', TG_OP,
      'changed_columns', changed_columns
    )
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists audit_crm_customers on public.customers;
create trigger audit_crm_customers after insert or update or delete on public.customers for each row execute function public.audit_crm_record_change('customers');

drop trigger if exists audit_crm_leads on public.leads;
create trigger audit_crm_leads after insert or update or delete on public.leads for each row execute function public.audit_crm_record_change('leads');

drop trigger if exists audit_crm_opportunities on public.opportunities;
create trigger audit_crm_opportunities after insert or update or delete on public.opportunities for each row execute function public.audit_crm_record_change('opportunities');

drop trigger if exists audit_crm_quotes on public.quotes;
create trigger audit_crm_quotes after insert or update or delete on public.quotes for each row execute function public.audit_crm_record_change('quotes');

drop trigger if exists audit_crm_invoices on public.invoices;
create trigger audit_crm_invoices after insert or update or delete on public.invoices for each row execute function public.audit_crm_record_change('invoices');

drop trigger if exists audit_crm_invoice_payments on public.invoice_payments;
create trigger audit_crm_invoice_payments after insert or update or delete on public.invoice_payments for each row execute function public.audit_crm_record_change('invoice_payments');

drop trigger if exists audit_crm_jobs on public.jobs;
create trigger audit_crm_jobs after insert or update or delete on public.jobs for each row execute function public.audit_crm_record_change('jobs');

drop trigger if exists audit_crm_tickets on public.tickets;
create trigger audit_crm_tickets after insert or update or delete on public.tickets for each row execute function public.audit_crm_record_change('tickets');

drop trigger if exists audit_crm_expenses on public.expenses;
create trigger audit_crm_expenses after insert or update or delete on public.expenses for each row execute function public.audit_crm_record_change('expenses');

drop trigger if exists audit_crm_inventory_items on public.inventory_items;
create trigger audit_crm_inventory_items after insert or update or delete on public.inventory_items for each row execute function public.audit_crm_record_change('inventory');

drop trigger if exists audit_crm_services on public.services;
create trigger audit_crm_services after insert or update or delete on public.services for each row execute function public.audit_crm_record_change('services');

drop trigger if exists audit_crm_purchase_orders on public.purchase_orders;
create trigger audit_crm_purchase_orders after insert or update or delete on public.purchase_orders for each row execute function public.audit_crm_record_change('purchase_orders');

drop trigger if exists audit_crm_documents on public.crm_documents;
create trigger audit_crm_documents after insert or update or delete on public.crm_documents for each row execute function public.audit_crm_record_change('documents');

drop trigger if exists audit_crm_contacts on public.contacts;
create trigger audit_crm_contacts after insert or update or delete on public.contacts for each row execute function public.audit_crm_record_change('contacts');

drop trigger if exists audit_crm_customer_emails on public.customer_emails;
create trigger audit_crm_customer_emails after insert or update or delete on public.customer_emails for each row execute function public.audit_crm_record_change('customer_emails');

drop trigger if exists audit_crm_contact_emails on public.contact_emails;
create trigger audit_crm_contact_emails after insert or update or delete on public.contact_emails for each row execute function public.audit_crm_record_change('contact_emails');
