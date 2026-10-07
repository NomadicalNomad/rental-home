-- Forward upgrade after both 20260919 migrations. Run preflight first; never repair
-- conflicting production rows by deletion. Apply in one transaction.
begin;
alter table public.account_invites add column if not exists revoked_at timestamptz;
alter table public.account_invites add column if not exists accepted_by uuid references auth.users(id);
alter table public.properties add column if not exists import_fingerprint text;
create unique index if not exists properties_import_fingerprint on public.properties(account_id,import_fingerprint) where import_fingerprint is not null;
create unique index if not exists properties_account_identity on public.properties(account_id,id);
create unique index if not exists expenses_account_identity on public.expenses(account_id,id);
create unique index if not exists tenants_account_property_identity on public.tenants(account_id,property_id,id);
create unique index if not exists receipts_one_per_expense on public.receipts(expense_id);

do $$ declare spec text[]; begin
  foreach spec slice 1 in array array[
    ['expenses','expenses_account_parent','(account_id,property_id)','properties(account_id,id)'],
    ['receipts','receipts_account_parent','(account_id,expense_id)','expenses(account_id,id)'],
    ['property_photos','photos_account_parent','(account_id,property_id)','properties(account_id,id)'],
    ['property_appliances','appliances_account_parent','(account_id,property_id)','properties(account_id,id)'],
    ['tenants','tenants_account_parent','(account_id,property_id)','properties(account_id,id)'],
    ['tenant_files','files_account_tenant_parent','(account_id,property_id,tenant_id)','tenants(account_id,property_id,id)']
  ] loop
    if not exists(select 1 from pg_constraint where conname=spec[2]) then
      execute format('alter table public.%I add constraint %I foreign key %s references public.%s on delete cascade',spec[1],spec[2],spec[3],spec[4]);
    end if;
  end loop;
end $$;

-- Stable, non-destructive compatibility backfills.
insert into public.property_photos(account_id,property_id,storage_path,is_primary)
select account_id,id,thumbnail_path,true from public.properties p
where thumbnail_path is not null and thumbnail_path<>'' and not exists(select 1 from public.property_photos x where x.property_id=p.id);
insert into public.tenants(account_id,property_id,name,phone,email)
select account_id,id,tenant_name,phone,email from public.properties p
where (tenant_name<>'' or phone<>'' or email<>'') and not exists(select 1 from public.tenants x where x.property_id=p.id);

-- Abort on conflicting existing data rather than deleting it.
do $$ begin
 if exists(select 1 from public.property_photos group by property_id having count(*)>10) then raise exception 'Preflight: gallery exceeds 10; operator review required'; end if;
end $$;

create or replace function public.validate_content_reference() returns trigger
language plpgsql security definer set search_path=public as $$
declare pid uuid; prefix text; path text; begin
 if public.is_sample_account(new.account_id) then return new; end if;
 if tg_table_name='receipts' then select property_id into pid from public.expenses where id=new.expense_id and account_id=new.account_id;
 elsif tg_table_name='properties' then pid:=new.id; else pid:=new.property_id; end if;
 prefix:=new.account_id::text||'/properties/'||pid::text||'/';
 path:=case when tg_table_name='properties' then to_jsonb(new)->>'thumbnail_path' when tg_table_name='tenants' then to_jsonb(new)->>'lease_storage_path' else to_jsonb(new)->>'storage_path' end;
 if path is not null and (path not like prefix||'%' or path ~ '(^|/)\.\.?(/|$)' or path ~ '[\\%]' or path ~ '[[:cntrl:]]') then raise exception 'Invalid account/property storage reference'; end if;
 if path is not null and not exists(select 1 from storage.objects where bucket_id='account-media' and name=path) then raise exception 'Referenced media is missing; upload and verify it first'; end if;
 return new;
end $$;
do $$ declare tab text; begin foreach tab in array array['properties','property_photos','receipts','tenants','tenant_files'] loop
 execute format('drop trigger if exists content_reference_check on public.%I',tab);
 execute format('create trigger content_reference_check before insert or update on public.%I for each row execute function public.validate_content_reference()',tab);
end loop; end $$;

create or replace function public.enforce_gallery_limit() returns trigger language plpgsql set search_path=public as $$ begin
 perform 1 from public.properties where id=new.property_id for update;
 if (select count(*) from public.property_photos where property_id=new.property_id and id<>new.id)>=10 then raise exception 'You can add up to 10 photos'; end if;
 return new;
