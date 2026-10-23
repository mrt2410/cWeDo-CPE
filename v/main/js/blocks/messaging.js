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
addEventListener('keydown',ev=>{
  if(letterTarget||editing) return;                       /* a dialog is open */
  const t=ev.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA')) return;
  const k=ev.key||'';
  if(k.length===1&&/[A-Za-z0-9]/.test(k)) triggerKey(k);   /* case-sensitive, like messages */
});
