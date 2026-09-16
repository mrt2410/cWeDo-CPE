/* ---- geometry measured from the original app ---- */
const BH=179,CAV_L=61,ARCH_TOP=61,ARCH_H=240,
      RP_L=105,RP_M0=105,RP_M1=205,RP_W=453,OVER=18,SNAP=75;
/* Repeat has two right caps. No input = infinite: rounded cap, nothing may follow.
   With an input = finite: the same cap cut off at a vertical edge, blocks may follow. */
const RP_CUT_FIN=426,
      CAV_R_INF=211, CAV_R_FIN=184,
      SOCK_INF=119.5, SOCK_FIN=92.5;

const scale=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cu'))/182;
const pscale=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pu'))/182;

/* ---- model ---- */
let stacks=[];            /* {id,x,y,items:[]} */
let uid=1;

/* ---- save / open (the board's program only — the custom recorded sound
   persists separately, see syncSensorMic/startRecording) ---- */
const PROGRAM_KEY='wedo:program';
const PROGRAM_FORMAT='wedo-cpe-program', PROGRAM_VERSION=1;
function serializeProgram(){
  return JSON.stringify({format:PROGRAM_FORMAT,version:PROGRAM_VERSION,stacks},null,2);
}
function applyProgram(data){
  if(!data||data.format!==PROGRAM_FORMAT||!Array.isArray(data.stacks))
    throw new Error('not a WeDo CPE program file');
  stacks=data.stacks;
  uid=1+stacks.reduce((m,st)=>Math.max(m,st.id||0),0);
}
let persistTimer=null;
function persistProgram(){
  clearTimeout(persistTimer);
  persistTimer=setTimeout(()=>{
    try{ localStorage.setItem(PROGRAM_KEY,serializeProgram()); }catch(e){}
  },250);
}
function restoreProgram(){
  try{
    const raw=localStorage.getItem(PROGRAM_KEY);
    if(raw) applyProgram(JSON.parse(raw));
  }catch(e){ /* corrupt or foreign data — start from an empty board instead of crashing */ }
}
/* ---- element factories ---- */
const FIELD={x:12,y:33,w:158,h:60};   /* white value field inside an input sprite */
const KEYCAP={x:86,y:44,w:58,h:50};   /* the face of the key, which has an A printed on it */
const EDITABLE=['NumberInput','TextInput'];

function blockEl(key,s,label){
  const m=S[key],d=document.createElement('div');d.className='wrap blk';
  d.style.width=(m.w*s)+'px';d.style.height=(m.h*s)+'px';
  const i=document.createElement('img');i.src=m.d;
  i.style.width=(m.cw*s)+'px';i.style.height=(m.ch*s)+'px';
  i.style.left=(-m.x0*s)+'px';i.style.top=(-m.y0*s)+'px';
  d.appendChild(i);
  if(label!=null&&key==='StartOnKeyPressBlock'){
    const t=document.createElement('div'); t.className='kletter';
    t.style.left=(KEYCAP.x*s)+'px'; t.style.top=(KEYCAP.y*s)+'px';
    t.style.width=(KEYCAP.w*s)+'px'; t.style.height=(KEYCAP.h*s)+'px';
    t.style.fontSize=(Math.round(KEYCAP.h*0.74)*s)+'px';
    t.textContent=String(label);
    d.appendChild(t);
  }
  if(label!=null&&EDITABLE.indexOf(key)>=0){
    const t=document.createElement('div');t.className='ival';
    t.style.left=(FIELD.x*s)+'px'; t.style.top=(FIELD.y*s)+'px';
    t.style.width=(FIELD.w*s)+'px'; t.style.height=(FIELD.h*s)+'px';
    t.style.fontSize=(Math.round(FIELD.h*0.62)*s)+'px';
    t.textContent=String(label);
    d.appendChild(t);
  }
  return d;
}

/* an input lives either in a socket (on its parent) or loose on the canvas */
const inputKeyOf=h => h.t==='i'?h.key:h.input;
const inputValOf=h => h.t==='i'?h.value:h.inputValue;
function setInputVal(h,v){ if(h.t==='i') h.value=v; else h.inputValue=v; }
function archEl(contentW,s,finite){
  const m=S.RepeatBlock,capEnd=finite?RP_CUT_FIN:RP_W,capW=capEnd-RP_M1,
        total=contentW+(CAV_L+(finite?CAV_R_FIN:CAV_R_INF))*s,
        midW=total-(RP_L+capW)*s;
  const box=document.createElement('div');box.className='wrap blk';
  box.style.width=total+'px';box.style.height=(ARCH_H*s)+'px';
  const sl=(x,w,dw,off)=>{const c=document.createElement('div');
    c.style.cssText='position:absolute;top:0;overflow:hidden;height:'+(ARCH_H*s)+'px;left:'+x+'px;width:'+w+'px';
    const i=document.createElement('img');i.src=m.d;
    i.style.cssText='position:absolute;top:0;height:'+(ARCH_H*s)+'px;width:'+dw+'px;left:'+off+'px';
    c.appendChild(i);box.appendChild(c);};
  sl(0,RP_L*s,RP_W*s,0);
  const k=midW/((RP_M1-RP_M0)*s);
  sl(RP_L*s,midW,RP_W*s*k,-RP_M0*s*k);
  sl(RP_L*s+midW,capW*s,RP_W*s,-RP_M1*s);
  return box;
}

/* ---- layout: renders a sequence, collects snap anchors ---- */
function buildSeq(items,x,y,s,ctx,stack,inLoop){
  /* an input sitting loose on the canvas is not a link in a chain —
     code blocks must not be able to snap onto it */
  let w=0,sealed=items.some(it=>it.t==='i');
  const at=(el,px,py,ref)=>{el.style.left=px+'px';el.style.top=py+'px';
    if(ref) el.__ref=ref;
    if(ref&&ref.type==='item'&&ctx.map) ctx.map.set(ref.arr[ref.index],el);
    ctx.el.appendChild(el);};
  items.forEach((it,idx)=>{
    if(ctx.anchors&&!sealed) ctx.anchors.push({kind:'seq',arr:items,index:idx,x:x+w,y:y,stack,inLoop:!!inLoop});
    if(it.t==='r'){
      const probe={el:document.createDocumentFragment(),anchors:null};
      const inner=buildSeq(it.children,0,0,s,probe,stack,true);
      const childW=Math.max(inner,S.MotorOffBlock.w*s);
      const fin=!!it.input;
      const aw=childW+(CAV_L+(fin?CAV_R_FIN:CAV_R_INF))*s;
      at(archEl(childW,s,fin),x+w,y-ARCH_TOP*s,{type:'item',arr:items,index:idx,stack});
      buildSeq(it.children,x+w+CAV_L*s,y,s,ctx,stack,true);
      const sx=x+w+aw-(fin?SOCK_FIN:SOCK_INF)*s;
      if(ctx.anchors) ctx.anchors.push({kind:'socket',item:it,x:sx,y:y+BH*s});
      if(it.input) at(blockEl(it.input,s,it.inputValue),sx-S[it.input].w*s/2,y+(BH-OVER)*s,
                      {type:'input',item:it,arr:items,index:idx,stack});
      if(!fin) sealed=true;
      w+=aw;
    } else if(it.t==='i'){
      at(blockEl(it.key,s,it.value),x+w,y,{type:'item',arr:items,index:idx,stack});
      w+=S[it.key].w*s;
    } else {
      const m=S[it.key];
      at(blockEl(it.key,s,it.letter),x+w,y+(BH-m.h)*s,{type:'item',arr:items,index:idx,stack});
      if(SOCKETED.has(it.key)){
        const sx=x+w+m.w*s/2;
        if(ctx.anchors) ctx.anchors.push({kind:'socket',item:it,x:sx,y:y+BH*s});
        if(it.input) at(blockEl(it.input,s,it.inputValue),sx-S[it.input].w*s/2,y+(BH-OVER)*s,
                        {type:'input',item:it,stack});
      }
      w+=m.w*s;
    }
  });
  if(ctx.anchors&&!sealed) ctx.anchors.push({kind:'seq',arr:items,index:items.length,x:x+w,y:y,stack,inLoop:!!inLoop});
  return w;
}

