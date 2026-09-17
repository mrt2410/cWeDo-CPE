/* ================= shared block data & classification ================= */
const B=WEDO_DATA.bundle;
const S=B.sprites, ORDER=B.order;

const STARTS=new Set(['StartBlock','StartOnKeyPressBlock','StartOnMessageBlock','StartOnButtonPressBlock']);
const SOCKETED=new Set(['StartOnMessageBlock','SendMessageBlock','WaitForBlock','MotorPowerBlock',
  'MotorOnForBlock','LightBlock','PlaySoundBlock','DisplayBackgroundBlock','DisplayBlock',
  'AddtoDisplayBlock','SubtractfromDisplayBlock','MultiplybyDisplayBlock','DividebyDisplayBlock']);
const INPUTS=new Set(['AnyDistanceChange','DistanceChangeCloser','DistanceChangeFurther','DistanceSensorInput',
  'AnyTilt','TiltUp','TiltDown','TiltThisWay','TiltThatWay','TiltSensorInput',
  'SoundSensorInput','NumberInput','TextInput','DisplayInput','RandomInput']);

/* Which inputs a socket will take. Without this a tilt sensor could be dropped
   into Motor Power, where it has no numeric meaning and silently fell back to
   full power. */
const NUM_INPUTS=['NumberInput','RandomInput','DisplayInput','DistanceSensorInput'];
const isCondition=k => STATE_KEYS.indexOf(k)>=0||EDGE_KEYS.indexOf(k)>=0;
const isNumeric  =k => NUM_INPUTS.indexOf(k)>=0;
function canAccept(parentKey,inputKey){
  if(parentKey==='RepeatBlock'||parentKey==='WaitForBlock')      /* a time or a condition */
    return isNumeric(inputKey)||isCondition(inputKey);
  if(parentKey==='StartOnMessageBlock'||parentKey==='SendMessageBlock'
     ||parentKey==='DisplayBlock')                               /* text or a number */
    return isNumeric(inputKey)||inputKey==='TextInput';
  return isNumeric(inputKey);                                    /* everything else: numbers */
}

/* ---- tray tab colours, and a way for a device file to add a block that has
   no baked sprite (every new hub capability below this point falls in that
   bucket — the real commercial app never exposed them, so there's no art) ---- */
const TAB_COLOUR={'Flow':'#c69500','Motor':'#2f8a33','Output':'#c02a2e',
                  'Sensor Input':'#d4740c','Other Input':'#2379a8'};

/* Registers a synthetic "sprite" entry so the existing rendering code
   (blockEl/buildSeq/archEl/drawTray) can treat a CSS-drawn block exactly like
   a real one — same w/h math, same socket/exec handling — just with a solid
   colour + text label instead of an <img>. See blockEl() in app.js. */
function registerCustomBlock(key,{label,group,w,h}={}){
  w=w||S.MotorOffBlock.w; h=h||S.MotorOffBlock.h;
  S[key]={w,h,cw:w,ch:h,x0:0,y0:0,custom:true,label:label||key,colour:TAB_COLOUR[group]||'#5b6b7a'};
  const entry=ORDER.find(([g])=>g===group);
  if(entry) entry[1].push([key,label||key]);
  else ORDER.push([group,[[key,label||key]]]);
}

/* blocks that arrive from the tray with an input already seated */
const N=v=>({key:'NumberInput',value:v}), T=v=>({key:'TextInput',value:v});
const DEFAULT_INPUT={
  MotorPowerBlock:N('5'), MotorOnForBlock:N('3'), WaitForBlock:N('3'), LightBlock:N('1'),
  PlaySoundBlock:N('1'), DisplayBackgroundBlock:N('1'), DisplayBlock:N('1'),
  AddtoDisplayBlock:N('1'), SubtractfromDisplayBlock:N('1'),
  MultiplybyDisplayBlock:N('1'), DividebyDisplayBlock:N('1'),
  StartOnMessageBlock:T('abc'), SendMessageBlock:T('abc')
};
const defaultValueFor=k => k==='NumberInput'?'1':(k==='TextInput'?'':undefined);
function mkItem(k){
  if(k==='RepeatBlock') return {t:'r',input:null,children:[]};
  if(INPUTS.has(k))     return {t:'i',key:k,value:defaultValueFor(k)};
  const d=DEFAULT_INPUT[k];
  const it={t:'b',key:k,input:d?d.key:null,inputValue:d?d.value:undefined};
  if(k==='StartOnKeyPressBlock') it.letter='A';
  if(k==='PlayToneBlock'){ it.note='A'; it.octave=4; }
  return it;
}