end $$;
drop trigger if exists gallery_limit on public.property_photos;
create trigger gallery_limit before insert or update of property_id on public.property_photos for each row execute function public.enforce_gallery_limit();

-- Only trusted confirmed identity can join. Signup never consumes invitation.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare aid uuid; begin
 insert into public.accounts(name) values(coalesce(nullif(trim(new.raw_user_meta_data->>'account_name'),''),'My rentals')) returning id into aid;
 insert into public.account_members(account_id,user_id,role,email) values(aid,new.id,'owner',coalesce(new.email,''));
 return new;
end $$;
create or replace function public.accept_invite(invite_token text) returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); identity_email text; invite public.account_invites%rowtype; begin
 if uid is null then raise exception 'Not signed in'; end if;
 select lower(email) into identity_email from auth.users where id=uid and email_confirmed_at is not null;
 if identity_email is null then raise exception 'Confirm your email before joining an account'; end if;
 select * into invite from public.account_invites where token=upper(trim(invite_token)) for update;
 if invite.id is null then raise exception 'Invite code was not found'; end if;
 if invite.revoked_at is not null or invite.expires_at<=now() then raise exception 'Invite has expired or was revoked'; end if;
 if invite.accepted_at is not null then
   if invite.accepted_by=uid and public.is_account_member(invite.account_id) then return invite.account_id; end if;
   raise exception 'Invite has already been used; ask the owner for a new link';
 end if;
 if invite.email is not null and lower(invite.email)<>identity_email then raise exception 'This invite was created for a different email'; end if;
 if public.is_sample_account(invite.account_id) then raise exception 'Not allowed'; end if;
 insert into public.account_members(account_id,user_id,role,email) values(invite.account_id,uid,'member',identity_email) on conflict do nothing;
 update public.account_invites set accepted_at=now(),accepted_by=uid where id=invite.id;
 return invite.account_id;
end $$;
create or replace function public.claim_pending_invites() returns void language plpgsql security definer set search_path=public as $$
declare t text; e text; begin
 select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if e is null then return; end if;
 for t in select token from public.account_invites where lower(email)=e and accepted_at is null and revoked_at is null and expires_at>now() order by created_at loop perform public.accept_invite(t); end loop;
