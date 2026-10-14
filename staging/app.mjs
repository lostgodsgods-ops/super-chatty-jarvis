export const APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07111f"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg" type="image/svg+xml"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><title>Super Chatty · Voice</title>
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#0d1b2d;--line:#24506c;--text:#eef7ff;--muted:#a8bfd4;--cyan:#35d8ff;--blue:#245bd5;--green:#50e3b2}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 50% 0%,#102b4c,transparent 45%),var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif;padding:16px}
main{max-width:560px;margin:0 auto;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:10px 0 22px}.brand{font-weight:800}.brand span{color:var(--cyan)}a{color:var(--cyan)}.panel{background:#0d1b2d;border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px}h1{font-size:1.45rem;margin:0 0 6px}.muted,small{color:var(--muted)}label{display:block;font-size:.9rem;color:var(--muted);margin:12px 0 6px}select,textarea,input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:#07111f;color:var(--text);font:inherit}textarea{min-height:86px;resize:vertical}button{border:1px solid var(--line);border-radius:12px;padding:12px;background:#10243b;color:var(--text);font:inherit;font-weight:700}button:disabled{opacity:.45}.micwrap{display:grid;place-items:center;padding:18px 0 8px}.mic{width:104px;height:104px;border-radius:50%;font-size:2.2rem;background:linear-gradient(145deg,#087eb7,#235bd5);box-shadow:0 0 36px #22caff38;border:2px solid #63dfff}.mic[aria-pressed="true"]{background:#a3334b;box-shadow:0 0 0 8px #a3334b22}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.primary{background:linear-gradient(120deg,#087eb7,#235bd5)}#status{padding:12px;border:1px solid var(--line);border-radius:10px;color:var(--cyan);white-space:pre-wrap;overflow-wrap:anywhere}#reply{white-space:pre-wrap;min-height:36px}.tag{display:inline-block;padding:3px 8px;border-radius:99px;background:#102b3e;color:var(--green);font-size:.78rem}@media(min-width:480px){body{padding:24px}}
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
<p class="muted"><small>Microphone audio is handled by the browser's speech recognition service. This page does not store session tokens in localStorage. Never share setup tokens or passwords in chat.</small></p>
</main>
<script>
const $=id=>document.getElementById(id);
const sayStatus=text=>{$("status").textContent=text;};
let recognition=null, listening=false;
async function checkSession(){try{const r=await fetch("/auth/status",{cache:"no-store",credentials:"same-origin"});if(!r.ok){location.replace("/owner");return false;}const data=await r.json();if(!data.authenticated){location.replace("/owner");return false;}sayStatus("Owner session verified.");return true;}catch(e){sayStatus("Session check failed. Reopen Owner security and sign in.");return false;}}
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
  const r=await fetch("/api/chat",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({message,language:$("language").value})});
  const data=await r.json().catch(()=>({error:"Invalid server response"}));
  if(r.status===503){$("reply").textContent="Chat provider is not configured or available in staging.";sayStatus(data.error||"AI provider unavailable.");return;}
  if(!r.ok){sayStatus(data.error||"Chat request failed.");return;}
  $("reply").textContent=data.reply||"No response returned.";sayStatus("Response received.");
  if(data.reply)void speakText(data.reply);
 }catch(e){sayStatus("Chat request failed. Check connection and try again.");}
 finally{$("send").disabled=false;}
});
checkSession();
</script></body></html>`;
