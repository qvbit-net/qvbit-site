insert into public.crm_permissions (role,module,can_view,can_create,can_update,can_delete)
values
('owner','technicians',true,true,true,true),
('admin','technicians',true,true,true,true),
('manager','technicians',true,true,true,false),
('technician','technicians',true,false,false,false)
on conflict (role,module) do update set
  can_view=excluded.can_view,
  can_create=excluded.can_create,
  can_update=excluded.can_update,
  can_delete=excluded.can_delete,
  updated_at=now();