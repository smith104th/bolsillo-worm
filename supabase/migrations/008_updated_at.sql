-- events.updated_at + trigger, so phones can sync only what changed. Safe to run more than once.
alter table public.events add column if not exists updated_at timestamptz not null default now();
create index if not exists events_hole_updated on public.events (hole_id, updated_at desc);
create or replace function public.wh_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events for each row execute function public.wh_touch();
notify pgrst, 'reload schema';
