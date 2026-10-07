import {validateProperty} from './validation.js';
import {toPropertyRow} from './property-row.js';
import {getAccount,getSupabase} from './auth.js';
import {exportRecovery,restoreRecovery,validateArchive,legacyFingerprint,MAX_ARCHIVE_BYTES} from './recovery.js';
let controller=null;
export function recoveryBusy(){return controller!==null;}
export function cancelRecovery(){controller?.abort();}
async function rpc(name,args){const {data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data;}
const api={
 snapshot:account=>rpc('account_snapshot',{target_account:account}),
 download:async path=>{const {data,error}=await getSupabase().storage.from('account-media').download(path);if(error)throw error;return data;},
 upload:async(path,file)=>{const {error}=await getSupabase().storage.from('account-media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;},
 remove:async path=>{const {error}=await getSupabase().storage.from('account-media').remove([path]);if(error)throw error;},
 beginStage:(account,stage,ids,revision)=>rpc('begin_recovery_stage',{target_account:account,stage_id:stage,property_ids:ids,expected_revision:revision}),
 endStage:stage=>rpc('end_recovery_stage',{stage_id:stage}),
 commit:(account,tables,revision)=>rpc('restore_complete_account',{target_account:account,payload:tables,expected_revision:revision})
};
function save(archive,label){const blob=new Blob([JSON.stringify(archive)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`rentmanor-${label}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function run(task,status){if(controller)throw new Error('A recovery operation is already running.');controller=new AbortController();const cancel=document.querySelector('#cancelRecovery');if(cancel)cancel.hidden=false;try{return await task({signal:controller.signal,onProgress:status});}finally{controller=null;if(cancel)cancel.hidden=true;}}
export async function downloadCompleteBackup(status){const account=getAccount().id;return run(async opts=>{const archive=await exportRecovery(api,account,opts);if(getAccount()?.id!==account)throw new Error('Account changed');save(archive,'complete-backup');status('Complete backup verified and downloaded. Keep this sensitive file private.');},status);}
export async function restoreFromFile(file,status){
 if(file.size>MAX_ARCHIVE_BYTES)throw new Error('Recovery file exceeds 100 MiB.');const account=getAccount().id;
 const parsed=JSON.parse(await file.text());
 return run(async opts=>{
  if(parsed.format!=='RentManorRecovery') {
   const incoming=Array.isArray(parsed)?parsed:parsed.properties;if(!Array.isArray(incoming)||incoming.length>5000)throw new Error('Invalid limited property import');
   // Explicit conflict preview: existing IDs never overwrite implicitly.
   const current=await api.snapshot(account);const rows=[];
   for(const p of incoming) {
    const normalized={...p,tenantName:p.tenantName??p.tenant_name,yearBuilt:p.yearBuilt??p.year_built,propertyType:p.propertyType??p.property_type,utilityElectric:p.utilityElectric??p.utility_electric,utilityGas:p.utilityGas??p.utility_gas,utilityWater:p.utilityWater??p.utility_water,utilityNotes:p.utilityNotes??p.utility_notes,trashSchedule:p.trashSchedule??p.trash_schedule,trashNotes:p.trashNotes??p.trash_notes};validateProperty(normalized);const fingerprint=await legacyFingerprint(p);if(current.tables.properties.some(r=>r.import_fingerprint===fingerprint))continue;
    if(p.id && current.tables.properties.some(r=>r.id===p.id))throw new Error('Import conflicts with an existing property ID. Export a complete recovery archive or resolve the conflict explicitly.');
    rows.push({...toPropertyRow(normalized,account),id:crypto.randomUUID(),import_fingerprint:fingerprint,thumbnail_path:null});
   }
   if(!window.confirm(`Import ${rows.length} new property records? This limited import preserves existing records and children; it does not restore attachments.`))return;
   await rpc('replace_account_properties',{target_account:account,payload:rows});status(`${rows.length} limited property records imported. Existing data preserved.`);return;
  }
  await validateArchive(parsed,opts);const total=parsed.tables.properties.length;
  if(!window.confirm(`Complete replacement preview: ${total} homes, ${parsed.tables.expenses.length} expenses, ${parsed.files.length} files. Current account records will be replaced. First download a verified recovery point.`))return;
  const recoveryPoint=await exportRecovery(api,account,opts);save(recoveryPoint,'before-restore-recovery-point');
  if(window.prompt('Keep the recovery-point download. Type REPLACE to replace this account. Other accounts are unaffected.')!=='REPLACE')return;
  await restoreRecovery(api,account,parsed,recoveryPoint,opts);status('Complete restore committed. Original media retained for operator rollback; keep the recovery point.');
 },status);
}