/* ================= sensors: shared multi-device bus =================
   Tilt and Distance each own their state/constants/condition logic (see
   tilt-sensor.js / motion-sensor.js), but a single BLE characteristic
   ("sensor value") reports for whichever device is attached to whichever
   port, so the port-to-device dispatch has to live somewhere that can see
   both — that's here, not in either device file. */
const DEV_MOTOR=1, DEV_TILT=34, DEV_DISTANCE=35;
const DEV_NAMES={1:'motor',34:'tilt sensor',35:'distance sensor'};
const EDGE_MS=400;      /* how long a change stays lit in the readout */
const EDGE_KEYS =['AnyTilt','AnyDistanceChange','DistanceChangeCloser','DistanceChangeFurther',
                  'SoundSensorInput'];
const KEY_SENSOR={TiltUp:'tilt',TiltDown:'tilt',TiltThisWay:'tilt',TiltThatWay:'tilt',
  TiltSensorInput:'tilt',AnyTilt:'tilt',AnyDistanceChange:'distance',
  DistanceChangeCloser:'distance',DistanceChangeFurther:'distance',DistanceSensorInput:'distance'};
const EVENT_KEYS=['AnyTilt','AnyDistanceChange','DistanceChangeCloser','DistanceChangeFurther',
                  'TiltUp','TiltDown','TiltThisWay','TiltThatWay','TiltSensorInput',
                  'SoundSensorInput'];
const newEvents=()=>{const o={};EVENT_KEYS.forEach(k=>o[k]={n:0,at:0});return o;};
const sensorEvents={events:newEvents(),motors:[]};
function bump(key){ const e=sensorEvents.events[key]; e.n++; e.at=Date.now(); }
function clearSensors(){
  Tilt.reset(); Motion.reset();
  sensorEvents.motors=[]; sensorEvents.events=newEvents();
  renderPorts();
}

/* tell a port which mode to report in, and to notify us as it changes */
const inputFormat=(port,type,mode,unit)=>
  [0x01,0x02,port,type,mode,0x01,0x00,0x00,0x00,unit,0x01];

async function configurePort(port,type){
  const h=connectedHub();
  if(!h||!h.inp) return;
  const bytes = type===DEV_TILT     ? inputFormat(port,DEV_TILT,1,2)      /* direction, SI */
              : type===DEV_DISTANCE ? inputFormat(port,DEV_DISTANCE,0,2)  /* distance, SI */
              : null;
  if(!bytes) return;
  const data=new Uint8Array(bytes);
  try{
    if(h.inp.writeValueWithResponse) await h.inp.writeValueWithResponse(data);
    else await h.inp.writeValue(data);
    log('port '+port+' configured as '+(DEV_NAMES[type]||type));
  }catch(e){ log('port '+port+' setup failed: '+e.message); }
}

function onPortEvent(ev){
  const v=new Uint8Array(ev.target.value.buffer);
  log('port event ['+[...v].join(',')+']');
  const port=v[0], attached=v[1];
  if(!attached){
    Tilt.onDetach(port); Motion.onDetach(port);
    sensorEvents.motors=sensorEvents.motors.filter(p=>p!==port);
    log('port '+port+' emptied'); renderPorts(); return;
  }
  /* write-ups disagree on which byte carries the device type, so look for a
     value we recognise instead of trusting one offset */
  let type=null;
  for(const i of [3,2,4]) if([DEV_MOTOR,DEV_TILT,DEV_DISTANCE].indexOf(v[i])>=0){type=v[i];break;}
  if(type===null){ log('port '+port+': device not recognised'); renderPorts(); return; }
  if(type===DEV_TILT) Tilt.onAttach(port);
  else if(type===DEV_DISTANCE) Motion.onAttach(port);
  else if(sensorEvents.motors.indexOf(port)<0) sensorEvents.motors.push(port);
  log('port '+port+' holds a '+(DEV_NAMES[type]||type));
  renderPorts();
}

