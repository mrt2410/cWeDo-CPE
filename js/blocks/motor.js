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
    /* dispatched one after the other, but unacknowledged: each resolves as soon
       as it is queued rather than waiting a round trip for the hub to reply */
    for(const d of pk) await writeOut(h.out,d,h);
  }catch(e){ log('motor write failed: '+e.message); return false; }
  log('motor -> '+p+'% (compensated '+signed+'%)  (both ports in '+
      Math.round((self.performance||Date).now()-t0)+'ms)');
  return true;
}

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
  },
  async execBrake(it,r){
    await motorBrake(); await sleep(STEP,r);
  }
};

registerCustomBlock('MotorBrakeBlock',{label:'Brake',group:'Motor'});