/* Tilt/Motion sensor logic (port dispatch, event bus, execution engine) moved
   to js/blocks/core.js. The per-device tilt/distance state and condition
   logic itself moves to js/blocks/tilt-sensor.js / motion-sensor.js in
   Tasks 2/3. STATE_KEYS is defined in tilt-sensor.js. */

/* Execution engine (STEP/mark/sleep/until/waitForInput/loopCount/runBody/
   execRepeat/execSeq/runStack/stopStack/stopAll/haltEverything/updateStop)
   moved to js/blocks/core.js. */
/* ---- display area wiring (see js/blocks/display.js) ---- */
wireDisplayChrome();

/* inputNumber/writeOut/sendOut moved to js/blocks/core.js. */

/* execBlock/runBody/execRepeat/execSeq moved to js/blocks/core.js. Note: the
   per-block behaviour that used to live in execBlock's switch (motor state,
   display, light, wait-for dispatch) is NOT preserved here — core.js's new
   execBlock is a dispatcher that calls into per-device namespaces (Motor.*,
   Display.*, RgbLight.*) which Tasks 4-8 create with their own logic. */
/* sameMsg/broadcast/triggerKey and the keydown listener moved to
   js/blocks/messaging.js. */

/* runStack/stopStack/stopAll/haltEverything/updateStop moved to
   js/blocks/core.js. */

let anchors=[], ejectAnim=null;

/* Where an ejected input should land: down and to the side, and not on top of
   something that is already there. */
function occupiedRects(){
  const sheet=document.getElementById('sheet');
  return Array.prototype.map.call(sheet.querySelectorAll('.wrap'),
    e=>({x:e.offsetLeft,y:e.offsetTop,w:e.offsetWidth,h:e.offsetHeight}));
}
function overlapFrac(a,b){
  const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  if(!ix||!iy) return 0;
  return (ix*iy)/Math.min(a.w*a.h, b.w*b.h);   /* 90% of the smaller block counts */
}
function findFreeSpot(base,w,h,s){
  const stepX=w*0.62, stepY=h+16*s;
  const tries=[[stepX,stepY],[-stepX,stepY],[stepX*2,stepY],[-stepX*2,stepY],
               [stepX,stepY*2],[-stepX,stepY*2],[stepX*2,stepY*2],[-stepX*2,stepY*2],
               [0,stepY*2],[stepX*3,stepY],[0,stepY*3]];
  const rects=occupiedRects();
  for(let i=0;i<tries.length;i++){
    const cand={x:base.x+tries[i][0], y:base.y+tries[i][1], w:w, h:h};
    if(cand.x<6||cand.y<6) continue;
    let worst=0;
    for(let k=0;k<rects.length;k++) worst=Math.max(worst,overlapFrac(cand,rects[k]));
    if(worst<0.9) return cand;
  }
  return {x:base.x+tries[0][0], y:base.y+tries[0][1]};
}

function render(){
  persistProgram();
  const sheet=document.getElementById('sheet');
  [...sheet.querySelectorAll('.wrap')].forEach(e=>e.remove());
  const s=scale();
  anchors=[];
  itemEl=new Map();
  const ctx={el:sheet,anchors,map:itemEl};
  /* stack positions are held unscaled; multiplying here keeps the gaps between
     programs in proportion to the blocks at every zoom level */
  stacks.forEach(st=>buildSeq(st.items,st.x*s,st.y*s,s,ctx,st));
  document.getElementById('empty').style.display=stacks.length?'none':'block';
  highlighted.forEach(it=>{const e=itemEl.get(it);if(e)e.classList.add('exec');});
  syncSensorMic();
  if(ejectAnim){
    const e=itemEl.get(ejectAnim.item);
    if(e){
      e.style.setProperty('--dx',ejectAnim.dx+'px');
      e.style.setProperty('--dy',ejectAnim.dy+'px');
      e.classList.add('ejecting');
    }
    ejectAnim=null;
  }
}

/* ---- palette ---- */
/* each tab is tinted like the blocks it holds; TAB_COLOUR is now in
   js/blocks/core.js since registerCustomBlock() also needs it */
let activeTab=0;
function drawTray(){
  const tabs=document.getElementById('traytabs'); tabs.innerHTML='';
  ORDER.forEach(([g],i)=>{
    const b=document.createElement('button');
    b.className='tab'+(i===activeTab?' on':'');
    b.textContent=g;
    b.style.color=TAB_COLOUR[g]||'#5b6b7a';
    b.onclick=()=>{ activeTab=i; drawTray(); };
    tabs.appendChild(b);
  });
  const tray=document.getElementById('tray'); tray.innerHTML='';
  const s=pscale();
  const d=document.createElement('div'); d.className='grp';
  /* fixed to the tallest block there is — the repeat arch — so the toolbar
     does not change height as you move between tabs */
  d.style.height=(ARCH_H*s)+'px';
  ORDER[activeTab][1].forEach(([key,label])=>{
    const h=document.createElement('div');h.className='pitem';h.title=label;h.dataset.key=key;
    const e=key==='RepeatBlock'?archEl(S.MotorOffBlock.w*s,s,false):blockEl(key,s);
    e.style.position='relative';h.appendChild(e);d.appendChild(h);
  });
  tray.appendChild(d);
  tray.scrollLeft=0;
}

/* ---- coordinate helpers ---- */
const stageEl=()=>document.getElementById('stage');
function toSheet(clientX,clientY){
  const r=stageEl().getBoundingClientRect();
  return {x:clientX-r.left+stageEl().scrollLeft, y:clientY-r.top+stageEl().scrollTop};
}

/* ---- dragging ---- */
let drag=null;   /* {payload,grabX,grabY,w,h} */
const ghost=document.getElementById('ghost'),
      caret=document.getElementById('caret'),
      ring=document.getElementById('ring'),
      band=document.getElementById('band');

/* a bare loop dragged over a run of blocks swallows them instead of being refused */
function isBareLoop(p){
  return p.kind==='chain'&&p.items.length===1&&p.items[0].t==='r'
         &&p.items[0].children.length===0;
}
const wrapsAt=(p,a)=>isBareLoop(p)&&a.kind==='seq'&&a.index<a.arr.length;

