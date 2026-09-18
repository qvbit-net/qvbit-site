alter table public.job_time_entries
  add column if not exists technician_id uuid references public.technicians(id) on delete set null;

create index if not exists job_time_entries_technician_id_idx
  on public.job_time_entries(technician_id);