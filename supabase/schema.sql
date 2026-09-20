-- RentManor (repo: rental-home) — paste this entire file into the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe-ish to re-run: functions/policies are replaced; tables are created if missing.
--
-- After this SQL:
--   1. Authentication → Providers → Email: enable Email.
--      For simplest sign-up, turn OFF "Confirm email" (otherwise she must click a mail link).
--   2. Authentication → URL configuration:
--        Site URL = https://app.rentmanor.com
--        Redirect URLs include that origin, https://nomadicalnomad.github.io/rental-home/app/**,
--        and http://localhost:8000/**
--   3. Settings → API: copy Project URL + anon public key into config.js (never the service_role key).
--   4. Storage: this file creates a private bucket named account-media. If that insert
--      is skipped, create it in Dashboard → Storage (private, not public).
--   5. Optional: upload files from supabase/sample-media/ into that bucket at the
--      paths listed in supabase/migrations/20260919_photos_expenses_sample.sql.
--   6. New personal accounts stay empty. The shared sample is account
--      00000000-0000-4000-8000-000000000001 (is_sample = true), read-only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My rentals',
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.accounts add column if not exists name text;
alter table public.accounts add column if not exists seeded boolean not null default false;
alter table public.accounts add column if not exists is_sample boolean not null default false;
alter table public.accounts add column if not exists created_at timestamptz not null default now();

create unique index if not exists accounts_one_sample_idx
  on public.accounts (is_sample)
  where is_sample;

create table if not exists public.account_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

alter table public.account_members add column if not exists role text;
alter table public.account_members add column if not exists email text not null default '';
alter table public.account_members add column if not exists created_at timestamptz not null default now();

do $$ begin
  alter table public.account_members
    add constraint account_members_role_check check (role in ('owner', 'member'));
exception when duplicate_object then null;
end $$;

create unique index if not exists account_members_user_account_idx
  on public.account_members (account_id, user_id);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  address text not null,
  city text not null,
  state text not null,
  zip text not null,
  status text not null check (status in ('occupied', 'vacant')),
  tenant_name text not null default '',
  phone text not null default '',
  email text not null default '',
  rent text not null default '',
  notes text not null default '',
  thumbnail_path text,
  beds numeric(4, 1),
  baths numeric(4, 1),
  sqft integer,
  year_built integer,
  property_type text not null default '',
  description text not null default '',
  utility_electric text not null default '',
  utility_gas text not null default '',
  utility_water text not null default '',
  utility_notes text not null default '',
  trash_schedule text not null default '',
  trash_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties add column if not exists thumbnail_path text;
alter table public.properties add column if not exists beds numeric(4, 1);
alter table public.properties add column if not exists baths numeric(4, 1);
alter table public.properties add column if not exists sqft integer;
alter table public.properties add column if not exists year_built integer;
alter table public.properties add column if not exists property_type text not null default '';
alter table public.properties add column if not exists description text not null default '';
alter table public.properties add column if not exists utility_electric text not null default '';
alter table public.properties add column if not exists utility_gas text not null default '';
alter table public.properties add column if not exists utility_water text not null default '';
alter table public.properties add column if not exists utility_notes text not null default '';
alter table public.properties add column if not exists trash_schedule text not null default '';
alter table public.properties add column if not exists trash_notes text not null default '';

create index if not exists properties_account_id_idx on public.properties (account_id);
create index if not exists properties_account_updated_idx on public.properties (account_id, updated_at desc);

create table if not exists public.account_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text,
  token text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

create index if not exists account_invites_account_id_idx on public.account_invites (account_id);
create index if not exists account_invites_email_idx on public.account_invites (lower(email));

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  spent_on date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  category text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_account_id_idx on public.expenses (account_id);
create index if not exists expenses_property_spent_idx on public.expenses (property_id, spent_on desc);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  storage_path text not null,
  content_type text not null default '',
  file_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_account_id_idx on public.receipts (account_id);
create index if not exists receipts_expense_id_idx on public.receipts (expense_id);