function ghostFor(payload,s){
  ghost.innerHTML='';
  const holder=document.createElement('div');
  holder.style.cssText='position:relative';
  if(payload.kind==='input'){
    const e=blockEl(payload.key,s,payload.value);e.style.position='relative';holder.appendChild(e);
    ghost.appendChild(holder);return {w:S[payload.key].w*s,h:S[payload.key].h*s};
  }
  const ctx={el:holder,anchors:null};
  const w=buildSeq(payload.items,0,ARCH_TOP*s,s,ctx,null);
  holder.style.width=w+'px';holder.style.height=(ARCH_H*s)+'px';
  ghost.appendChild(holder);
  return {w,h:BH*s};
}

function startDrag(payload,ev,grabX,grabY){
  const s=scale();
  const g=ghostFor(payload,s);
  drag={payload,grabX,grabY,w:g.w,h:g.h};
  moveGhost(ev.clientX,ev.clientY);
  ghost.style.display='block';
}
function moveGhost(cx,cy){
  ghost.style.transform='translate('+(cx-drag.grabX)+'px,'+(cy-drag.grabY-(drag.payload.kind==='input'?0:ARCH_TOP*scale()))+'px)';
}

function bestAnchor(){
  if(!drag) return null;
  const r=stageEl().getBoundingClientRect();
  const gx=lastX-drag.grabX-r.left+stageEl().scrollLeft;
  const gy=lastY-drag.grabY-r.top +stageEl().scrollTop;
  let best=null,bd=SNAP;
  anchors.forEach(a=>{
    if(drag.payload.kind==='input'){
      if(a.kind!=='socket') return;      /* an occupied socket is fine — the old one pops out */
      const parent=a.item.t==='r'?'RepeatBlock':a.item.key;
      if(!canAccept(parent,drag.payload.key)) return;
      const d=Math.hypot(a.x-(gx+drag.w/2), a.y-(gy+OVER*scale()));
      if(d<bd){bd=d;best=a;}
    } else {
      if(a.kind!=='seq') return;
      const first=drag.payload.items[0];
      if(a.inLoop&&drag.payload.items.some(it=>it.t==='r')) return;
      /* Nothing may ever sit after an infinite loop. Two ways that could happen:
         dropping past one that already exists, or dropping one in front of
         blocks that would then trail it. Both are refused here. */
      if(a.arr.slice(0,a.index).some(it=>it.t==='r'&&!it.input)) return;
      if(drag.payload.items.some(it=>it.t==='r'&&!it.input)&&a.index!==a.arr.length){
        /* an empty loop may still land here if it encloses the rest of the chain,
           since then nothing is left trailing it — but it can't swallow a loop */
        if(!(isBareLoop(drag.payload)&&!a.arr.slice(a.index).some(it=>it.t==='r'))) return;
      }
      const isStart=first.t==='b'&&STARTS.has(first.key);
      const arrIsTop=a.stack&&a.stack.items===a.arr;
      if(isStart&&(a.index!==0||!arrIsTop)) return;
      if(!isStart&&a.index===0&&a.arr[0]&&a.arr[0].t==='b'&&STARTS.has(a.arr[0].key)) return;
      /* Joining on the right lines the chain's LEFT edge up with the join.
         Joining on the left lines its RIGHT edge up instead, so measure both
         and take whichever the user is actually closer to. */
      let dx=Math.abs(a.x-gx);
      if(a.index<a.arr.length) dx=Math.min(dx,Math.abs(a.x-(gx+drag.w)));
      const d=Math.hypot(dx, a.y-gy);
      if(d<bd){bd=d;best=a;}
    }
  });
  return best;
}
function showIndicator(a){
  const s=scale();
  caret.style.display=ring.style.display=band.style.display='none';
  if(!a) return;
  if(drag&&wrapsAt(drag.payload,a)){
    const endA=anchors.find(z=>z.kind==='seq'&&z.arr===a.arr&&z.index===a.arr.length);
    const endX=endA?endA.x:a.x+S.MotorOffBlock.w*s;
    band.style.display='block';
    band.style.left=(a.x-8)+'px';band.style.top=(a.y-ARCH_TOP*s)+'px';
    band.style.width=(endX-a.x+16)+'px';band.style.height=(ARCH_H*s)+'px';
    return;
  }
  if(a.kind==='seq'){
    caret.style.display='block';
    caret.style.left=(a.x-4)+'px';caret.style.top=(a.y-6)+'px';
    caret.style.width='8px';caret.style.height=(BH*s+12)+'px';
  } else {
    const w=S.NumberInput.w*s,h=S.NumberInput.h*s;
    ring.style.display='block';
    ring.classList.toggle('replace',!!a.item.input);
    ring.style.left=(a.x-w/2)+'px';ring.style.top=(a.y-OVER*s)+'px';
    ring.style.width=w+'px';ring.style.height=h+'px';
  }
}

let lastX=0,lastY=0;
let pending=null;
addEventListener('pointerdown',ev=>{
  if(ev.button!==undefined&&ev.button!==0) return;
  const pit=ev.target.closest('.pitem');
  if(pit){
    /* no preventDefault here: a sideways swipe must reach the tray as a scroll.
       The block is only lifted once the finger moves upward (see pointermove). */
    pending={from:'tray',key:pit.dataset.key,rect:pit.getBoundingClientRect(),
             sx:ev.clientX,sy:ev.clientY,pt:ev.pointerType,t0:Date.now()};
    lastX=ev.clientX;lastY=ev.clientY;return;
  }
  const el=ev.target.closest('.blk');
  if(el&&el.__ref&&document.getElementById('sheet').contains(el)){
    pending={from:'sheet',el,ref:el.__ref,rect:el.getBoundingClientRect(),
             sx:ev.clientX,sy:ev.clientY,pt:ev.pointerType,t0:Date.now()};
    pending.hold=setTimeout(holdFired,600);
    lastX=ev.clientX;lastY=ev.clientY;ev.preventDefault();
  }
},true);

/* A long press is ours — used to pick the key letter — so the browser's own
   context menu must not appear on top of it. Text areas keep theirs so the
   diagnostics log can still be selected and copied. */
addEventListener('contextmenu',ev=>{
  const t=ev.target;
  if(t&&t.closest&&t.closest('#diag')) return;   /* only the diagnostics log */
  ev.preventDefault();
});

const clearHold=p=>{ if(p&&p.hold){ clearTimeout(p.hold); p.hold=null; } };
/* a long press on a Start On Key Press block picks its letter */
function holdFired(){
  if(!pending||drag||pending.from!=='sheet') return;
  const ref=pending.ref;
  if(ref.type!=='item') return;
  const it=ref.arr[ref.index];
  if(it&&it.t==='b'&&it.key==='StartOnKeyPressBlock'){
    pending.consumed=true;
    openLetterPicker(it);
  }
}

/* a press only becomes a drag once the pointer travels far enough;
   a press that never travels is a tap, which is how programs are started */