end $$;
-- Legacy short links require reissue; accepted links are never revived.
update public.account_invites set revoked_at=coalesce(revoked_at,now()) where length(token)<64;
drop function if exists public.create_invite(uuid,text);
create function public.create_invite(target_account uuid,invite_email text default null)
returns table(id uuid,token text,email text,expires_at timestamptz) language plpgsql security definer set search_path=public as $$
begin
 if not public.is_account_owner(target_account) or public.is_sample_account(target_account) then raise exception 'Only the account owner can invite someone'; end if;
 if invite_email is not null and trim(invite_email)<>'' and invite_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Please enter a valid email'; end if;
 return query insert into public.account_invites(account_id,email,token,created_by)
 values(target_account,nullif(lower(trim(invite_email)),''),upper(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')),auth.uid())
 returning account_invites.id,account_invites.token,account_invites.email,account_invites.expires_at;
end $$;
create or replace function public.revoke_invite(target_invite uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 update public.account_invites set revoked_at=now() where id=target_invite and public.is_account_owner(account_id);
 if not found then raise exception 'Only the account owner can revoke this invite'; end if;
end $$;
create or replace function public.lookup_invite(invite_token text) returns table(account_name text,status text) language plpgsql stable security definer set search_path=public as $$ begin
 return query select 'a rental account'::text,case when revoked_at is not null then 'revoked' when accepted_at is not null then 'accepted' when expires_at<=now() then 'expired' else 'valid' end
 from public.account_invites where token=upper(trim(invite_token));
end $$;

create or replace function public.save_current_tenant(target_property uuid,payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p public.properties%rowtype; tid uuid; begin
 select * into p from public.properties where id=target_property for update;
 if not public.is_account_member(p.account_id) or public.is_sample_account(p.account_id) then raise exception 'Not allowed'; end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'Tenant name required'; end if;
 insert into public.tenants(account_id,property_id,name,phone,email,notes)
 values(p.account_id,p.id,trim(payload->>'name'),coalesce(payload->>'phone',''),coalesce(payload->>'email',''),coalesce(payload->>'notes',''))
 on conflict(property_id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,notes=excluded.notes returning id into tid;
 update public.properties set status='occupied',tenant_name=trim(payload->>'name'),phone=coalesce(payload->>'phone',''),email=coalesce(payload->>'email','') where id=p.id;
 return tid;
end $$;
create or replace function public.vacate_property(target_property uuid) returns void language plpgsql security definer set search_path=public as $$
declare aid uuid; begin
 select account_id into aid from public.properties where id=target_property for update;
 if not public.is_account_member(aid) or public.is_sample_account(aid) then raise exception 'Not allowed'; end if;
 delete from public.tenants where property_id=target_property;
 update public.properties set status='vacant',tenant_name='',phone='',email='' where id=target_property;
end $$;
create or replace function public.set_primary_photo(target_photo uuid) returns void language plpgsql security definer set search_path=public as $$
declare p public.property_photos%rowtype; begin
 select * into p from public.property_photos where id=target_photo;
 if not public.is_account_member(p.account_id) or public.is_sample_account(p.account_id) then raise exception 'Not allowed'; end if;
 perform 1 from public.properties where id=p.property_id for update;
 update public.property_photos set is_primary=false where property_id=p.property_id and is_primary;
 update public.property_photos set is_primary=true where id=p.id;
end $$;

-- Old clients may only merge properties, never delete omitted children.
create or replace function public.replace_account_properties(target_account uuid,payload jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; pid uuid; existing jsonb; merged jsonb; row public.properties%rowtype; fp text; begin
 if not public.is_account_member(target_account) or public.is_sample_account(target_account) then raise exception 'Not allowed'; end if;
 if payload is null or jsonb_typeof(payload)<>'array' or jsonb_array_length(payload)>5000 then raise exception 'Invalid limited import'; end if;
 -- Serialize fingerprint retries, including different IDs and old clients.
 perform 1 from public.accounts where id=target_account for update;
 for r in select * from jsonb_array_elements(payload) loop
  fp:=nullif(r->>'import_fingerprint','');
  if fp is not null and exists(select 1 from public.properties where account_id=target_account and import_fingerprint=fp) then continue; end if;
  pid:=coalesce(nullif(r->>'id','')::uuid,gen_random_uuid());
  if exists(select 1 from public.properties where id=pid and account_id<>target_account) then raise exception 'Conflicting identifier'; end if;
  select to_jsonb(p) into existing from public.properties p where id=pid;
  merged:=coalesce(existing,jsonb_build_object('address','','city','','state','','zip','','status','vacant','tenant_name','','phone','','email','','rent','','notes','','property_type','','description','','utility_electric','','utility_gas','','utility_water','','utility_notes','','trash_schedule','','trash_notes','','created_at',now(),'updated_at',now()))
    ||(r-'account_id'-'thumbnail_path'-'created_at'-'updated_at')||jsonb_build_object('id',pid,'account_id',target_account,'updated_at',now());
  if existing is not null and exists(select 1 from public.tenants where property_id=pid) then
   merged:=merged||jsonb_build_object('status',existing->'status','tenant_name',existing->'tenant_name','phone',existing->'phone','email',existing->'email');
  end if;
  row:=jsonb_populate_record(null::public.properties,merged);
  if nullif(trim(row.address),'') is null or nullif(trim(row.city),'') is null or row.state !~ '^[A-Za-z]{2}$' or row.zip !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'Invalid property address'; end if;
  insert into public.properties select row.* on conflict(id) do update set address=excluded.address,city=excluded.city,state=excluded.state,zip=excluded.zip,status=excluded.status,tenant_name=excluded.tenant_name,phone=excluded.phone,email=excluded.email,rent=excluded.rent,notes=excluded.notes,beds=excluded.beds,baths=excluded.baths,sqft=excluded.sqft,year_built=excluded.year_built,property_type=excluded.property_type,description=excluded.description,utility_electric=excluded.utility_electric,utility_gas=excluded.utility_gas,utility_water=excluded.utility_water,utility_notes=excluded.utility_notes,trash_schedule=excluded.trash_schedule,trash_notes=excluded.trash_notes,import_fingerprint=excluded.import_fingerprint;
  if existing is null and nullif(trim(row.tenant_name),'') is not null then perform public.save_current_tenant(pid,jsonb_build_object('name',row.tenant_name,'phone',row.phone,'email',row.email)); end if;
 end loop;
end $$;

create or replace function public.account_snapshot(target_account uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb:='{}'; tab text; rows jsonb; begin
 if not public.is_account_member(target_account) or public.is_sample_account(target_account) then raise exception 'Not allowed'; end if;
 foreach tab in array array['properties','expenses','receipts','property_photos','property_appliances','tenants','tenant_files'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id),''[]''::jsonb) from public.%I t where account_id=$1',tab) into rows using target_account;
  result:=result||jsonb_build_object(tab,rows);
 end loop;
 return jsonb_build_object('tables',result,'revision',md5(result::text));
end $$;
create or replace function public.restore_complete_account(target_account uuid,payload jsonb,expected_revision text) returns void language plpgsql security definer set search_path=public as $$
declare tab text; cols text; snap jsonb; begin
 if not public.is_account_member(target_account) or public.is_sample_account(target_account) then raise exception 'Not allowed'; end if;
 -- Serialize against every account content table, including direct old clients.
 lock table public.properties,public.expenses,public.receipts,public.property_photos,public.property_appliances,public.tenants,public.tenant_files in share row exclusive mode;
 snap:=public.account_snapshot(target_account);
 if (snap->>'revision') is distinct from expected_revision then raise exception 'Account changed; create a new recovery point and preview'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>50000000 then raise exception 'Invalid recovery payload'; end if;
 foreach tab in array array['properties','expenses','receipts','property_photos','property_appliances','tenants','tenant_files'] loop
  if jsonb_typeof(payload->tab) is distinct from 'array' or jsonb_array_length(payload->tab)>50000 then raise exception 'Incomplete recovery payload: %',tab; end if;
  if exists(select 1 from jsonb_array_elements(payload->tab) r where r->>'account_id'<>target_account::text or r->>'account_id' is null) then raise exception 'Foreign account in payload'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(payload->'property_photos') r group by r->>'property_id' having count(*)>10 or count(*) filter(where (r->>'is_primary')::boolean)<>1) then raise exception 'Invalid gallery primary/count'; end if;
 if exists(select 1 from jsonb_array_elements(payload->'properties') p join jsonb_array_elements(payload->'property_photos') g on g->>'property_id'=p->>'id' and (g->>'is_primary')::boolean where p->>'thumbnail_path' is distinct from g->>'storage_path') then raise exception 'Inconsistent primary thumbnail'; end if;
 delete from public.properties where account_id=target_account;
 foreach tab in array array['properties','expenses','tenants','property_photos','property_appliances','receipts','tenant_files'] loop
  select string_agg(quote_ident(attname),',' order by attnum) into cols from pg_attribute where attrelid=('public.'||tab)::regclass and attnum>0 and not attisdropped;
  execute format('insert into public.%I(%s) select %s from jsonb_populate_recordset(null::public.%I,$1)',tab,cols,cols,tab) using payload->tab;
 end loop;
end $$;

-- Only referenced-safe deletion by client; returns whether object can be retired.
create or replace function public.media_is_referenced(object_path text) returns boolean language plpgsql stable security definer set search_path=public as $$ begin
 if not public.is_account_member(public.media_account_id(object_path)) then raise exception 'Not allowed'; end if;
 return exists(select 1 from public.properties where thumbnail_path=object_path) or exists(select 1 from public.property_photos where storage_path=object_path) or exists(select 1 from public.receipts where storage_path=object_path) or exists(select 1 from public.tenants where lease_storage_path=object_path) or exists(select 1 from public.tenant_files where storage_path=object_path);
end $$;

-- Numeric/length constraints on new writes without silently dropping old data.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='properties_valid_facts') then alter table public.properties add constraint properties_valid_facts check((beds is null or beds between 0 and 20) and (baths is null or baths between 0 and 20) and (sqft is null or sqft>=0) and (year_built is null or year_built between 1800 and 2100) and length(address) between 1 and 120 and length(notes)<=1000) not valid; end if;
end $$;
-- Validate nested object authorization and deny traversal; do not depend on UI.
create or replace function public.valid_media_path(object_path text) returns boolean language sql stable security definer set search_path=public as $$
 select object_path !~ '(^|/)\.\.?(/|$)' and object_path !~ '[\\%]' and object_path !~ '[[:cntrl:]]'
 and exists(select 1 from public.properties p where object_path like p.account_id::text||'/properties/'||p.id::text||'/%' and public.is_account_member(p.account_id) and not public.is_sample_account(p.account_id));
$$;
drop policy if exists account_media_insert on storage.objects;
create policy account_media_insert on storage.objects for insert to authenticated with check(bucket_id='account-media' and public.valid_media_path(name));
drop policy if exists account_media_update on storage.objects;
create policy account_media_update on storage.objects for update to authenticated using(bucket_id='account-media' and public.valid_media_path(name) and not public.media_is_referenced(name)) with check(bucket_id='account-media' and public.valid_media_path(name));
drop policy if exists account_media_delete on storage.objects;
create policy account_media_delete on storage.objects for delete to authenticated using(bucket_id='account-media' and public.is_account_member(public.media_account_id(name)) and not public.is_sample_account(public.media_account_id(name)) and not public.media_is_referenced(name));

do $$ declare fn text; begin foreach fn in array array['create_invite(uuid,text)','revoke_invite(uuid)','save_current_tenant(uuid,jsonb)','vacate_property(uuid)','set_primary_photo(uuid)','account_snapshot(uuid)','restore_complete_account(uuid,jsonb,text)','media_is_referenced(text)','valid_media_path(text)'] loop
 execute 'revoke all on function public.'||fn||' from public'; execute 'grant execute on function public.'||fn||' to authenticated';
end loop; end $$;
create table if not exists public.recovery_stages (
 id uuid primary key,account_id uuid not null references public.accounts(id),user_id uuid not null references auth.users(id),property_ids uuid[] not null,expires_at timestamptz not null default now()+interval '2 hours'
);
alter table public.recovery_stages enable row level security;
create or replace function public.begin_recovery_stage(target_account uuid,stage_id uuid,property_ids uuid[],expected_revision text) returns void language plpgsql security definer set search_path=public as $$ begin
 if not public.is_account_member(target_account) or public.is_sample_account(target_account) or cardinality(property_ids)>5000 then raise exception 'Not allowed'; end if;
 if (public.account_snapshot(target_account)->>'revision') is distinct from expected_revision then raise exception 'Account changed'; end if;
 if exists(select 1 from public.properties where id=any(property_ids) and account_id<>target_account) then raise exception 'Conflicting property ID'; end if;
 insert into public.recovery_stages(id,account_id,user_id,property_ids) values(stage_id,target_account,auth.uid(),property_ids);
end $$;
create or replace function public.end_recovery_stage(stage_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin delete from public.recovery_stages where id=stage_id and user_id=auth.uid(); end $$;
create or replace function public.valid_media_path(object_path text) returns boolean language sql stable security definer set search_path=public as $$
 select object_path !~ '(^|/)\.\.?(/|$)' and object_path !~ '[\\%]' and object_path !~ '[[:cntrl:]]' and (
 exists(select 1 from public.properties p where object_path like p.account_id::text||'/properties/'||p.id::text||'/%' and public.is_account_member(p.account_id) and not public.is_sample_account(p.account_id))
 or exists(select 1 from public.recovery_stages s,unnest(s.property_ids) pid where s.user_id=auth.uid() and s.expires_at>now() and public.is_account_member(s.account_id) and object_path like s.account_id::text||'/properties/'||pid::text||'/recovery/'||s.id::text||'/%'));
$$;
revoke all on function public.begin_recovery_stage(uuid,uuid,uuid[],text) from public;
revoke all on function public.end_recovery_stage(uuid) from public;
grant execute on function public.begin_recovery_stage(uuid,uuid,uuid[],text),public.end_recovery_stage(uuid) to authenticated;
-- Match supported client formats; existing objects remain readable.
update storage.buckets set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','application/pdf'] where id='account-media';
revoke all on function public.validate_content_reference() from public;
-- Older direct property status writes must also leave tenant mirrors consistent.
create or replace function public.apply_vacancy_transition() returns trigger language plpgsql set search_path=public as $$ begin
 if old.status='occupied' and new.status='vacant' and not public.is_sample_account(new.account_id) then
  delete from public.tenants where property_id=new.id and account_id=new.account_id;
  new.tenant_name:='';new.phone:='';new.email:='';
 end if;return new;
end $$;
drop trigger if exists property_vacancy_transition on public.properties;
create trigger property_vacancy_transition before update of status on public.properties for each row execute function public.apply_vacancy_transition();
revoke all on function public.apply_vacancy_transition() from public;
commit;