create table if not exists public.property_appliances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  fuel text check (fuel is null or fuel in ('gas', 'electric', 'other')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_appliances_property_idx
  on public.property_appliances (property_id, created_at);
create index if not exists property_appliances_account_idx
  on public.property_appliances (account_id);

create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_photos_property_idx
  on public.property_photos (property_id, sort_order, created_at);
create index if not exists property_photos_account_idx
  on public.property_photos (account_id);
create unique index if not exists property_photos_one_primary_idx
  on public.property_photos (property_id)
  where is_primary;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  lease_storage_path text,
  lease_content_type text not null default '',
  lease_file_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenants_one_per_property_idx
  on public.tenants (property_id);
create index if not exists tenants_account_idx
  on public.tenants (account_id);

create table if not exists public.tenant_files (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  kind text not null default 'correspondence' check (kind in ('correspondence', 'other')),
  storage_path text not null,
  content_type text not null default '',
  file_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_files_tenant_idx
  on public.tenant_files (tenant_id, created_at desc);
create index if not exists tenant_files_account_idx
  on public.tenant_files (account_id);
create index if not exists tenant_files_property_idx
  on public.tenant_files (property_id);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS policies do not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_account_member(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members
    where account_id = aid
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_account_owner(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members
    where account_id = aid
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '');
$$;

create or replace function public.sample_account_id()
returns uuid
language sql
immutable
as $$
  select '00000000-0000-4000-8000-000000000001'::uuid;
$$;

create or replace function public.is_sample_account(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select aid = public.sample_account_id()
    or coalesce((select is_sample from public.accounts where id = aid), false);
$$;

create or replace function public.media_account_id(object_name text)
returns uuid
language plpgsql
stable
as $$
declare
  folder text;
begin
  folder := (storage.foldername(object_name))[1];
  if folder is null or folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return folder::uuid;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists properties_touch_updated_at on public.properties;
create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute procedure public.touch_updated_at();

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute procedure public.touch_updated_at();

drop trigger if exists receipts_touch_updated_at on public.receipts;
create trigger receipts_touch_updated_at
  before update on public.receipts
  for each row execute procedure public.touch_updated_at();

drop trigger if exists property_appliances_touch_updated_at on public.property_appliances;
create trigger property_appliances_touch_updated_at
  before update on public.property_appliances
  for each row execute procedure public.touch_updated_at();

drop trigger if exists property_photos_touch_updated_at on public.property_photos;
create trigger property_photos_touch_updated_at
  before update on public.property_photos
  for each row execute procedure public.touch_updated_at();

drop trigger if exists tenants_touch_updated_at on public.tenants;
create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute procedure public.touch_updated_at();

drop trigger if exists tenant_files_touch_updated_at on public.tenant_files;
create trigger tenant_files_touch_updated_at
  before update on public.tenant_files
  for each row execute procedure public.touch_updated_at();

create or replace function public.sync_property_thumbnail()
returns trigger
language plpgsql
as $$
declare
  pid uuid;
  primary_path text;
  promote_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  pid := coalesce(new.property_id, old.property_id);

  if tg_op = 'DELETE' and not exists (
    select 1 from public.property_photos
    where property_id = pid and is_primary
  ) then
    select id into promote_id
    from public.property_photos
    where property_id = pid
    order by sort_order, created_at
    limit 1;
    if promote_id is not null then
      update public.property_photos
        set is_primary = true
      where id = promote_id;
    end if;
  end if;

  select storage_path into primary_path
  from public.property_photos
  where property_id = pid and is_primary
  limit 1;

  update public.properties
    set thumbnail_path = primary_path
  where id = pid
    and thumbnail_path is distinct from primary_path;

  return coalesce(new, old);
end;
$$;

drop trigger if exists property_photos_sync_thumbnail on public.property_photos;
create trigger property_photos_sync_thumbnail
  after insert or update or delete on public.property_photos
  for each row execute procedure public.sync_property_thumbnail();

-- ---------------------------------------------------------------------------
-- New user: join a matching email invite, or create an owner account
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending public.account_invites%rowtype;
  new_account_id uuid;
  invite_token text;
  account_name text;
begin
  invite_token := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '');
  account_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'account_name', '')), '');

  if invite_token is not null then
    select * into pending
    from public.account_invites
    where token = upper(invite_token)
      and accepted_at is null
      and expires_at > now()
    limit 1;
  end if;

  if pending.id is null and new.email is not null then
    select * into pending
    from public.account_invites
    where accepted_at is null
      and expires_at > now()
      and email is not null
      and lower(email) = lower(new.email)
    order by created_at desc
    limit 1;
  end if;

  if pending.id is not null then
    insert into public.account_members (account_id, user_id, role, email)
    values (pending.account_id, new.id, 'member', coalesce(new.email, ''))
    on conflict (account_id, user_id) do nothing;
    update public.account_invites
      set accepted_at = now()
      where id = pending.id
        and accepted_at is null;
    return new;
  end if;

  insert into public.accounts (name)
  values (coalesce(account_name, 'My rentals'))
  returning id into new_account_id;

  insert into public.account_members (account_id, user_id, role, email)
  values (new_account_id, new.id, 'owner', coalesce(new.email, ''));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs used by the PWA
