-- Nexus V2 - PostgreSQL schema
-- Compatible Railway, Render, Neon or Supabase PostgreSQL.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'user' check (role in ('superadmin','admin','manager','user')),
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  view_key text not null,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  unique(user_id, view_key)
);

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  imported_by uuid references app_users(id) on delete set null,
  file_name text not null,
  row_count integer not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  phone text,
  client_type text,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);

create table if not exists operators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  extension text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  import_id uuid references imports(id) on delete cascade,
  row_hash text not null,
  call_time timestamptz,
  call_id text,
  from_number text,
  to_number text,
  phone text,
  client_name text,
  operator_name text,
  direction text,
  status text,
  call_type text,
  ringing_seconds integer not null default 0,
  talking_seconds integer not null default 0,
  duration_seconds integer not null default 0,
  is_answered boolean not null default false,
  is_abandoned boolean not null default false,
  is_internal boolean not null default false,
  is_outbound_client boolean not null default false,
  is_callback boolean not null default false,
  is_premium boolean not null default false,
  is_forfait boolean not null default false,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id, row_hash)
);

create index if not exists calls_org_time_idx on calls(organization_id, call_time);
create index if not exists calls_org_client_idx on calls(organization_id, client_name);
create index if not exists calls_org_operator_idx on calls(organization_id, operator_name);
create index if not exists calls_org_abandoned_idx on calls(organization_id, is_abandoned);
create index if not exists calls_org_premium_idx on calls(organization_id, is_premium);

insert into organizations (name, slug)
values ('GROUPE SALC', 'salc')
on conflict (slug) do nothing;
