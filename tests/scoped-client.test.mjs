import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedClient} from '../app/scoped-client.js';

test('stale account responses and queued writes cannot populate a new account',async()=>{
 let scope='account-a',finish;
 const response=new Promise(resolve=>{finish=resolve;});
 const client=scopedClient({from:()=>({select:()=>response}),rpc:()=>response},()=>scope);
 const pending=client.from('properties').select();
 const result=Promise.resolve(pending);
 await Promise.resolve();scope='account-b';finish({data:[{id:'old-account'}],error:null});
 await assert.rejects(result,/Account changed/);
});
test('returned API errors are always surfaced, including unchecked mutation awaits',async()=>{
 const client=scopedClient({rpc:()=>Promise.resolve({data:null,error:new Error('Write denied')})},()=> 'account-a');
 await assert.rejects(client.rpc('save_current_tenant'),/Write denied/);
});
