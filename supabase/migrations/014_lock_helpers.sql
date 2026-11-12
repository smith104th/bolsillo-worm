-- Nov 12 audit: on the live database four internal helpers were callable by any signed-in user,
-- although schema.sql has always revoked them (the live grants had drifted). wh_dig_km and
-- wh_retunnel take a pocket id, so someone who knew another pocket's id could add tunnel
-- distance or a "tunnel" event to it. They're only meant to run inside the other wh_* functions,
-- which run as the owner, so nothing in the app changes.
revoke execute on function
  public.wh_dig_km(uuid, smallint, double precision), public.wh_retunnel(uuid),
  public.wh_today(uuid), public.wh_code()
from public, anon, authenticated;

-- the two functions the Supabase linter flags for a search_path that isn't pinned
alter function public.wh_km(jsonb, jsonb) set search_path = public;
alter function public.wh_touch() set search_path = public;