-- ---------------------------------------------------------------------------

create or replace function public.claim_pending_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := public.current_user_email();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  if user_email is null or user_email = '' then
    return;
  end if;

  insert into public.account_members (account_id, user_id, role, email)
  select i.account_id, uid, 'member', user_email
  from public.account_invites i
  where i.accepted_at is null
    and i.expires_at > now()
    and i.email is not null
    and lower(i.email) = lower(user_email)
  on conflict (account_id, user_id) do nothing;

  update public.account_invites i
  set accepted_at = now()
  where i.accepted_at is null
    and i.expires_at > now()
    and i.email is not null
    and lower(i.email) = lower(user_email)
    and exists (
      select 1 from public.account_members m
      where m.account_id = i.account_id and m.user_id = uid
    );
end;
$$;

create or replace function public.ensure_my_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  aid uuid;
  user_email text := public.current_user_email();
  meta_name text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  perform public.claim_pending_invites();

  select account_id into aid
  from public.account_members
  where user_id = uid
  order by created_at asc
  limit 1;

  if aid is not null then
    return aid;
  end if;

  select nullif(trim(coalesce(raw_user_meta_data ->> 'account_name', '')), '')
    into meta_name
  from auth.users
  where id = uid;

  insert into public.accounts (name)
  values (coalesce(meta_name, 'My rentals'))
  returning id into aid;

  insert into public.account_members (account_id, user_id, role, email)
  values (aid, uid, 'owner', coalesce(user_email, ''));

  return aid;
end;
$$;