function onSensorValue(ev){
  const buf=ev.target.value.buffer;
  const v=new Uint8Array(buf), dv=new DataView(buf);
  if(v.length<6) return;
  /* The hub's own voltage/current telemetry rides this same characteristic —
     js/telemetry/voltage-current.js adds a second listener to it, so those
     notifications arrive here too. They always carry their port in byte 1, and
     it never matches an attached tilt/distance sensor, so without this they
     would fall through to the v[0] guess below and a raw millivolt float could
     be read as a tilt direction. (VOLTAGE_PORT/CURRENT_PORT are declared in
     voltage-current.js, which loads after this file; that's fine — like the
     Tilt/Motion references below, they are only resolved when this runs.) */
  if(v[1]===VOLTAGE_PORT||v[1]===CURRENT_PORT) return;
  const val=dv.getFloat32(2,true);
  let port=v[1];                                   /* byte 1 is the port... */
  if(port!==Tilt.state.port&&port!==Motion.state.port) port=v[0];   /* ...usually */
  const raw='['+[...v].join(',')+']';
  if(port===Tilt.state.port) Tilt.onValue(val,raw);
  else if(port===Motion.state.port) Motion.onValue(val,raw);
  renderPorts();
}

function sensorCondition(key){
  const t=Tilt.condition(key);
  if(t!==null) return t;
  const e=sensorEvents.events[key];
  return e ? Date.now()-e.at<EDGE_MS : false;   /* recently happened */
}
/* A loop body can take seconds, so a condition may come and go while it runs.
   Comparing counts against a snapshot catches that; a held tilt is also true
   simply by still being held. */
function snapshotEvents(){
  const s={}; for(const k in sensorEvents.events) s[k]=sensorEvents.events[k].n; return s;
}
function metSince(key,snap){
  const e=sensorEvents.events[key];
  if(e&&snap[key]!=null&&e.n>snap[key]) return true;
  return STATE_KEYS.indexOf(key)>=0 ? sensorCondition(key) : false;
}
function sensorAttached(key){
  if(key==='SoundSensorInput') return micOn;     /* the tablet's mic, not a hub port */
  const which=KEY_SENSOR[key];
  if(which==='tilt') return Tilt.attached();
  if(which==='distance') return Motion.attached();
  return true;
}

const COND_KEYS=['TiltUp','TiltDown','TiltThisWay','TiltThatWay','TiltSensorInput','AnyTilt',
                 'AnyDistanceChange','DistanceChangeCloser','DistanceChangeFurther'];
function renderPorts(){
  const el=document.getElementById('ports'); if(!el) return;
  el.innerHTML=
    Tilt.describe()+Motion.describe()+
    '<div class="prow"><b>Motor</b> '+(sensorEvents.motors.length?'port '+sensorEvents.motors.join(', ')
        :'not detected')+'</div>'+
    '<div class="prow"><b>Microphone</b> '+(micOn?'on — level '+micLevel.toFixed(3):'off')+'</div>'+
    '<div class="conds">'+COND_KEYS.map(k=>'<span class="'+(sensorCondition(k)?'on':'')+'">'+
        k.replace(/([A-Z])/g,' $1').trim()+'</span>').join('')+'</div>';
}
setInterval(renderPorts,250);

/* ================= execution engine ================= */
const STEP=200;            /* how long an instantaneous block stays highlighted */
const DEFAULT_LOOPS=3;
const DEFAULT_SECONDS=3;   /* shared default duration: Wait For and Motor On For */
const runners=new Map();   /* stack.id -> runner */
const highlighted=new Set();
let itemEl=new Map();

function mark(it,on){
  if(on) highlighted.add(it); else highlighted.delete(it);
  const e=itemEl.get(it);
  if(e) e.classList.toggle('exec',on);
}
function clearMarks(items){
  items.forEach(it=>{mark(it,false); if(it.children) clearMarks(it.children);});
}
function sleep(ms,r){
  return new Promise(res=>{
    const t=setTimeout(res,ms);
    r.cancels.add(()=>{clearTimeout(t);res();});
  });
}
/* waits until test() passes, or until the program is stopped */
function until(test,r,pollMs=30){
  return new Promise(res=>{
    if(r.stop||test()) return res();
    const id=setInterval(()=>{ if(r.stop||test()){ clearInterval(id); res(); } },pollMs);
    r.cancels.add(()=>{ clearInterval(id); res(); });
  });
}
const prettyKey=k=>k.replace(/([A-Z])/g,' $1').trim().toLowerCase();

