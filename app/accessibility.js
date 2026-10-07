// Keep modal keyboard focus with the active dialog and restore the opener.
export function bindAccessibility() {
  let active=null,opener=null;
  const visible=el=>el.getClientRects().length>0;
  const controls=el=>[...el.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(visible);
  const observer=new MutationObserver(()=>{
    const dialog=[...document.querySelectorAll('[role="dialog"]')].filter(visible).at(-1);
    if(dialog===active)return;
    if(dialog){if(!active)opener=document.activeElement;active=dialog;queueMicrotask(()=>controls(dialog)[0]?.focus());}
    else{active=null;if(opener?.isConnected)opener.focus();opener=null;}
  });
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden'],childList:true});
  document.addEventListener('keydown',event=>{
    if(event.key==='Tab'&&active){const items=controls(active);if(!items.length){event.preventDefault();return;}const first=items[0],last=items.at(-1);if(event.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){event.preventDefault();first.focus();}}
    const tab=event.target.closest?.('[role="tab"]');
    if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')];const i=tabs.indexOf(tab);const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(i+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length];next.click();queueMicrotask(()=>document.getElementById(next.id)?.focus());}
  });
}