create or replace function public.lookup_invite(invite_token text)
returns table (
  account_name text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  invite public.account_invites%rowtype;
  aname text;
begin
  if invite_token is null or trim(invite_token) = '' then
    return;
  end if;

  select * into invite
  from public.account_invites
  where token = upper(trim(invite_token))
  limit 1;

  if invite.id is null then
    return;
  end if;

  select name into aname from public.accounts where id = invite.account_id;

  account_name := coalesce(aname, 'a rental account');
  if invite.accepted_at is not null then
    status := 'accepted';
  elsif invite.expires_at <= now() then
    status := 'expired';
  else
    status := 'valid';
  end if;
  return next;
end;
$$;

drop function if exists public.create_invite(text);

create or replace function public.create_invite(target_account uuid, invite_email text default null)
returns table (
  id uuid,
  token text,
  email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  aid uuid := target_account;
  new_token text;
  clean_email text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  if aid is null or not public.is_account_owner(aid) then
    raise exception 'Only the account owner can invite someone';
  end if;

  clean_email := nullif(trim(lower(coalesce(invite_email, ''))), '');
  new_token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  return query
  insert into public.account_invites (account_id, email, token, created_by, expires_at)
  values (aid, clean_email, new_token, uid, now() + interval '14 days')
  returning public.account_invites.id, public.account_invites.token, public.account_invites.email, public.account_invites.expires_at;
end;
$$;

create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text := public.current_user_email();
  invite public.account_invites%rowtype;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  if invite_token is null or trim(invite_token) = '' then
    raise exception 'Missing invite code';
  end if;

  select * into invite
  from public.account_invites
  where token = upper(trim(invite_token))
  for update;

  if invite.id is null then
    raise exception 'That invite code was not found';
  end if;

  if invite.expires_at <= now() then
    raise exception 'That invite has expired';
  end if;

  if invite.email is not null
     and invite.email <> ''
     and user_email is not null
     and user_email <> ''
     and lower(invite.email) <> lower(user_email) then
    raise exception 'This invite was created for a different email';
  end if;

  insert into public.account_members (account_id, user_id, role, email)
  values (invite.account_id, uid, 'member', coalesce(user_email, ''))
  on conflict (account_id, user_id) do update
    set email = excluded.email;

  if invite.accepted_at is null then
    update public.account_invites
      set accepted_at = now()
      where id = invite.id;
  end if;

  return invite.account_id;
end;
$$;

create or replace function public.replace_account_properties(target_account uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_sample_account(target_account) or not public.is_account_member(target_account) then
    raise exception 'Not allowed';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Backup file did not contain a property list';
  end if;

  delete from public.properties where account_id = target_account;

  insert into public.properties (
    id, account_id, address, city, state, zip, status,
    tenant_name, phone, email, rent, notes, thumbnail_path,
    beds, baths, sqft, year_built, property_type, description,
    utility_electric, utility_gas, utility_water, utility_notes,
    trash_schedule, trash_notes, created_at, updated_at
  )
  select
    case
      when (item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (item->>'id')::uuid
      else gen_random_uuid()
    end,
    target_account,
    coalesce(nullif(trim(item->>'address'), ''), 'Untitled home'),
    coalesce(trim(item->>'city'), ''),
    coalesce(trim(item->>'state'), ''),
    coalesce(trim(item->>'zip'), ''),
    case when item->>'status' = 'occupied' then 'occupied' else 'vacant' end,
    coalesce(nullif(trim(item->>'tenant_name'), ''), nullif(trim(item->>'tenantName'), ''), ''),
    coalesce(trim(item->>'phone'), ''),
    coalesce(trim(item->>'email'), ''),
    coalesce(trim(item->>'rent'), ''),
    coalesce(trim(item->>'notes'), ''),
    nullif(trim(coalesce(item->>'thumbnail_path', item->>'thumbnailPath', '')), ''),
    nullif(item->>'beds', '')::numeric,
    nullif(item->>'baths', '')::numeric,
    nullif(item->>'sqft', '')::integer,
    nullif(coalesce(item->>'year_built', item->>'yearBuilt'), '')::integer,
    coalesce(trim(coalesce(item->>'property_type', item->>'propertyType', '')), ''),
    coalesce(trim(item->>'description'), ''),
    coalesce(trim(coalesce(item->>'utility_electric', item->>'utilityElectric', '')), ''),
    coalesce(trim(coalesce(item->>'utility_gas', item->>'utilityGas', '')), ''),
    coalesce(trim(coalesce(item->>'utility_water', item->>'utilityWater', '')), ''),
    coalesce(trim(coalesce(item->>'utility_notes', item->>'utilityNotes', '')), ''),
    coalesce(trim(coalesce(item->>'trash_schedule', item->>'trashSchedule', '')), ''),
    coalesce(trim(coalesce(item->>'trash_notes', item->>'trashNotes', '')), ''),
    coalesce((item->>'created_at')::timestamptz, (item->>'createdAt')::timestamptz, now()),
    now()
  from jsonb_array_elements(payload) as item;

  insert into public.tenants (account_id, property_id, name, phone, email)
  select p.account_id, p.id, p.tenant_name, p.phone, p.email
  from public.properties p
  where p.account_id = target_account
    and (
      p.status = 'occupied'
      or nullif(trim(p.tenant_name), '') is not null
      or nullif(trim(p.phone), '') is not null
      or nullif(trim(p.email), '') is not null
    );

  insert into public.property_photos (account_id, property_id, storage_path, sort_order, is_primary)
  select p.account_id, p.id, p.thumbnail_path, 0, true
  from public.properties p
  where p.account_id = target_account
    and p.thumbnail_path is not null
    and trim(p.thumbnail_path) <> '';
end;
$$;

create or replace function public.mark_account_seeded(target_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_member(target_account) then
    raise exception 'Not allowed';
  end if;
  update public.accounts set seeded = true where id = target_account;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Personal accounts: members only.
-- Sample account: anon + authenticated SELECT only. Client writes denied.
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.properties enable row level security;
alter table public.account_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.receipts enable row level security;
alter table public.property_appliances enable row level security;
alter table public.property_photos enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_files enable row level security;

drop policy if exists accounts_select_member on public.accounts;
create policy accounts_select_member
  on public.accounts for select
  to anon, authenticated
  using (public.is_account_member(id) or is_sample);

drop policy if exists accounts_update_member on public.accounts;
create policy accounts_update_member
  on public.accounts for update
  to authenticated
  using (public.is_account_member(id) and not is_sample)
  with check (public.is_account_member(id) and not is_sample);

drop policy if exists members_select_peer on public.account_members;
create policy members_select_peer
  on public.account_members for select
  to authenticated
  using (public.is_account_member(account_id));

drop policy if exists properties_select_member on public.properties;
create policy properties_select_member
  on public.properties for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists properties_insert_member on public.properties;
create policy properties_insert_member
  on public.properties for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists properties_update_member on public.properties;
create policy properties_update_member
  on public.properties for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists properties_delete_member on public.properties;
create policy properties_delete_member
  on public.properties for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists expenses_select_member on public.expenses;
create policy expenses_select_member
  on public.expenses for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists expenses_insert_member on public.expenses;
create policy expenses_insert_member
  on public.expenses for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists expenses_update_member on public.expenses;
create policy expenses_update_member
  on public.expenses for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists expenses_delete_member on public.expenses;
create policy expenses_delete_member
  on public.expenses for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists receipts_select_member on public.receipts;
create policy receipts_select_member
  on public.receipts for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists receipts_insert_member on public.receipts;
create policy receipts_insert_member
  on public.receipts for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists receipts_update_member on public.receipts;
create policy receipts_update_member
  on public.receipts for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists receipts_delete_member on public.receipts;
create policy receipts_delete_member
  on public.receipts for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists property_appliances_select_member on public.property_appliances;
create policy property_appliances_select_member
  on public.property_appliances for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists property_appliances_insert_member on public.property_appliances;
create policy property_appliances_insert_member
  on public.property_appliances for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists property_appliances_update_member on public.property_appliances;
create policy property_appliances_update_member
  on public.property_appliances for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists property_appliances_delete_member on public.property_appliances;
create policy property_appliances_delete_member
  on public.property_appliances for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists property_photos_select_member on public.property_photos;
create policy property_photos_select_member
  on public.property_photos for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists property_photos_insert_member on public.property_photos;
create policy property_photos_insert_member
  on public.property_photos for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists property_photos_update_member on public.property_photos;
create policy property_photos_update_member
  on public.property_photos for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists property_photos_delete_member on public.property_photos;
create policy property_photos_delete_member
  on public.property_photos for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists tenants_select_member on public.tenants;
create policy tenants_select_member
  on public.tenants for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists tenants_insert_member on public.tenants;
create policy tenants_insert_member
  on public.tenants for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists tenants_update_member on public.tenants;
create policy tenants_update_member
  on public.tenants for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists tenants_delete_member on public.tenants;
create policy tenants_delete_member
  on public.tenants for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists tenant_files_select_member on public.tenant_files;
create policy tenant_files_select_member
  on public.tenant_files for select
  to anon, authenticated
  using (public.is_account_member(account_id) or public.is_sample_account(account_id));

drop policy if exists tenant_files_insert_member on public.tenant_files;
create policy tenant_files_insert_member
  on public.tenant_files for insert
  to authenticated
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists tenant_files_update_member on public.tenant_files;
create policy tenant_files_update_member
  on public.tenant_files for update
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id))
  with check (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists tenant_files_delete_member on public.tenant_files;
create policy tenant_files_delete_member
  on public.tenant_files for delete
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists invites_select_owner on public.account_invites;
create policy invites_select_owner
  on public.account_invites for select
  to authenticated
  using (public.is_account_owner(account_id));

drop policy if exists invites_delete_owner on public.account_invites;
create policy invites_delete_owner
  on public.account_invites for delete
  to authenticated
  using (public.is_account_owner(account_id));

-- ---------------------------------------------------------------------------
-- Grants
-- Anon may SELECT the sample account only (RLS). No client writes on sample.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.accounts to anon;
grant select, update on public.accounts to authenticated;
grant select on public.account_members to authenticated;
grant select on public.properties to anon;
grant select, insert, update, delete on public.properties to authenticated;
grant select on public.expenses to anon, authenticated;
grant insert, update, delete on public.expenses to authenticated;
grant select on public.receipts to anon, authenticated;
grant insert, update, delete on public.receipts to authenticated;
grant select on public.property_appliances to anon, authenticated;
grant insert, update, delete on public.property_appliances to authenticated;
grant select on public.property_photos to anon, authenticated;
grant insert, update, delete on public.property_photos to authenticated;
grant select on public.tenants to anon, authenticated;
grant insert, update, delete on public.tenants to authenticated;
grant select on public.tenant_files to anon, authenticated;
grant insert, update, delete on public.tenant_files to authenticated;
grant select, delete on public.account_invites to authenticated;

revoke all on function public.is_account_member(uuid) from public;
revoke all on function public.is_account_owner(uuid) from public;
revoke all on function public.current_user_email() from public;
revoke all on function public.sample_account_id() from public;
revoke all on function public.is_sample_account(uuid) from public;
revoke all on function public.media_account_id(text) from public;
revoke all on function public.claim_pending_invites() from public;
revoke all on function public.ensure_my_account() from public;
revoke all on function public.lookup_invite(text) from public;
revoke all on function public.create_invite(uuid, text) from public;
revoke all on function public.accept_invite(text) from public;
revoke all on function public.replace_account_properties(uuid, jsonb) from public;
revoke all on function public.mark_account_seeded(uuid) from public;
revoke all on function public.sync_property_thumbnail() from public;

grant execute on function public.is_account_member(uuid) to anon, authenticated;
grant execute on function public.is_account_owner(uuid) to authenticated;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.sample_account_id() to anon, authenticated;
grant execute on function public.is_sample_account(uuid) to anon, authenticated;
grant execute on function public.media_account_id(text) to anon, authenticated;
grant execute on function public.claim_pending_invites() to authenticated;
grant execute on function public.ensure_my_account() to authenticated;
grant execute on function public.lookup_invite(text) to anon, authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.replace_account_properties(uuid, jsonb) to authenticated;
grant execute on function public.mark_account_seeded(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private media bucket + path-scoped policies
-- Thumbnail / primary: {account_id}/properties/{property_id}/thumbnail(+ext)
-- Gallery:             {account_id}/properties/{property_id}/photos/{photo_id}(+ext)
-- Receipt:             {account_id}/properties/{property_id}/expenses/{expense_id}/{receipt_id}(+ext)
-- Lease:               {account_id}/properties/{property_id}/tenant/lease(+ext)
-- Correspondence:      {account_id}/properties/{property_id}/tenant/files/{file_id}(+ext)
-- Sample prefix is read-only for anon + authenticated. Client writes denied.
-- ---------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'account-media',
    'account-media',
    false,
    10485760,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'image/svg+xml',
      'application/pdf'
    ]
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  raise notice 'Create a private Storage bucket named account-media in the dashboard if it does not exist.';
end $$;

drop policy if exists account_media_select on storage.objects;
create policy account_media_select
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'account-media'
    and public.media_account_id(name) is not null
    and (
      public.is_sample_account(public.media_account_id(name))
      or public.is_account_member(public.media_account_id(name))
    )
  );

drop policy if exists account_media_insert on storage.objects;
create policy account_media_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'account-media'
    and public.media_account_id(name) is not null
    and public.is_account_member(public.media_account_id(name))
    and not public.is_sample_account(public.media_account_id(name))
  );

drop policy if exists account_media_update on storage.objects;
create policy account_media_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'account-media'
    and public.media_account_id(name) is not null
    and public.is_account_member(public.media_account_id(name))
    and not public.is_sample_account(public.media_account_id(name))
  )
  with check (
    bucket_id = 'account-media'
    and public.media_account_id(name) is not null
    and public.is_account_member(public.media_account_id(name))
    and not public.is_sample_account(public.media_account_id(name))
  );

drop policy if exists account_media_delete on storage.objects;
create policy account_media_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'account-media'
    and public.media_account_id(name) is not null
    and public.is_account_member(public.media_account_id(name))
    and not public.is_sample_account(public.media_account_id(name))
  );

