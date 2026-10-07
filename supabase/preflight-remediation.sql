-- READ ONLY. Run with authorized operator access before the forward migration.
-- Return counts only; don't export customer fields or delete conflicts.
select 'expenses_parent_account' issue,count(*) count from public.expenses c join public.properties p on p.id=c.property_id where c.account_id<>p.account_id
union all select 'receipts_parent_account',count(*) from public.receipts c join public.expenses p on p.id=c.expense_id where c.account_id<>p.account_id
union all select 'photos_parent_account',count(*) from public.property_photos c join public.properties p on p.id=c.property_id where c.account_id<>p.account_id
union all select 'appliances_parent_account',count(*) from public.property_appliances c join public.properties p on p.id=c.property_id where c.account_id<>p.account_id
union all select 'tenants_parent_account',count(*) from public.tenants c join public.properties p on p.id=c.property_id where c.account_id<>p.account_id
union all select 'tenant_files_parent',count(*) from public.tenant_files c join public.tenants p on p.id=c.tenant_id where c.account_id<>p.account_id or c.property_id<>p.property_id
union all select 'receipt_duplicates',count(*) from (select expense_id from public.receipts group by expense_id having count(*)>1) x
union all select 'gallery_over_limit',count(*) from (select property_id from public.property_photos group by property_id having count(*)>10) x
union all select 'invalid_home_facts',count(*) from public.properties where beds<0 or beds>20 or baths<0 or baths>20 or sqft<0 or year_built<1800 or year_built>2100 or length(address)=0 or length(address)>120 or length(notes)>1000;
with refs as (
select account_id,thumbnail_path path from public.properties union all
select account_id,storage_path from public.property_photos union all
select account_id,storage_path from public.receipts union all
select account_id,lease_storage_path from public.tenants union all
select account_id,storage_path from public.tenant_files)
select 'missing_or_foreign_media' issue,count(*) count from refs r
where r.path is not null and not public.is_sample_account(r.account_id) and
(r.path not like r.account_id::text||'/properties/%' or not exists(select 1 from storage.objects o where o.bucket_id='account-media' and o.name=r.path));
