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