-- ---------------------------------------------------------------------------
-- Shared sample portfolio (service-role / SQL editor only — not the client)
-- ---------------------------------------------------------------------------

insert into public.accounts (id, name, seeded, is_sample)
values (
  '00000000-0000-4000-8000-000000000001',
  'Sample portfolio',
  true,
  true
)
on conflict (id) do update
  set name = excluded.name,
      seeded = true,
      is_sample = true;

insert into public.properties (
  id, account_id, address, city, state, zip, status,
  tenant_name, phone, email, rent, notes, thumbnail_path,
  beds, baths, sqft, year_built, property_type, description,
  utility_electric, utility_gas, utility_water, utility_notes,
  trash_schedule, trash_notes, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    '1124 Iron Point Road', 'Folsom', 'CA', '95630', 'occupied',
    'Maria Hernandez', '(916) 555-0148', 'maria.h@example.com', '2450',
    'Renewal conversation in October.',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/thumbnail.svg',
    3, 2, 1620, 1998, 'Single family',
    'Single-story ranch near Intel. Two-car garage and a covered patio.',
    'SMUD', 'PG&E', 'City of Folsom',
    'Landlord pays water. Tenant pays electric and gas.',
    'Thursday mornings', 'Bins out by 6am. Recycle and green waste weekly.',
    '2026-03-01T16:00:00Z', '2026-09-12T17:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000001',
    '704 Blue Ravine Road', 'Folsom', 'CA', '95630', 'vacant',
    '', '', '', '2200',
    'Fresh paint completed in the living room.',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000012/thumbnail.svg',
    2, 2, 1180, 2004, 'Townhouse',
    'End-unit townhouse. Fresh paint in the living room. Ready to show.',
    'SMUD', 'PG&E', 'City of Folsom',
    'All utilities in the landlord name until a tenant moves in.',
    'Friday mornings', 'HOA handles street sweeping; trash is city pickup.',
    '2026-04-12T16:00:00Z', '2026-08-03T18:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000001',
    '1538 East Bidwell Street', 'Folsom', 'CA', '95630', 'occupied',
    'James Wilson', '(916) 555-0196', 'james.wilson@example.com', '2750',
    'Two-car garage; gardener included.',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000013/thumbnail.svg',
    4, 2.5, 2105, 1992, 'Single family',
    'Two-story with a two-car garage. Gardener included on the first of the month.',
    'SMUD', 'PG&E', 'City of Folsom',
    'Tenant pays all utilities.',
    'Wednesday mornings', 'Extra green-waste pickup in fall.',
    '2026-02-18T16:00:00Z', '2026-09-08T16:30:00Z'
  )
