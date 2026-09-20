-- Incremental: MLS/ops property fields, gallery, appliances, tenants, lease + correspondence.
-- Run after 20260919_photos_expenses_sample.sql (or a schema.sql that already has those pieces).
-- Safe to re-run. Does not wipe personal accounts. Sample writes stay service-role / SQL only.

-- ---------------------------------------------------------------------------
-- properties: MLS-like + utilities + trash (thumbnail_path stays, synced to primary photo)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

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

-- Keep thumbnail_path = primary gallery path. Promote another photo if the primary is removed.
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
-- One-shot backfill: existing thumbnail → primary gallery row; contact → tenants
-- ---------------------------------------------------------------------------

insert into public.property_photos (account_id, property_id, storage_path, sort_order, is_primary)
select p.account_id, p.id, p.thumbnail_path, 0, true
from public.properties p
where p.thumbnail_path is not null
  and trim(p.thumbnail_path) <> ''
  and not exists (
    select 1 from public.property_photos g
    where g.property_id = p.id
  );

insert into public.tenants (account_id, property_id, name, phone, email)
select p.account_id, p.id, p.tenant_name, p.phone, p.email
from public.properties p
where (
    p.status = 'occupied'
    or nullif(trim(p.tenant_name), '') is not null
    or nullif(trim(p.phone), '') is not null
    or nullif(trim(p.email), '') is not null
  )
  and not exists (
    select 1 from public.tenants t
    where t.property_id = p.id
  );

-- ---------------------------------------------------------------------------
-- Backup restore: keep contact columns + MLS; recreate the one tenant row
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- RLS + grants (member read/write; sample SELECT only)
-- ---------------------------------------------------------------------------

alter table public.property_appliances enable row level security;
alter table public.property_photos enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_files enable row level security;

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

grant select on public.property_appliances to anon, authenticated;
grant insert, update, delete on public.property_appliances to authenticated;
grant select on public.property_photos to anon, authenticated;
grant insert, update, delete on public.property_photos to authenticated;
grant select on public.tenants to anon, authenticated;
grant insert, update, delete on public.tenants to authenticated;
grant select on public.tenant_files to anon, authenticated;
grant insert, update, delete on public.tenant_files to authenticated;

revoke all on function public.sync_property_thumbnail() from public;

-- ---------------------------------------------------------------------------
-- Sample portfolio extras (read-only for clients)
-- ---------------------------------------------------------------------------

update public.properties set
  beds = 3, baths = 2, sqft = 1620, year_built = 1998,
  property_type = 'Single family',
  description = 'Single-story ranch near Intel. Two-car garage and a covered patio.',
  utility_electric = 'SMUD',
  utility_gas = 'PG&E',
  utility_water = 'City of Folsom',
  utility_notes = 'Landlord pays water. Tenant pays electric and gas.',
  trash_schedule = 'Thursday mornings',
  trash_notes = 'Bins out by 6am. Recycle and green waste weekly.'
where id = '00000000-0000-4000-8000-000000000011'
  and account_id = '00000000-0000-4000-8000-000000000001';

update public.properties set
  beds = 2, baths = 2, sqft = 1180, year_built = 2004,
  property_type = 'Townhouse',
  description = 'End-unit townhouse. Fresh paint in the living room. Ready to show.',
  utility_electric = 'SMUD',
  utility_gas = 'PG&E',
  utility_water = 'City of Folsom',
  utility_notes = 'All utilities in the landlord name until a tenant moves in.',
  trash_schedule = 'Friday mornings',
  trash_notes = 'HOA handles street sweeping; trash is city pickup.'
where id = '00000000-0000-4000-8000-000000000012'
  and account_id = '00000000-0000-4000-8000-000000000001';

update public.properties set
  beds = 4, baths = 2.5, sqft = 2105, year_built = 1992,
  property_type = 'Single family',
  description = 'Two-story with a two-car garage. Gardener included on the first of the month.',
  utility_electric = 'SMUD',
  utility_gas = 'PG&E',
  utility_water = 'City of Folsom',
  utility_notes = 'Tenant pays all utilities.',
  trash_schedule = 'Wednesday mornings',
  trash_notes = 'Extra green-waste pickup in fall.'
where id = '00000000-0000-4000-8000-000000000013'
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

-- Vacant sample home must not keep a leftover tenant row.
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
