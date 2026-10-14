alter table public.saved_items
  add column details jsonb;

comment on column public.saved_items.details is
  'Snapshot of an externally discovered place so its name, coordinates and source remain available after saving.';