function beginDrag(ev){
  const p=pending;pending=null;clearHold(p);
  if(p.from==='tray'){
    const key=p.key;
    const payload=INPUTS.has(key)
      ? {kind:'input',key,value:defaultValueFor(key)}
      : {kind:'chain',items:[mkItem(key)]};
    const s=scale(),ps=pscale(),k=s/ps,isArch=key==='RepeatBlock';
    startDrag(payload,ev,(p.sx-p.rect.left)*k,(p.sy-p.rect.top-(isArch?ARCH_TOP*ps:0))*k);
    return;
  }
  const ref=p.ref,r=p.rect,s=scale();
  if(ref.stack) stopStack(ref.stack);          /* editing a running program halts it */
  let payload,isArch=false,origin=null;
  if(ref.type==='input'){
    origin=ref.item;
    payload={kind:'input',key:ref.item.input,value:ref.item.inputValue};
    ref.item.input=null; ref.item.inputValue=undefined;
    if(ref.item.t==='r'&&ref.arr&&ref.index<ref.arr.length-1){
      const trailing=ref.arr.splice(ref.index+1);
      const st=ref.stack;
      stacks.push({id:uid++,x:(st?st.x:60)+40,
                   y:(st?st.y:100)+ARCH_H+70,items:trailing});
    }
  }else{
    const it0=ref.arr[ref.index];
    if(it0&&it0.t==='i'){
      ref.arr.splice(ref.index,1);
      payload={kind:'input',key:it0.key,value:it0.value};
    }else{
      isArch=!!(it0&&it0.t==='r');
      payload={kind:'chain',items:ref.arr.splice(ref.index)};
    }
    if(ref.stack&&ref.stack.items===ref.arr&&ref.arr.length===0)
      stacks=stacks.filter(x=>x!==ref.stack);
  }
  /* the drag must be live before re-rendering: render() decides what is on the
     canvas, and a block in mid-air only counts if the drag state already exists */
  startDrag(payload,ev,p.sx-r.left,p.sy-r.top-(isArch?ARCH_TOP*s:0));
  drag.origin=origin; drag.t0=p.t0; drag.sx=p.sx; drag.sy=p.sy;
  render();
}

function handleTap(p){
  if(p.from!=='sheet') return;
  const ref=p.ref;
  if(ref.type==='input'){ openInputUI(ref.item); return; }
  if(ref.type!=='item'||!ref.stack) return;
  const tapped=ref.arr[ref.index];
  if(tapped&&tapped.t==='i'){ openEditor(tapped); return; }
  if(tapped&&tapped.t==='b'&&tapped.key==='PlaySoundBlock'){ openSoundDialog(tapped); return; }
  if(tapped&&tapped.t==='b'&&tapped.key==='LightBlock'){ openColourDialog(tapped); return; }
  if(tapped&&tapped.t==='b'&&tapped.key==='DisplayBackgroundBlock'){ openBgPicker(tapped); return; }
  if(tapped&&tapped.t==='b'&&tapped.key==='MotorPowerBlock'){ openSpeedPicker(tapped); return; }
  if(ref.arr!==ref.stack.items||ref.index!==0) return;   /* only the head of a program */
  const it=ref.arr[0];
  if(!it||it.t!=='b') return;
  if(it.key==='StartBlock'){ runStack(ref.stack); }
  /* same path as a real key press, so every block with that letter runs */
  else if(it.key==='StartOnKeyPressBlock'){ triggerKey(it.letter||'A'); }
}
/* ---- editing an input's value ---- */
let editing=null, edBuf='';
const edEl=()=>document.getElementById('editor');
/* a Play Sound block's number is chosen from the list, not typed */
function openInputUI(holder){
  if(holder&&holder.t==='b'&&holder.key==='PlaySoundBlock'){ openSoundDialog(holder); return; }
  if(holder&&holder.t==='b'&&holder.key==='LightBlock'){ openColourDialog(holder); return; }
  if(holder&&holder.t==='b'&&holder.key==='DisplayBackgroundBlock'){ openBgPicker(holder); return; }
  if(holder&&holder.t==='b'&&holder.key==='MotorPowerBlock'){ openSpeedPicker(holder); return; }
  openEditor(holder);
}
function openEditor(holder){
  const key=inputKeyOf(holder);
  if(EDITABLE.indexOf(key)<0) return;      /* random, display and sensor plugs aren't typed */
  editing=holder;
  const isNum=key==='NumberInput';
  edBuf=String(inputValOf(holder)??'');
  document.getElementById('edtitle').textContent=isNum?'Number':'Text';
  document.getElementById('edview').style.display=isNum?'flex':'none';
  document.getElementById('edpad').style.display=isNum?'grid':'none';
  const ti=document.getElementById('edtext');
  ti.style.display=isNum?'none':'block';
  if(isNum) drawPad(); else { ti.value=edBuf; setTimeout(()=>ti.focus(),320); }
  paintView();
  edEl().classList.add('open');
  edEl().classList.remove('armed');
  setTimeout(()=>{ if(editing) edEl().classList.add('armed'); },300);
}
function paintView(){ document.getElementById('edview').textContent=edBuf===''?'0':edBuf; }
function drawPad(){
  const pad=document.getElementById('edpad'); pad.innerHTML='';
  ['1','2','3','4','5','6','7','8','9','.','0','⌫'].forEach(lab=>{
    const b=document.createElement('button'); b.textContent=lab;
    b.onclick=()=>{
      if(lab==='⌫') edBuf=edBuf.slice(0,-1);
      else if(lab==='.'){ if(edBuf.indexOf('.')<0) edBuf=(edBuf||'0')+'.'; }
      else edBuf=(edBuf==='0'?'':edBuf)+lab;
      paintView();
    };
    pad.appendChild(b);
  });
}
function closeEditor(save){
  if(save&&editing){
    const key=inputKeyOf(editing);
    const v=key==='NumberInput'
      ? (edBuf===''?'0':edBuf)
      : document.getElementById('edtext').value;
    setInputVal(editing,v);
  }
  editing=null; edEl().classList.remove('open'); edEl().classList.remove('armed'); render();
}
document.getElementById('edok').onclick=()=>closeEditor(true);
document.getElementById('edcancel').onclick=()=>closeEditor(false);
edEl().onclick=e=>{ if(e.target===edEl()) closeEditor(false); };

/* ---- sound dialog ---- */
/* ---- motor speed picker ---- */
const spEl=()=>document.getElementById('speeds');
let speedTarget=null;
function openSpeedPicker(item){
  speedTarget=item;
  const g=document.getElementById('spgrid'); g.innerHTML='';
  const cur=String(item?item.inputValue:'');
  for(let i=0;i<=10;i++){
    const b=document.createElement('button');
    b.className='sptile'+(cur===String(i)?' chosen':'');
    b.textContent=i;
    b.onclick=()=>chooseSpeed(i);
    g.appendChild(b);
  }
  spEl().classList.add('open'); spEl().classList.remove('armed');
  setTimeout(()=>{ if(spEl().classList.contains('open')) spEl().classList.add('armed'); },300);
}
function chooseSpeed(i){
  if(speedTarget){
    speedTarget.input='NumberInput'; speedTarget.inputValue=String(i);
    log('motor speed '+i+' ('+levelToPower(i)+'%) chosen');
  }
  closeSpeedPicker(); render();
}
function closeSpeedPicker(){
  spEl().classList.remove('open'); spEl().classList.remove('armed'); speedTarget=null;
}
document.getElementById('spclose').onclick=closeSpeedPicker;
spEl().onclick=e=>{ if(e.target===spEl()) closeSpeedPicker(); };

