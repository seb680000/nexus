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
  select
    public.nexus_current_email() in (
      'sebastien@groupe-salc.fr',
      'sebastien.schmitt57@gmail.com',
      'sebastien.schmitt@hotmail.fr'
    )
    or exists (
      select 1
      from public.nexus_user_access
      where lower(email) = public.nexus_current_email()
        and status = 'active'
      limit 1
    );
$$;

alter table public.call_import_rows enable row level security;

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
grant execute on function public.nexus_has_active_access() to authenticated;
grant select on public.call_import_rows to authenticated;
grant select on public.nexus_user_access to authenticated;

-- Controle admin : doit retourner le nombre de lignes partagees.
select organization_id, count(*) as lignes_partagees
from public.call_import_rows
group by organization_id
order by organization_id;