on conflict (id) do update
  set address = excluded.address,
      city = excluded.city,
      state = excluded.state,
      zip = excluded.zip,
      status = excluded.status,
      tenant_name = excluded.tenant_name,
      phone = excluded.phone,
      email = excluded.email,
      rent = excluded.rent,
      notes = excluded.notes,
      thumbnail_path = excluded.thumbnail_path,
      beds = excluded.beds,
      baths = excluded.baths,
      sqft = excluded.sqft,
      year_built = excluded.year_built,
      property_type = excluded.property_type,
      description = excluded.description,
      utility_electric = excluded.utility_electric,
      utility_gas = excluded.utility_gas,
      utility_water = excluded.utility_water,
      utility_notes = excluded.utility_notes,
      trash_schedule = excluded.trash_schedule,
      trash_notes = excluded.trash_notes,
      updated_at = excluded.updated_at;

insert into public.expenses (
  id, account_id, property_id, spent_on, amount, category, notes, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '2026-09-12', 84.00, 'Repairs', 'HVAC filter',
    '2026-09-12T17:10:00Z', '2026-09-12T17:10:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '2026-01-15', 420.00, 'Insurance', 'Annual landlord policy',
    '2026-01-15T18:00:00Z', '2026-01-15T18:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000023',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000012',
    '2026-08-03', 186.50, 'Supplies', 'Living room paint',
    '2026-08-03T18:20:00Z', '2026-08-03T18:20:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000024',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000013',
    '2026-09-08', 62.40, 'Utilities', 'Water',
    '2026-09-08T16:40:00Z', '2026-09-08T16:40:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000025',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000013',
    '2026-09-01', 75.00, 'Other', 'Gardener',
    '2026-09-01T15:00:00Z', '2026-09-01T15:00:00Z'
  )