/* ---- background picker ---- */
const bgEl=()=>document.getElementById('backgrounds');
let bgTarget=null;
function openBgPicker(item){
  bgTarget=item;
  const g=document.getElementById('bggrid'); g.innerHTML='';
  const cur=String(item?item.inputValue:'');
  for(let i=0;i<=BG_COUNT;i++){
    const have=i===0||!!BG_THUMBS[String(i)];
    const b=document.createElement('button');
    b.className='bgtile'+(cur===String(i)?' chosen':'')+(have?'':' pending');
    if(i===0) b.innerHTML='<span class="none">no picture</span>';
    else if(have) b.innerHTML='<img src="data:image/webp;base64,'+BG_THUMBS[String(i)]+'" alt="">';
    else b.innerHTML='<span class="none">not loaded yet</span>';
    const n=document.createElement('span'); n.className='num'; n.textContent=i;
    b.appendChild(n);
    if(have) b.onclick=()=>chooseBg(i);
    g.appendChild(b);
  }
  bgEl().classList.add('open'); bgEl().classList.remove('armed');
  setTimeout(()=>{ if(bgEl().classList.contains('open')) bgEl().classList.add('armed'); },300);
}
function chooseBg(i){
  if(bgTarget){
    bgTarget.input='NumberInput'; bgTarget.inputValue=String(i);
    log('background '+i+' chosen');
  }
  closeBgPicker(); render();
}
function closeBgPicker(){
  bgEl().classList.remove('open'); bgEl().classList.remove('armed'); bgTarget=null;
}
document.getElementById('bgclose').onclick=closeBgPicker;
bgEl().onclick=e=>{ if(e.target===bgEl()) closeBgPicker(); };

/* ---- key letter picker ---- */
const ltEl=()=>document.getElementById('letters');
let letterTarget=null;
const KB_ROWS=[['1','2','3','4','5','6','7','8','9','0'],
               ['q','w','e','r','t','y','u','i','o','p'],
               ['a','s','d','f','g','h','j','k','l'],
               ['z','x','c','v','b','n','m']];
let ltShift=true;
function drawLetterKeys(){
  const g=document.getElementById('ltgrid'); g.innerHTML='';
  const cur=letterTarget?(letterTarget.letter||'A'):null;
  KB_ROWS.forEach((row,ri)=>{
    const r=document.createElement('div'); r.className='krow';
    if(ri===3){
      const sh=document.createElement('button');
      sh.className='kkey wide'+(ltShift?' on':'');
      sh.textContent='Shift';
      sh.onclick=()=>{ ltShift=!ltShift; drawLetterKeys(); };
      r.appendChild(sh);
    }
    row.forEach(ch=>{
      const label = ri===0 ? ch : (ltShift?ch.toUpperCase():ch);
      const b=document.createElement('button');
      b.className='kkey'+(label===cur?' chosen':'');
      b.textContent=label;
      b.onclick=()=>{ letterTarget.letter=label; log('start on key "'+label+'"');
                      closeLetterPicker(); render(); };
      r.appendChild(b);
    });
    g.appendChild(r);
  });
}
function openLetterPicker(item){
  letterTarget=item;
  const cur=item.letter||'A';
  ltShift = !/[a-z]/.test(cur);        /* open in the case already chosen */
  drawLetterKeys();
  ltEl().classList.add('open'); ltEl().classList.remove('armed');
  setTimeout(()=>{ if(ltEl().classList.contains('open')) ltEl().classList.add('armed'); },300);
}
function closeLetterPicker(){
  ltEl().classList.remove('open'); ltEl().classList.remove('armed'); letterTarget=null;
}
document.getElementById('ltclose').onclick=closeLetterPicker;
ltEl().onclick=e=>{ if(e.target===ltEl()) closeLetterPicker(); };

/* ---- colour picker ---- */
/* approximations of what the hub shows; the bulb button proves the real thing */
const LED_HEX=['#7c8892','#ff4fa3','#9b30d9','#1e54d6','#2fa8e8','#17c0b0',
               '#2fbf3f','#ffd21e','#ff8c1a','#e8322a','#ffffff'];
const colEl=()=>document.getElementById('colours');
let colourTarget=null;

