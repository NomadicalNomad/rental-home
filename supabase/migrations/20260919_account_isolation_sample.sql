-- RentManor — account isolation + shared sample (2026-09-19)
--
-- Paste this into Supabase Dashboard → SQL → New query → Run.
-- Safe to re-run. Does NOT delete or rewrite any non-sample properties.
--
-- Dashboard steps after this SQL:
--   1. Table Editor → accounts: confirm one row id
--      00000000-0000-4000-8000-000000000001 with is_sample = true.
--   2. Authentication → Policies: properties should have
--      properties_select_member (authenticated / member) and
--      properties_select_sample (anon + authenticated / sample only).
--      Insert/update/delete must exclude the sample account.
--   3. Do not turn off RLS on accounts, account_members, properties, or
--      account_invites. Do not put the service_role key in the PWA.
--   4. Reload https://app.rentmanor.com/ and prove:
--      fresh signup → 0 properties; no foreign Folsom rows.
--      Sample homes only at https://app.rentmanor.com/#/sample
--
-- Re-running supabase/schema.sql is also fine (same outcome).

alter table public.accounts add column if not exists is_sample boolean not null default false;

create unique index if not exists accounts_one_sample_idx
  on public.accounts (is_sample)
  where is_sample;

create or replace function public.is_sample_account(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select aid = '00000000-0000-4000-8000-000000000001'::uuid
    or exists (
      select 1
      from public.accounts
      where id = aid
        and is_sample = true
    );
$$;

insert into public.accounts (id, name, seeded, is_sample)
values ('00000000-0000-4000-8000-000000000001', 'Sample homes', true, true)
on conflict (id) do update
  set is_sample = true,
      seeded = true,
      name = excluded.name;

insert into public.properties (
  id, account_id, address, city, state, zip, status,
  tenant_name, phone, email, rent, notes
) values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '1124 Iron Point Road', 'Folsom', 'CA', '95630', 'occupied',
    'Maria Hernandez', '(916) 555-0148', 'maria.h@example.com', '2450',
    'Renewal conversation in October.'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '704 Blue Ravine Road', 'Folsom', 'CA', '95630', 'vacant',
    '', '', '', '2200',
    'Fresh paint completed in the living room.'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    '1538 East Bidwell Street', 'Folsom', 'CA', '95630', 'occupied',
    'James Wilson', '(916) 555-0196', 'james.wilson@example.com', '2750',
    'Two-car garage; gardener included.'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    '889 Sibley Street', 'Folsom', 'CA', '95630', 'vacant',
    '', '', '', '1950',
    ''
  )
on conflict (id) do nothing;

-- Personal accounts stay member-only. Sample is read-only for every client role.
drop policy if exists accounts_select_sample on public.accounts;
create policy accounts_select_sample
  on public.accounts for select
  to anon, authenticated
  using (public.is_sample_account(id));

drop policy if exists accounts_update_member on public.accounts;
create policy accounts_update_member
  on public.accounts for update
  to authenticated
  using (public.is_account_member(id) and not public.is_sample_account(id))
  with check (public.is_account_member(id) and not public.is_sample_account(id));

drop policy if exists members_select_peer on public.account_members;
create policy members_select_peer
  on public.account_members for select
  to authenticated
  using (public.is_account_member(account_id) and not public.is_sample_account(account_id));

drop policy if exists properties_select_sample on public.properties;
create policy properties_select_sample
  on public.properties for select
  to anon, authenticated
  using (public.is_sample_account(account_id));

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

grant select on public.accounts to anon;
grant select on public.properties to anon;
revoke all on function public.is_sample_account(uuid) from public;
grant execute on function public.is_sample_account(uuid) to anon, authenticated;

-- Keep existing personal-account functions from attaching anyone to the sample.
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

  if pending.id is not null and not public.is_sample_account(pending.account_id) then
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
    and not public.is_sample_account(i.account_id)
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

  select m.account_id into aid
  from public.account_members m
  join public.accounts a on a.id = m.account_id
  where m.user_id = uid
    and coalesce(a.is_sample, false) = false
  order by m.created_at asc
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

  if public.is_sample_account(aid) then
    raise exception 'Sample account is read-only';
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

  if public.is_sample_account(invite.account_id) then
    raise exception 'Sample account is read-only';
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

  if public.is_sample_account(target_account) then
    raise exception 'Sample account is read-only';
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
  if public.is_sample_account(target_account) then
    raise exception 'Sample account is read-only';
  end if;
  update public.accounts set seeded = true where id = target_account;
end;
$$;
