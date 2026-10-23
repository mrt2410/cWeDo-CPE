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
