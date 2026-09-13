CREATE OR REPLACE FUNCTION public.sync_invoice_payment_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_invoice_id uuid; v_paid numeric;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid FROM public.invoice_payments p WHERE p.invoice_id = v_invoice_id;
  UPDATE public.invoices i
  SET amount_paid = v_paid,
      status = CASE
        WHEN v_paid >= i.total AND i.total > 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        ELSE CASE WHEN i.status IN ('paid','partial') THEN 'sent' ELSE i.status END
      END,
      updated_at = now()
  WHERE i.id = v_invoice_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invoice_payments_sync_invoice ON public.invoice_payments;
CREATE TRIGGER invoice_payments_sync_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_payment_rollup();

CREATE OR REPLACE FUNCTION public.validate_ticket_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_role text;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  SELECT role INTO target_role FROM public.user_profiles WHERE id = NEW.assigned_to AND is_active = true;
  IF target_role IS NULL THEN RAISE EXCEPTION 'Assigned technician must be an active CRM user.'; END IF;
  IF target_role NOT IN ('owner','technician','manager','admin') THEN
    RAISE EXCEPTION 'Tickets may only be assigned to owner, admin, manager, or technician users.';
  END IF;
  IF public.current_crm_role() = 'technician' AND NEW.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'Technicians may only assign tickets to themselves.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_validate_assignment ON public.tickets;
CREATE TRIGGER tickets_validate_assignment
BEFORE INSERT OR UPDATE OF assigned_to ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.validate_ticket_assignment();

CREATE OR REPLACE TRIGGER audit_crm_customer_assets
AFTER INSERT OR DELETE OR UPDATE ON public.customer_assets
FOR EACH ROW EXECUTE FUNCTION public.audit_crm_record_change('customer_assets');

CREATE OR REPLACE TRIGGER audit_crm_service_contracts
AFTER INSERT OR DELETE OR UPDATE ON public.service_contracts
FOR EACH ROW EXECUTE FUNCTION public.audit_crm_record_change('service_contracts');
