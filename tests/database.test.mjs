import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const schema=fs.readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261007_complete_remediation.sql',import.meta.url),'utf8');
const audited=schema.split('-- COMPLETE REMEDIATION FORWARD ALIGNMENT')[0];
async function setup(source=audited){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',(select email from auth.users where id=auth.uid()))$$;
 grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to authenticated;grant select on storage.objects to anon;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 `);await db.exec(source.replace('create extension if not exists pgcrypto;',''));return db;}
const u='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('isolated PostgreSQL migrations, RLS, RPCs, recovery and constraints',async t=>{
 const db=await setup();try{
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${u}','owner@example.test',now()),('${other}','other@example.test',now());`);
 const accounts=(await db.query('select account_id,user_id from public.account_members where user_id=any($1::uuid[])',[[u,other]])).rows;
 const aid=accounts.find(r=>r.user_id===u).account_id,bid=accounts.find(r=>r.user_id===other).account_id;
 const pid='cccccccc-cccc-4ccc-8ccc-cccccccccccc',foreign='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 await db.exec(`insert into public.properties(id,account_id,address,city,state,zip,status) values('${pid}','${aid}','Synthetic Home','Test','CA','90000','vacant'),('${foreign}','${bid}','Foreign Home','Test','CA','90000','vacant');`);
 await t.test('original suspected forged parent is reproducible before upgrade',async()=>{await db.exec(`insert into public.expenses(account_id,property_id,spent_on,amount) values('${aid}','${foreign}','2026-10-01',1);`);assert.equal((await db.query('select count(*)::int n from expenses where account_id=$1 and property_id=$2',[aid,foreign])).rows[0].n,1);await db.exec(`delete from expenses where property_id='${foreign}';`);});
 await t.test('forward migration and repeat application',async()=>{await db.exec(migration);await db.exec(migration);});
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${u}',false);`);
 await t.test('two-account read and forged parent write are rejected',async()=>{assert.equal((await db.query('select * from properties where id=$1',[foreign])).rows.length,0);await assert.rejects(db.query('insert into expenses(account_id,property_id,spent_on,amount) values($1,$2,$3,1)',[aid,foreign,'2026-10-01']),/foreign key/);await assert.rejects(db.query('select account_snapshot($1)',[bid]),/Not allowed/);});
 await t.test('tenant mirror and vacancy atomicity',async()=>{await db.query('select save_current_tenant($1,$2::jsonb)',[pid,JSON.stringify({name:'Synthetic tenant',phone:'',email:'tenant@example.test',notes:'saved'})]);assert.equal((await db.query('select status,tenant_name from properties where id=$1',[pid])).rows[0].tenant_name,'Synthetic tenant');await assert.rejects(db.query('select save_current_tenant($1,$2::jsonb)',[pid,'{"name":""}']),/required/);assert.equal((await db.query('select name from tenants where property_id=$1',[pid])).rows[0].name,'Synthetic tenant');});
 await t.test('single-use restricted and idempotent invitation',async()=>{
 const inv=(await db.query('select * from create_invite($1,$2)',[aid,'OTHER@EXAMPLE.TEST'])).rows[0];assert.equal(inv.token.length,64);
 await assert.rejects(db.query('select accept_invite($1)',[inv.token]),/different email/);
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);assert.equal((await db.query('select accept_invite($1) id',[inv.token])).rows[0].id,aid);await db.query('select accept_invite($1)',[inv.token]);
 await db.exec(`select set_config('request.jwt.claim.sub','${u}',false);`);await assert.rejects(db.query('select accept_invite($1)',[inv.token]),/used/);
 const revoked=(await db.query('select * from create_invite($1,null)',[aid])).rows[0];await db.query('select revoke_invite($1)',[revoked.id]);await assert.rejects(db.query('select accept_invite($1)',[revoked.token]),/revoked/);
 });
 await t.test('unconfirmed signup metadata never grants membership; confirmed explicit acceptance works',async()=>{
 const invite=(await db.query('select * from create_invite($1,$2)',[aid,'new@example.test'])).rows[0];const newbie='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 await db.exec('reset role');await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[newbie,'new@example.test',JSON.stringify({invite_token:invite.token})]);assert.equal((await db.query('select * from account_members where user_id=$1 and account_id=$2',[newbie,aid])).rows.length,0);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${newbie}',false);`);await assert.rejects(db.query('select accept_invite($1)',[invite.token]),/Confirm/);await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[newbie]);await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${newbie}',false);`);await db.query('select accept_invite($1)',[invite.token]);await db.exec(`select set_config('request.jwt.claim.sub','${u}',false);`);
 });
 await t.test('gallery cap and one receipt enforced directly',async()=>{
 for(let i=0;i<11;i++)await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['account-media',`${aid}/properties/${pid}/photos/${i}.jpg`]);
 for(let i=0;i<10;i++)await db.query('insert into property_photos(account_id,property_id,storage_path,is_primary) values($1,$2,$3,$4)',[aid,pid,`${aid}/properties/${pid}/photos/${i}.jpg`,i===0]);
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['account-media',`${aid}/properties/${pid}/photos/overflow.jpg`]);
 await assert.rejects(db.query('insert into property_photos(account_id,property_id,storage_path) values($1,$2,$3)',[aid,pid,`${aid}/properties/${pid}/photos/overflow.jpg`]),/10 photos/);
 const expense=(await db.query('insert into expenses(account_id,property_id,spent_on,amount) values($1,$2,$3,0) returning id',[aid,pid,'2026-10-01'])).rows[0].id;
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2),($1,$3)',['account-media',`${aid}/properties/${pid}/expenses/${expense}/receipt.pdf`,`${aid}/properties/${pid}/expenses/${expense}/other.pdf`]);
 await db.query('insert into receipts(account_id,expense_id,storage_path) values($1,$2,$3)',[aid,expense,`${aid}/properties/${pid}/expenses/${expense}/receipt.pdf`]);await assert.rejects(db.query('insert into receipts(account_id,expense_id,storage_path) values($1,$2,$3)',[aid,expense,`${aid}/properties/${pid}/expenses/${expense}/other.pdf`]),/unique/);
 });
 await t.test('tenant file actual property and forged media path rejected',async()=>{const tenant=(await db.query('select id from tenants where property_id=$1',[pid])).rows[0].id;await db.exec('reset role');await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['account-media',`${aid}/properties/${foreign}/tenant/files/a.pdf`]);await db.exec('set role authenticated');await assert.rejects(db.query('insert into tenant_files(account_id,property_id,tenant_id,storage_path) values($1,$2,$3,$4)',[aid,foreign,tenant,`${aid}/properties/${foreign}/tenant/files/a.pdf`]),/foreign key/);await assert.rejects(db.query('insert into property_photos(account_id,property_id,storage_path) values($1,$2,$3)',[aid,pid,`${bid}/properties/${foreign}/x.jpg`]),/Invalid|10 photos/);assert.equal((await db.query('select valid_media_path($1) ok',[`${aid}/properties/${pid}/../x.jpg`])).rows[0].ok,false);});
 await t.test('limited old RPC preserves all child rows',async()=>{const before=(await db.query('select account_snapshot($1) s',[aid])).rows[0].s;await db.query('select replace_account_properties($1,$2::jsonb)',[aid,JSON.stringify([{id:pid,address:'Updated home',city:'Test',state:'CA',zip:'90000',status:'vacant'}])]);const after=(await db.query('select account_snapshot($1) s',[aid])).rows[0].s;for(const tab of ['expenses','receipts','property_photos','tenants'])assert.equal(after.tables[tab].length,before.tables[tab].length);});
 await t.test('limited import fingerprints deduplicate retries and preserve supported fields',async()=>{
 const fp='synthetic-fingerprint';const first=crypto.randomUUID();const row={id:first,address:'Imported home',city:'Test',state:'CA',zip:'90000',status:'vacant',beds:0,utility_water:'Synthetic water',import_fingerprint:fp};
 await db.query('select replace_account_properties($1,$2::jsonb)',[aid,JSON.stringify([row])]);await db.query('select replace_account_properties($1,$2::jsonb)',[aid,JSON.stringify([{...row,id:crypto.randomUUID()}])]);
 const imported=(await db.query('select beds,utility_water from properties where import_fingerprint=$1',[fp])).rows;assert.equal(imported.length,1);assert.equal(Number(imported[0].beds),0);assert.equal(imported[0].utility_water,'Synthetic water');
 });
 await t.test('expired invitations and missing complete-RPC arrays fail safely',async()=>{
 const inv=(await db.query('select * from create_invite($1,null)',[aid])).rows[0];await db.exec('reset role');await db.query("update account_invites set expires_at=now()-interval '1 second' where id=$1",[inv.id]);await db.exec('set role authenticated');await assert.rejects(db.query('select accept_invite($1)',[inv.token]),/expired/);
 const snap=(await db.query('select account_snapshot($1) s',[aid])).rows[0].s;await assert.rejects(db.query('select restore_complete_account($1,$2::jsonb,$3)',[aid,JSON.stringify({properties:[]}),snap.revision]),/Incomplete/);assert.equal((await db.query('select account_snapshot($1) s',[aid])).rows[0].s.revision,snap.revision);
 });
 await t.test('all seven relational tables, primary cover, lease and correspondence participate in recovery',async()=>{
 const tenant=(await db.query('select id from tenants where property_id=$1',[pid])).rows[0].id;const lease=aid+'/properties/'+pid+'/tenant/lease.pdf',copy=aid+'/properties/'+pid+'/tenant/files/copy.pdf';
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2),($1,$3)',['account-media',lease,copy]);await db.query('update tenants set lease_storage_path=$1,lease_content_type=$2,lease_file_name=$3 where id=$4',[lease,'application/pdf','synthetic.pdf',tenant]);
 await db.query('insert into tenant_files(account_id,property_id,tenant_id,storage_path,kind) values($1,$2,$3,$4,$5)',[aid,pid,tenant,copy,'correspondence']);await db.query('insert into property_appliances(account_id,property_id,name,fuel,notes) values($1,$2,$3,$4,$5)',[aid,pid,'Synthetic range','electric','Recovery notes']);
 const snap=(await db.query('select account_snapshot($1) s',[aid])).rows[0].s;for(const table of Object.keys(snap.tables))assert.ok(snap.tables[table].length>0,table);
 assert.equal(snap.tables.properties.find(r=>r.id===pid).thumbnail_path,snap.tables.property_photos.find(r=>r.is_primary).storage_path);
 await db.query('delete from storage.objects where name=$1',[lease]);assert.equal((await db.query('select * from storage.objects where name=$1',[lease])).rows.length,1);
 });
 await t.test('full SQL snapshot replacement roundtrip and rollback/stale revision',async()=>{
 const snapshot=(await db.query('select account_snapshot($1) s',[aid])).rows[0].s;
 const invalid=structuredClone(snapshot.tables);invalid.expenses[0].property_id=foreign;await assert.rejects(db.query('select restore_complete_account($1,$2::jsonb,$3)',[aid,JSON.stringify(invalid),snapshot.revision]),/foreign key/);
 assert.equal((await db.query('select account_snapshot($1) s',[aid])).rows[0].s.revision,snapshot.revision);
 await assert.rejects(db.query('select restore_complete_account($1,$2::jsonb,$3)',[aid,JSON.stringify(snapshot.tables),'stale']),/changed/);
 await db.query('select restore_complete_account($1,$2::jsonb,$3)',[aid,JSON.stringify(snapshot.tables),snapshot.revision]);const result=(await db.query('select account_snapshot($1) s',[aid])).rows[0].s;
 for(const tab of Object.keys(snapshot.tables))assert.equal(result.tables[tab].length,snapshot.tables[tab].length);
 });
 await t.test('anonymous sample only; personal writes unavailable',async()=>{await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false);");assert.equal((await db.query('select * from properties where account_id=$1',[aid])).rows.length,0);assert.ok((await db.query("select * from properties where account_id='00000000-0000-4000-8000-000000000001'")).rows.length);await assert.rejects(db.query('delete from properties'),/permission/);});
 }finally{await db.close();}
});
test('fresh setup and documented older-installation migration order',async t=>{
 await t.test('full fresh schema includes identical forward remediation',async()=>{const db=await setup(schema);try{const r=await db.query("select to_regclass('public.recovery_stages') id");assert.ok(r.rows[0].id);await db.exec(migration);}finally{await db.close();}});
 await t.test('pre-tabs historical installation upgrades with safe forward bridge',async()=>{const db=await setup(fs.readFileSync(new URL('./fixtures/schema-before-tabs.sql',import.meta.url),'utf8'));try{for(const file of ['20260919_photos_expenses_sample.sql','20261007_tabs_upgrade_bridge.sql','20261007_complete_remediation.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));assert.ok((await db.query("select to_regclass('public.recovery_stages') id")).rows[0].id);}finally{await db.close();}});
});
