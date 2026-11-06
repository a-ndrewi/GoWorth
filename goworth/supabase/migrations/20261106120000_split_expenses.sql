-- Split expenses between the people on a trip. Each expense remembers who paid it and whom it is shared
-- between; settlements record one traveller paying another back. Expenses saved before this keep both empty:
-- the trip owner paid them and everyone on the trip shares them.

alter table public.trip_expenses add column if not exists paid_by uuid references auth.users(id) on delete set null;
alter table public.trip_expenses add column if not exists split_with uuid[];
alter table public.trip_expenses drop constraint if exists trip_expense_split_size;
alter table public.trip_expenses add constraint trip_expense_split_size
  check (split_with is null or cardinality(split_with) between 1 and 31);

-- The owner and every companion who accepted; the only people an expense or settlement may name.
create or replace function public.is_trip_participant(p_trip uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trips where id = p_trip and user_id = p_person)
    or exists (select 1 from public.trip_members where trip_id = p_trip and member_id = p_person and status = 'accepted');
$$;
revoke all on function public.is_trip_participant(uuid, uuid) from public, anon, authenticated;

-- Checked only when the payer or the split changes, so an older expense that names someone who has since left
-- the trip can still be renamed or re-categorised.
create or replace function public.validate_expense_split() returns trigger
language plpgsql security definer set search_path = '' as $$
declare person uuid;
begin
  if tg_op = 'UPDATE' and new.paid_by is not distinct from old.paid_by and new.split_with is not distinct from old.split_with then
    return new;
  end if;
  if new.paid_by is not null and not public.is_trip_participant(new.trip_id, new.paid_by) then
    raise exception 'The payer is not on this trip';
  end if;
  if new.split_with is not null then
    if cardinality(new.split_with) <> cardinality(array(select distinct unnest(new.split_with))) then
      raise exception 'Each traveller can be in a split only once';
    end if;
    foreach person in array new.split_with loop
      if not public.is_trip_participant(new.trip_id, person) then raise exception 'Someone in this split is not on the trip'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_expense_split() from public, anon, authenticated;
drop trigger if exists validate_expense_split on public.trip_expenses;
create trigger validate_expense_split before insert or update on public.trip_expenses
  for each row execute function public.validate_expense_split();

-- One traveller paying another back. Not an expense: it never counts towards the trip budget.
create table if not exists public.trip_settlements (
  trip_id uuid not null references public.trips(id) on delete cascade,
  id text not null,
  from_member uuid not null,
  to_member uuid not null,
  amount numeric(12,2) not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (trip_id, id),
  constraint settlement_people_differ check (from_member <> to_member),
  constraint settlement_amount_range check (amount > 0 and amount <= 1000000),
  constraint settlement_id_length check (char_length(id) <= 80)
);
alter table public.trip_settlements enable row level security;
revoke all on public.trip_settlements from anon, authenticated;
grant select, insert, delete on public.trip_settlements to authenticated;

drop policy if exists "Travellers manage settlements" on public.trip_settlements;
create policy "Travellers manage settlements" on public.trip_settlements for all to authenticated
  using (public.is_trip_member(trip_id) or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  with check (public.is_trip_member(trip_id) or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));

create or replace function public.validate_settlement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_trip_participant(new.trip_id, new.from_member) or not public.is_trip_participant(new.trip_id, new.to_member) then
    raise exception 'Both travellers must be on this trip';
  end if;
  new.created_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.validate_settlement() from public, anon, authenticated;
drop trigger if exists validate_settlement on public.trip_settlements;
create trigger validate_settlement before insert on public.trip_settlements
  for each row execute function public.validate_settlement();