on conflict (id) do update
  set spent_on = excluded.spent_on,
      amount = excluded.amount,
      category = excluded.category,
      notes = excluded.notes,
      updated_at = excluded.updated_at;

insert into public.receipts (
  id, account_id, expense_id, storage_path, content_type, file_name, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/expenses/00000000-0000-4000-8000-000000000021/00000000-0000-4000-8000-000000000031.svg',
    'image/svg+xml',
    'hvac-filter.svg',
    '2026-09-12T17:12:00Z',
    '2026-09-12T17:12:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000024',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000013/expenses/00000000-0000-4000-8000-000000000024/00000000-0000-4000-8000-000000000032.pdf',
    'application/pdf',
    'water-bill.pdf',
    '2026-09-08T16:42:00Z',
    '2026-09-08T16:42:00Z'
  )
on conflict (id) do update
  set storage_path = excluded.storage_path,
      content_type = excluded.content_type,
      file_name = excluded.file_name,
      updated_at = excluded.updated_at;

-- Keep the shared demo to 3 homes (drop an earlier fourth Folsom clone if present).
delete from public.properties
where id = '00000000-0000-4000-8000-000000000014'
  and account_id = '00000000-0000-4000-8000-000000000001';

insert into public.property_photos (
  id, account_id, property_id, storage_path, sort_order, is_primary, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/thumbnail.svg',
    0, true, '2026-03-01T16:05:00Z', '2026-03-01T16:05:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000042',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/photos/00000000-0000-4000-8000-000000000042.svg',
    1, false, '2026-03-02T16:05:00Z', '2026-03-02T16:05:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000043',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000012/thumbnail.svg',
    0, true, '2026-04-12T16:05:00Z', '2026-04-12T16:05:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000044',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000013/thumbnail.svg',
    0, true, '2026-02-18T16:05:00Z', '2026-02-18T16:05:00Z'
  )
