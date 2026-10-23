/* ================= RGB Light (hub IO type 23) =================
   Discrete mode (mode 0): port 6, command 4, one byte, an index into the hub's
   own 11-colour palette, not an RGB value.
   Absolute (full-colour) mode (mode 1): same port/command, but a 3-byte RGB
   payload instead of a 1-byte palette index.

   Each command declares the mode it wants first, by writing an input format to
   the input characteristic — the same mechanism configurePort() uses to put a
   tilt/distance sensor into the mode it should report in. Declaring it every
   time means neither command depends on what mode the hub happens to be left
   in by the other.

   UNVERIFIED against real hardware — same caveat category as the piezo port
   and the voltage/current ports (see docs/io-inventory-vs-wedo2-sdk.md). Nobody
   has confirmed on a real hub whether the mode switch is actually required (the
   payload length alone may be enough to disambiguate), nor that 23/0/1 are the
   right type and mode bytes. It is written because the SDK's own device classes
   set an input format before driving a device, and because a redundant write is
   cheaper than a colour command the hub silently misreads. */
const LED_NAMES=['off','pink','purple','blue','sky blue','teal',
                 'green','yellow','orange','red','white'];
const LED_PORT=6;          /* the hub's built-in LED — not an attachable device */
const DEV_RGB_LIGHT=23;    /* WeDo 2.0 IO type for the RGB light */
const LED_IDLE=3;          /* what the hub shows when it is just sitting connected */
const DEFAULT_COLOUR=9;    /* placeholder until an input carries a value */

/* unit is 0, not SI: this is an output, so nothing is being scaled for reading */
async function ledSetMode(mode){
  const h=connectedHub();
  if(!h||!h.inp) return;
  const data=new Uint8Array(inputFormat(LED_PORT,DEV_RGB_LIGHT,mode,0));
  try{
    if(h.inp.writeValueWithResponse) await h.inp.writeValueWithResponse(data);
    else await h.inp.writeValue(data);
    log('light mode '+mode+' ('+(mode?'absolute':'discrete')+')');
  }catch(e){ log('light mode switch failed: '+e.message); }
}

async function ledSet(idx){
  const i=Math.max(0,Math.min(10,Math.round(idx)));
  await ledSetMode(0);
  log('light -> '+i+' ('+LED_NAMES[i]+')');
  return sendOut([LED_PORT,0x04,0x01,i]);
}

async function ledSetRGB(r,g,b){
  const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
  const bytes=[LED_PORT,0x04,3,clamp(r),clamp(g),clamp(b)];
  await ledSetMode(1);
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
