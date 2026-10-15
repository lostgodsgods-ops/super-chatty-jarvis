export const APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07111f"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg" type="image/svg+xml"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><title>Super Chatty · Voice</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#0d1b2d;--line:#24506c;--text:#eef7ff;--muted:#a8bfd4;--cyan:#35d8ff;--blue:#245bd5;--green:#50e3b2}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 50% 0%,#102b4c,transparent 45%),var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif;padding:16px}
main{max-width:560px;margin:0 auto;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0 22px}.brand{font-weight:800}.brand span{color:var(--cyan)}a{color:var(--cyan)}.panel{background:#0d1b2d;border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px}h1{font-size:1.45rem;margin:0 0 6px}.muted,small{color:var(--muted)}label{display:block;font-size:.9rem;color:var(--muted);margin:12px 0 6px}select,textarea,input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:#07111f;color:var(--text);font:inherit}textarea{min-height:86px;resize:vertical}button{border:1px solid var(--line);border-radius:12px;padding:12px;background:#10243b;color:var(--text);font:inherit;font-weight:700}button:disabled{opacity:.45}.micwrap{display:grid;place-items:center;padding:18px 0 8px}.mic{width:104px;height:104px;border-radius:50%;font-size:2.2rem;background:linear-gradient(145deg,#087eb7,#235bd5);box-shadow:0 0 36px #22caff38;border:2px solid #63dfff}.mic[aria-pressed="true"]{background:#a3334b;box-shadow:0 0 0 8px #a3334b22}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.mission-box{border:1px solid #24506c;border-radius:14px;padding:14px;margin:12px 0;background:#0a1727}.mission-box h3{margin-top:0}.mission-box textarea{min-height:90px}.mission-box li{margin:6px 0}.history-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.history-head h2{margin:0}.history-head button{font-size:.82rem;padding:8px 10px}#historyList{padding-left:24px;display:grid;gap:10px}#historyList li{overflow-wrap:anywhere;border-bottom:1px solid var(--line);padding:0 0 10px}#historyList strong{color:var(--cyan);display:block;font-size:.85rem}#historyList p{margin:4px 0 0;white-space:pre-wrap}.primary{background:linear-gradient(120deg,#087eb7,#235bd5)}#status{padding:12px;border:1px solid var(--line);border-radius:10px;color:var(--cyan);white-space:pre-wrap;overflow-wrap:anywhere}#reply{white-space:pre-wrap;min-height:36px}.tag{display:inline-block;padding:3px 8px;border-radius:99px;background:#102b3e;color:var(--green);font-size:.78rem}@media(min-width:480px){body{padding:24px}}
</style></head>
<body><main>
<header><div class="brand">✦ Super <span>Chatty Jarvis</span></div><a href="/owner">Owner security</a></header>
<section class="panel"><h1>Talk to Chatty</h1><p class="muted">Voice-first mobile interface · Hindi + English</p><span class="tag">Staging</span>
<label for="language">Voice language</label><select id="language"><option value="hi-IN">Hindi (India)</option><option value="en-IN">English (India)</option><option value="en-US">English (US)</option></select>
<label for="voiceProfile">Voice style (available voices depend on your phone)</label><select id="voiceProfile"><option value="standard">Standard</option><option value="male">Male-style</option><option value="female">Female-style</option><option value="child">Child-like (if installed)</option><option value="senior">Senior-style (if installed)</option></select>
<div class="micwrap"><button id="mic" class="mic" aria-label="Start voice input" aria-pressed="false">🎙️</button><small id="micHint">Tap the microphone and speak</small></div>
<label for="message">Your message</label><textarea id="message" placeholder="यहाँ बोलें या टाइप करें… / Speak or type here"></textarea>
<div class="actions"><button id="send" class="primary">Send to Chatty</button><button id="speak">Read text aloud</button></div>
</section>
<section class="panel"><h2>Chatty response</h2><div id="reply" aria-live="polite">Voice input and spoken output are available in supported browsers. AI response service is not connected in this staging build yet.</div><div id="status" role="status" aria-live="polite">Checking Owner session…</div></section>
<section class="panel" id="historyPanel" hidden><div class="history-head"><h2>Conversation history</h2><button id="clearHistory" type="button">Clear history</button></div><p class="muted"><small>Saved on this device only. Clearing browser/app data may remove this history.</small></p><ol id="historyList" aria-live="polite"></ol><p id="historyStatus" class="muted" role="status">Loading local history…</p></section>
<section class="panel" id="taskPanel" hidden><h2>Jarvis Mission Control</h2><p class="muted"><small>Super Chatty can plan and coordinate up to three specialized read-only agents. Each task needs your approval before execution. This staging release has no unrestricted internet access and cannot autonomously change external systems.</small></p><div class="mission-box"><h3>Bounded agent swarm</h3><label for="missionGoal">Mission goal</label><textarea id="missionGoal" placeholder="Describe the goal for Jarvis to plan…"></textarea><label for="missionContext">Context or code (optional)</label><textarea id="missionContext" placeholder="Paste relevant context or code for the agents…"></textarea><button id="createMission" class="primary" type="button">Plan mission · 3 specialist agents</button><p id="missionStatus" class="muted" role="status">Mission planning requires Owner approval for each generated task.</p><ul id="agentLibrary"><li>Loading specialist agents…</li></ul><ol id="missionList" aria-live="polite"></ol></div><h3>Owner task queue</h3><p class="muted"><small>Tasks are stored in D1. Workers AI can prepare research summaries and code reviews, but does not execute supplied code or change repositories.</small></p><label for="taskType">Task type</label><select id="taskType"><option value="read_only_research">Read-only research summary</option><option value="code_review">Read-only code review</option></select><label for="taskPrompt">Task details</label><textarea id="taskPrompt" placeholder="Write the question or paste code to review…"></textarea><div class="actions"><button id="createTask" class="primary" type="button">Create task</button><button id="refreshTasks" type="button">Refresh queue</button></div><div class="actions"><button id="runNextTask" type="button">Run next approved task</button></div><ol id="taskList" aria-live="polite"></ol><p id="taskStatus" class="muted" role="status">Loading task queue…</p><div id="taskResult" aria-live="polite"></div></section>
<p class="muted"><small>Microphone audio is handled by the browser's speech recognition service. This page does not store session tokens in browser storage. Never share setup tokens or passwords in chat.</small></p>
</main>
<script>
const $=id=>document.getElementById(id);
const sayStatus=text=>{$("status").textContent=text;};
let recognition=null, listening=false;
const HISTORY_DB_NAME="scj-chat-history-v1",HISTORY_STORE="messages",HISTORY_LIMIT=200;
let historyDbPromise=null;
function openHistoryDb(){
 if(!("indexedDB" in window))return Promise.reject(new Error("IndexedDB unavailable"));
 if(historyDbPromise)return historyDbPromise;
 historyDbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(HISTORY_DB_NAME,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(HISTORY_STORE)){const store=db.createObjectStore(HISTORY_STORE,{keyPath:"id"});store.createIndex("createdAt","createdAt");}};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error("Could not open local history"));
  request.onblocked=()=>reject(new Error("Local history database is blocked"));
 });
 return historyDbPromise;
}
async function readConversationHistory(){
 try{const db=await openHistoryDb();const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(HISTORY_STORE,"readonly"),request=tx.objectStore(HISTORY_STORE).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error||new Error("Could not read local history"));});return rows.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).slice(-HISTORY_LIMIT);}
 catch{return [];}
}
function renderConversationHistory(rows){
 const list=$("historyList");list.replaceChildren();
 for(const row of rows){
  const item=document.createElement("li"),heading=document.createElement("strong"),body=document.createElement("p");
  heading.textContent=(row.role==="user"?"You":"Chatty")+" · "+new Date(row.createdAt).toLocaleString();
  body.textContent=row.content;
  item.append(heading,body);list.append(item);
 }
 $("historyStatus").textContent=rows.length?("Saved locally · "+rows.length+" messages"):"No saved messages yet.";
}
async function restoreConversationHistory(){renderConversationHistory(await readConversationHistory());}
async function persistConversationMessage(role,content){
 if(!["user","assistant"].includes(role)||typeof content!=="string"||!content.trim())return;
 const row={id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2)),role,content:content.slice(0,8000),createdAt:new Date().toISOString()};
 try{
  const db=await openHistoryDb();
  await new Promise((resolve,reject)=>{const tx=db.transaction(HISTORY_STORE,"readwrite");tx.objectStore(HISTORY_STORE).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Could not save local history"));tx.onabort=()=>reject(tx.error||new Error("Local history save aborted"));});
  const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(HISTORY_STORE,"readonly"),request=tx.objectStore(HISTORY_STORE).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error||new Error("Could not count local history"));});
  rows.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  if(rows.length>HISTORY_LIMIT){const old=rows.slice(0,rows.length-HISTORY_LIMIT);await new Promise((resolve,reject)=>{const tx=db.transaction(HISTORY_STORE,"readwrite"),store=tx.objectStore(HISTORY_STORE);for(const entry of old)store.delete(entry.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Could not trim local history"));});}
 }catch{$("historyStatus").textContent="IndexedDB is unavailable; local chat history could not be saved on this device.";return;}
 await restoreConversationHistory();
}
async function clearConversationHistory(){
 try{const db=await openHistoryDb();await new Promise((resolve,reject)=>{const tx=db.transaction(HISTORY_STORE,"readwrite");tx.objectStore(HISTORY_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Could not clear local history"));});}catch{}
 await restoreConversationHistory();
}
$("clearHistory").addEventListener("click",()=>{void clearConversationHistory();});
async function loadAgentLibrary(){
 try{
  const response=await fetch("/agents",{cache:"no-store",credentials:"same-origin"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Agent catalog unavailable");
  const list=$("agentLibrary");list.replaceChildren();
  for(const agent of data.agents||[]){
   const item=document.createElement("li"),name=document.createElement("strong"),detail=document.createElement("span"),boundary=document.createElement("small");
   name.textContent=agent.name+" — ";detail.textContent=agent.capability+" ";boundary.textContent="Boundary: "+agent.boundary;
   item.append(name,detail,boundary);list.append(item);
  }
 }catch(error){$("agentLibrary").textContent=error.message||"Agent catalog unavailable.";}
}
async function refreshMissions(){
 try{
  const response=await fetch("/missions",{cache:"no-store",credentials:"same-origin"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Could not load missions");
  const list=$("missionList");list.replaceChildren();
  for(const mission of data.missions||[]){
   const item=document.createElement("li");
   const text=document.createElement("span");
   text.textContent="Mission "+mission.id+" · "+mission.status+" · "+mission.agentCount+" agents"+(mission.synthesized?" · synthesis saved":"");
   item.append(text);
   if(mission.status==="completed"){
    const synth=document.createElement("button");synth.type="button";synth.textContent=mission.synthesized?"View synthesis":"Synthesize results";
    synth.addEventListener("click",async()=>{
     synth.disabled=true;$("missionStatus").textContent="Combining the three specialist results…";
     try{
      const response=await fetch("/missions/"+encodeURIComponent(mission.id)+"/synthesize",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:"{}"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||"Mission synthesis failed");
      $("taskResult").textContent=result.result?.summary||"Mission synthesis saved.";
      $("missionStatus").textContent=result.reused?"Loaded saved mission synthesis.":"Combined result saved to D1.";
      await refreshMissions();
     }catch(error){$("missionStatus").textContent=error.message||"Mission synthesis failed.";}
     finally{synth.disabled=false;}
    });
    item.append(synth);
   }
   list.append(item);
  }
 }catch(error){$("missionStatus").textContent=error.message||"Mission history unavailable.";}
}
$("createMission").addEventListener("click",async()=>{
 const goal=$("missionGoal").value.trim();
 if(!goal){$("missionStatus").textContent="Enter a mission goal first.";return;}
 $("createMission").disabled=true;$("missionStatus").textContent="Preparing a three-role mission plan…";
 try{
  const response=await fetch("/missions",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({goal,context:$("missionContext").value.trim()})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Mission creation failed");
  $("missionGoal").value="";$("missionContext").value="";
  $("missionStatus").textContent="Mission created. Review and approve each of the three tasks below before running them.";
  await refreshTasks();await refreshMissions();
 }catch(error){$("missionStatus").textContent=error.message||"Mission creation failed.";}
 finally{$("createMission").disabled=false;}
});
async function refreshTasks(){
 $("taskStatus").textContent="Loading task queue…";
 try{
  const response=await fetch("/tasks",{cache:"no-store",credentials:"same-origin"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Could not load task queue");
  renderTaskList(Array.isArray(data.tasks)?data.tasks:[]);
 }catch(error){$("taskStatus").textContent=error.message||"Task queue unavailable.";}
}
function renderTaskList(tasks){
 const list=$("taskList");list.replaceChildren();
 for(const task of tasks){
  const item=document.createElement("li"),title=document.createElement("strong"),meta=document.createElement("p");
  title.textContent=(task.agentRole?task.agentRole+" · ":"")+task.taskType+" · "+task.status;
  meta.textContent="Task "+task.id+" · Updated "+(task.updatedAt||task.createdAt||"unknown");
  item.append(title,meta);
  if(task.status==="pending_approval"){
   const approve=document.createElement("button");approve.type="button";approve.textContent="Approve task";
   approve.addEventListener("click",async()=>{
    approve.disabled=true;
    try{
     const response=await fetch("/tasks/"+encodeURIComponent(task.id)+"/approve",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({approved:true})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.error||"Approval failed");
     $("taskStatus").textContent="Task approved and queued.";
     await refreshTasks();
    }catch(error){$("taskStatus").textContent=error.message||"Approval failed.";}
    finally{approve.disabled=false;}
   });
   item.append(approve);
  }
  if(task.status==="completed"){
   const view=document.createElement("button");view.type="button";view.textContent="View result";
   view.addEventListener("click",async()=>{
    try{
     const response=await fetch("/results?taskId="+encodeURIComponent(task.id),{cache:"no-store",credentials:"same-origin"});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.error||"Could not load result");
     const result=(data.results||[])[0]?.result;
     $("taskResult").textContent=result?.summary||JSON.stringify(result||{message:"No result saved."},null,2);
    }catch(error){$("taskStatus").textContent=error.message||"Could not load result.";}
   });
   item.append(view);
  }
  list.append(item);
 }
 $("taskStatus").textContent=tasks.length?("Tasks loaded · "+tasks.length+" recent tasks"):"No tasks yet. Create a task to begin.";
}
$("createTask").addEventListener("click",async()=>{
 const prompt=$("taskPrompt").value.trim();
 if(!prompt){$("taskStatus").textContent="Add task details first.";return;}
 $("createTask").disabled=true;
 try{
  const taskType=$("taskType").value;
  const payload=taskType==="code_review"?{material:prompt}:{question:prompt};
  const response=await fetch("/tasks",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({taskType,payload})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Task creation failed");
  $("taskPrompt").value="";
  $("taskStatus").textContent="Task created as pending approval. Review it and approve when ready.";
  await refreshTasks();
 }catch(error){$("taskStatus").textContent=error.message||"Task creation failed.";}
 finally{$("createTask").disabled=false;}
});
$("refreshTasks").addEventListener("click",()=>{void refreshTasks();});
$("runNextTask").addEventListener("click",async()=>{
 $("runNextTask").disabled=true;$("taskResult").textContent="Running one approved task…";
 try{
  const response=await fetch("/tasks/run-next",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:"{}"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Task execution failed");
  if(!data.taskId){$("taskResult").textContent=data.message||"No approved tasks are queued.";return;}
  $("taskResult").textContent=data.result?.summary||"Task completed; see results for details.";
  $("taskStatus").textContent="Task completed and saved to D1.";
  await refreshTasks();
 }catch(error){$("taskResult").textContent="";$("taskStatus").textContent=error.message||"Task execution failed.";}
 finally{$("runNextTask").disabled=false;}
});


async function checkSession(){try{const r=await fetch("/auth/status",{cache:"no-store",credentials:"same-origin"});if(!r.ok){location.replace("/owner");return false;}const data=await r.json();if(!data.authenticated){location.replace("/owner");return false;}$("historyPanel").hidden=false;$("taskPanel").hidden=false;await restoreConversationHistory();await loadAgentLibrary();await refreshTasks();await refreshMissions();sayStatus("Owner session verified.");return true;}catch(e){sayStatus("Session check failed. Reopen Owner security and sign in.");return false;}}
function makeRecognition(){const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){sayStatus("Voice input is not supported in this browser. Try a current Chrome browser or type your message.");return null;}const r=new C();r.lang=$("language").value;r.interimResults=true;r.continuous=false;r.onstart=()=>{listening=true;$("mic").setAttribute("aria-pressed","true");$("micHint").textContent="Listening… tap again to stop";sayStatus("Listening. Speak now.");};r.onresult=e=>{let text="";for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;$("message").value=text;};r.onerror=e=>sayStatus("Microphone status: "+e.error+". Check browser microphone permission.");r.onend=()=>{listening=false;$("mic").setAttribute("aria-pressed","false");$("micHint").textContent="Tap the microphone and speak";};return r;}
$("mic").addEventListener("click",()=>{if(listening&&recognition){recognition.stop();return;}recognition=makeRecognition();if(!recognition)return;recognition.lang=$("language").value;try{recognition.start();}catch(e){sayStatus("Could not start microphone. Check permission and try again.");}});
$("language").addEventListener("change",()=>{if(recognition&&!listening)recognition.lang=$("language").value;});
let voiceLoadReady=false;
function localVoiceFor(lang,profile){
 const voices=window.speechSynthesis?.getVoices?.()||[];
 const locale=lang.toLowerCase();
 const matching=voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith(locale.slice(0,2)));
 const hints={male:["male","man","david","mark","alex","ravi","hemant","madhur","aditya","daniel","aaron"],female:["female","woman","zira","samantha","karen","susan","veena","priya","heera"],child:["child","kid","junior"],senior:["senior","elder","grandpa","grandma"]};
 const hint=hints[profile]||[];
 return matching.find(v=>hint.some(word=>v.name.toLowerCase().includes(word)))||matching[0]||voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith(locale.slice(0,2)))||null;
}
function playWorkerTTS(text,lang){
 return fetch("/api/tts",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({text,language:lang,voiceProfile:$("voiceProfile").value})})
  .then(async r=>{if(!r.ok)throw new Error("Cloudflare TTS unavailable");const blob=await r.blob();if(!blob.size)throw new Error("Empty audio");return blob;})
  .then(blob=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob);const audio=new Audio(url);audio.onended=()=>{URL.revokeObjectURL(url);resolve();};audio.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Audio playback failed"));};audio.play().catch(e=>{URL.revokeObjectURL(url);reject(e);});}));
}
async function speakText(text){
 if(!text)return;
 const lang=$("language").value,profile=$("voiceProfile").value;
 if("speechSynthesis" in window&&"SpeechSynthesisUtterance" in window){
  try{
   window.speechSynthesis.cancel();
   const voices=window.speechSynthesis.getVoices();
   if(!voices.length&&"onvoiceschanged" in window.speechSynthesis)await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;resolve();};window.speechSynthesis.onvoiceschanged=finish;setTimeout(finish,700);});
   const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;
   const chosen=localVoiceFor(lang,profile);if(chosen)utterance.voice=chosen;
   utterance.onstart=()=>sayStatus("Speaking with your phone's voice engine…");
   utterance.onend=()=>sayStatus("Speech finished.");
   utterance.onerror=async()=>{sayStatus("Device speech failed; trying server-side AI speech…");try{await playWorkerTTS(text,lang);sayStatus("Cloudflare AI speech finished.");}catch(e){sayStatus("Speech unavailable. Check device voices and staging AI TTS configuration.");}};
   window.speechSynthesis.speak(utterance);
   sayStatus(chosen?"Reading aloud with selected voice preference.":"Reading aloud with the best available device voice.");
   return;
  }catch(e){sayStatus("Device speech failed; trying server-side AI speech…");}
 }
 try{await playWorkerTTS(text,lang);sayStatus("Cloudflare AI speech finished.");}
 catch(e){sayStatus("Speech unavailable. Check device voices and staging AI TTS configuration.");}
}
if("speechSynthesis" in window)window.speechSynthesis.onvoiceschanged=()=>{voiceLoadReady=true;};
$("speak").addEventListener("click",()=>{const replyText=$("reply").textContent.trim();const text=replyText&&!replyText.startsWith("Voice input and spoken output are available")?replyText:$("message").value.trim();if(!text){sayStatus("There is no text to read aloud yet.");return;}void speakText(text);});
if("serviceWorker" in navigator){navigator.serviceWorker.register("/service-worker.js").catch(()=>sayStatus("PWA offline shell could not be registered; online use remains available."));}
$("send").addEventListener("click",async()=>{
 const message=$("message").value.trim();
 if(!message){sayStatus("Speak or type a message first.");return;}
 $("send").disabled=true;
 try{
  if(!$("historyPanel").hidden)await persistConversationMessage("user",message);
  const r=await fetch("/api/chat",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({message,language:$("language").value})});
  const data=await r.json().catch(()=>({error:"Invalid server response"}));
  if(r.status===503){$("reply").textContent="Chat backend is not configured in staging yet or is temporarily unavailable.";sayStatus(data.error||"AI provider unavailable.");return;}
  if(!r.ok){sayStatus(data.error||"Chat request failed.");return;}
  $("reply").textContent=data.reply||"No response returned.";sayStatus(data.core?.intent==="create_mission"?"Mission created · review the tasks and approve each one in Mission Control.":"Response received.");
  if(data.core?.intent==="create_mission"){await refreshTasks();await refreshMissions();}
  if(data.reply){if(!$("historyPanel").hidden)await persistConversationMessage("assistant",data.reply);void speakText(data.reply);}
 }catch(e){sayStatus("Chat request failed. Check connection and try again.");}
 finally{$("send").disabled=false;}
});
checkSession();
</script></body></html>`;
