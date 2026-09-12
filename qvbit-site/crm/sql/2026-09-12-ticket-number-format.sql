-- Ticket numbers use the format QVBYYYYMMDDNNNN.
-- This migration was applied to the production Supabase database.

BEGIN;

ALTER TABLE public.tickets
  ALTER COLUMN ticket_number DROP IDENTITY IF EXISTS;

ALTER TABLE public.tickets
  ALTER COLUMN ticket_number TYPE text
  USING ('QVB' || to_char(created_at, 'YYYYMMDD') || lpad(ticket_number::text, 4, '0'));

CREATE SEQUENCE IF NOT EXISTS public.tickets_ticket_number_seq;

SELECT setval(
  'public.tickets_ticket_number_seq',
  GREATEST(COALESCE((SELECT max((regexp_match(ticket_number, '(\\d+)$'))[1]::bigint) FROM public.tickets), 0), 1),
  true
);

CREATE OR REPLACE FUNCTION public.assign_qvb_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '' THEN
    NEW.ticket_number := 'QVB' || to_char(COALESCE(NEW.created_at, now()), 'YYYYMMDD') || lpad(nextval('public.tickets_ticket_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_assign_qvb_ticket_number ON public.tickets;
CREATE TRIGGER tickets_assign_qvb_ticket_number
BEFORE INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.assign_qvb_ticket_number();

COMMIT;
