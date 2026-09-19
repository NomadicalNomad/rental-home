-- Incremental: photos, expenses, receipts, private account-media, shared sample.
-- Run this if the project already applied an older supabase/schema.sql.
-- Safe to re-run. Does not wipe personal accounts.
--
-- After this file:
--   1. Confirm Dashboard → Storage has a private bucket named account-media.
--      (This script tries to create it; create it by hand if that insert is skipped.)
--   2. Optional: upload supabase/sample-media/ files to the bucket using the
--      storage_path values seeded below. The app also ships the same files as
--      a sample-only fallback if the object is missing.
--   3. Never put service_role in the PWA. Sample rows are seeded here only.

alter table public.accounts add column if not exists is_sample boolean not null default false;
create unique index if not exists accounts_one_sample_idx
  on public.accounts (is_sample)
  where is_sample;

alter table public.properties add column if not exists thumbnail_path text;

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

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute procedure public.touch_updated_at();

drop trigger if exists receipts_touch_updated_at on public.receipts;
create trigger receipts_touch_updated_at
  before update on public.receipts
  for each row execute procedure public.touch_updated_at();

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
    tenant_name, phone, email, rent, notes, thumbnail_path, created_at, updated_at
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
    coalesce((item->>'created_at')::timestamptz, (item->>'createdAt')::timestamptz, now()),
    now()
  from jsonb_array_elements(payload) as item;
end;
$$;

alter table public.expenses enable row level security;
alter table public.receipts enable row level security;

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

grant select on public.accounts to anon;
grant select on public.properties to anon;
grant select on public.expenses to anon, authenticated;
grant insert, update, delete on public.expenses to authenticated;
grant select on public.receipts to anon, authenticated;
grant insert, update, delete on public.receipts to authenticated;

revoke all on function public.sample_account_id() from public;
revoke all on function public.is_sample_account(uuid) from public;
revoke all on function public.media_account_id(text) from public;
grant execute on function public.sample_account_id() to anon, authenticated;
grant execute on function public.is_sample_account(uuid) to anon, authenticated;
grant execute on function public.media_account_id(text) to anon, authenticated;
grant execute on function public.is_account_member(uuid) to anon, authenticated;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'account-media',
    'account-media',
    false,
    10485760,
    array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif', 'image/svg+xml', 'application/pdf'
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

insert into public.accounts (id, name, seeded, is_sample)
values ('00000000-0000-4000-8000-000000000001', 'Sample portfolio', true, true)
on conflict (id) do update
  set name = excluded.name, seeded = true, is_sample = true;

insert into public.properties (
  id, account_id, address, city, state, zip, status,
  tenant_name, phone, email, rent, notes, thumbnail_path, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001',
   '1124 Iron Point Road', 'Folsom', 'CA', '95630', 'occupied',
   'Maria Hernandez', '(916) 555-0148', 'maria.h@example.com', '2450',
   'Renewal conversation in October.',
   '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/thumbnail.svg',
   '2026-03-01T16:00:00Z', '2026-09-12T17:00:00Z'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001',
   '704 Blue Ravine Road', 'Folsom', 'CA', '95630', 'vacant',
   '', '', '', '2200', 'Fresh paint completed in the living room.',
   '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000012/thumbnail.svg',
   '2026-04-12T16:00:00Z', '2026-08-03T18:00:00Z'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001',
   '1538 East Bidwell Street', 'Folsom', 'CA', '95630', 'occupied',
   'James Wilson', '(916) 555-0196', 'james.wilson@example.com', '2750',
   'Two-car garage; gardener included.',
   '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000013/thumbnail.svg',
   '2026-02-18T16:00:00Z', '2026-09-08T16:30:00Z'),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001',
   '889 Sibley Street', 'Folsom', 'CA', '95630', 'vacant',
   '', '', '', '1950', '',
   '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000014/thumbnail.svg',
   '2026-05-20T16:00:00Z', '2026-07-01T16:00:00Z')
on conflict (id) do update
  set address = excluded.address, city = excluded.city, state = excluded.state, zip = excluded.zip,
      status = excluded.status, tenant_name = excluded.tenant_name, phone = excluded.phone,
      email = excluded.email, rent = excluded.rent, notes = excluded.notes,
      thumbnail_path = excluded.thumbnail_path, updated_at = excluded.updated_at;

insert into public.expenses (
  id, account_id, property_id, spent_on, amount, category, notes, created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000011', '2026-09-12', 84.00, 'Repairs', 'HVAC filter',
   '2026-09-12T17:10:00Z', '2026-09-12T17:10:00Z'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000011', '2026-01-15', 420.00, 'Insurance', 'Annual landlord policy',
   '2026-01-15T18:00:00Z', '2026-01-15T18:00:00Z'),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000012', '2026-08-03', 186.50, 'Supplies', 'Living room paint',
   '2026-08-03T18:20:00Z', '2026-08-03T18:20:00Z'),
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000013', '2026-09-08', 62.40, 'Utilities', 'Water',
   '2026-09-08T16:40:00Z', '2026-09-08T16:40:00Z'),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000013', '2026-09-01', 75.00, 'Other', 'Gardener',
   '2026-09-01T15:00:00Z', '2026-09-01T15:00:00Z'),
  ('00000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000014', '2026-06-22', 48.00, 'Repairs', 'Front porch light',
   '2026-06-22T19:00:00Z', '2026-06-22T19:00:00Z')
on conflict (id) do update
  set spent_on = excluded.spent_on, amount = excluded.amount, category = excluded.category,
      notes = excluded.notes, updated_at = excluded.updated_at;

insert into public.receipts (
  id, account_id, expense_id, storage_path, content_type, file_name, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000011/expenses/00000000-0000-4000-8000-000000000021/00000000-0000-4000-8000-000000000031.svg',
    'image/svg+xml', 'hvac-filter.svg', '2026-09-12T17:12:00Z', '2026-09-12T17:12:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000032',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000024',
    '00000000-0000-4000-8000-000000000001/properties/00000000-0000-4000-8000-000000000013/expenses/00000000-0000-4000-8000-000000000024/00000000-0000-4000-8000-000000000032.pdf',
    'application/pdf', 'water-bill.pdf', '2026-09-08T16:42:00Z', '2026-09-08T16:42:00Z'
  )
on conflict (id) do update
  set storage_path = excluded.storage_path, content_type = excluded.content_type,
      file_name = excluded.file_name, updated_at = excluded.updated_at;
