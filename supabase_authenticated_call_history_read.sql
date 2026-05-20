-- Nexus / SALC - lecture collective pour tous les comptes Nexus connectes
-- A executer dans Supabase > SQL Editor > Run.
--
-- Effet :
-- - tous les utilisateurs connectes Supabase Auth peuvent lire public.call_import_rows ;
-- - le role Nexus ne bloque plus la lecture de l'historique des appels ;
-- - les visiteurs anonymes ne recoivent pas de droit de lecture.

alter table public.call_import_rows disable row level security;

grant usage on schema public to authenticated;
grant select on public.call_import_rows to authenticated;

create or replace function public.nexus_latest_call_time(p_organization_id text default 'salc')
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(c.call_time)
  from public.call_import_rows c
  where c.organization_id = coalesce(p_organization_id, 'salc');
$$;

create or replace function public.nexus_read_call_rows(
  p_organization_id text default 'salc',
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_limit integer default 1000,
  p_offset integer default 0,
  p_descending boolean default false
)
returns table(raw jsonb, call_time timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(p_descending, false) then
    return query
    select c.raw, c.call_time
    from public.call_import_rows c
    where c.organization_id = coalesce(p_organization_id, 'salc')
      and (p_start is null or c.call_time >= p_start)
      and (p_end is null or c.call_time <= p_end)
    order by c.call_time desc nulls last
    limit least(greatest(coalesce(p_limit, 1000), 0), 5000)
    offset greatest(coalesce(p_offset, 0), 0);
  else
    return query
    select c.raw, c.call_time
    from public.call_import_rows c
    where c.organization_id = coalesce(p_organization_id, 'salc')
      and (p_start is null or c.call_time >= p_start)
      and (p_end is null or c.call_time <= p_end)
    order by c.call_time asc nulls last
    limit least(greatest(coalesce(p_limit, 1000), 0), 5000)
    offset greatest(coalesce(p_offset, 0), 0);
  end if;
end;
$$;

grant execute on function public.nexus_latest_call_time(text) to authenticated;
grant execute on function public.nexus_read_call_rows(text, timestamptz, timestamptz, integer, integer, boolean) to authenticated;

notify pgrst, 'reload schema';

select organization_id, count(*) as lignes_partagees
from public.call_import_rows
group by organization_id
order by organization_id;