/* Wait For, and later Repeat-until, both resolve an input the same way. */
async function waitForInput(it,r){
  const key=it.input;
  if(key==='SoundSensorInput'){ micForSensor=true; await ensureMic(); }
  if(EDGE_KEYS.indexOf(key)>=0){
    if(!sensorAttached(key)) log('Wait For: no '+KEY_SENSOR[key]+' sensor attached — this will wait');
    const start=sensorEvents.events[key].n;
    log('waiting for '+prettyKey(key));
    await until(()=>sensorEvents.events[key].n>start,r);   /* the next one, not the last one */
    return;
  }
  if(STATE_KEYS.indexOf(key)>=0){
    if(!sensorAttached(key)) log('Wait For: no '+KEY_SENSOR[key]+' sensor attached — this will wait');
    log('waiting for '+prettyKey(key));
    await until(()=>sensorCondition(key),r);          /* passes straight away if already true */
    return;
  }
  const secs=inputNumber(it,DEFAULT_SECONDS);
  const s=(secs==null?DEFAULT_SECONDS:secs);
  log('waiting '+s+'s');
  await sleep(s*1000,r);
}

function loopCount(it){
  const v=inputNumber(it,DEFAULT_LOOPS);
  const n=Math.round(v==null?DEFAULT_LOOPS:v);
  return n>0?n:0;      /* a count of zero means the body never runs */
}

/* Random takes its range from whatever it is plugged into */
const RAND_RANGE={MotorPowerBlock:[1,10],LightBlock:[0,10],MotorOnForBlock:[1,10],
  WaitForBlock:[1,10],RepeatBlock:[1,10],PlaySoundBlock:[1,10],DisplayBackgroundBlock:[1,10],
  DisplayBlock:[0,10],AddtoDisplayBlock:[1,10],SubtractfromDisplayBlock:[1,10],
  MultiplybyDisplayBlock:[1,10],DividebyDisplayBlock:[1,10]};
function randomFor(it){
  const parent=it.t==='r'?'RepeatBlock':it.key;
  const r=RAND_RANGE[parent]||[1,10];
  const n=r[0]+Math.floor(Math.random()*(r[1]-r[0]+1));
  log('random '+n+' (from '+r[0]+'–'+r[1]+')');
  return n;
}

function inputNumber(it,fallback){
  const key=it.input;
  if(!key) return null;
  /* the distance sensor reads as a live number wherever a number is wanted */
  if(key==='DistanceSensorInput')
    return Motion.state.value==null?null:Motion.state.value;
  if(key==='RandomInput')  return randomFor(it);
  if(key==='DisplayInput') return displayNumber();
  const v=parseFloat(it.inputValue);
  if(Number.isFinite(v)) return v;
  return fallback==null?null:fallback;
}

/* Write mode is chosen once per hub. Without-response matters for the motors:
   an acknowledged write makes the second port wait a round trip for the first,
   which is long enough to see two motors start out of step. */
function writeOut(c,data,h){
  if(!h.writeMode){
    h.writeMode = (c.properties&&c.properties.writeWithoutResponse&&c.writeValueWithoutResponse)
                    ? 'nr' : (c.writeValueWithResponse ? 'wr' : 'legacy');
    log('output write mode: '+h.writeMode);
  }
  if(h.writeMode==='nr') return c.writeValueWithoutResponse(data);
  if(h.writeMode==='wr') return c.writeValueWithResponse(data);
  return c.writeValue(data);
}
async function sendOut(bytes){
  const h=connectedHub();
  if(!h||!h.out){ log('no hub connected — command skipped'); return false; }
  try{ await writeOut(h.out,new Uint8Array(bytes),h); return true; }
  catch(e){ log('write failed: '+e.message); return false; }
}

