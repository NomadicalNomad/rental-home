// Late responses cannot repopulate a newly selected account. Server RLS remains
// the security boundary; this is a UI consistency guard, not authorization.
export function scopedClient(client,scope) {
 const wrap=(target,origin)=>new Proxy(target,{get(obj,key){
  if(key==='then')return(resolve,reject)=>Promise.resolve(obj).then(value=>{if(scope()!==origin)throw new Error('Account changed; reload the current account.');if(value?.error)throw value.error;return value;}).then(resolve,reject);
  const val=obj[key];if(typeof val!=='function')return val;
  return(...args)=>{if(scope()!==origin)throw new Error('Account changed; reload the current account.');const result=val.apply(obj,args);return result && typeof result.then==='function'?wrap(result,origin):result;};
 }});
 return new Proxy(client,{get(obj,key){
  if(key==='from')return(...args)=>wrap(obj.from(...args),scope());
  if(key==='rpc')return(...args)=>wrap(obj.rpc(...args),scope());
  return obj[key];
 }});
}
