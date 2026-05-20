-- Nexus / SALC - correctif lecture collective des appels
-- A executer dans Supabase > SQL Editor.
-- Objectif : tout compte Nexus actif peut lire call_import_rows,
-- quel que soit son role. Les roles servent uniquement a l'interface.

create or replace function public.nexus_current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email',''));
$$;

create or replace function public.nexus_has_active_access()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.nexus_user_access
    where lower(email) = public.nexus_current_email()
      and status = 'active'
    limit 1
  );
$$;

create or replace function public.nexus_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.nexus_user_access
  where lower(email) = public.nexus_current_email()
    and status = 'active'
  limit 1;
$$;

alter table public.call_import_rows enable row level security;
alter table public.nexus_user_access enable row level security;
alter table public.nexus_profiles enable row level security;
alter table public.nexus_view_permissions enable row level security;

drop policy if exists nexus_access_read on public.nexus_user_access;
create policy nexus_access_read
on public.nexus_user_access
for select to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

drop policy if exists nexus_profiles_read on public.nexus_profiles;
create policy nexus_profiles_read
on public.nexus_profiles
for select to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

drop policy if exists nexus_view_permissions_read on public.nexus_view_permissions;
drop policy if exists nexus_view_permissions_read_own on public.nexus_view_permissions;
drop policy if exists nexus_view_permissions_read_superadmin on public.nexus_view_permissions;
create policy nexus_view_permissions_read
on public.nexus_view_permissions
for select to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

drop policy if exists "read own rows" on public.call_import_rows;
drop policy if exists call_rows_read_active on public.call_import_rows;

create policy call_rows_read_active
on public.call_import_rows
for select to authenticated
using (
  organization_id = 'salc'
  and public.nexus_has_active_access()
);

comment on policy call_rows_read_active on public.call_import_rows
is 'Tout compte Nexus actif peut lire l historique collectif des appels. Le role ne bloque pas la lecture Supabase.';

grant usage on schema public to authenticated;
grant execute on function public.nexus_current_email() to authenticated;
grant execute on function public.nexus_current_role() to authenticated;
grant execute on function public.nexus_has_active_access() to authenticated;
grant select on public.call_import_rows to authenticated;
grant select on public.nexus_user_access to authenticated;
grant select on public.nexus_profiles to authenticated;
grant select on public.nexus_view_permissions to authenticated;

create or replace function public.nexus_latest_call_time(p_organization_id text default 'salc')
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_latest timestamptz;
begin
  if not public.nexus_has_active_access() then
    raise exception 'Compte Nexus inactif ou non autorise' using errcode = '42501';
  end if;

  select max(c.call_time)
  into v_latest
  from public.call_import_rows c
  where c.organization_id = coalesce(p_organization_id, 'salc');

  return v_latest;
end;
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
  if not public.nexus_has_active_access() then
    raise exception 'Compte Nexus inactif ou non autorise' using errcode = '42501';
  end if;

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

create or replace function public.nexus_get_my_access()
returns table(
  email text,
  role text,
  status text,
  first_name text,
  last_name text,
  display_name text,
  avatar_url text,
  permissions jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    a.email,
    a.role,
    a.status,
    coalesce(p.first_name, '') as first_name,
    coalesce(p.last_name, '') as last_name,
    coalesce(p.display_name, '') as display_name,
    coalesce(p.avatar_url, '') as avatar_url,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'view_id', vp.view_id,
          'view_label', vp.view_label,
          'can_view', vp.can_view,
          'can_edit', vp.can_edit
        )
        order by vp.view_id
      ) filter (where vp.view_id is not null),
      '[]'::jsonb
    ) as permissions
  from public.nexus_user_access a
  left join public.nexus_profiles p on lower(p.email) = lower(a.email)
  left join public.nexus_view_permissions vp on lower(vp.email) = lower(a.email)
  where lower(a.email) = public.nexus_current_email()
    and a.status = 'active'
  group by a.email, a.role, a.status, p.first_name, p.last_name, p.display_name, p.avatar_url;
end;
$$;

grant execute on function public.nexus_get_my_access() to authenticated;

-- Controle admin : doit retourner le nombre de lignes partagees.
select organization_id, count(*) as lignes_partagees
from public.call_import_rows
group by organization_id
order by organization_id;
