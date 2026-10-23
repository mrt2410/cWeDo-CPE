/* ================= Stage 11: sound ================= */
let audioCtx=null, micOn=false, micStream=null, micAnalyser=null, micTimer=null, micLevel=0;
const SB=WEDO_DATA.soundbank;
const SOUND_NAMES=SB.names, SOUND_DATA=SB.clips;   /* base64 Opus, decoded on first use */
const SOUND_BANK={};        /* index -> decoded AudioBuffer */
const soundName=i => SOUND_NAMES[i-1]||('sound '+i);
async function loadSound(i){
  if(SOUND_BANK[i]) return SOUND_BANK[i];
  const b64=SOUND_DATA[String(i)];
  if(!b64) return null;
  const raw=atob(b64), bytes=new Uint8Array(raw.length);
  for(let k=0;k<raw.length;k++) bytes[k]=raw.charCodeAt(k);
  try{ SOUND_BANK[i]=await ac().decodeAudioData(bytes.buffer); }
  catch(e){ log('could not decode sound '+i+': '+e.message); return null; }
  return SOUND_BANK[i];
}
let customSound=null;       /* your own recording, played as sound 0 */
let mediaRec=null, recChunks=[], recState='idle';

/* the recording persists separately from the program: it's a device-local
   asset, not something you'd want bundled into a shared .wedo.json file */
const SOUND_KEY='wedo:customSound';
function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(r.result.slice(r.result.indexOf(',')+1));
    r.onerror=()=>reject(r.error||new Error('could not read blob'));
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64,mime){
  const raw=atob(b64),bytes=new Uint8Array(raw.length);
  for(let k=0;k<raw.length;k++) bytes[k]=raw.charCodeAt(k);
  return new Blob([bytes],{type:mime});
}
async function persistCustomSound(blob){
  try{
    const data=await blobToBase64(blob);
    localStorage.setItem(SOUND_KEY,JSON.stringify({mime:blob.type||'audio/webm',data}));
  }catch(e){ /* storage full/unavailable — recording still works this session */ }
}
async function restoreCustomSound(){
  try{
    const raw=localStorage.getItem(SOUND_KEY);
    if(!raw) return;
    const {mime,data}=JSON.parse(raw);
    const blob=base64ToBlob(data,mime);
    customSound=await ac().decodeAudioData(await blob.arrayBuffer());
  }catch(e){ /* no Web Audio support, corrupt data, etc. — sound 0 just stays empty */ }
}

function ac(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
let currentSource=null;
function playBuffer(buf){
  const c=ac(), src=c.createBufferSource();
  src.buffer=buf; src.connect(c.destination); src.start();
  currentSource=src;
  return buf.duration;
}
function stopSound(){
  if(currentSource){ try{ currentSource.stop(); }catch(e){} currentSource=null; }
}
/* stand-in until the real LEGO samples are dropped in: a distinct note per number */
const PLACEHOLDER_SECS=0.4;
function playPlaceholder(i){
  const c=ac(), t=c.currentTime;
  const o=c.createOscillator(), g=c.createGain();
  o.type=['sine','triangle','square','sawtooth'][i%4];
  o.frequency.setValueAtTime(196*Math.pow(2,((i-1)%12)/12),t);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.22,t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.38);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t+PLACEHOLDER_SECS);
  return PLACEHOLDER_SECS;
}
/* returns how long the sound runs for, so the caller can wait it out */
async function playSound(n){
  const i=Math.max(0,Math.round(n));
  if(i===0){
    if(!customSound){ log('sound 0: nothing recorded yet'); return 0; }
    log('playing your recording'); return playBuffer(customSound);
  }
  const buf=await loadSound(i);
  if(buf){ log('playing sound '+i+' — '+soundName(i)); return playBuffer(buf); }
  log('sound '+i+' ('+soundName(i)+') not loaded — placeholder tone');
  return playPlaceholder(i);
}

/* ---- microphone: needed for the sound sensor and for recording ---- */
async function ensureMic(){
  if(micOn) return true;
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:true});
    const c=ac(), src=c.createMediaStreamSource(micStream);
    micAnalyser=c.createAnalyser(); micAnalyser.fftSize=1024;
    src.connect(micAnalyser);
    const buf=new Float32Array(micAnalyser.fftSize);
    let prev=null;
    micTimer=setInterval(()=>{
      micAnalyser.getFloatTimeDomainData(buf);
      let sum=0; for(let i=0;i<buf.length;i++) sum+=buf[i]*buf[i];
      micLevel=Math.sqrt(sum/buf.length);
      if(prev!=null&&Math.abs(micLevel-prev)>SOUND_EPS) bump('SoundSensorInput');
      prev=micLevel;
    },60);
    micOn=true; log('microphone on');
    return true;
  }catch(e){ log('microphone unavailable: '+e.message); return false; }
}
const SOUND_EPS=0.035;   /* how big a jump in loudness counts as a change */

/* The microphone is held only while something needs it: a recording in
   progress, or a running program using Sound Sensor Change. */
let micForSensor=false;
function releaseMic(){
  if(micTimer){ clearInterval(micTimer); micTimer=null; }
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
  micAnalyser=null; micOn=false; micLevel=0;
  log('microphone released');
  renderPorts();
}
function maybeReleaseMic(){
  if(micOn && !micForSensor && recState==='idle') releaseMic();
}

/* The microphone follows what is on the canvas: as soon as a Sound Sensor
   Change block is placed it is requested, and once the last one is gone it is
   released. Asking at build time beats asking halfway through a running program. */
let micDenied=false;
function hasSoundSensor(){
  let found=false;
  const scan=items=>{
    for(let i=0;i<items.length&&!found;i++){
      const it=items[i];
      if(it.t==='i'&&it.key==='SoundSensorInput') found=true;
      else if(it.input==='SoundSensorInput') found=true;
      else if(it.children) scan(it.children);
    }
  };
  for(let i=0;i<stacks.length&&!found;i++) scan(stacks[i].items);
  /* a block being dragged has left the canvas model but is still in the user's
     hand — without this, detaching one briefly looks like it was deleted */
  if(!found&&drag&&drag.payload){
    if(drag.payload.kind==='input') found=drag.payload.key==='SoundSensorInput';
    else if(drag.payload.items) scan(drag.payload.items);
  }
  return found;
}
async function syncSensorMic(){
  if(hasSoundSensor()){
    micForSensor=true;
    if(!micOn&&!micDenied&&!await ensureMic()) micDenied=true;
  }else{
    micForSensor=false;
    maybeReleaseMic();
  }
}


async function startRecording(){
  micDenied=false;
  if(!await ensureMic()) return;
  recChunks=[];
  mediaRec=new MediaRecorder(micStream);
  mediaRec.ondataavailable=e=>{ if(e.data.size) recChunks.push(e.data); };
  mediaRec.onstop=async ()=>{
    try{
      const blob=new Blob(recChunks,{type:mediaRec.mimeType||'audio/webm'});
      customSound=await ac().decodeAudioData(await blob.arrayBuffer());
      persistCustomSound(blob);
      log('recorded '+customSound.duration.toFixed(1)+'s as sound 0');
    }catch(e){ log('could not decode the recording: '+e.message); }
    recState='idle'; paintSoundDialog();
    maybeReleaseMic();
  };
  mediaRec.start(); recState='recording'; paintSoundDialog();
  setTimeout(()=>{ if(recState==='recording') stopRecording(); },10000);   /* safety cap */
}
function stopRecording(){
  if(mediaRec&&recState==='recording'){ recState='saving'; mediaRec.stop(); paintSoundDialog(); }
}
