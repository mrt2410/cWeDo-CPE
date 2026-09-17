/* ================= RGB Light (hub IO type 23) =================
   Discrete mode: port 6, command 4, one byte, an index into the hub's own
   11-colour palette, not an RGB value.
   Absolute (full-colour) mode: same port/command, but a 3-byte RGB payload
   instead of a 1-byte palette index — the hub tells the two apart by
   payload length. */
const LED_NAMES=['off','pink','purple','blue','sky blue','teal',
                 'green','yellow','orange','red','white'];
const LED_IDLE=3;          /* what the hub shows when it is just sitting connected */
const DEFAULT_COLOUR=9;    /* placeholder until an input carries a value */

async function ledSet(idx){
  const i=Math.max(0,Math.min(10,Math.round(idx)));
  log('light -> '+i+' ('+LED_NAMES[i]+')');
  return sendOut([0x06,0x04,0x01,i]);
}

async function ledSetRGB(r,g,b){
  const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
  const bytes=[6,0x04,3,clamp(r),clamp(g),clamp(b)];
  log('light -> rgb('+bytes[3]+','+bytes[4]+','+bytes[5]+')');
  return sendOut(bytes);
}

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
