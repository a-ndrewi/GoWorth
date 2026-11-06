-- Deleting an account clears it from trip_expenses.paid_by (on delete set null), and that update ran the split
-- check again. By then the account's trip_members rows were already gone, so a split that still named it failed
-- with "Someone in this split is not on the trip" and the whole deletion rolled back. An update that only clears
-- the payer, or only narrows the split, cannot add anyone to an expense, so it is not checked again.
create or replace function public.validate_expense_split() returns trigger
language plpgsql security definer set search_path = '' as $$
declare person uuid;
begin
  if tg_op = 'UPDATE'
    and (new.paid_by is not distinct from old.paid_by or new.paid_by is null)
    and (new.split_with is not distinct from old.split_with
      or (new.split_with is not null and old.split_with is not null and new.split_with <@ old.split_with)) then
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
