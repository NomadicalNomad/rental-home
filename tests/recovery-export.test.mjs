import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {exportRecovery,restoreRecovery,validateArchive,legacyFingerprint,TABLES} from '../app/recovery.js';
import {validateMoney,validateDate,validateProperty,assertFileSignature} from '../app/validation.js';
import {toPropertyRow} from '../app/property-row.js';import {expensesToCsv,expensesToPdf} from '../app/export.js';import {PDFDocument} from 'pdf-lib';
const aid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',eid='cccccccc-cccc-4ccc-8ccc-cccccccccccc',tid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const id=()=>crypto.randomUUID();const path=name=>`${aid}/properties/${pid}/${name}`;
function fixture(){
 const tables=Object.fromEntries(TABLES.map(t=>[t,[]]));
 tables.properties=[{id:pid,account_id:aid,address:'Synthetic home',city:'Test',state:'CA',zip:'90000',status:'occupied',rent:'0',notes:'',beds:0,thumbnail_path:path('photos/a.png')}];
 tables.expenses=[{id:eid,account_id:aid,property_id:pid,spent_on:'2026-10-01',amount:0,category:'Other',notes:'Expense notes'}];
 tables.receipts=[{id:id(),account_id:aid,expense_id:eid,storage_path:path(`expenses/${eid}/receipt.pdf`)}];
 tables.property_photos=[{id:id(),account_id:aid,property_id:pid,storage_path:path('photos/a.png'),is_primary:true,sort_order:0}];
 tables.property_appliances=[{id:id(),account_id:aid,property_id:pid,name:'Fridge',fuel:'electric',notes:'Appliance notes'}];
 tables.tenants=[{id:tid,account_id:aid,property_id:pid,name:'Synthetic tenant',notes:'Tenant notes',lease_storage_path:path('tenant/lease.pdf')}];
 tables.tenant_files=[{id:id(),account_id:aid,property_id:pid,tenant_id:tid,storage_path:path('tenant/files/copy.pdf'),kind:'correspondence'}];
 const files=new Map([[path('photos/a.png'),new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=','base64')],{type:'image/png'})]]);
 for(const p of [tables.receipts[0].storage_path,tables.tenants[0].lease_storage_path,tables.tenant_files[0].storage_path])files.set(p,new Blob([fs.readFileSync('app/sample-media/00000000-0000-4000-8000-000000000032.pdf')],{type:'application/pdf'}));
 return {tables,files};
}
test('money/date/facts boundary validation preserves zero and rejects blank/precision/invalid dates',()=>{
 assert.equal(validateMoney('0'),0);for(const v of ['',null,'-1','0.001','NaN','1e2','10000000000'])assert.throws(()=>validateMoney(v));
 assert.equal(validateDate('2024-02-29'),'2024-02-29');assert.throws(()=>validateDate('2026-02-29'));
 const p={address:'A',city:'Test',state:'CA',zip:'90000',rent:'0',beds:0,baths:0,sqft:0,yearBuilt:1800};assert.equal(validateProperty(p),p);assert.throws(()=>validateProperty({...p,beds:-1}));assert.throws(()=>validateProperty({...p,sqft:1.2}));
 assert.throws(()=>assertFileSignature(new TextEncoder().encode('not a PDF'),'application/pdf'));
});
test('deliberate clears differ from absence and preserve numeric zero',()=>{const row=toPropertyRow({id:pid,address:'a',beds:'',baths:0,description:'',utilityNotes:'',thumbnailPath:'',rent:0},aid);assert.equal(row.beds,null);assert.equal(row.baths,0);assert.equal(row.description,'');assert.equal(row.utility_notes,'');assert.equal(row.thumbnail_path,null);assert.equal(row.rent,0);assert.equal('sqft' in row,false);});
test('complete records/files recovery roundtrip, checksum and compensation failure points',async t=>{
 const f=fixture();let snapshot={tables:f.tables,revision:'r1'},commits=0;let failAt='';
 const api={snapshot:async()=>structuredClone(snapshot),download:async p=>{if(failAt==='download')throw new Error('download failed');const file=f.files.get(p);if(!file)throw new Error('Missing file');return file;},upload:async(p,file)=>{if(failAt==='upload')throw new Error('upload failed');f.files.set(p,file);},remove:async p=>f.files.delete(p),beginStage:async()=>{},endStage:async()=>{},commit:async(a,t,r)=>{if(failAt==='commit')throw new Error('commit failed');assert.equal(r,snapshot.revision);snapshot={tables:structuredClone(t),revision:'r2'};commits++;}};
 const archive=await exportRecovery(api,aid);assert.equal(archive.files.length,4);await validateArchive(archive);
 await t.test('incomplete/corrupt archive rejected before mutation',async()=>{const bad=structuredClone(archive);bad.files.pop();await assert.rejects(validateArchive(bad),/manifest/);const corrupt=structuredClone(archive);corrupt.files[0].sha256='x';await assert.rejects(validateArchive(corrupt),/checksum/);const traversal=structuredClone(archive);traversal.tables.property_photos[0].storage_path=path('../other');await assert.rejects(validateArchive(traversal),/primary|storage/);});
 await t.test('upload/metadata failure retains originals and compensates staged files',async()=>{for(const phase of ['upload','commit']){failAt=phase;const originals=new Set(f.files.keys());await assert.rejects(restoreRecovery(api,aid,archive,archive),/failed/);assert.deepEqual(new Set(f.files.keys()),originals);assert.equal(commits,0);}failAt='';});
 await t.test('cancellation and export failure do not commit',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(exportRecovery(api,aid,{signal:controller.signal}),/abort/i);failAt='download';await assert.rejects(exportRecovery(api,aid),/download/);failAt='';});
 await t.test('every child and binary readable after complete replacement',async()=>{const before=structuredClone(archive);await restoreRecovery(api,aid,archive,archive);const after=await exportRecovery(api,aid);for(const tab of TABLES)assert.equal(after.tables[tab].length,before.tables[tab].length);assert.equal(after.tables.tenants[0].notes,'Tenant notes');assert.equal(after.tables.property_appliances[0].notes,'Appliance notes');assert.deepEqual(after.files.map(f=>f.sha256).sort(),before.files.map(f=>f.sha256).sort());assert.equal(after.tables.properties[0].thumbnail_path,after.tables.property_photos[0].storage_path);});
});
test('stable legacy provenance ignores generated timestamps/IDs but preserves distinct content',async()=>{const p={address:'A',notes:'one',id:id(),updatedAt:'today'};assert.equal(await legacyFingerprint(p),await legacyFingerprint({...p,id:id(),updatedAt:'tomorrow'}));assert.notEqual(await legacyFingerprint(p),await legacyFingerprint({...p,notes:'two'}));});
test('CSV neutralizes formula/control/whitespace prefixes and retains numeric amount and Unicode',()=>{
 const csv=expensesToCsv([{spentOn:'2026-10-01',amount:0,category:'\t =SUM(1,2)',notes:'José, "quoted"\nnext'},{spentOn:'2026-10-02',amount:1.25,category:'Other',notes:'\r\n@evil'}]);assert.match(csv,/0\.00/);assert.match(csv,/José/);assert.match(csv,/"'\t =SUM/);assert.match(csv,/"'\r\n@evil/);assert.match(csv,/""quoted""/);
});
test('Unicode PDF, long words/notes, multiple pages and empty report use embedded font',async()=>{
 const fontBytes=fs.readFileSync(new URL('../app/fonts/NotoSans-Regular.ttf',import.meta.url));
 const list=Array.from({length:45},(_,i)=>({spentOn:'2026-10-01',amount:1.25,category:'Repairs',notes:`José Ελληνικά Кириллица line ${i}\n`+'unbroken'.repeat(40)+'\n'+'A long paragraph. '.repeat(12)}));
 const bytes=await expensesToPdf({address:'José Manor – Αθήνα',list,fontBytes});const parsed=await PDFDocument.load(bytes);assert.ok(parsed.getPageCount()>3);
 fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/synthetic-expenses.pdf',bytes);assert.equal((await PDFDocument.load(await expensesToPdf({address:'Empty',list:[],fontBytes}))).getPageCount(),1);
 await assert.rejects(expensesToPdf({address:'Unsupported 🏠',list:[],fontBytes}),/unsupported/);
});
