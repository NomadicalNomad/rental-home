import { assertFileSignature, validateProperty, validateMoney, validateDate } from './validation.js';
export const TABLES=['properties','expenses','receipts','property_photos','property_appliances','tenants','tenant_files'];
export const MAX_ARCHIVE_BYTES=100*1024*1024;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=message=>{throw new Error(message);};
export async function sha256(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function encode(bytes) { let s=''; for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.slice(i,i+8192)); return btoa(s); }
function decode(text) { if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) fail('Invalid file encoding'); return Uint8Array.from(atob(text),c=>c.charCodeAt(0)); }
export function referencedPaths(tables) { return [...new Set([...tables.properties.map(r=>r.thumbnail_path),...tables.property_photos.map(r=>r.storage_path),...tables.receipts.map(r=>r.storage_path),...tables.tenants.map(r=>r.lease_storage_path),...tables.tenant_files.map(r=>r.storage_path)].filter(Boolean))].sort(); }
export function validateTables(tables,account) {
 if(!UUID.test(account)) fail('Invalid source account');
 for(const tab of TABLES) {
  if(!Array.isArray(tables[tab]) || tables[tab].length>50000) fail(`Missing or excessive ${tab}`);
  const ids=new Set(); for(const r of tables[tab]) { if(!r || !UUID.test(r.id)||ids.has(r.id)||r.account_id!==account) fail(`Invalid/duplicate/foreign ${tab} identifier`); ids.add(r.id); }
 }
 if(tables.properties.length>5000) fail('Too many properties');
 const properties=new Map(tables.properties.map(r=>[r.id,r])); const expenses=new Map(tables.expenses.map(r=>[r.id,r])); const tenants=new Map(tables.tenants.map(r=>[r.id,r]));
 const oneTenant=new Set(),oneReceipt=new Set(),photos=new Map(),primary=new Set();
 for(const r of tables.properties) { validateProperty({...r,yearBuilt:r.year_built}); if(!['occupied','vacant'].includes(r.status)) fail('Invalid occupancy'); }
 for(const tab of ['expenses','property_photos','property_appliances','tenants','tenant_files']) for(const r of tables[tab]) if(!properties.has(r.property_id)) fail(`Orphan ${tab}`);
 for(const r of tables.expenses) {validateMoney(r.amount);validateDate(r.spent_on);if(String(r.notes??'').length>1000) fail('Expense notes too long');}
 for(const r of tables.tenants) { if(oneTenant.has(r.property_id)) fail('Multiple tenants'); oneTenant.add(r.property_id); }
 for(const r of tables.receipts) { if(!expenses.has(r.expense_id)||oneReceipt.has(r.expense_id)) fail('Orphan/duplicate receipt'); oneReceipt.add(r.expense_id); }
 for(const r of tables.tenant_files) if(tenants.get(r.tenant_id)?.property_id!==r.property_id) fail('Tenant-file parent mismatch');
 for(const r of tables.property_photos) { const count=(photos.get(r.property_id)||0)+1; photos.set(r.property_id,count); if(count>10) fail('Photo limit exceeded'); if(r.is_primary) {if(primary.has(r.property_id)) fail('Multiple primary photos');primary.add(r.property_id);} }
 for(const r of tables.properties) { const list=tables.property_photos.filter(p=>p.property_id===r.id); if(list.length && (!primary.has(r.id)||list.find(p=>p.is_primary)?.storage_path!==r.thumbnail_path)) fail('Inconsistent primary cover'); }
 for(const tab of ['properties','property_photos','receipts','tenants','tenant_files']) for(const r of tables[tab]) {
  const path=tab==='properties'?r.thumbnail_path:tab==='tenants'?r.lease_storage_path:r.storage_path;
  const pid=tab==='properties'?r.id:tab==='receipts'?expenses.get(r.expense_id)?.property_id:r.property_id;
  if(path && (!path.startsWith(`${account}/properties/${pid}/`) || /(^|\/)\.{1,2}(\/|$)|[\\%\x00-\x1f]/.test(path))) fail('Invalid storage path');
 }
 return tables;
}
export async function validateArchive(archive,{signal}={}) {
 if(new TextEncoder().encode(JSON.stringify(archive)).length>MAX_ARCHIVE_BYTES || archive?.format!=='RentManorRecovery'||archive.version!==2||!archive.complete) fail('Not a complete version-2 recovery archive');
 validateTables(archive.tables,archive.sourceAccount);
 if(!Array.isArray(archive.files)||archive.files.length>50000) fail('Invalid files');
 const paths=referencedPaths(archive.tables),seen=new Set(); let total=0;
 for(const file of archive.files) {signal?.throwIfAborted(); if(seen.has(file.path)||!paths.includes(file.path)||typeof file.base64!=='string'||file.base64.length>15*1024*1024) fail('Unexpected/duplicate/oversize file'); seen.add(file.path);const bytes=decode(file.base64);total+=bytes.length;if(total>70*1024*1024||bytes.length!==file.bytes||bytes.length>10*1024*1024||await sha256(bytes)!==file.sha256) fail('File size/checksum mismatch');assertFileSignature(bytes,file.type); }
 if(paths.length!==seen.size || archive.manifest.fileCount!==seen.size || TABLES.some(t=>archive.manifest.records[t]!==archive.tables[t].length)) fail('Incomplete manifest');
 if(await sha256(new TextEncoder().encode(JSON.stringify(archive.tables)))!==archive.manifest.recordsSha256) fail('Record checksum mismatch');
 return archive;
}
export async function exportRecovery(api,account,{signal,onProgress=()=>{}}={}) {
 signal?.throwIfAborted(); const snap=await api.snapshot(account); validateTables(snap.tables,account);
 const paths=referencedPaths(snap.tables),files=[];let bytesTotal=0;
 for(const path of paths) {signal?.throwIfAborted();onProgress(`Reading file ${files.length+1} of ${paths.length}`);const blob=await api.download(path);const bytes=new Uint8Array(await blob.arrayBuffer());bytesTotal+=bytes.length;if(bytesTotal>70*1024*1024) fail('Portfolio exceeds the 70 MiB recovery limit; operator export required');assertFileSignature(bytes,blob.type);files.push({path,type:blob.type,bytes:bytes.length,sha256:await sha256(bytes),base64:encode(bytes)});}
 const after=await api.snapshot(account); if(after.revision!==snap.revision) fail('Account changed during backup; retry for a consistent snapshot');
 const archive={format:'RentManorRecovery',version:2,complete:true,exportedAt:new Date().toISOString(),sourceAccount:account,revision:snap.revision,tables:snap.tables,files,manifest:{fileCount:files.length,records:Object.fromEntries(TABLES.map(t=>[t,snap.tables[t].length])),recordsSha256:await sha256(new TextEncoder().encode(JSON.stringify(snap.tables)))}};
 await validateArchive(archive,{signal});return archive;
}
export async function restoreRecovery(api,account,archive,recoveryPoint,{signal,onProgress=()=>{}}={}) {
 await validateArchive(archive,{signal});await validateArchive(recoveryPoint,{signal});if(recoveryPoint.sourceAccount!==account) fail('Recovery point belongs to another account');
 const stage=crypto.randomUUID(),tables=structuredClone(archive.tables),paths=new Map(),uploaded=[];
 // A target-scoped stage authorizes incoming IDs without creating live properties.
 await api.beginStage(account,stage,tables.properties.map(r=>r.id),recoveryPoint.revision);
 let committed=false;
 try {
  for(const file of archive.files) {signal?.throwIfAborted(); const pid=file.path.split('/')[2];const ext=file.type==='application/pdf'?'pdf':file.type.split('/')[1];const path=`${account}/properties/${pid}/recovery/${stage}/${crypto.randomUUID()}.${ext}`;paths.set(file.path,path);uploaded.push(path);onProgress(`Staging file ${uploaded.length} of ${archive.files.length}`);await api.upload(path,new Blob([decode(file.base64)],{type:file.type})); const check=await api.download(path);if(await sha256(await check.arrayBuffer())!==file.sha256) fail('Staged file verification failed'); }
  for(const tab of TABLES) for(const r of tables[tab]) {r.account_id=account;for(const key of ['storage_path','lease_storage_path','thumbnail_path']) if(r[key]) r[key]=paths.get(r[key])||fail('Missing staged file');}
  validateTables(tables,account);signal?.throwIfAborted();
  await api.commit(account,tables,recoveryPoint.revision);committed=true;
 } finally {
  if(!committed) { for(const path of uploaded) {try{await api.remove(path);}catch{/* Stage remains recoverable; never delete originals. */}} }
  await api.endStage(stage).catch(()=>{});
 }
 // Original objects stay online for operator rollback/verified cleanup.
 return {tables,retainedOriginalPaths:referencedPaths(recoveryPoint.tables)};
}
export async function legacyFingerprint(property) {
 const canonical=JSON.stringify(Object.fromEntries(Object.entries(property).filter(([k])=>!['id','createdAt','updatedAt','created_at','updated_at'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
 return sha256(new TextEncoder().encode(canonical));
}
