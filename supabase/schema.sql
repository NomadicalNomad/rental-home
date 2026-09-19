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
alter table public.accounts add column if not exists created_at timestamptz not null default now();

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  if not public.is_account_member(target_account) then
    raise exception 'Not allowed';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Backup file did not contain a property list';
  end if;

  delete from public.properties where account_id = target_account;

  insert into public.properties (
    id, account_id, address, city, state, zip, status,
    tenant_name, phone, email, rent, notes, created_at, updated_at
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
    coalesce((item->>'created_at')::timestamptz, (item->>'createdAt')::timestamptz, now()),
    now()
  from jsonb_array_elements(payload) as item;
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
-- A signed-in user only reads/writes rows for accounts they belong to.
-- Invites: owners create; acceptor joins via accept_invite() (security definer).
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.properties enable row level security;
alter table public.account_invites enable row level security;

drop policy if exists accounts_select_member on public.accounts;
create policy accounts_select_member
  on public.accounts for select
  to authenticated
  using (public.is_account_member(id));

drop policy if exists accounts_update_member on public.accounts;
create policy accounts_update_member
  on public.accounts for update
  to authenticated
  using (public.is_account_member(id))
  with check (public.is_account_member(id));

drop policy if exists members_select_peer on public.account_members;
create policy members_select_peer
  on public.account_members for select
  to authenticated
  using (public.is_account_member(account_id));

drop policy if exists properties_select_member on public.properties;
create policy properties_select_member
  on public.properties for select
  to authenticated
  using (public.is_account_member(account_id));

drop policy if exists properties_insert_member on public.properties;
create policy properties_insert_member
  on public.properties for insert
  to authenticated
  with check (public.is_account_member(account_id));

drop policy if exists properties_update_member on public.properties;
create policy properties_update_member
  on public.properties for update
  to authenticated
  using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

drop policy if exists properties_delete_member on public.properties;
create policy properties_delete_member
  on public.properties for delete
  to authenticated
  using (public.is_account_member(account_id));

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
-- Grants (anon cannot read properties; lookup_invite is the only public RPC)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, update on public.accounts to authenticated;
grant select on public.account_members to authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant select, delete on public.account_invites to authenticated;

revoke all on function public.is_account_member(uuid) from public;
revoke all on function public.is_account_owner(uuid) from public;
revoke all on function public.current_user_email() from public;
revoke all on function public.claim_pending_invites() from public;
revoke all on function public.ensure_my_account() from public;
revoke all on function public.lookup_invite(text) from public;
revoke all on function public.create_invite(uuid, text) from public;
revoke all on function public.accept_invite(text) from public;
revoke all on function public.replace_account_properties(uuid, jsonb) from public;
revoke all on function public.mark_account_seeded(uuid) from public;

grant execute on function public.is_account_member(uuid) to authenticated;
grant execute on function public.is_account_owner(uuid) to authenticated;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.claim_pending_invites() to authenticated;
grant execute on function public.ensure_my_account() to authenticated;
grant execute on function public.lookup_invite(text) to anon, authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.replace_account_properties(uuid, jsonb) to authenticated;
grant execute on function public.mark_account_seeded(uuid) to authenticated;
