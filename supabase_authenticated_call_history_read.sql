-- Nexus / SALC - ouverture de lecture collective des imports 3CX
-- A executer dans Supabase > SQL Editor > Run.
--
-- Objectif fonctionnel :
-- - un compte Supabase authentifie dans le portail Nexus lit l'historique collectif ;
-- - les imports faits par sebastien.schmitt@hotmail.fr ou tout autre admin sont visibles ;
-- - aucune condition sur role, user_id, created_by ou email ne bloque la lecture ;
-- - les droits de pages restent geres uniquement dans l'application Nexus.

create table if not exists public.call_import_rows (
  id bigserial primary key,
  organization_id text not null default 'salc',
  user_id uuid default auth.uid(),
  created_by uuid default auth.uid(),
  row_hash text not null,
  call_id text,
  call_time timestamptz,
  client text,
  operator_name text,
  phone text,
  direction text,
  status text,
  call_type text,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.call_import_rows
  add column if not exists organization_id text not null default 'salc';

alter table public.call_import_rows
  add column if not exists user_id uuid default auth.uid();

alter table public.call_import_rows
  add column if not exists created_by uuid default auth.uid();

alter table public.call_import_rows
  add column if not exists raw jsonb;

update public.call_import_rows
set organization_id = 'salc'
where organization_id is null or organization_id = '';

drop index if exists public.call_import_rows_org_hash_idx;
create unique index if not exists call_import_rows_org_hash_idx
on public.call_import_rows (organization_id, row_hash);

-- Point important : on retire le verrou RLS sur l'historique d'appels.
-- La securite fonctionnelle se fait dans Nexus par les droits d'onglets.
alter table public.call_import_rows disable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.call_import_rows to authenticated;
grant insert, update on public.call_import_rows to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace function public.nexus_latest_call_time(p_organization_id text default 'salc')
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(c.call_time)
  from public.call_import_rows c
  where c.organization_id = coalesce(nullif(p_organization_id, ''), 'salc');
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
    where c.organization_id = coalesce(nullif(p_organization_id, ''), 'salc')
      and (p_start is null or c.call_time >= p_start)
      and (p_end is null or c.call_time <= p_end)
    order by c.call_time desc nulls last
    limit least(greatest(coalesce(p_limit, 1000), 0), 5000)
    offset greatest(coalesce(p_offset, 0), 0);
  else
    return query
    select c.raw, c.call_time
    from public.call_import_rows c
    where c.organization_id = coalesce(nullif(p_organization_id, ''), 'salc')
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

select
  organization_id,
  count(*) as lignes_partagees,
  min(call_time) as premier_appel,
  max(call_time) as dernier_appel
from public.call_import_rows
group by organization_id
order by organization_id;