on conflict (id) do update
  set storage_path = excluded.storage_path,
      sort_order = excluded.sort_order,
      is_primary = excluded.is_primary;

insert into public.property_appliances (
  id, account_id, property_id, name, fuel, notes, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000071',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    'Range', 'gas', 'Replaced 2023.', '2026-03-01T16:10:00Z', '2026-03-01T16:10:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000072',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    'Dryer', 'electric', 'In the garage.', '2026-03-01T16:11:00Z', '2026-03-01T16:11:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000073',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    'Refrigerator', 'electric', '', '2026-03-01T16:12:00Z', '2026-03-01T16:12:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000074',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000012',
    'Range', 'electric', 'Works. Leave for the next tenant.', '2026-04-12T16:10:00Z', '2026-04-12T16:10:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000075',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000013',
    'Washer', 'electric', 'Shared laundry closet.', '2026-02-18T16:10:00Z', '2026-02-18T16:10:00Z'
  )
on conflict (id) do update
  set name = excluded.name, fuel = excluded.fuel, notes = excluded.notes;

insert into public.tenants (
  id, account_id, property_id, name, phone, email, notes,
  lease_storage_path, lease_content_type, lease_file_name, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000061',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    'Maria Hernandez', '(916) 555-0148', 'maria.h@example.com',
    'Renewal conversation in October. Prefers texts.',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/tenant/lease.pdf',
    'application/pdf', 'hernandez-lease.pdf',
    '2025-10-01T16:00:00Z', '2026-09-12T17:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000063',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000013',
    'James Wilson', '(916) 555-0196', 'james.wilson@example.com',
    'Quiet tenant. Gardener comes the first Monday.',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000013/tenant/lease.pdf',
    'application/pdf', 'wilson-lease.pdf',
    '2024-08-01T16:00:00Z', '2026-09-08T16:30:00Z'
  )
on conflict (id) do update
  set name = excluded.name, phone = excluded.phone, email = excluded.email,
      notes = excluded.notes, lease_storage_path = excluded.lease_storage_path,
      lease_content_type = excluded.lease_content_type, lease_file_name = excluded.lease_file_name;

delete from public.tenants
where property_id = '00000000-0000-4000-8000-000000000012'
  and account_id = '00000000-0000-4000-8000-000000000001';

insert into public.tenant_files (
  id, account_id, tenant_id, property_id, kind, storage_path, content_type, file_name, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000081',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000061',
    '00000000-0000-4000-8000-000000000011',
    'correspondence',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/tenant/files/00000000-0000-4000-8000-000000000081.svg',
    'image/svg+xml', 'renewal-text.svg',
    '2026-09-10T15:00:00Z', '2026-09-10T15:00:00Z'
  )
on conflict (id) do update
  set storage_path = excluded.storage_path, content_type = excluded.content_type,
      file_name = excluded.file_name, kind = excluded.kind;
