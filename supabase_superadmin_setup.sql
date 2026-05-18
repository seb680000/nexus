-- Nexus / SALC - profils, droits dynamiques et base partagee
-- A executer dans Supabase > Editeur SQL, puis cliquer sur "Courir".

create table if not exists public.nexus_user_access (
  email text primary key,
  role text not null default 'user' check (role in ('superadmin','admin','manager','user')),
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nexus_profiles (
  email text primary key,
  first_name text,
  last_name text,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.nexus_profiles
  add column if not exists first_name text;

alter table public.nexus_profiles
  add column if not exists last_name text;

create table if not exists public.nexus_view_permissions (
  email text not null references public.nexus_user_access(email) on delete cascade,
  view_id text not null,
  view_label text,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (email, view_id)
);

create or replace function public.nexus_current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email',''));
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

alter table public.nexus_user_access enable row level security;
alter table public.nexus_profiles enable row level security;
alter table public.nexus_view_permissions enable row level security;

drop policy if exists nexus_access_read on public.nexus_user_access;
drop policy if exists nexus_access_insert_superadmin on public.nexus_user_access;
drop policy if exists nexus_access_update_superadmin on public.nexus_user_access;
drop policy if exists nexus_access_delete_superadmin on public.nexus_user_access;

create policy nexus_access_read
on public.nexus_user_access
for select to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

create policy nexus_access_insert_superadmin
on public.nexus_user_access
for insert to authenticated
with check (public.nexus_current_role() = 'superadmin');

create policy nexus_access_update_superadmin
on public.nexus_user_access
for update to authenticated
using (public.nexus_current_role() = 'superadmin')
with check (public.nexus_current_role() = 'superadmin');

create policy nexus_access_delete_superadmin
on public.nexus_user_access
for delete to authenticated
using (public.nexus_current_role() = 'superadmin');

drop policy if exists nexus_profiles_read on public.nexus_profiles;
drop policy if exists nexus_profiles_insert on public.nexus_profiles;
drop policy if exists nexus_profiles_update on public.nexus_profiles;
drop policy if exists nexus_profiles_delete_superadmin on public.nexus_profiles;

create policy nexus_profiles_read
on public.nexus_profiles
for select to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

create policy nexus_profiles_insert
on public.nexus_profiles
for insert to authenticated
with check (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

create policy nexus_profiles_update
on public.nexus_profiles
for update to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin')
with check (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

create policy nexus_profiles_delete_superadmin
on public.nexus_profiles
for delete to authenticated
using (public.nexus_current_role() = 'superadmin');

drop policy if exists nexus_view_permissions_read on public.nexus_view_permissions;
drop policy if exists nexus_view_permissions_insert_superadmin on public.nexus_view_permissions;
drop policy if exists nexus_view_permissions_update_superadmin on public.nexus_view_permissions;
drop policy if exists nexus_view_permissions_delete_superadmin on public.nexus_view_permissions;

create policy nexus_view_permissions_read
on public.nexus_view_permissions
for select to authenticated
using (lower(email) = public.nexus_current_email() or public.nexus_current_role() = 'superadmin');

create policy nexus_view_permissions_insert_superadmin
on public.nexus_view_permissions
for insert to authenticated
with check (public.nexus_current_role() = 'superadmin');

create policy nexus_view_permissions_update_superadmin
on public.nexus_view_permissions
for update to authenticated
using (public.nexus_current_role() = 'superadmin')
with check (public.nexus_current_role() = 'superadmin');

create policy nexus_view_permissions_delete_superadmin
on public.nexus_view_permissions
for delete to authenticated
using (public.nexus_current_role() = 'superadmin');

create table if not exists public.nexus_password_reset_requests (
  id bigserial primary key,
  email text not null,
  requester_email text,
  user_agent text,
  page_url text,
  status text not null default 'requested',
  requested_at timestamptz not null default now()
);

alter table public.nexus_password_reset_requests enable row level security;

drop policy if exists nexus_password_reset_requests_insert on public.nexus_password_reset_requests;
drop policy if exists nexus_password_reset_requests_read_superadmin on public.nexus_password_reset_requests;
drop policy if exists nexus_password_reset_requests_update_superadmin on public.nexus_password_reset_requests;

create policy nexus_password_reset_requests_insert
on public.nexus_password_reset_requests
for insert to anon, authenticated
with check (length(trim(email)) > 3);

create policy nexus_password_reset_requests_read_superadmin
on public.nexus_password_reset_requests
for select to authenticated
using (public.nexus_current_role() = 'superadmin');

create policy nexus_password_reset_requests_update_superadmin
on public.nexus_password_reset_requests
for update to authenticated
using (public.nexus_current_role() = 'superadmin')
with check (public.nexus_current_role() = 'superadmin');

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
  add column if not exists created_by uuid default auth.uid();

drop index if exists public.call_import_rows_org_hash_idx;
create unique index if not exists call_import_rows_org_hash_idx
on public.call_import_rows (organization_id, row_hash);

alter table public.call_import_rows enable row level security;

drop policy if exists "read own rows" on public.call_import_rows;
drop policy if exists "insert own rows" on public.call_import_rows;
drop policy if exists "update own rows" on public.call_import_rows;
drop policy if exists "delete own rows" on public.call_import_rows;
drop policy if exists call_rows_read_active on public.call_import_rows;
drop policy if exists call_rows_insert_active on public.call_import_rows;
drop policy if exists call_rows_update_admin on public.call_import_rows;
drop policy if exists call_rows_delete_admin on public.call_import_rows;

create policy call_rows_read_active
on public.call_import_rows
for select to authenticated
using (organization_id = 'salc' and public.nexus_current_role() is not null);

create policy call_rows_insert_active
on public.call_import_rows
for insert to authenticated
with check (
  organization_id = 'salc'
  and public.nexus_current_role() in ('superadmin','admin','manager','user')
);

create policy call_rows_update_admin
on public.call_import_rows
for update to authenticated
using (
  organization_id = 'salc'
  and public.nexus_current_role() in ('superadmin','admin','manager')
)
with check (
  organization_id = 'salc'
  and public.nexus_current_role() in ('superadmin','admin','manager')
);

create policy call_rows_delete_admin
on public.call_import_rows
for delete to authenticated
using (
  organization_id = 'salc'
  and public.nexus_current_role() in ('superadmin','admin')
);

insert into public.nexus_user_access (email, role, status)
values
  ('sebastien@groupe-salc.fr','superadmin','active'),
  ('sebastien.schmitt57@gmail.com','superadmin','active'),
  ('sebastien.schmitt@hotmail.fr','superadmin','active')
on conflict (email) do update
set role = 'superadmin',
    status = 'active',
    updated_at = now();

insert into public.nexus_profiles (email, first_name, last_name, display_name)
values
  ('sebastien@groupe-salc.fr','Sebastien','Schmitt','Sebastien Schmitt'),
  ('sebastien.schmitt57@gmail.com','Sebastien','Schmitt','Sebastien Schmitt'),
  ('sebastien.schmitt@hotmail.fr','Sebastien','Schmitt','Sebastien Schmitt')
on conflict (email) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    updated_at = now();