async function execBlock(it,r){
  switch(it.key){
    case 'MotorPowerBlock':    await Motor.execPower(it,r); break;
    case 'MotorThisWayBlock':  await Motor.execThisWay(it,r); break;
    case 'MotorThatWayBlock':  await Motor.execThatWay(it,r); break;
    case 'MotorOffBlock':      await Motor.execOff(it,r); break;
    case 'MotorOnForBlock':    await Motor.execOnFor(it,r); break;
    case 'MotorBrakeBlock':    await Motor.execBrake(it,r); break;
    case 'WaitForBlock':{
      if(!it.input){ log('Wait For skipped — no input attached'); await sleep(STEP,r); break; }
      await waitForInput(it,r);
      break;
    }
    case 'PlaySoundBlock':{
      const n=inputNumber(it,1);
      if(n==null){ log('Play Sound skipped — no input attached'); await sleep(STEP,r); break; }
      const secs=await playSound(n);
      if(secs>0){
        /* hold the program until the sound finishes, and cut it off if stopped */
        try{ await sleep(secs*1000,r); }
        finally{ if(r.stop) stopSound(); }
      }else await sleep(STEP,r);
      break;
    }
    case 'DisplayBlock':           await Display.execDisplay(it,r); break;
    case 'AddtoDisplayBlock':      await Display.execMath('+',it,r); break;
    case 'SubtractfromDisplayBlock': await Display.execMath('-',it,r); break;
    case 'MultiplybyDisplayBlock': await Display.execMath('*',it,r); break;
    case 'DividebyDisplayBlock':   await Display.execMath('/',it,r); break;
    case 'DisplayClosedBlock':     await Display.execClosed(it,r); break;
    case 'DisplayMediumsizeBlock': await Display.execMedium(it,r); break;
    case 'DisplayFullsizeBlock':   await Display.execFull(it,r); break;
    case 'DisplayBackgroundBlock': await Display.execBackground(it,r); break;
    case 'SendMessageBlock':{
      if(!it.input){ log('Send Message skipped — no input attached'); await sleep(STEP,r); break; }
      const msg = it.input==='TextInput' ? String(it.inputValue==null?'':it.inputValue)
                                         : String(inputNumber(it,0)??'');
      broadcast(msg);
      await sleep(STEP,r); break;
    }
    case 'LightBlock': await RgbLight.execLight(it,r); break;
    case 'PlayToneBlock': await PiezoTonePlayer.execPlay(it,r); break;
    default: await sleep(STEP,r);
  }
}

async function runBody(it,r){
  if(it.children.length===0) await sleep(STEP,r);   /* the arch itself never lights up */
  else await execSeq(it.children,r);
}
async function execRepeat(it,r){
  const key=it.input;
  if(!key){                                    /* no count: forever */
    while(!r.stop) await runBody(it,r);
    return;
  }
  if(STATE_KEYS.indexOf(key)>=0||EDGE_KEYS.indexOf(key)>=0){
    if(key==='SoundSensorInput'){ micForSensor=true; await ensureMic(); }
    if(!sensorAttached(key))
      log('Repeat until '+prettyKey(key)+': no '+(KEY_SENSOR[key]||'sound')+' sensor available');
    const snap=snapshotEvents();
    log('repeating until '+prettyKey(key));
    while(!r.stop&&!metSince(key,snap)) await runBody(it,r);
    return;
  }
  const n=loopCount(it);
  log('repeating '+n+'x');
  for(let i=0;i<n&&!r.stop;i++) await runBody(it,r);
}

async function execSeq(items,r){
  for(const it of items){
    if(r.stop) return;
    if(it.t==='r'){
      await execRepeat(it,r);
    }else if(it.t==='b'){
      mark(it,true);
      try{ await execBlock(it,r); } finally { mark(it,false); }
    }
  }
}

async function runStack(stack){
  if(runners.has(stack.id)) return;      /* already running — the press is ignored */
  const r={stop:false,cancels:new Set()};
  runners.set(stack.id,r); updateStop();
  try{
    const head=stack.items[0];
    if(head&&head.t==='b'){ mark(head,true); await sleep(Math.round(STEP*0.6),r); mark(head,false); }
    await execSeq(stack.items.slice(1),r);
  }finally{
    runners.delete(stack.id);
    clearMarks(stack.items);
    updateStop();
    if(runners.size===0) syncSensorMic();
  }
}
function stopStack(stack){
  const r=runners.get(stack.id); if(!r) return;
  r.stop=true; r.cancels.forEach(f=>f()); r.cancels.clear();
}
function stopAll(){ stacks.slice().forEach(stopStack); }

/* Chrome throttles timers in a backgrounded tab, so a running On For could
   overshoot its duration by a long way. Halt everything instead. */
function haltEverything(reason){
  if(runners.size===0) return;
  log('halted — '+reason);
  stopAll(); stopSound();
  motorRun(0);            /* best effort; the On For finally also stops it */
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) haltEverything('app left the foreground');
});
addEventListener('pagehide',()=>haltEverything('page closed'));
function updateStop(){
  document.getElementById('stop').classList.toggle('active',runners.size>0);
}
registerCustomBlock('StartOnButtonPressBlock',{label:'Hub Button',group:'Flow'});
