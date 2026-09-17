# WeDo 2.0 Block File Split + New I/O Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `js/app.js` (1966 lines, monolithic) into per-device files under `js/blocks/` and `js/telemetry/`, then implement 5 hub I/O features that are missing compared to the reference SDK: Piezo Tone Player, motor brake, motor power offset compensation, RGB Light absolute (full-color) mode, and a programmable hub-button block.

**Architecture:** No bundler, no ES modules — plain `<script src>` tags loaded in dependency order, all sharing one global scope (identical to how `data/bundle.js`/`soundbank.js`/`bgbank.js` already work). Each device file exposes a small namespaced object (`Motor`, `RgbLight`, `Tilt`, `Motion`, ...) so `js/blocks/core.js`'s `execBlock()` dispatcher can call e.g. `Motor.execPower(it,r)`.

**Tech Stack:** Vanilla JS, zero runtime dependencies, jsdom + Node's built-in test runner for tests (`npm test`).

**Spec:** [docs/superpowers/specs/2026-09-16-wedo2-io-blocks-design.md](../specs/2026-09-16-wedo2-io-blocks-design.md)

## Global Constraints

- No `import`/`export`, no bundler — the app must keep working over `file://`.
- Every new/moved file gets a matching test under `test/blocks/` or `test/telemetry/`.
- `test/helpers.js`'s `SCRIPTS` array and `WeDo CPE v1.0.html`'s `<script src>` tags must list files in the exact same order.
- Boot-time code that runs immediately (not inside a function) must stay at the very bottom of `js/app.js` (the last-loaded file) — this project already hit a temporal-dead-zone bug from getting this wrong (CHANGELOG 2026-09-16 (6)).
- Every task ends with `npm test` passing before committing.
- Every task's commit is followed by a `CHANGELOG.md` entry (folded into the task's own commit, not a separate step) — this project's standing convention (`AGENTS.md`).
- New block types (`PlayToneBlock`, `MotorBrakeBlock`, `StartOnButtonPressBlock`) have no hand-drawn sprite art available (the app's block graphics are pre-rendered images baked into `data/bundle.js`, and the real commercial WeDo app never exposed these hub capabilities to build sprites for). They render via a small CSS-only fallback block (Task 10) instead of an `<img>` sprite. RGB absolute-color reuses the existing `LightBlock` sprite/dialog rather than adding a new block, for the same reason.
- Hub-internal port numbers for Piezo Tone Player, Voltage sensor, and Current sensor are **best-guess placeholders** (5, 4, 3 respectively) chosen by analogy to the existing LED's port 6 — there is no way to confirm them without real hardware. Every task touching them says so in a code comment and in the doc/CHANGELOG entry, matching this project's existing practice of flagging what needs manual hardware verification (`AGENTS.md`).

---

## File Inventory (end state)

```
js/
  blocks/
    core.js               -- B/S/ORDER, TAB_COLOUR, registerCustomBlock, block-classification
                              sets, canAccept, N/T/DEFAULT_INPUT/mkItem, sendOut/writeOut,
                              inputNumber, randomFor/RAND_RANGE, execBlock dispatcher,
                              execution engine (sleep/until/runStack/execSeq/execRepeat/mark),
                              shared sensor bus (onPortEvent/onSensorValue/sensorCondition/
                              sensorAttached/clearSensors/renderPorts)
    tilt-sensor.js          -- TILT/TILT_INFO/STATE_KEYS, Tilt namespace
    motion-sensor.js        -- DIST_EPS, Motion namespace
    motor.js                -- motorState, motorRun, execBlock handlers, Motor namespace
    rgb-light.js             -- LED_NAMES/LED_HEX, ledSet/ledSetRGB, RgbLight namespace
    piezo-tone-player.js     -- NEW: note table, playTone/stopTone, PlayToneBlock
    sound.js                 -- tablet mic + tablet speaker (SoundSensorInput, PlaySoundBlock)
    display.js               -- virtual display state/paint/math blocks
    messaging.js              -- broadcast/triggerKey/triggerButtonPress, Send/Start blocks
  telemetry/
    button-battery.js         -- hub-button + battery GATT wiring
    voltage-current.js        -- NEW voltage/current sensor wiring
  app.js                      -- engine only: rendering, drag/drop, dialogs, save/open,
                              autosave, BLE scan/connect/disconnect/reconnect, boot sequence
```

---

## Phase 1: Restructuring (behavior-preserving)

### Task 1: Create `js/blocks/core.js`

**Files:**
- Create: `js/blocks/core.js`
- Modify: `js/app.js:1-34, 36-89 (partial), 119-122, 538-978, 725-756, 982 (S/B/ORDER refs stay working)`
- Modify: `WeDo CPE v1.0.html` (add `<script src="js/blocks/core.js"></script>` after the `data/*.js` tags, before `js/app.js`)
- Modify: `test/helpers.js` (`SCRIPTS` array)
- Test: `test/blocks/core.test.js`

**Interfaces:**
- Produces: `B`, `S`, `ORDER` (globals), `TAB_COLOUR`, `registerCustomBlock(key, opts)`, `STARTS`, `SOCKETED`, `INPUTS`, `NUM_INPUTS`, `isCondition(k)`, `isNumeric(k)`, `canAccept(parentKey,inputKey)`, `N(v)`, `T(v)`, `DEFAULT_INPUT`, `mkItem(k)`, `defaultValueFor(k)`, `sendOut(bytes)`, `writeOut(c,data,h)`, `inputNumber(it,fallback)`, `randomFor(it)`, `RAND_RANGE`, `execBlock(it,r)` (dispatcher only — case bodies call into device namespaces added in later tasks), `sleep(ms,r)`, `until(test,r,pollMs)`, `prettyKey(k)`, `waitForInput(it,r)`, `loopCount(it)`, `runBody(it,r)`, `execRepeat(it,r)`, `execSeq(items,r)`, `runStack(stack)`, `stopStack(stack)`, `stopAll()`, `haltEverything(reason)`, `updateStop()`, `mark(it,on)`, `clearMarks(items)`, `runners`, `highlighted`, `itemEl` (mutable — reassigned by `render()` in app.js), `STEP`, `DEFAULT_LOOPS`, `DEFAULT_SECONDS`, `DEV_MOTOR`/`DEV_TILT`/`DEV_DISTANCE`, `DEV_NAMES`, `EDGE_MS`, `EDGE_KEYS`, `KEY_SENSOR`, `EVENT_KEYS`, `newEvents()`, `bump(key)`, `sensorEvents` (`{events, motors}`), `clearSensors()`, `inputFormat(port,type,mode,unit)`, `configurePort(port,type)`, `onPortEvent(ev)`, `onSensorValue(ev)`, `sensorCondition(key)`, `snapshotEvents()`, `metSince(key,snap)`, `sensorAttached(key)`, `COND_KEYS`, `renderPorts()`.
- Consumes: nothing yet at load time. At call time (after all scripts load) it calls into `Tilt.*`/`Motion.*` (Task 2/3), `motorRun`/`Motor.*` (Task 4), `ledSet`/`RgbLight.*` (Task 5), sound functions (Task 6: `playSound`, `stopSound`, `ensureMic`, `micForSensor`, `micOn`, `micLevel`), display functions (Task 7: `displayContent`, `applyMath`, `openDisplay`, `paintDisplay`, etc.), messaging (Task 8: `broadcast`), and `log()`/`connectedHub()` (still in `app.js`, called only from inside functions — safe since `app.js` finishes loading before any of this runs).

- [ ] **Step 1: Create `js/blocks/core.js` with the moved code**

```js
/* ================= shared block data & classification ================= */
const B=WEDO_DATA.bundle;
const S=B.sprites, ORDER=B.order;

const STARTS=new Set(['StartBlock','StartOnKeyPressBlock','StartOnMessageBlock']);
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
```

- [ ] **Step 2: Remove the moved code from `js/app.js`**

Delete lines 1-34 (the `B`/`S`/`ORDER`/`STARTS`/`SOCKETED`/`INPUTS`/`NUM_INPUTS`/`isCondition`/`isNumeric`/`canAccept` block), lines 69-85 (`N`/`T`/`DEFAULT_INPUT`/`mkItem`), line 122 (`defaultValueFor` — keep it only if still referenced elsewhere in app.js; it isn't, so delete), lines 185-349 minus what Tasks 2/3 need (leave a placeholder comment `/* Tilt/Motion sensor logic moved to js/blocks/tilt-sensor.js and motion-sensor.js */` if useful, otherwise just delete — Tasks 2/3 create those files from this same source), lines 538-978 (execution engine block), lines 725-756 (`inputNumber`/`writeOut`/`sendOut`), and the palette `TAB_COLOUR` constant at old line 1040 (now in core.js — delete the duplicate in app.js, keep `activeTab`/`drawTray()` which still live in app.js since they're rendering).

Also delete `const RAND_RANGE=...` and `randomFor` (now in core.js), keeping `motorState`/`DEFAULT_LEVEL`/`POWER_FLOOR`/`levelToPower` in place for now (Task 4 moves those).

Run `git diff js/app.js` after this step and confirm every removed block has an exact counterpart in the new `js/blocks/core.js` — nothing should be deleted without a new home.

- [ ] **Step 3: Wire up script order**

In `WeDo CPE v1.0.html`, change:
```html
<script src="data/bundle.js"></script>
<script src="data/soundbank.js"></script>
<script src="data/bgbank.js"></script>
<script src="js/app.js"></script>
```
to:
```html
<script src="data/bundle.js"></script>
<script src="data/soundbank.js"></script>
<script src="data/bgbank.js"></script>
<script src="js/blocks/core.js"></script>
<script src="js/app.js"></script>
```
(Tasks 2-9 insert their own tags between `core.js` and `app.js`, in the order given in each task.)

In `test/helpers.js`, update:
```js
const SCRIPTS = ["data/bundle.js", "data/soundbank.js", "data/bgbank.js", "js/app.js"];
```
to:
```js
const SCRIPTS = ["data/bundle.js", "data/soundbank.js", "data/bgbank.js",
  "js/blocks/core.js", "js/app.js"];
```

- [ ] **Step 4: Run the existing test suite — expect it to fail with `Tilt is not defined` (or similar)**

Run: `npm test`
Expected: FAIL — `core.js` now calls `Tilt.reset()`/`Motion.reset()`/`Tilt.describe()`/etc. and those don't exist until Task 2/3. This is expected; Task 1 alone is not meant to leave the suite green. Confirm the failure is specifically about `Tilt`/`Motion` being undefined, not some other regression (e.g. a typo from the manual line deletion) — if it's a different error, fix the transcription before moving on.

- [ ] **Step 5: Commit**

```bash
git add js/blocks/core.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "$(cat <<'EOF'
Extract shared block infra into js/blocks/core.js

First step of splitting js/app.js into per-device files: pulls out
block classification, the execution engine, and the shared sensor
port-dispatch bus. Tilt/Motion namespaces referenced here land in the
next two commits — the suite is expected to fail until then.
EOF
)"
```

---

### Task 2: Create `js/blocks/tilt-sensor.js`

**Files:**
- Create: `js/blocks/tilt-sensor.js`
- Modify: `js/app.js` (none left to remove — Task 1 already stripped Stage 7; if any tilt-only lines remain from Task 1's Step 2, remove them now)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js` (insert `js/blocks/tilt-sensor.js` right after `js/blocks/core.js`)
- Test: `test/blocks/tilt-sensor.test.js`

**Interfaces:**
- Consumes: `bump(key)`, `configurePort(port,type)`, `DEV_TILT` (all from `core.js`, called at runtime only — safe regardless of load order relative to core.js as long as core.js loads first, which it does).
- Produces: `TILT`, `TILT_INFO`, `STATE_KEYS`, `Tilt` (`{state, reset(), onAttach(port), onDetach(port), onValue(val,raw), condition(key), attached(), describe()}`).

- [ ] **Step 1: Create `js/blocks/tilt-sensor.js`**

```js
/* ================= Tilt Sensor (hub IO type 34) ================= */
/* direction codes the hub reports for the tilt sensor */
/* One table per tilt code: its name in the readout and the block it satisfies.
   Left and right were the other way round on the real sensor. */
const TILT={NONE:0, UP:3, LEFT:5, RIGHT:7, DOWN:9};
const TILT_INFO={};
TILT_INFO[TILT.NONE] ={name:'no tilt',key:'TiltSensorInput'};
TILT_INFO[TILT.UP]   ={name:'up',     key:'TiltUp'};
TILT_INFO[TILT.LEFT] ={name:'left',   key:'TiltThisWay'};
TILT_INFO[TILT.RIGHT]={name:'right',  key:'TiltThatWay'};
TILT_INFO[TILT.DOWN] ={name:'down',   key:'TiltDown'};

/* Tilt directions are states: true for as long as the sensor is held there.
   Changes are moments: they happen between two readings and are gone. Those are
   counted, so a wait can tell "it happened again" from "it is still true". */
const STATE_KEYS=['TiltUp','TiltDown','TiltThisWay','TiltThatWay','TiltSensorInput'];

const Tilt={
  state:{port:null,dir:TILT.NONE,raw:null},
  reset(){ Tilt.state={port:null,dir:TILT.NONE,raw:null}; },
  onAttach(port){ Tilt.state.port=port; configurePort(port,DEV_TILT); },
  onDetach(port){ if(Tilt.state.port===port) Tilt.reset(); },
  onValue(val,raw){
    const was=Tilt.state.dir, now=Math.round(val);
    Tilt.state.dir=now; Tilt.state.raw=raw;
    /* no direction mode is free while we are reading direction, so a shake is
       inferred from flipping straight between two tilts */
    if(was!==now){
      const k=(TILT_INFO[now]||{}).key; if(k) bump(k);
      if(was!==TILT.NONE&&now!==TILT.NONE) bump('AnyTilt');
    }
  },
  condition(key){
    const t=Tilt.state;
    switch(key){
      case 'TiltUp':          return t.dir===TILT.UP;
      case 'TiltDown':        return t.dir===TILT.DOWN;
      case 'TiltThisWay':     return t.dir===TILT.LEFT;
      case 'TiltThatWay':     return t.dir===TILT.RIGHT;
      case 'TiltSensorInput': return t.port!=null&&t.dir===TILT.NONE;
    }
    return null;    /* not a tilt condition key */
  },
  attached(){ return Tilt.state.port!=null; },
  describe(){
    const t=Tilt.state;
    return '<div class="prow"><b>Tilt</b> '+(t.port?'port '+t.port+' — code '+t.dir+
        ' ('+((TILT_INFO[t.dir]||{}).name||'?')+')':'not attached')+
        (t.raw?'<span class="raw">'+t.raw+'</span>':'')+'</div>';
  }
};
```

- [ ] **Step 2: Update script tags and helpers.js**

`WeDo CPE v1.0.html`:
```html
<script src="js/blocks/core.js"></script>
<script src="js/blocks/tilt-sensor.js"></script>
<script src="js/app.js"></script>
```
`test/helpers.js`:
```js
const SCRIPTS = ["data/bundle.js", "data/soundbank.js", "data/bgbank.js",
  "js/blocks/core.js", "js/blocks/tilt-sensor.js", "js/app.js"];
```

- [ ] **Step 3: Run tests — expect failure on `Motion is not defined`**

Run: `npm test`
Expected: still FAIL (Task 3 hasn't run yet), but the failure should now be about `Motion`, not `Tilt` — confirming Task 2 resolved cleanly.

- [ ] **Step 4: Commit**

```bash
git add js/blocks/tilt-sensor.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract Tilt Sensor logic into js/blocks/tilt-sensor.js"
```

---

### Task 3: Create `js/blocks/motion-sensor.js`

**Files:**
- Create: `js/blocks/motion-sensor.js`
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js` (insert after `tilt-sensor.js`)
- Test: `test/blocks/motion-sensor.test.js`

**Interfaces:**
- Consumes: `bump(key)`, `configurePort`, `DEV_DISTANCE` (from `core.js`).
- Produces: `DIST_EPS`, `Motion` (`{state, reset(), onAttach(port), onDetach(port), onValue(val,raw), attached(), describe()}`). Note: distance has no per-key `condition()` the way Tilt does (its only condition keys are edge keys handled generically by `sensorCondition`'s event-timestamp fallback in core.js), so `Motion` has no `condition()` method — `core.js`'s `sensorCondition` only calls `Tilt.condition()`.

- [ ] **Step 1: Create `js/blocks/motion-sensor.js`**

```js
/* ================= Motion/Distance Sensor (hub IO type 35) ================= */
const DIST_EPS=0.2;     /* how much movement counts as a distance change */

const Motion={
  state:{port:null,value:null,prev:null,raw:null},
  reset(){ Motion.state={port:null,value:null,prev:null,raw:null}; },
  onAttach(port){ Motion.state.port=port; configurePort(port,DEV_DISTANCE); },
  onDetach(port){ if(Motion.state.port===port) Motion.reset(); },
  onValue(val,raw){
    const prev=Motion.state.value, cur=Math.max(0,Math.min(10,val));
    Motion.state.prev=prev; Motion.state.value=cur; Motion.state.raw=raw;
    if(prev!=null){
      const d=cur-prev;
      if(Math.abs(d)>DIST_EPS) bump('AnyDistanceChange');
      if(d<-DIST_EPS) bump('DistanceChangeCloser');
      if(d> DIST_EPS) bump('DistanceChangeFurther');
    }
  },
  attached(){ return Motion.state.port!=null; },
  describe(){
    const d=Motion.state;
    return '<div class="prow"><b>Distance</b> '+(d.port?'port '+d.port+
        (d.value!=null?' — '+d.value.toFixed(1):''):'not attached')+
        (d.raw?'<span class="raw">'+d.raw+'</span>':'')+'</div>';
  }
};
```

- [ ] **Step 2: Update script tags and helpers.js** (insert `js/blocks/motion-sensor.js` after `tilt-sensor.js`, both in the HTML and in `SCRIPTS`)

- [ ] **Step 3: Run tests — expect failure on `Motor is not defined`**

Run: `npm test`
Expected: FAIL, now on `Motor` (Task 4 not done yet) — confirms Tilt+Motion resolved.

- [ ] **Step 4: Commit**

```bash
git add js/blocks/motion-sensor.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract Motion/Distance Sensor logic into js/blocks/motion-sensor.js"
```

---

### Task 4: Create `js/blocks/motor.js`

**Files:**
- Create: `js/blocks/motor.js`
- Modify: `js/app.js:597-607, 760-774` (remove `motorState`/`DEFAULT_LEVEL`/`POWER_FLOOR`/`levelToPower`/`motorRun`)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/blocks/motor.test.js`

**Interfaces:**
- Consumes: `sendOut`, `writeOut`, `connectedHub()` (app.js, runtime-only call), `log()` (app.js), `inputNumber`, `sleep`, `STEP`, `DEFAULT_SECONDS` (core.js).
- Produces: `motorState`, `DEFAULT_LEVEL`, `POWER_FLOOR`, `levelToPower(l)`, `motorRun(power)`, `Motor` (`{execPower(it,r), execThisWay(it,r), execThatWay(it,r), execOff(it,r), execOnFor(it,r)}`).

- [ ] **Step 1: Create `js/blocks/motor.js`**

```js
/* ================= Motor (hub IO type 1) ================= */
/* ---- motor state. Power and direction are remembered but never assumed:
   until a program sets both, Motor On For does nothing. ---- */
const motorState={power:null,dir:null};
const DEFAULT_LEVEL=10;    /* until Motor Power carries an input */

/* Level 1-10 maps onto 35-100%. The motor stalls below roughly a third power —
   measured on real hardware: 29% would not turn, 38% would. */
const POWER_FLOOR=35;
const levelToPower=l => l<=0 ? 0
  : Math.round(POWER_FLOOR+(Math.min(l,10)-1)*((100-POWER_FLOOR)/9));

/* -100..100; negative is encoded as 256+value. Both ports are addressed so any
   attached motor responds, and both packets are dispatched before either is
   awaited so the motors start and stop together. */
async function motorRun(power){
  const h=connectedHub();
  if(!h||!h.out){ log('motor: no hub connected — command skipped'); return false; }
  const p=Math.max(-100,Math.min(100,Math.round(power)));
  const b=p<0?256+p:p;
  const pk=[new Uint8Array([1,0x01,0x01,b]),new Uint8Array([2,0x01,0x01,b])];
  const t0=(self.performance||Date).now();
  try{
    /* dispatched one after the other, but unacknowledged: each resolves as soon
       as it is queued rather than waiting a round trip for the hub to reply */
    for(const d of pk) await writeOut(h.out,d,h);
  }catch(e){ log('motor write failed: '+e.message); return false; }
  log('motor -> '+p+'%  (both ports in '+Math.round((self.performance||Date).now()-t0)+'ms)');
  return true;
}

const Motor={
  async execPower(it,r){
    const lvl=inputNumber(it,DEFAULT_LEVEL);
    if(lvl==null) log('Motor Power: no input attached — power left unset');
    else { motorState.power=levelToPower(lvl); log('power set to '+motorState.power+'%'); }
    await sleep(STEP,r);
  },
  async execThisWay(it,r){
    motorState.dir=-1; log('direction set: this way'); await sleep(STEP,r);
  },
  async execThatWay(it,r){
    motorState.dir=1; log('direction set: that way'); await sleep(STEP,r);
  },
  async execOff(it,r){
    await motorRun(0); await sleep(STEP,r);
  },
  async execOnFor(it,r){
    if(motorState.power==null||motorState.dir==null){
      log('Motor On For skipped — '+
          (motorState.power==null?'no power set':'')+
          (motorState.power==null&&motorState.dir==null?' and ':'')+
          (motorState.dir==null?'no direction set':''));
      await sleep(STEP,r); return;
    }
    const secs=inputNumber(it,DEFAULT_SECONDS)??DEFAULT_SECONDS;
    await motorRun(motorState.power*motorState.dir);
    /* the stop is in a finally so the motor cannot be left spinning by an
       error, a stop press, or the program being edited mid-run */
    try{ await sleep(secs*1000,r); }
    finally{ await motorRun(0); }
  }
};
```

- [ ] **Step 2: Remove `motorState`/`DEFAULT_LEVEL`/`POWER_FLOOR`/`levelToPower`/`motorRun` from `js/app.js`**

- [ ] **Step 3: Update script tags and helpers.js** (insert `js/blocks/motor.js` after `motion-sensor.js`)

- [ ] **Step 4: Run tests — expect failure on `RgbLight is not defined`**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add js/blocks/motor.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract Motor logic into js/blocks/motor.js"
```

---

### Task 5: Create `js/blocks/rgb-light.js`

**Files:**
- Create: `js/blocks/rgb-light.js`
- Modify: `js/app.js:776-787` (remove `LED_NAMES`/`LED_IDLE`/`DEFAULT_COLOUR`/`ledSet`; **keep** `LED_HEX` and the colour dialog in app.js per the spec's boundary rule — dialogs stay in the engine)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/blocks/rgb-light.test.js`

**Interfaces:**
- Consumes: `sendOut` (core.js), `inputNumber`, `sleep`, `STEP` (core.js), `log()` (app.js).
- Produces: `LED_NAMES`, `LED_IDLE`, `DEFAULT_COLOUR`, `ledSet(idx)`, `RgbLight` (`{execLight(it,r)}`). (`LED_HEX` stays in `app.js` — it's colour-dialog rendering data, not device logic.)

- [ ] **Step 1: Create `js/blocks/rgb-light.js`**

```js
/* ================= RGB Light (hub IO type 23) =================
   Discrete mode only for now — port 6, command 4, one byte, an index into
   the hub's own 11-colour palette, not an RGB value. Absolute (full-colour)
   mode is added in Task 12. */
const LED_NAMES=['off','pink','purple','blue','sky blue','teal',
                 'green','yellow','orange','red','white'];
const LED_IDLE=3;          /* what the hub shows when it is just sitting connected */
const DEFAULT_COLOUR=9;    /* placeholder until an input carries a value */

async function ledSet(idx){
  const i=Math.max(0,Math.min(10,Math.round(idx)));
  log('light -> '+i+' ('+LED_NAMES[i]+')');
  return sendOut([0x06,0x04,0x01,i]);
}

const RgbLight={
  async execLight(it,r){
    const c=inputNumber(it,DEFAULT_COLOUR);
    if(c==null) log('Light skipped — no input attached');
    else await ledSet(c);
    await sleep(STEP,r);
  }
};
```

- [ ] **Step 2: Remove the moved lines from `js/app.js`** (keep `LED_HEX` where it already is, next to the colour dialog)

- [ ] **Step 3: Update script tags and helpers.js**

- [ ] **Step 4: Run tests — expect failure related to sound (`playSound is not defined`, etc.)**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add js/blocks/rgb-light.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract RGB Light logic into js/blocks/rgb-light.js"
```

---

### Task 6: Create `js/blocks/sound.js`

**Files:**
- Create: `js/blocks/sound.js`
- Modify: `js/app.js:351-536` (remove the whole "Stage 11: sound" block)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/blocks/sound.test.js`

**Interfaces:**
- Consumes: `bump(key)` (core.js), `log()` (app.js), `drag`, `stacks`, `recState`/`paintSoundDialog` references stay internal to this file except `paintSoundDialog` which is a dialog function staying in `app.js` — called from here at runtime (safe).
- Produces: `audioCtx`/`micOn`/`micStream`/`micAnalyser`/`micTimer`/`micLevel` (mutable globals — read by `core.js`'s `renderPorts`/`sensorAttached`/`waitForInput`/`execRepeat`), `SOUND_NAMES`/`SOUND_DATA`/`SOUND_BANK`/`soundName`/`loadSound`, `customSound`/`mediaRec`/`recChunks`/`recState`, `blobToBase64`/`base64ToBlob`/`persistCustomSound`/`restoreCustomSound`, `ac()`, `currentSource`/`playBuffer`/`stopSound`, `playPlaceholder`/`playSound`, `ensureMic`, `SOUND_EPS`, `micForSensor`/`releaseMic`/`maybeReleaseMic`, `micDenied`/`hasSoundSensor`/`syncSensorMic`, `startRecording`/`stopRecording`.

- [ ] **Step 1: Create `js/blocks/sound.js`** with the exact content of the current `js/app.js` lines 351-536 (the whole "Stage 11: sound" section — tablet mic for the sound sensor, tablet speaker/recording for Play Sound). Copy it verbatim; no logic changes in this task.

- [ ] **Step 2: Remove those lines from `js/app.js`**

- [ ] **Step 3: Update script tags and helpers.js**

- [ ] **Step 4: Run tests — expect failure related to `displayContent`/`paintDisplay is not defined`**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add js/blocks/sound.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract tablet mic/speaker sound logic into js/blocks/sound.js"
```

---

### Task 7: Create `js/blocks/display.js`

**Files:**
- Create: `js/blocks/display.js`
- Modify: `js/app.js:621-723` (remove `BGB`/`BG_COUNT`/`BG_THUMBS`/`BG_FULL`/`bgUrl`/`displayContent`/`displaySize`/`displayBg`/`displayNumber`/`dispPos`/`BG_RATIO`/`paintDisplay`/`fitDisplayText`/`dispDrag`/`wireDisplayChrome`/`openDisplay`/`applyMath`; **keep** the `wireDisplayChrome()` invocation itself at the bottom of `app.js`'s boot sequence since it's DOM wiring done at boot, not exec logic — see Step 2)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/blocks/display.test.js`

**Interfaces:**
- Consumes: `log()` (app.js), `inputNumber` (core.js), `sleep`/`STEP` (core.js).
- Produces: `BGB`/`BG_COUNT`/`BG_THUMBS`/`BG_FULL`/`bgUrl(i)`, `displayContent`/`displaySize`/`displayBg`/`displayNumber()`, `dispPos`/`BG_RATIO`/`paintDisplay()`/`fitDisplayText(box,span,H)`/`dispDrag`/`wireDisplayChrome()`/`openDisplay()`, `applyMath(op,it)`, `Display` (`{execDisplay(it,r), execMath(op,it,r), execClosed(it,r), execMedium(it,r), execFull(it,r), execBackground(it,r)}`).

- [ ] **Step 1: Create `js/blocks/display.js`**

```js
/* ================= Display (software-only — no hub feature) ================= */
const BGB=WEDO_DATA.bgbank;
const BG_COUNT=BGB.count, BG_THUMBS=BGB.thumbs, BG_FULL=BGB.full||{};
/* the display uses the full image where we have it, and falls back to the
   thumbnail — soft, but better than nothing — until the rest arrive */
function bgUrl(i){
  const k=String(i), d=BG_FULL[k]||BG_THUMBS[k];
  return d ? 'url(data:image/webp;base64,'+d+')' : null;
}

/* blank rather than 0, so a program that only sets a background shows the
   picture alone with no stray number floating over it */
let displayContent='';
let displaySize='closed';    /* closed | medium | full */
let displayBg=0;
const displayNumber=()=>{ const v=parseFloat(displayContent); return Number.isFinite(v)?v:0; };

let dispPos=null;      /* null means centred; otherwise where you dragged it to */
const BG_RATIO=256/160;      /* the shape of every background image */
function paintDisplay(){
  const d=document.getElementById('display'); if(!d) return;
  d.className=displaySize;
  if(displaySize!=='closed'){
    const work=document.getElementById('work');
    const aw=work.clientWidth, ah=work.clientHeight;
    const wf=displaySize==='full'?0.96:0.58, hf=displaySize==='full'?0.96:0.58;
    let W=aw*wf, H=W/BG_RATIO;
    if(H>ah*hf){ H=ah*hf; W=H*BG_RATIO; }       /* short screens clamp on height */
    d.style.width=Math.round(W)+'px';
    d.style.height=Math.round(H)+'px';
    d.dataset.h=Math.round(H);
  }
  if(dispPos){ d.style.left=dispPos.x+'px'; d.style.top=dispPos.y+'px'; d.style.transform='none'; }
  else { d.style.left='50%'; d.style.top='50%'; d.style.transform='translate(-50%,-50%)'; }
  const bg=document.getElementById('dispbg'), u=displayBg?bgUrl(displayBg):null;
  bg.style.background=u?(u+' center/cover no-repeat'):'#fff';
  const box=document.getElementById('disptext'), span=box.firstElementChild;
  span.textContent=String(displayContent);
  if(displaySize!=='closed') fitDisplayText(box,span,+d.dataset.h);
}

/* Shrink the text until it fits the window, down to half the normal size.
   Binary search rather than stepping down, so this costs about eight layout
   reads instead of a hundred. */
function fitDisplayText(box,span,H){
  const max=Math.max(12,Math.round(H*0.3)), min=Math.max(8,Math.round(H*0.15));
  box.style.fontSize=max+'px';
  if(!span.textContent) return;
  const fits=()=>span.offsetWidth<=box.clientWidth+1 && span.offsetHeight<=box.clientHeight+1;
  if(fits()) return;
  let lo=min, hi=max, best=min;
  while(hi-lo>1){
    const mid=Math.round((lo+hi)/2);
    box.style.fontSize=mid+'px';
    if(fits()){ best=mid; lo=mid; } else hi=mid;
  }
  box.style.fontSize=best+'px';
}

/* drag the display by its title bar, and close it by hand */
let dispDrag=null;
function wireDisplayChrome(){
  const d=document.getElementById('display'), head=document.getElementById('disphead');
  if(!d||!head) return;
  head.addEventListener('pointerdown',e=>{
    if(e.target.closest('#dispclose')) return;
    const r=d.getBoundingClientRect();
    dispDrag={dx:e.clientX-r.left, dy:e.clientY-r.top};
    head.classList.add('moving');
    e.stopPropagation(); e.preventDefault();
  },true);
  addEventListener('pointermove',e=>{
    if(!dispDrag) return;
    const w=document.getElementById('work').getBoundingClientRect();
    const r=d.getBoundingClientRect();
    const x=Math.min(Math.max(e.clientX-dispDrag.dx-w.left,-r.width+80), w.width-80);
    const y=Math.min(Math.max(e.clientY-dispDrag.dy-w.top,0), w.height-40);
    dispPos={x,y}; paintDisplay();
  });
  addEventListener('pointerup',()=>{
    if(!dispDrag) return;
    dispDrag=null; head.classList.remove('moving');
  });
  document.getElementById('dispclose').onclick=()=>{
    displaySize='closed'; log('display closed by hand'); paintDisplay();
  };
}
function openDisplay(){ if(displaySize==='closed') displaySize='medium'; }

function applyMath(op,it){
  const n=inputNumber(it,null);
  if(n==null){ log('display maths skipped — no input attached'); return; }
  const cur=displayNumber();
  let out;
  if(op==='+') out=cur+n;
  else if(op==='-') out=cur-n;
  else if(op==='*') out=cur*n;
  else { if(n===0){ log('divide by zero ignored — display unchanged'); return; } out=cur/n; }
  displayContent=Math.round(out*1e6)/1e6;
  log('display '+op+' '+n+' = '+displayContent);
  openDisplay(); paintDisplay();
}

const Display={
  async execDisplay(it,r){
    if(!it.input){ log('Display skipped — no input attached'); await sleep(STEP,r); return; }
    displayContent = it.input==='TextInput'
      ? String(it.inputValue==null?'':it.inputValue)
      : (inputNumber(it,0)??0);
    log('display shows "'+displayContent+'"');
    openDisplay(); paintDisplay(); await sleep(STEP,r);
  },
  async execMath(op,it,r){ applyMath(op,it); await sleep(STEP,r); },
  async execClosed(it,r){
    displaySize='closed'; log('display closed'); paintDisplay(); await sleep(STEP,r);
  },
  async execMedium(it,r){
    displaySize='medium'; log('display medium'); paintDisplay(); await sleep(STEP,r);
  },
  async execFull(it,r){
    displaySize='full'; log('display full size'); paintDisplay(); await sleep(STEP,r);
  },
  async execBackground(it,r){
    const n=inputNumber(it,1);
    if(n==null) log('Display Background skipped — no input attached');
    else{
      displayBg=Math.max(0,Math.min(BG_COUNT,Math.round(n)));
      log('background '+displayBg+(bgUrl(displayBg)||displayBg===0?'':' — image not loaded yet'));
      openDisplay(); paintDisplay();
    }
    await sleep(STEP,r);
  }
};
```

- [ ] **Step 2: Remove the moved lines from `js/app.js`, keeping the `wireDisplayChrome();` call itself at the same place in the boot sequence** (it's a function invocation, not a declaration — it must still run once, from wherever it currently sits in app.js's top-level flow)

- [ ] **Step 3: Update script tags and helpers.js**

- [ ] **Step 4: Run tests — expect failure related to `broadcast is not defined` or `triggerKey`**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add js/blocks/display.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract virtual display logic into js/blocks/display.js"
```

---

### Task 8: Create `js/blocks/messaging.js`

**Files:**
- Create: `js/blocks/messaging.js`
- Modify: `js/app.js:915-943` (remove `sameMsg`/`broadcast`/`triggerKey` and the `keydown` listener that calls `triggerKey`)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/blocks/messaging.test.js`

**Interfaces:**
- Consumes: `stacks` (app.js model state), `runStack` (core.js), `itemEl` (core.js), `keyPressAnim` (app.js, dialog/animation helper — stays there), `log()` (app.js), `letterTarget`/`editing` (app.js dialog state, read to suppress key handling while a dialog is open).
- Produces: `sameMsg(a,b)`, `broadcast(msg)`, `triggerKey(letter)`.

- [ ] **Step 1: Create `js/blocks/messaging.js`**

```js
/* ================= Messaging (software-only — no hub feature) ================= */
/* messages match exactly on case, ignoring spaces around the edges */
const sameMsg=(a,b)=>String(a==null?'':a).trim()===String(b==null?'':b).trim();
function broadcast(msg){
  let n=0;
  stacks.forEach(st=>{
    const head=st.items[0];
    if(head&&head.t==='b'&&head.key==='StartOnMessageBlock'&&sameMsg(head.inputValue,msg)){
      n++; runStack(st);              /* not awaited: the sender carries straight on */
    }
  });
  log('message "'+String(msg).trim()+'" sent — '+n+' program'+(n===1?'':'s')+' started');
}
function triggerKey(letter){
  let n=0;
  stacks.forEach(st=>{
    const head=st.items[0];
    if(head&&head.t==='b'&&head.key==='StartOnKeyPressBlock'&&(head.letter||'A')===letter){
      n++; keyPressAnim(itemEl.get(head)); runStack(st);
    }
  });
  if(n) log('key "'+letter+'" pressed — '+n+' program'+(n===1?'':'s')+' started');
}
addEventListener('keydown',ev=>{
  if(letterTarget||editing) return;                       /* a dialog is open */
  const t=ev.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA')) return;
  const k=ev.key||'';
  if(k.length===1&&/[A-Za-z0-9]/.test(k)) triggerKey(k);   /* case-sensitive, like messages */
});
```

- [ ] **Step 2: Remove the moved lines from `js/app.js`**

- [ ] **Step 3: Update script tags and helpers.js** — this one has a real dependency: it uses `runStack`/`itemEl` (`core.js`) and `keyPressAnim`/`letterTarget`/`editing` (`app.js`, called only inside the `keydown` handler, i.e. at runtime, so load order relative to `app.js` doesn't matter — put it anywhere after `core.js`, e.g. right after `motion-sensor.js` for consistency with the input-block grouping)

- [ ] **Step 4: Run tests — expect failure related to `C_BUTTON`/hub-button wiring (Task 9)**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add js/blocks/messaging.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract messaging logic into js/blocks/messaging.js"
```

---

### Task 9: Create `js/telemetry/button-battery.js`

**Files:**
- Create: `js/telemetry/button-battery.js`
- Modify: `js/app.js:1872-1881` (the button + battery wiring inside `connect()`)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/telemetry/button-battery.test.js`

**Interfaces:**
- Consumes: nothing at load time.
- Produces: `Telemetry.wireButtonBattery(h, svc, server)` — an async function `connect()` calls after getting `svc`/`server`, replacing the two inline `try{...}catch{...}` blocks. Returns nothing; mutates `h.pressed`/`h.battery` and calls `renderHubs()`/`log()` exactly as the original inline code did.

- [ ] **Step 1: Create `js/telemetry/button-battery.js`**

```js
/* ================= Hub button + battery (standard GATT services,
   not covered by the WeDo2 IOType enum — these aren't attachable devices,
   they're the hub itself) ================= */
const C_BUTTON='00001526-1212-efde-1523-785feabcd123';

const Telemetry={
  async wireButtonBattery(h,svc,server){
    try{
      const bc=await svc.getCharacteristic(C_BUTTON);await bc.startNotifications();
      bc.addEventListener('characteristicvaluechanged',ev=>{
        h.pressed=ev.target.value.getUint8(0)===1;log('button '+(h.pressed?'DOWN':'up'));
        if(h.pressed) triggerButtonPress();
        renderHubs();
      });
      try{h.pressed=(await bc.readValue()).getUint8(0)===1;}catch(e){}
      log('button notifications on');
    }catch(e){log('button characteristic failed: '+e.message);}
    try{
      const bs=await server.getPrimaryService('battery_service');
      const bl=await bs.getCharacteristic('battery_level');
      h.battery=(await bl.readValue()).getUint8(0);await bl.startNotifications();
      bl.addEventListener('characteristicvaluechanged',ev=>{h.battery=ev.target.value.getUint8(0);renderHubs();});
    }catch(e){log('battery unavailable: '+e.message);}
  }
};
```

Note: `triggerButtonPress()` doesn't exist yet — it's added in Task 16 (Phase 2). Until then this file has a forward reference that's only exercised if a real button-press event fires, which none of the Phase 1 tests do (they test the extraction, not button-press behavior) — so the suite stays green. Task 16 defines it.

- [ ] **Step 2: Replace the two inline `try` blocks in `connect()` (js/app.js) with:**

```js
    await Telemetry.wireButtonBattery(h,svc,server);
```
(remove `C_BUTTON` from `js/app.js`'s own constant list at the top of the Bluetooth stage — it's now declared in `telemetry/button-battery.js`)

- [ ] **Step 3: Update script tags and helpers.js** (insert `js/telemetry/button-battery.js` anywhere after `core.js`, before `app.js` — it has no dependency on the other block files)

- [ ] **Step 4: Run the full test suite — expect all tests green again**

Run: `npm test`
Expected: PASS — this is the last Phase 1 extraction, so every function referenced across all the new files now exists. If anything still fails, it's a real regression from one of Tasks 1-9's manual line moves — bisect by re-running each task's individual test file (`node --test test/blocks/`) to find which extraction has the bug, fix it there, and re-run the full suite before continuing.

- [ ] **Step 5: Commit**

```bash
git add js/telemetry/button-battery.js js/app.js "WeDo CPE v1.0.html" test/helpers.js
git commit -m "Extract hub button/battery wiring into js/telemetry/button-battery.js"
```

---

## Phase 2: New features

### Task 10: Custom-block rendering fallback

**Files:**
- Modify: `js/app.js` (`blockEl` function)
- Modify: `css/style.css` (add `.custom-blk`/`.custom-label` rules)
- Test: `test/blocks/custom-block-render.test.js`

**Interfaces:**
- Consumes: `S[key].custom`/`.colour`/`.label` (set by `registerCustomBlock` in `core.js`, Task 1).
- Produces: `blockEl()` now renders a CSS block (colour fill + centred label) for any key registered via `registerCustomBlock`, in addition to its existing sprite-image rendering for every other key. No change to any existing block's rendering.

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("blockEl renders a CSS fallback block for a custom-registered key", async () => {
  const dom = await loadApp();
  const { window } = dom;
  window.eval(`registerCustomBlock('TestCustomBlock',{label:'Test',group:'Motor'});`);
  const el = window.eval(`blockEl('TestCustomBlock', 1, null)`);
  assert.equal(el.classList.contains("custom-blk"), true);
  assert.equal(el.querySelector(".custom-label").textContent, "Test");
  assert.equal(el.querySelector("img"), null);
});

test("blockEl still renders a real sprite block with an <img>", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const el = window.eval(`blockEl('MotorOffBlock', 1, null)`);
  assert.equal(el.classList.contains("custom-blk"), false);
  assert.notEqual(el.querySelector("img"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blocks/custom-block-render.test.js`
Expected: FAIL — `blockEl` doesn't check `.custom` yet, so the first test's `custom-blk` class assertion fails.

- [ ] **Step 3: Update `blockEl()` in `js/app.js`**

Change:
```js
function blockEl(key,s,label){
  const m=S[key],d=document.createElement('div');d.className='wrap blk';
  d.style.width=(m.w*s)+'px';d.style.height=(m.h*s)+'px';
  const i=document.createElement('img');i.src=m.d;
  i.style.width=(m.cw*s)+'px';i.style.height=(m.ch*s)+'px';
  i.style.left=(-m.x0*s)+'px';i.style.top=(-m.y0*s)+'px';
  d.appendChild(i);
```
to:
```js
function blockEl(key,s,label){
  const m=S[key],d=document.createElement('div');d.className='wrap blk';
  d.style.width=(m.w*s)+'px';d.style.height=(m.h*s)+'px';
  if(m.custom){
    d.classList.add('custom-blk');
    d.style.background=m.colour;
    d.style.borderRadius=Math.round(18*s)+'px';
    const t=document.createElement('div');t.className='custom-label';
    t.style.fontSize=Math.round(m.h*0.22*s)+'px';
    t.textContent=m.label;
    d.appendChild(t);
  }else{
    const i=document.createElement('img');i.src=m.d;
    i.style.width=(m.cw*s)+'px';i.style.height=(m.ch*s)+'px';
    i.style.left=(-m.x0*s)+'px';i.style.top=(-m.y0*s)+'px';
    d.appendChild(i);
  }
```
(the rest of the function — the `kletter`/`ival` overlay blocks — is unchanged, and still runs for custom blocks too, though none of Tasks 11/12/16's blocks use those overlays)

- [ ] **Step 4: Add CSS to `css/style.css`** (near the existing `.blk`/`.ival`/`.kletter` rules)

```css
.custom-blk{display:flex;align-items:center;justify-content:center;color:#fff;
  text-align:center;padding:0 10px;box-sizing:border-box;font-weight:600}
.blk.exec.custom-blk{filter:brightness(1.12)}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/blocks/custom-block-render.test.js`
Expected: PASS

- [ ] **Step 6: Run the full suite, then commit**

Run: `npm test`
```bash
git add js/app.js css/style.css test/blocks/custom-block-render.test.js
git commit -m "Add CSS fallback block rendering for blocks with no sprite art"
```

---

### Task 11: Piezo Tone Player (`PlayToneBlock`)

**Files:**
- Create: `js/blocks/piezo-tone-player.js`
- Modify: `js/app.js` (register the block's tap-to-open-dialog in `handleTap`/`openInputUI`, add a tone-picker dialog, add HTML for it — see Step 5)
- Modify: `js/blocks/core.js` (`execBlock` dispatcher gets a new case; `mkItem` gets a default-note/octave case; `SOCKETED`/`DEFAULT_INPUT`/`RAND_RANGE` gain a `PlayToneBlock` entry for its duration socket)
- Modify: `WeDo CPE v1.0.html`, `test/helpers.js`
- Test: `test/blocks/piezo-tone-player.test.js`

**Interfaces:**
- Consumes: `sendOut` (core.js), `log()` (app.js), `registerCustomBlock` (core.js).
- Produces: `PIEZO_NOTES` (note name -> semitone offset from A), `noteToFrequency(note,octave)`, `playTone(note,octave,durationMs)`, `stopTone()`, `PiezoTonePlayer` (`{execPlay(it,r)}`).

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("noteToFrequency matches equal-temperament A4=440Hz", async () => {
  const dom = await loadApp();
  const freq = dom.window.eval(`noteToFrequency('A',4)`);
  assert.ok(Math.abs(freq - 440) < 0.01);
});

test("noteToFrequency: C4 is below A4", async () => {
  const dom = await loadApp();
  const freq = dom.window.eval(`noteToFrequency('C',4)`);
  assert.ok(freq > 260 && freq < 262);   // C4 ~ 261.63 Hz
});

test("playTone writes the piezo play command with little-endian freq/duration", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`playTone('A', 4, 500)`);
  const bytes = sent[0];
  // port 5 (best-guess), command 0x02, len 4, freq=440 LE, duration=500 LE
  assert.equal(bytes[0], 5);
  assert.equal(bytes[1], 0x02);
  assert.equal(bytes[2], 4);
  assert.equal(bytes[3] | (bytes[4] << 8), 440);
  assert.equal(bytes[5] | (bytes[6] << 8), 500);
});

test("stopTone writes the piezo stop command", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`stopTone()`);
  assert.deepEqual(sent[0], [5, 0x03, 0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blocks/piezo-tone-player.test.js`
Expected: FAIL — `noteToFrequency is not defined`.

- [ ] **Step 3: Create `js/blocks/piezo-tone-player.js`**

```js
/* ================= Piezo Tone Player (hub IO type 22) =================
   NOT exposed by the real WeDo 2.0 app's own block set — this is new,
   implementing the capability the SDK exposes via play_note()/
   play_frequency()/stop_playing(). Port 5 is an UNVERIFIED guess (by
   analogy with the LED's port 6); needs confirming against real hardware.
   Command IDs (0x02 play, 0x03 stop) and the little-endian u16 frequency/
   duration payload are taken directly from the SDK's output_command.py. */
const PIEZO_PORT=5;                 /* unverified */
const PLAY_PIEZO_TONE_COMMAND_ID=0x02;
const STOP_PIEZO_TONE_COMMAND_ID=0x03;
const PIEZO_MAX_FREQUENCY=1500, PIEZO_MAX_DURATION_MS=65536;

/* semitone offset from A, matching the SDK's PiezoTonePlayerNote enum */
const PIEZO_NOTES={C:-9,'C#':-8,D:-7,'D#':-6,E:-5,F:-4,'F#':-3,G:-2,'G#':-1,A:0,'A#':1,B:2};

function noteToFrequency(note,octave){
  const halfSteps=(PIEZO_NOTES[note]||0)+(octave-4)*12;
  return 440*Math.pow(2,halfSteps/12);
}

async function playTone(note,octave,durationMs){
  const freq=Math.min(PIEZO_MAX_FREQUENCY,Math.round(noteToFrequency(note,octave)));
  const dur=Math.min(PIEZO_MAX_DURATION_MS,Math.round(durationMs));
  log('piezo -> '+note+octave+' ('+freq+'Hz) for '+dur+'ms');
  const bytes=new Uint8Array(7);
  bytes[0]=PIEZO_PORT; bytes[1]=PLAY_PIEZO_TONE_COMMAND_ID; bytes[2]=4;
  bytes[3]=freq&0xff; bytes[4]=(freq>>8)&0xff;
  bytes[5]=dur&0xff;  bytes[6]=(dur>>8)&0xff;
  return sendOut(bytes);
}
async function stopTone(){
  return sendOut([PIEZO_PORT,STOP_PIEZO_TONE_COMMAND_ID,0]);
}

const PiezoTonePlayer={
  async execPlay(it,r){
    const secs=inputNumber(it,1)??1;
    const note=it.note||'A', octave=it.octave||4;
    await playTone(note,octave,secs*1000);
    try{ await sleep(secs*1000,r); }
    finally{ if(r.stop) stopTone(); }
  }
};

registerCustomBlock('PlayToneBlock',{label:'♪ Tone',group:'Output'});
SOCKETED.add('PlayToneBlock');
DEFAULT_INPUT.PlayToneBlock=N('1');
RAND_RANGE.PlayToneBlock=[1,10];
```

Note the test's expectation of `sendOut([...])` being called with a plain array is satisfied because `sendOut` (core.js) does `new Uint8Array(bytes)` internally, so passing a `Uint8Array` here works identically — kept as `Uint8Array` for clarity of the byte-packing.

- [ ] **Step 4: Wire `mkItem`'s note/octave default and the `execBlock` case (`js/blocks/core.js`)**

In `mkItem`, next to the existing `if(k==='StartOnKeyPressBlock') it.letter='A';` line, add:
```js
  if(k==='PlayToneBlock'){ it.note='A'; it.octave=4; }
```
In `execBlock`'s switch, add a case (anywhere among the others):
```js
    case 'PlayToneBlock': await PiezoTonePlayer.execPlay(it,r); break;
```

- [ ] **Step 5: Add a tap-to-open tone picker dialog (`js/app.js`)**

This mirrors the existing speed/colour/sound dialogs. Add HTML for a `#tones` dialog next to the other dialog markup in `WeDo CPE v1.0.html` (same structure as `#speeds`, reusing its CSS classes — a grid of note buttons `C C# D D# E F F# G G# A A# B` times a small octave stepper 1-6), then in `js/app.js`:

```js
/* ---- piezo tone picker ---- */
const tnEl=()=>document.getElementById('tones');
let toneTarget=null;
const PIEZO_NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function openTonePicker(item){
  toneTarget=item;
  const g=document.getElementById('tngrid'); g.innerHTML='';
  PIEZO_NOTE_NAMES.forEach(n=>{
    const b=document.createElement('button');
    b.className='tntile'+(item&&item.note===n?' chosen':'');
    b.textContent=n;
    b.onclick=()=>{ toneTarget.note=n; log('tone note '+n+' chosen'); closeTonePicker(); render(); };
    g.appendChild(b);
  });
  const oc=document.getElementById('tnoctave');
  oc.value=item?item.octave:4;
  oc.oninput=()=>{ if(toneTarget) toneTarget.octave=Math.max(1,Math.min(6,Math.round(+oc.value)||4)); };
  tnEl().classList.add('open'); tnEl().classList.remove('armed');
  setTimeout(()=>{ if(tnEl().classList.contains('open')) tnEl().classList.add('armed'); },300);
}
function closeTonePicker(){
  tnEl().classList.remove('open'); tnEl().classList.remove('armed'); toneTarget=null; render();
}
document.getElementById('tnclose').onclick=closeTonePicker;
tnEl().onclick=e=>{ if(e.target===tnEl()) closeTonePicker(); };
```

Wire it into the existing tap-dispatch (`handleTap` and `openInputUI`), alongside the other block-specific dialogs:
```js
  if(tapped&&tapped.t==='b'&&tapped.key==='PlayToneBlock'){ openTonePicker(tapped); return; }
```
(added next to the existing `PlaySoundBlock`/`LightBlock`/`DisplayBackgroundBlock`/`MotorPowerBlock` lines in both `handleTap` and `openInputUI`)

- [ ] **Step 6: Update script tags and helpers.js** (insert `js/blocks/piezo-tone-player.js` after `js/blocks/rgb-light.js`, before `js/blocks/sound.js`)

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test test/blocks/piezo-tone-player.test.js` then `npm test`
Expected: PASS

- [ ] **Step 8: Update `docs/io-inventory-vs-wedo2-sdk.md`** — mark Piezo Tone Player as implemented, with a note that the port number is unverified.

- [ ] **Step 9: Add a `CHANGELOG.md` entry and commit**

```bash
git add js/blocks/piezo-tone-player.js js/blocks/core.js js/app.js "WeDo CPE v1.0.html" test/helpers.js test/blocks/piezo-tone-player.test.js docs/io-inventory-vs-wedo2-sdk.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Add Piezo Tone Player output (PlayToneBlock)

New block plays a note (picked via a tap dialog, like the existing
speed/colour/sound pickers) for a duration (the block's own numeric
socket, like every other timed block). Wire format taken from the
LEGO-WeDo-2.0-Python-SDK's output_command.py. The hub port (5) is an
unverified guess by analogy with the LED's port 6 — needs confirming
against real hardware.
EOF
)"
```

---

### Task 12: Motor brake (`MotorBrakeBlock`)

**Files:**
- Modify: `js/blocks/motor.js` (`motorRun` gains a `brake` flag path; new `Motor.execBrake`)
- Modify: `js/blocks/core.js` (`execBlock` case, `registerCustomBlock` call)
- Test: `test/blocks/motor.test.js` (extend)

**Interfaces:**
- Produces: `motorBrake()` (sends power byte 127 to both ports), `Motor.execBrake(it,r)`.

- [ ] **Step 1: Write the failing test**

```js
test("motorBrake sends power byte 127 to both ports", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`motorBrake()`);
  assert.deepEqual(sent[0], [1, 0x01, 0x01, 127]);
  assert.deepEqual(sent[1], [2, 0x01, 0x01, 127]);
});
```
(add this to `test/blocks/motor.test.js`, alongside whatever motor tests already exist from Task 4's extraction — if Task 4 didn't add a test file yet, create it now with this as the first test plus one covering `motorRun`'s existing behavior, e.g. asserting `motorRun(-50)` sends `256-50=206`)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blocks/motor.test.js`
Expected: FAIL — `motorBrake is not defined`.

- [ ] **Step 3: Add `motorBrake()` and `Motor.execBrake` to `js/blocks/motor.js`**

```js
/* the LEGO SDK's MOTOR_POWER_BRAKE constant: instant stop (vs. power 0,
   which drifts/coasts to a stop under inertia — MotorOffBlock's behavior) */
const MOTOR_POWER_BRAKE=127;
async function motorBrake(){
  const h=connectedHub();
  if(!h||!h.out){ log('motor brake: no hub connected — command skipped'); return false; }
  const pk=[new Uint8Array([1,0x01,0x01,MOTOR_POWER_BRAKE]),new Uint8Array([2,0x01,0x01,MOTOR_POWER_BRAKE])];
  try{ for(const d of pk) await writeOut(h.out,d,h); }
  catch(e){ log('motor brake write failed: '+e.message); return false; }
  log('motor -> brake');
  return true;
}
```
Add to the `Motor` object:
```js
  async execBrake(it,r){
    await motorBrake(); await sleep(STEP,r);
  }
```
At the bottom of the file:
```js
registerCustomBlock('MotorBrakeBlock',{label:'Brake',group:'Motor'});
```

- [ ] **Step 4: Add the `execBlock` case (`js/blocks/core.js`)**

```js
    case 'MotorBrakeBlock':    await Motor.execBrake(it,r); break;
```

- [ ] **Step 5: Run test to verify it passes, then the full suite**

Run: `node --test test/blocks/motor.test.js && npm test`
Expected: PASS

- [ ] **Step 6: Update `docs/io-inventory-vs-wedo2-sdk.md`, add `CHANGELOG.md` entry, commit**

```bash
git add js/blocks/motor.js js/blocks/core.js test/blocks/motor.test.js docs/io-inventory-vs-wedo2-sdk.md CHANGELOG.md
git commit -m "Add motor brake (MotorBrakeBlock) — instant stop vs. drift"
```

---

### Task 13: Motor power offset compensation

**Files:**
- Modify: `js/blocks/motor.js` (`motorRun`)
- Test: `test/blocks/motor.test.js` (extend)

No new block — this changes what `MotorOnForBlock`/existing power blocks actually send, per the SDK's `write_motor_power()`: remaps the 1-100 input range onto an actual 35-100 output range (below ~35% the real motor doesn't turn at all), so a program that sets "low power" is still guaranteed to move.

**Interfaces:** unchanged signature — `motorRun(power)` still takes -100..100, but the byte it sends is no longer that number verbatim.

- [ ] **Step 1: Write the failing test**

```js
test("motorRun compensates low power so it clears the motor's stall floor", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`motorRun(10)`);   // 10% requested
  // compensated: round(35 + (100-35)/100*10) = round(41.5) = 42
  assert.equal(sent[0][3], 42);
});

test("motorRun compensation preserves sign for negative power", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`motorRun(-10)`);
  assert.equal(sent[0][3], 256-42);   // same compensated magnitude, negative encoding
});

test("motorRun(0) still sends 0 (no floor applied when stopping)", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`motorRun(0)`);
  assert.equal(sent[0][3], 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blocks/motor.test.js`
Expected: FAIL — `motorRun(10)` currently sends `10`, not `42`.

- [ ] **Step 3: Update `motorRun` in `js/blocks/motor.js`**

```js
/* -100..100; negative is encoded as 256+value. Both ports are addressed so any
   attached motor responds, and both packets are dispatched before either is
   awaited so the motors start and stop together.
   Non-zero power is remapped from 1-100 onto 35-100 (MOTOR_POWER_OFFSET):
   measured on real hardware, the motor stalls below ~35%, so a program
   asking for "low power" would otherwise silently do nothing. Zero is left
   alone — that's a real stop, not "as slow as possible". */
const MOTOR_POWER_OFFSET=35;
async function motorRun(power){
  const h=connectedHub();
  if(!h||!h.out){ log('motor: no hub connected — command skipped'); return false; }
  const p=Math.max(-100,Math.min(100,Math.round(power)));
  const mag=Math.abs(p);
  const compensated = mag===0 ? 0
    : Math.round(MOTOR_POWER_OFFSET+((100-MOTOR_POWER_OFFSET)/100)*mag);
  const signed = p<0 ? -compensated : compensated;
  const b=signed<0?256+signed:signed;
  const pk=[new Uint8Array([1,0x01,0x01,b]),new Uint8Array([2,0x01,0x01,b])];
  const t0=(self.performance||Date).now();
  try{
    for(const d of pk) await writeOut(h.out,d,h);
  }catch(e){ log('motor write failed: '+e.message); return false; }
  log('motor -> '+p+'% (compensated '+signed+'%)  (both ports in '+
      Math.round((self.performance||Date).now()-t0)+'ms)');
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes, then the full suite**

Run: `node --test test/blocks/motor.test.js && npm test`
Expected: PASS. Note this also changes the earlier "negative power" test added in Task 4/12's own coverage (if one asserted the old uncompensated byte) — update any such assertion to the compensated value, following the same `round(35+(65/100)*mag)` formula.

- [ ] **Step 5: Update `docs/io-inventory-vs-wedo2-sdk.md`, add `CHANGELOG.md` entry, commit**

```bash
git add js/blocks/motor.js test/blocks/motor.test.js docs/io-inventory-vs-wedo2-sdk.md CHANGELOG.md
git commit -m "Compensate low motor power settings so they clear the stall floor"
```

---

### Task 14: RGB Light absolute (full-colour) mode

**Files:**
- Modify: `js/blocks/rgb-light.js` (`ledSetRGB`, mode-switch write, `RgbLight.execLight` custom-colour branch)
- Modify: `js/app.js` (extend the existing colour dialog with a "Custom…" tile + RGB sliders)
- Test: `test/blocks/rgb-light.test.js` (extend)

No new block — `LightBlock`'s existing colour-picker dialog gains a 12th "Custom…" tile. Picking it opens three sliders (R/G/B); the chosen colour is stored directly on the block item as `it.customRGB={r,g,b}` (the same pattern this app already uses for `StartOnKeyPressBlock.letter` — an extra property on the item, not a socket value), leaving `it.input`/`it.inputValue` as a display-only placeholder (`'RGB'`) so `execBlock`'s existing "no input attached" check still works unchanged.

**Interfaces:**
- Produces: `ledSetRGB(r,g,b)`, `RgbLight.execLight(it,r)` (extended to check `it.customRGB` first).

- [ ] **Step 1: Write the failing test**

```js
test("ledSetRGB writes the absolute-mode command with r/g/b bytes", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`ledSetRGB(255, 0, 128)`);
  // port 6, command 0x04, len 3, r,g,b
  assert.deepEqual(sent[0], [6, 0x04, 3, 255, 0, 128]);
});

test("RgbLight.execLight uses customRGB over the discrete index when both are set", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const sent = [];
  window.eval(`
    connectedHub = () => ({ out: {}, connected: true });
    writeOut = (c, data) => { sent.push([...data]); return Promise.resolve(); };
  `);
  await window.eval(`
    RgbLight.execLight({key:'LightBlock', input:'NumberInput', inputValue:'RGB',
                         customRGB:{r:10,g:20,b:30}}, {cancels:new Set()})
  `);
  assert.deepEqual(sent[0], [6, 0x04, 3, 10, 20, 30]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blocks/rgb-light.test.js`
Expected: FAIL — `ledSetRGB is not defined`.

- [ ] **Step 3: Extend `js/blocks/rgb-light.js`**

```js
/* Absolute (full-colour) mode: port 6, command 4 — same command as the
   discrete index write, just a 3-byte RGB payload instead of a 1-byte
   palette index. The hub distinguishes the two by payload length. */
async function ledSetRGB(r,g,b){
  const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
  const bytes=[6,0x04,3,clamp(r),clamp(g),clamp(b)];
  log('light -> rgb('+bytes[3]+','+bytes[4]+','+bytes[5]+')');
  return sendOut(bytes);
}
```
Update `RgbLight.execLight`:
```js
const RgbLight={
  async execLight(it,r){
    if(it.customRGB){
      await ledSetRGB(it.customRGB.r,it.customRGB.g,it.customRGB.b);
      await sleep(STEP,r); return;
    }
    const c=inputNumber(it,DEFAULT_COLOUR);
    if(c==null) log('Light skipped — no input attached');
    else await ledSet(c);
    await sleep(STEP,r);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/blocks/rgb-light.test.js`
Expected: PASS

- [ ] **Step 5: Add the "Custom…" tile + RGB sliders to the colour dialog (`js/app.js`)**

Add HTML for an RGB slider row to the `#colours` dialog markup in `WeDo CPE v1.0.html` (three `<input type="range" min="0" max="255">`, ids `rgbr`/`rgbg`/`rgbb`, plus an `#rgbapply` button, initially hidden — shown only when the "Custom…" tile is active), then in `js/app.js`:

```js
function buildColourList(){
  const g=document.getElementById('colgrid'); g.innerHTML='';
  const current=colourTarget?String(colourTarget.inputValue):null;
  for(let i=0;i<=10;i++){
    const d=document.createElement('div');
    d.className='srow'+(current===String(i)&&!(colourTarget&&colourTarget.customRGB)?' chosen':'');
    const pick=document.createElement('button'); pick.className='pick';
    pick.innerHTML='<b>'+i+'</b><span class="swatch'+(i===0?' off':'')+'" style="'+
      (i===0?'':'background:'+LED_HEX[i])+'"></span>'+LED_NAMES[i];
    pick.onclick=()=>chooseColour(i);
    const prev=document.createElement('button'); prev.className='prev';
    prev.title='Try it on the hub';
    prev.innerHTML='<svg viewBox="0 0 24 24"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';
    prev.onclick=e=>{ e.stopPropagation(); ledSet(i); };
    d.appendChild(pick); d.appendChild(prev); g.appendChild(d);
  }
  const custom=document.createElement('div');
  custom.className='srow'+(colourTarget&&colourTarget.customRGB?' chosen':'');
  const pick=document.createElement('button'); pick.className='pick';
  const rgb=colourTarget&&colourTarget.customRGB;
  pick.innerHTML='<b>—</b><span class="swatch" style="background:rgb('+
    (rgb?rgb.r+','+rgb.g+','+rgb.b:'0,255,255')+')"></span>Custom…';
  pick.onclick=()=>openRgbSliders();
  custom.appendChild(pick); g.appendChild(custom);
}
function openRgbSliders(){
  const rgb=(colourTarget&&colourTarget.customRGB)||{r:0,g:255,b:255};
  document.getElementById('rgbr').value=rgb.r;
  document.getElementById('rgbg').value=rgb.g;
  document.getElementById('rgbb').value=rgb.b;
  document.getElementById('rgbsliders').style.display='block';
}
document.getElementById('rgbapply').onclick=()=>{
  if(colourTarget){
    colourTarget.customRGB={
      r:+document.getElementById('rgbr').value,
      g:+document.getElementById('rgbg').value,
      b:+document.getElementById('rgbb').value
    };
    colourTarget.input='NumberInput'; colourTarget.inputValue='RGB';
    log('custom colour rgb('+colourTarget.customRGB.r+','+colourTarget.customRGB.g+','+
        colourTarget.customRGB.b+') chosen');
  }
  closeColourDialog(); render();
};
```
And update `chooseColour` to clear any previous `customRGB` when a discrete index is picked instead:
```js
function chooseColour(i){
  if(colourTarget){
    colourTarget.input='NumberInput';
    colourTarget.inputValue=String(i);
    delete colourTarget.customRGB;
    log('colour '+i+' ('+LED_NAMES[i]+') chosen');
  }
  closeColourDialog(); render();
}
```
And hide the slider panel whenever the dialog (re)opens on a block without `customRGB`, in `openColourDialog`:
```js
function openColourDialog(item){
  colourTarget=item||null;
  document.getElementById('rgbsliders').style.display='none';
  buildColourList();
  colEl().classList.add('open'); colEl().classList.remove('armed');
  setTimeout(()=>{ if(colEl().classList.contains('open')) colEl().classList.add('armed'); },300);
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (jsdom doesn't exercise the new dialog interactively unless a test targets it — the byte-level `ledSetRGB`/`execLight` tests from Steps 1-4 are what actually verify this feature; the dialog wiring is manual-verification territory like the rest of this app's UI, per `AGENTS.md`)

- [ ] **Step 7: Update `docs/io-inventory-vs-wedo2-sdk.md`, add `CHANGELOG.md` entry, commit**

```bash
git add js/blocks/rgb-light.js js/app.js "WeDo CPE v1.0.html" test/blocks/rgb-light.test.js docs/io-inventory-vs-wedo2-sdk.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Add RGB Light absolute (full-colour) mode via a "Custom…" tile

Extends the existing Light block colour dialog rather than adding a
new block: there's no sprite art for a second light block, and the
existing block/dialog already does everything needed except carry an
RGB triple, which is stored directly on the item (customRGB), the same
pattern already used for Start On Key Press's letter.
EOF
)"
```

---

### Task 15: Voltage/current telemetry

**Files:**
- Create: `js/telemetry/voltage-current.js`
- Modify: `js/app.js` (`connect()` calls the new wiring; hub panel gets two new readout rows)
- Modify: `WeDo CPE v1.0.html` (hub panel markup), `test/helpers.js`
- Test: `test/telemetry/voltage-current.test.js`

Per the design doc, this ships as read-only hub-panel telemetry (like the existing button/battery), not a new block — there's no clear "program" use case yet.

**Interfaces:**
- Produces: `Telemetry.wireVoltageCurrent(h, io)` — async, called from `connect()` after the I/O service is available. Sets `h.voltageMv`/`h.currentMa` and calls `renderHubs()` on updates.

- [ ] **Step 1: Write the failing test**

Call the function directly off `dom.window` rather than through `window.eval` with fake objects — `dom.window.Telemetry` is a real object reference once the script has loaded, and plain JS objects/functions passed as arguments cross into jsdom's realm fine, so no `eval` is needed for this call:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

test("wireVoltageCurrent configures both ports and stores readings from notifications", async () => {
  const dom = await loadApp();
  const writes = [];
  const fakeChar = (uuid) => ({
    uuid,
    writeValue: (d) => { writes.push([uuid, Array.from(new Uint8Array(d))]); return Promise.resolve(); },
    startNotifications: () => Promise.resolve(),
    addEventListener: () => {},
  });
  const io = { getCharacteristic: (u) => Promise.resolve(fakeChar(u)) };
  const h = {};
  await dom.window.Telemetry.wireVoltageCurrent(h, io);
  assert.ok(writes.length >= 2);   // voltage + current input-format configure writes
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/telemetry/voltage-current.test.js`
Expected: FAIL — `dom.window.Telemetry.wireVoltageCurrent is not a function`.

- [ ] **Step 3: Create `js/telemetry/voltage-current.js`**

`wireVoltageCurrent(h, io)` receives the whole I/O service object and looks up `C_INPUT`/`C_SENSOR` itself, the same way `connect()` already does for `h.inp`/`h.val` — matching what the Step 1 test's fake `io.getCharacteristic` stands in for.

```js
/* ================= Voltage (hub IO type 20) & Current (hub IO type 21) =================
   Both are hub-internal — not attachable devices, so they never go through
   the port-attach notification flow the way Tilt/Motion do. Instead they're
   configured once per connect, directly against their own fixed connect_id,
   same idea as the SDK's VoltageSensor/CurrentSensor classes (which write
   their input format in their own constructor). Ports 4 (voltage) and 3
   (current) are UNVERIFIED guesses by analogy with the LED's port 6 — needs
   confirming against real hardware. */
const VOLTAGE_PORT=4, CURRENT_PORT=3;   /* unverified */
const DEV_VOLTAGE=20, DEV_CURRENT=21;

Object.assign(Telemetry,{
  async wireVoltageCurrent(h,io){
    try{
      const c=await io.getCharacteristic(C_INPUT);
      const write=async(bytes)=>{
        const data=new Uint8Array(bytes);
        if(c.writeValueWithResponse) await c.writeValueWithResponse(data); else await c.writeValue(data);
      };
      await write(inputFormat(VOLTAGE_PORT,DEV_VOLTAGE,0,2));   /* mode 0, SI */
      await write(inputFormat(CURRENT_PORT,DEV_CURRENT,0,2));
    }catch(e){ log('voltage/current setup failed: '+e.message); }
    try{
      const val=await io.getCharacteristic(C_SENSOR);
      /* h.val (js/app.js's own sensor-value listener) already calls
         startNotifications() and adds its own listener — this adds a
         second listener on the same characteristic rather than replacing
         it, which the Web Bluetooth / EventTarget API supports directly */
      val.addEventListener('characteristicvaluechanged',ev=>{
        const buf=ev.target.value.buffer;
        const v=new Uint8Array(buf), dv=new DataView(buf);
        if(v.length<6) return;
        const port=v[1]!=null?v[1]:v[0], reading=dv.getFloat32(2,true);
        if(port===VOLTAGE_PORT){ h.voltageMv=reading; renderHubs(); }
        else if(port===CURRENT_PORT){ h.currentMa=reading; renderHubs(); }
      });
    }catch(e){ log('voltage/current notifications unavailable: '+e.message); }
  }
});
```

Note: `Telemetry` must already exist (from `js/telemetry/button-battery.js`, Task 9) — `Object.assign` extends it rather than redefining it, so load order just needs `button-battery.js` before `voltage-current.js` (both already load after `core.js`, before `app.js`).

- [ ] **Step 4: Wire it into `connect()` (`js/app.js`)**, right after the existing I/O-service block:

```js
    try{
      const io=await server.getPrimaryService(IO_SERVICE);
      h.out=await io.getCharacteristic(C_OUTPUT);
      h.inp=await io.getCharacteristic(C_INPUT);
      h.val=await io.getCharacteristic(C_SENSOR);
      await h.val.startNotifications();
      h.val.addEventListener('characteristicvaluechanged',onSensorValue);
      log('I/O characteristics ready');
      await Telemetry.wireVoltageCurrent(h,io);
    }catch(e){log('I/O service unavailable: '+e.message);}
```

- [ ] **Step 5: Add two readout rows to the hub panel (`WeDo CPE v1.0.html` + `renderHubs()` in `js/app.js`)**

In `renderHubs()`, extend the connected-hub row:
```js
    if(h.connected){
      const b=document.createElement('div');b.className='batt';
      b.textContent=(h.battery!=null?h.battery+'%':'--');r.appendChild(b);
      if(h.voltageMv!=null||h.currentMa!=null){
        const vc=document.createElement('div');vc.className='voltcur';
        vc.textContent=(h.voltageMv!=null?(h.voltageMv/1000).toFixed(2)+'V':'--')+' / '+
                        (h.currentMa!=null?h.currentMa.toFixed(0)+'mA':'--');
        r.appendChild(vc);
      }
      const k=document.createElement('button');k.className='kill';k.title='Disconnect';
```
Add a matching `.voltcur{font-size:11px;color:#8a97a3;margin:0 6px}` rule to `css/style.css` near the existing `.batt` rule.

- [ ] **Step 6: Run tests**

Run: `node --test test/telemetry/voltage-current.test.js && npm test`
Expected: PASS

- [ ] **Step 7: Update `docs/io-inventory-vs-wedo2-sdk.md`, add `CHANGELOG.md` entry, commit**

```bash
git add js/telemetry/voltage-current.js js/app.js "WeDo CPE v1.0.html" css/style.css test/helpers.js test/telemetry/voltage-current.test.js docs/io-inventory-vs-wedo2-sdk.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Add voltage/current sensor telemetry to the hub panel

Read-only for now (per the design doc — no clear program use case yet,
unlike the tilt/distance sensors which drive program logic). Ports 3/4
are unverified guesses, same caveat as the existing LED port.
EOF
)"
```

---

### Task 16: Hub button as a programmable block (`StartOnButtonPressBlock`)

**Files:**
- Modify: `js/blocks/messaging.js` (`triggerButtonPress`)
- Modify: `js/blocks/core.js` (`STARTS` set, `registerCustomBlock`)
- Modify: `js/app.js` (`handleTap` — tap-to-test, like `StartOnKeyPressBlock`)
- Test: `test/blocks/messaging.test.js` (extend)

**Interfaces:**
- Produces: `triggerButtonPress()` (runs every stack whose head is a `StartOnButtonPressBlock`, same shape as `triggerKey`).
- Consumes: called from `js/telemetry/button-battery.js`'s button-notification handler (Task 9 left a forward reference to this — resolved now) and from `js/app.js`'s `handleTap`.

- [ ] **Step 1: Write the failing test**

```js
test("triggerButtonPress runs stacks headed by StartOnButtonPressBlock", async () => {
  const dom = await loadApp();
  const { window } = dom;
  window.eval(`
    stacks = [{ id: 1, items: [{ t:'b', key:'StartOnButtonPressBlock', input:null }] }];
    var ran = false;
    runStack = (st) => { ran = true; };
  `);
  window.eval(`triggerButtonPress()`);
  assert.equal(window.eval(`ran`), true);
});

test("triggerButtonPress ignores stacks headed by something else", async () => {
  const dom = await loadApp();
  const { window } = dom;
  window.eval(`
    stacks = [{ id: 1, items: [{ t:'b', key:'StartBlock', input:null }] }];
    var ran = false;
    runStack = (st) => { ran = true; };
  `);
  window.eval(`triggerButtonPress()`);
  assert.equal(window.eval(`ran`), false);
});
```
(add to `test/blocks/messaging.test.js`, alongside whatever `broadcast`/`triggerKey` tests already exist from Task 8's extraction)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/blocks/messaging.test.js`
Expected: FAIL — `triggerButtonPress is not defined`.

- [ ] **Step 3: Add `triggerButtonPress` to `js/blocks/messaging.js`**

```js
function triggerButtonPress(){
  let n=0;
  stacks.forEach(st=>{
    const head=st.items[0];
    if(head&&head.t==='b'&&head.key==='StartOnButtonPressBlock'){
      n++; runStack(st);
    }
  });
  if(n) log('hub button pressed — '+n+' program'+(n===1?'':'s')+' started');
}
```
At the bottom of the same file:
```js
STARTS.add('StartOnButtonPressBlock');
registerCustomBlock('StartOnButtonPressBlock',{label:'Hub Button',group:'Flow'});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/blocks/messaging.test.js`
Expected: PASS

- [ ] **Step 5: Wire tap-to-test in `handleTap` (`js/app.js`)**

```js
  if(it.key==='StartBlock'){ runStack(ref.stack); }
  /* same path as a real key press, so every block with that letter runs */
  else if(it.key==='StartOnKeyPressBlock'){ triggerKey(it.letter||'A'); }
  else if(it.key==='StartOnButtonPressBlock'){ triggerButtonPress(); }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — this also confirms Task 9's forward reference in `js/telemetry/button-battery.js` (`if(h.pressed) triggerButtonPress();`) now resolves cleanly.

- [ ] **Step 7: Update `docs/io-inventory-vs-wedo2-sdk.md`, add `CHANGELOG.md` entry, commit**

```bash
git add js/blocks/messaging.js js/blocks/core.js js/app.js test/blocks/messaging.test.js docs/io-inventory-vs-wedo2-sdk.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Add hub button as a programmable block (StartOnButtonPressBlock)

Not an SDK gap — the button/battery GATT services aren't part of the
WeDo2 IOType enum at all — but the button was already being read for
the hub panel's telemetry (js/telemetry/button-battery.js), so wiring
it to a Start block reuses that instead of any new BLE traffic.
EOF
)"
```

---

## Final verification (after all 16 tasks)

- [ ] Run `npm test` one more time end to end — full green.
- [ ] Read through `docs/io-inventory-vs-wedo2-sdk.md` top to bottom and confirm all 5 shipped features are marked implemented, with the tilt-angle-mode/motion-count-mode items still explicitly marked out of scope.
- [ ] Confirm `CHANGELOG.md` has one dated entry per task (16 entries, or merged same-day entries per the project's existing style of numbering same-day entries `(2)`, `(3)`, etc.).
- [ ] Manually smoke-test in a real browser (`python3 -m http.server 8000`, open `http://localhost:8000/`) that the tray still renders all tabs, the new "♪ Tone", "Brake", and "Hub Button" blocks appear with their CSS fallback rendering and drag/drop normally, and the Light block's colour dialog shows the new "Custom…" tile — this app's Web Bluetooth paths still need real hardware to verify end to end, per `AGENTS.md`; say so plainly rather than claiming the hub-side behavior is confirmed.
