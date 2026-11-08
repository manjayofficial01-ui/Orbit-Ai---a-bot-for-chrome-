chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
// Routines. An alarm can only mark one due: Chrome stops this worker the moment it is idle,
// and a scheduled prompt that ran here would run with no transcript, no approvals and no
// person watching. So the alarm raises a flag and a badge, and the next Orbit surface that
// opens turns it into a real, visible run. Nothing is pretended to have happened.
chrome.alarms?.onAlarm.addListener(alarm=>{
  if(!String(alarm?.name||'').startsWith('orbit-routine:'))return;
  chrome.storage.local.set({orbitRoutineDue:Date.now()}).catch(console.error);
  try{
    chrome.action.setBadgeBackgroundColor({color:'#e0a35c'});
    chrome.action.setBadgeText({text:'1'});
  }catch{}
});
chrome.runtime.onInstalled.addListener(()=>{chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'ask-orbit',title:'Ask Orbit about selection',contexts:['selection']}));});
chrome.contextMenus.onClicked.addListener((info,tab)=>{if(info.menuItemId!=='ask-orbit')return;const text=String(info.selectionText||'').slice(0,24000);if(!text)return;chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);chrome.storage.session.set({selectionDraft:{text,url:info.pageUrl||'',title:'Selected text',id:crypto.randomUUID()}}).catch(console.error);});