function buildColourList(){
  const g=document.getElementById('colgrid'); g.innerHTML='';
  const current=colourTarget?String(colourTarget.inputValue):null;
  for(let i=0;i<=10;i++){
    const d=document.createElement('div');
    d.className='srow'+(current===String(i)?' chosen':'');
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
}
function chooseColour(i){
  if(colourTarget){
    colourTarget.input='NumberInput';
    colourTarget.inputValue=String(i);
    log('colour '+i+' ('+LED_NAMES[i]+') chosen');
  }
  closeColourDialog(); render();
}
function closeColourDialog(){
  colEl().classList.remove('open'); colEl().classList.remove('armed'); colourTarget=null;
}
function openColourDialog(item){
  colourTarget=item||null;
  buildColourList();
  colEl().classList.add('open'); colEl().classList.remove('armed');
  setTimeout(()=>{ if(colEl().classList.contains('open')) colEl().classList.add('armed'); },300);
}
document.getElementById('colclose').onclick=closeColourDialog;
colEl().onclick=e=>{ if(e.target===colEl()) closeColourDialog(); };

const sndEl=()=>document.getElementById('sounds');
let soundTarget=null;          /* the Play Sound block that opened the list */

function buildSoundList(){
  const g=document.getElementById('sndgrid'); g.innerHTML='';
  const current=soundTarget?String(soundTarget.inputValue):null;
  const row=(i,label,note)=>{
    const d=document.createElement('div');
    d.className='srow'+(current===String(i)?' chosen':'');
    const pick=document.createElement('button'); pick.className='pick';
    pick.innerHTML='<b>'+i+'</b>'+label+(note||'');
    pick.onclick=()=>chooseSound(i);
    const prev=document.createElement('button'); prev.className='prev';
    prev.title='Listen without choosing';
    prev.innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>';
    prev.onclick=e=>{ e.stopPropagation(); playSound(i); };
    d.appendChild(pick); d.appendChild(prev); g.appendChild(d);
  };
  row(0,'own recording', customSound?'':' <i>— none yet</i>');
  for(let i=1;i<=SOUND_NAMES.length;i++) row(i,soundName(i));
}
function chooseSound(i){
  if(soundTarget){
    soundTarget.input='NumberInput';      /* re-attach if the input was pulled off */
    soundTarget.inputValue=String(i);
    log('sound '+i+' ('+soundName(i)+') chosen');
  }
  closeSoundDialog();
  render();
}
function closeSoundDialog(){
  stopRecording();
  sndEl().classList.remove('open'); sndEl().classList.remove('armed');
  soundTarget=null;
}
function openSoundDialog(item){
  soundTarget=item||null;
  buildSoundList();
  paintSoundDialog();
  sndEl().classList.add('open'); sndEl().classList.remove('armed');
  setTimeout(()=>{ if(sndEl().classList.contains('open')) sndEl().classList.add('armed'); },300);
}
function paintSoundDialog(){
  const st=document.getElementById('sndstate');
  if(!st) return;
  st.textContent = recState==='recording' ? 'Recording… tap Stop when finished.'
                 : recState==='saving'    ? 'Saving…'
                 : customSound            ? 'Your sound: '+customSound.duration.toFixed(1)+'s'
                 : 'No recording yet.';
  document.getElementById('sndrec').disabled  = recState!=='idle';
  document.getElementById('sndstop').disabled = recState!=='recording';
  document.getElementById('sndrec').className = recState==='recording'?'rec':'';
  if(sndEl().classList.contains('open')) buildSoundList();   /* refresh row 0 after recording */
}
document.getElementById('sndrec').onclick=startRecording;
document.getElementById('sndstop').onclick=stopRecording;
document.getElementById('sndclose').onclick=closeSoundDialog;
sndEl().onclick=e=>{ if(e.target===sndEl()) closeSoundDialog(); };

function keyPressAnim(el){
  if(!el) return;
  el.classList.add('keypress','down');
  setTimeout(()=>el.classList.remove('down'),130);
  setTimeout(()=>el.classList.remove('keypress'),420);
}

const TRAY_LIFT=12;   /* how far up you must swipe to pull a block out of the tray */
/* Android's own touch slop is around 8 CSS px, so 6 is too tight for a finger:
   a tap with any roll in it became a drag and the block just snapped back. */
const slopFor=p => p.pt==='touch' ? 12 : 6;
addEventListener('pointermove',ev=>{
  if(pending&&!drag){
    const dx=ev.clientX-pending.sx, dy=ev.clientY-pending.sy, slop=slopFor(pending);
    if(pending.from==='tray'&&pending.pt==='touch'){
      /* touch only: a sideways swipe must reach the tray as a scroll, so the
         block is only lifted once the finger moves upward. A mouse has no
         competing scroll gesture here, so it uses the plain radial check below. */
      if(Math.abs(dx)>Math.abs(dy)){
        if(Math.abs(dx)>slop) pending=null;
        return;
      }
      if(dy>-TRAY_LIFT) return;             /* not lifted far enough yet */
      beginDrag(ev);
    }else{
      if(Math.hypot(dx,dy)<slop) return;
      beginDrag(ev);
    }
  }
  if(!drag) return;
  lastX=ev.clientX;lastY=ev.clientY;
  moveGhost(ev.clientX,ev.clientY);
  const tr=document.getElementById('tray').getBoundingClientRect();
  const overTray=ev.clientY>=tr.top;
  document.getElementById('tray').classList.toggle('over',overTray);
  showIndicator(overTray?null:bestAnchor());
});

function finishDrag(cx,cy){
  let tapped=null;
  const tr=document.getElementById('tray').getBoundingClientRect();
  const overTray=cy>=tr.top;
  const a=overTray?null:bestAnchor();
  if(!overTray){
    if(a&&drag.payload.kind==='input'){
      const oldKey=a.item.input, oldVal=a.item.inputValue;
      a.item.input=drag.payload.key; a.item.inputValue=drag.payload.value;
      if(oldKey&&oldKey!==drag.payload.key||(oldKey&&drag.origin!==a.item)){
        /* the one that was here falls out and stays on the canvas, value intact */
        const s=scale(), m=S[oldKey];
        const base={x:a.x-m.w*s/2, y:a.y-OVER*s};
        const spot=findFreeSpot(base, m.w*s, m.h*s, s);
        const item={t:'i',key:oldKey,value:oldVal};
        stacks.push({id:uid++, x:spot.x/s, y:spot.y/s, items:[item]});
        ejectAnim={item, dx:base.x-spot.x, dy:base.y-spot.y};
        log((oldVal!==undefined?'"'+oldVal+'" ':'')+'input pushed out of the socket');
      }
      /* picked up and put straight back, quickly and barely moved: that was a tap */
      if(drag.origin===a.item && Date.now()-drag.t0<400 &&
         Math.hypot(cx-drag.sx,cy-drag.sy)<28) tapped=a.item;
    }
    else if(a&&wrapsAt(drag.payload,a)){
      const loop=drag.payload.items[0];
      loop.children=a.arr.splice(a.index);   /* everything from here on moves inside */
      a.arr.push(loop);
    }
    else if(a) a.arr.splice(a.index,0,...drag.payload.items);
    else{
      const p=toSheet(cx-drag.grabX,cy-drag.grabY);
      const items=drag.payload.kind==='input'
        ? [{t:'i',key:drag.payload.key,value:drag.payload.value}]
        : drag.payload.items;
      const sc=scale();
      stacks.push({id:uid++,x:Math.max(10,p.x/sc),y:Math.max(10+ARCH_TOP,p.y/sc),items});
    }
  }
  ghost.style.display='none';ghost.innerHTML='';
  caret.style.display=ring.style.display=band.style.display='none';
  document.getElementById('tray').classList.remove('over');
  drag=null;pending=null;render();
  if(tapped) openInputUI(tapped);
}
addEventListener('pointerup',ev=>{
  if(pending&&!drag){
    const p=pending;pending=null;clearHold(p);
    if(!p.consumed) handleTap(p);
    return;
  }
  if(!drag){clearHold(pending);pending=null;return;}
  finishDrag(ev.clientX,ev.clientY);
});
/* the browser claiming the gesture as a scroll cancels the pointer */
addEventListener('pointercancel',()=>{
  clearHold(pending);
  if(!drag){pending=null;return;}
  finishDrag(lastX,lastY);
});

/* ---- zoom ---- */
let cu=118;
zin.onclick =()=>{cu=Math.min(190,cu+16);document.documentElement.style.setProperty('--cu',cu);render();};
zout.onclick=()=>{cu=Math.max(70,cu-16);document.documentElement.style.setProperty('--cu',cu);render();};
addEventListener('resize',()=>{drawTray();paintDisplay();});
addEventListener('load',()=>setTimeout(()=>splash.classList.add('gone'),900));
document.getElementById('stop').onclick=stopAll;

/* ---- save as / open ---- */
let bannerTimer=null;
function flashBanner(msg,ms=3000){
  const el=document.getElementById('banner');
  if(el.dataset.orig===undefined) el.dataset.orig=el.textContent;
  el.textContent=msg;
  clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>{ el.textContent=el.dataset.orig; },ms);
}
function defaultProgramName(){
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  return `wedo-program-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function openSaveAsDialog(){
  const el=document.getElementById('saveas');
  document.getElementById('saname').value=defaultProgramName();
  el.classList.add('open');
  setTimeout(()=>{ if(el.classList.contains('open')) el.classList.add('armed'); },300);
}
function closeSaveAsDialog(){
  const el=document.getElementById('saveas');
  el.classList.remove('open'); el.classList.remove('armed');
}
function downloadText(filename,text){
  const blob=new Blob([text],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function confirmSaveAs(){
  let name=document.getElementById('saname').value.trim()||defaultProgramName();
  if(!/\.wedo\.json$/i.test(name)) name+='.wedo.json';
  downloadText(name,serializeProgram());
  closeSaveAsDialog();
}
function handleOpenFile(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      applyProgram(JSON.parse(reader.result));
      persistProgram();render();
      flashBanner('Opened "'+file.name+'"');
    }catch(e){
      flashBanner('Could not open that file: '+e.message);
    }
  };
  reader.onerror=()=>flashBanner('Could not read that file.');
  reader.readAsText(file);
}
document.getElementById('saveasbtn').onclick=openSaveAsDialog;
document.getElementById('sacancel').onclick=closeSaveAsDialog;
document.getElementById('saok').onclick=confirmSaveAs;
document.getElementById('openbtn').onclick=()=>document.getElementById('openfile').click();
document.getElementById('openfile').onchange=e=>{
  const file=e.target.files[0];
  e.target.value='';   /* so choosing the same file again still fires 'change' */
  if(file) handleOpenFile(file);
};

restoreProgram();
restoreCustomSound();
drawTray();render();


/* ================= Stage 2: Bluetooth ================= */
const HUB_SERVICE='00001523-1212-efde-1523-785feabcd123';
const IO_SERVICE ='00004f0e-1212-efde-1523-785feabcd123';
const C_NAME='00001524-1212-efde-1523-785feabcd123';
const C_BUTTON='00001526-1212-efde-1523-785feabcd123';
const C_ATTACHED='00001527-1212-efde-1523-785feabcd123';
const C_INPUT   ='00001563-1212-efde-1523-785feabcd123';
const C_OUTPUT  ='00001565-1212-efde-1523-785feabcd123';
const C_SENSOR  ='00001560-1212-efde-1523-785feabcd123';
const listEl=document.getElementById('list'),diagEl=document.getElementById('diag'),
      hintEl=document.getElementById('hint'),refreshBtn=document.getElementById('refresh');
const hubs=new Map();let scanning=null,busy=false;
const connectedHub=()=>[...hubs.values()].find(h=>h.connected);
const logLines=[];

/* ---- remembering & auto-reconnecting to the last hub ---- */
const LAST_HUB_KEY='wedo:lastHub';
function rememberLastHub(id,name){
  try{ localStorage.setItem(LAST_HUB_KEY,JSON.stringify({id,name})); }catch(e){}
}
/* the actual GATT connect (device.gatt.connect(), services, characteristics)
   needs a real browser and real hardware to verify — this only handles
   finding the remembered device and retrying the connect attempt, so it's
   testable with fakes standing in for getDevices/connect/isConnected */
async function attemptAutoReconnect({getDevices,connect,isConnected,lastId,
                                      retries=10,delayMs=3000,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!lastId) return false;
  const devices=await getDevices();
  const device=devices.find(d=>d.id===lastId);
  if(!device) return false;
  for(let i=0;i<retries;i++){
    await connect(device);
    if(isConnected()) return true;
    if(i<retries-1) await wait(delayMs);
  }
  return false;
}
async function autoReconnect(){
  try{
    const cap=capabilities();
    if(!cap.secure){ log('auto-reconnect skipped: not a secure context'); return; }
    if(!cap.bt){ log('auto-reconnect skipped: Web Bluetooth not available'); return; }
    if(!navigator.bluetooth.getDevices){ log('auto-reconnect skipped: getDevices() not supported by this browser'); return; }
    if(connectedHub()) return;
    const raw=localStorage.getItem(LAST_HUB_KEY);
    if(!raw){ log('auto-reconnect: no remembered Smarthub'); return; }
    const {id,name}=JSON.parse(raw);
    if(!id) return;
    log('auto-reconnect: looking for '+(name||id)+'…');
    document.getElementById('hub').querySelector('.state').textContent=
      'Reconnecting'+(name?' to '+name:'')+'…';
    const ok=await attemptAutoReconnect({
      getDevices:()=>navigator.bluetooth.getDevices(),
      connect,
      isConnected:()=>!!connectedHub(),
      lastId:id,
    });
    if(!ok){
      log('auto-reconnect: gave up on '+(name||id)+' — not found or not reachable');
      setHubWidget();
    }
  }catch(e){ log('auto-reconnect error: '+e.message); }
}
function log(m){
  const line=new Date().toLocaleTimeString()+'  '+m;
  logLines.push(line);
  const d=document.createElement('div');d.className='l';
  d.textContent=line;diagEl.appendChild(d);diagEl.scrollTop=diagEl.scrollHeight;
}
function envText(){
  return 'Secure context: '+isSecureContext+
       '\nWeb Bluetooth: '+(!!navigator.bluetooth)+
       '\nLive scanning: '+!!(navigator.bluetooth&&navigator.bluetooth.requestLEScan)+
       '\nOrigin: '+location.origin+
       '\nUser agent: '+navigator.userAgent;
}
async function copyLog(){
  const text=envText()+'\n\n'+logLines.join('\n');
  const btn=document.getElementById('copylog');
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    else{
      const ta=document.createElement('textarea');
      ta.value=text;ta.style.cssText='position:fixed;top:-1000px';
      document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
    }
    btn.textContent='Copied';
  }catch(e){ btn.textContent='Press and hold to select'; }
  setTimeout(()=>btn.textContent='Copy',1600);
}
function capabilities(){
  const secure=isSecureContext,bt=!!navigator.bluetooth,
        scan=!!(navigator.bluetooth&&navigator.bluetooth.requestLEScan);
  const head=document.createElement('div');
  head.innerHTML='<b>Environment</b><br>Secure context: '+(secure?'yes':'NO \u2014 Bluetooth blocked')+
    '<br>Web Bluetooth: '+(bt?'available':'NOT available')+
    '<br>Live scanning: '+(scan?'available':'not available \u2014 using Chrome\u2019s picker')+
    '<br>Origin: '+location.origin+'<hr style="border:none;border-top:1px solid #e6eaee">';
  head.dataset.head='1';
  if(diagEl.firstChild&&diagEl.firstChild.dataset&&diagEl.firstChild.dataset.head)
    diagEl.replaceChild(head,diagEl.firstChild); else diagEl.insertBefore(head,diagEl.firstChild);
  return {secure,bt,scan};
}
function renderHubs(){
  const conn=connectedHub();listEl.innerHTML='';
  refreshBtn.disabled=!!conn||busy;
  if(conn) hintEl.textContent='Only one Smarthub at a time. Disconnect this one to choose another.';
  if(hubs.size===0){const p=document.createElement('div');
    p.style.cssText='color:#a9b4bf;font-size:14px;padding:14px 6px';
    p.textContent='No Smarthubs yet. Switch the hub on, then press the search button below.';
    listEl.appendChild(p);return;}
  hubs.forEach(h=>{
    const r=document.createElement('div');let cls='row ';
    if(h.connected) cls+=h.pressed?'pressed':'connected';
    else if(conn) cls+='blocked'; else cls+=h.pressed?'pressed':'found';
    r.className=cls;
    r.innerHTML='<div class="hbrick"></div><div class="nm">'+(h.name||'Unnamed hub')+'</div>';
    if(h.connected){
      const b=document.createElement('div');b.className='batt';
      b.textContent=(h.battery!=null?h.battery+'%':'--');r.appendChild(b);
      const k=document.createElement('button');k.className='kill';k.title='Disconnect';
      k.innerHTML='<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      k.onclick=e=>{e.stopPropagation();disconnect(h);};r.appendChild(k);
    } else if(!conn){ r.onclick=()=>connect(h.device); }
    listEl.appendChild(r);
  });
}
function setHubWidget(){const on=connectedHub(),w=document.getElementById('hub');
  w.classList.toggle('on',!!on);w.querySelector('.state').textContent=on?on.name:'Not connected';}
async function connect(device){
  if(!device) return;
  if(connectedHub()){hintEl.textContent='Disconnect the current Smarthub first.';return;}
  if(busy) return; busy=true;renderHubs();
  try{
    log('connecting to '+(device.name||device.id)+' ...');
    const server=await device.gatt.connect();
    const svc=await server.getPrimaryService(HUB_SERVICE);
    let name=device.name;
    try{const c=await svc.getCharacteristic(C_NAME);
      name=new TextDecoder().decode(await c.readValue()).replace(/\0+$/,'');}catch(e){log('name read failed: '+e.message);}
    const h=hubs.get(device.id)||{device};
    h.device=device;h.name=name;h.connected=true;h.pressed=false;hubs.set(device.id,h);
    try{const bc=await svc.getCharacteristic(C_BUTTON);await bc.startNotifications();
      bc.addEventListener('characteristicvaluechanged',ev=>{
        h.pressed=ev.target.value.getUint8(0)===1;log('button '+(h.pressed?'DOWN':'up'));renderHubs();});
      try{h.pressed=(await bc.readValue()).getUint8(0)===1;}catch(e){}
      log('button notifications on');}catch(e){log('button characteristic failed: '+e.message);}
    try{const bs=await server.getPrimaryService('battery_service');
      const bl=await bs.getCharacteristic('battery_level');
      h.battery=(await bl.readValue()).getUint8(0);await bl.startNotifications();
      bl.addEventListener('characteristicvaluechanged',ev=>{h.battery=ev.target.value.getUint8(0);renderHubs();});
    }catch(e){log('battery unavailable: '+e.message);}
    clearSensors();
    try{
      const io=await server.getPrimaryService(IO_SERVICE);
      h.out=await io.getCharacteristic(C_OUTPUT);
      h.inp=await io.getCharacteristic(C_INPUT);
      h.val=await io.getCharacteristic(C_SENSOR);
      await h.val.startNotifications();
      h.val.addEventListener('characteristicvaluechanged',onSensorValue);
      log('I/O characteristics ready');
    }catch(e){log('I/O service unavailable: '+e.message);}
    try{const ac=await svc.getCharacteristic(C_ATTACHED);await ac.startNotifications();
      ac.addEventListener('characteristicvaluechanged',onPortEvent);
    }catch(e){log('attached-IO unavailable: '+e.message);}
    if(!h.wired){h.wired=true;
      device.addEventListener('gattserverdisconnected',()=>{
        h.connected=false;h.pressed=false;h.battery=null;h.out=null;h.inp=null;h.val=null;
        clearSensors();
        log('disconnected: '+(h.name||''));hintEl.textContent='';renderHubs();setHubWidget();});}
    rememberLastHub(device.id,name);
    log('connected to '+name);hintEl.textContent='';
  }catch(e){log('connect failed: '+e.message);hintEl.textContent='Could not connect: '+e.message;
    const h=hubs.get(device.id);if(h)h.connected=false;
  }finally{busy=false;renderHubs();setHubWidget();}
}
async function disconnect(h){
  haltEverything('hub disconnected');
  /* put the LED back before the link goes down, so the next person to pick this
     hub up doesn't find it still showing the last program's colour */
  try{ if(h.out) await ledSet(LED_IDLE); }
  catch(e){ log('could not reset the light: '+e.message); }
  try{if(h.device.gatt.connected)h.device.gatt.disconnect();log('disconnect requested');}
  catch(e){log('disconnect error: '+e.message);}
  h.connected=false;h.pressed=false;h.battery=null;h.out=null;h.inp=null;h.val=null;
  clearSensors();
  hintEl.textContent='';renderHubs();setHubWidget();
}
async function search(){
  if(connectedHub()){hintEl.textContent='Disconnect the current Smarthub first.';return;}
  const cap=capabilities();
  if(!cap.secure){hintEl.textContent='Serve this page over https:// or http://localhost.';return;}
  if(!cap.bt){hintEl.textContent='Web Bluetooth is not available in this browser.';return;}
  if(cap.scan) return liveScan();
  hintEl.textContent='Chrome will show its own list of nearby Smarthubs.';
  try{const device=await navigator.bluetooth.requestDevice({
      filters:[{services:[HUB_SERVICE]}],
      optionalServices:[IO_SERVICE,'battery_service','device_information']});
    if(!hubs.has(device.id))hubs.set(device.id,{device,name:device.name,connected:false,pressed:false});
    renderHubs();connect(device);
  }catch(e){log('picker cancelled/failed: '+e.message);hintEl.textContent='';}
}
async function liveScan(){
  if(scanning){scanning.stop();scanning=null;}
  hintEl.textContent='Scanning for Smarthubs\u2026';
  try{navigator.bluetooth.addEventListener('advertisementreceived',onAdvert);
    scanning=await navigator.bluetooth.requestLEScan({filters:[{services:[HUB_SERVICE]}],keepRepeatedDevices:true});
    log('live scan started');
    setTimeout(()=>{if(scanning){scanning.stop();scanning=null;log('scan stopped');
      hintEl.textContent='Scan finished. Press search to look again.';}},20000);
  }catch(e){log('requestLEScan failed: '+e.message);hintEl.textContent='Live scanning refused; using Chrome\u2019s picker.';}
}
function onAdvert(e){
  const h=hubs.get(e.device.id)||{device:e.device,connected:false,pressed:false};
  h.device=e.device;h.name=e.name||h.name||e.device.name;h.rssi=e.rssi;
  let dump='';
  e.manufacturerData&&e.manufacturerData.forEach((v,k)=>{dump+=' mfr'+k+'=['+[...new Uint8Array(v.buffer)].join(',')+']';});
  e.serviceData&&e.serviceData.forEach((v,k)=>{dump+=' svc'+String(k).slice(4,8)+'=['+[...new Uint8Array(v.buffer)].join(',')+']';});
  if(dump) log((h.name||e.device.id)+dump);
  hubs.set(e.device.id,h);renderHubs();
}
function openPanel(){
  panel.classList.add('open'); scrim.classList.add('open'); work.classList.add('dim');
  panel.setAttribute('aria-hidden','false'); capabilities(); renderHubs();
}
function closePanel(){
  panel.classList.remove('open'); scrim.classList.remove('open'); work.classList.remove('dim');
  panel.setAttribute('aria-hidden','true');
}
document.getElementById('hub').onclick=openPanel;
document.getElementById('close').onclick=closePanel;
document.getElementById('scrim').onclick=closePanel;   /* tapping the canvas closes it */
refreshBtn.onclick=search;
document.getElementById('diagtoggle').onclick=()=>document.getElementById('diagwrap').classList.toggle('closed');
document.getElementById('copylog').onclick=copyLog;
capabilities();renderHubs();
autoReconnect();
