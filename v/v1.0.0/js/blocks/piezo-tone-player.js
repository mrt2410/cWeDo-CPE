/* ================= Piezo Tone Player (hub IO type 22) =================
   NOT exposed by the real WeDo 2.0 app's own block set — this is new,
   implementing the capability the SDK exposes via play_note()/
   play_frequency()/stop_playing(). Port 5 is CONFIRMED against real
   hardware: connecting a real Smarthub reports connect ID 5 attached with
   IO type 22 in its "Attached I/O" broadcast. Command IDs (0x02 play,
   0x03 stop) and the little-endian u16 frequency/duration payload are
   taken directly from the SDK's output_command.py, and also confirmed
   correct against the real hub (LED, which shares the same write path,
   audibly/visibly works).
   The retail WeDo 2.0 Smarthub has NO physical speaker, though — this
   command is accepted by the hub's firmware (harmless, and future-proofs
   this block for LEGO hubs that do have one, e.g. BOOST/Powered Up) but
   never produces audible sound there. So the tone is ALSO played through
   the tablet's own speaker via Web Audio (ac(), from sound.js), the same
   mechanism PlaySoundBlock uses — that's the only way this block can
   actually be heard on real WeDo 2.0 hardware. */
const PIEZO_PORT=5;
const PLAY_PIEZO_TONE_COMMAND_ID=0x02;
const STOP_PIEZO_TONE_COMMAND_ID=0x03;
const PIEZO_MAX_FREQUENCY=1500, PIEZO_MAX_DURATION_MS=65536;

/* semitone offset from A, matching the SDK's PiezoTonePlayerNote enum */
const PIEZO_NOTES={C:-9,'C#':-8,D:-7,'D#':-6,E:-5,F:-4,'F#':-3,G:-2,'G#':-1,A:0,'A#':1,B:2};

function noteToFrequency(note,octave){
  const halfSteps=(PIEZO_NOTES[note]||0)+(octave-4)*12;
  return 440*Math.pow(2,halfSteps/12);
}

/* the hub has no speaker to hear this on (see header comment), so the tone
   is also synthesised locally, the same way PlaySoundBlock's placeholder
   tone is (js/blocks/sound.js playPlaceholder()) — a plain oscillator with
   a short fade in/out to avoid clicks. Not exercised by the test suite:
   jsdom has no Web Audio, same as the mic/recording code in sound.js, so
   this needs manual verification in a real browser. */
let toneOsc=null;
function stopToneAudio(){
  if(toneOsc){ try{ toneOsc.stop(); }catch(e){} toneOsc=null; }
}
function playToneAudio(freq,durationMs){
  try{
    stopToneAudio();
    const c=ac(), t=c.currentTime, durSec=durationMs/1000;
    const o=c.createOscillator(), g=c.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.22,t+0.02);  /* matches sound.js playPlaceholder()'s peak gain */
    g.gain.exponentialRampToValueAtTime(0.0001,t+Math.max(durSec,0.05));
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t+durSec);
    o.onended=()=>{ if(toneOsc===o) toneOsc=null; };
    toneOsc=o;
  }catch(e){ log('tablet speaker unavailable: '+e.message); }
}

async function playTone(note,octave,durationMs){
  const freq=Math.min(PIEZO_MAX_FREQUENCY,Math.round(noteToFrequency(note,octave)));
  const dur=Math.min(PIEZO_MAX_DURATION_MS,Math.round(durationMs));
  log('piezo -> '+note+octave+' ('+freq+'Hz) for '+dur+'ms');
  const bytes=new Uint8Array(7);
  bytes[0]=PIEZO_PORT; bytes[1]=PLAY_PIEZO_TONE_COMMAND_ID; bytes[2]=4;
  bytes[3]=freq&0xff; bytes[4]=(freq>>8)&0xff;
  bytes[5]=dur&0xff;  bytes[6]=(dur>>8)&0xff;
  playToneAudio(freq,dur);
  return sendOut(bytes);
}
async function stopTone(){
  stopToneAudio();
  return sendOut([PIEZO_PORT,STOP_PIEZO_TONE_COMMAND_ID,0]);
}

const PIEZO_PREVIEW_MS=500;

const PiezoTonePlayer={
  async execPlay(it,r){
    const secs=inputNumber(it,1)??1;
    const note=it.note||'A', octave=it.octave||4;
    await playTone(note,octave,secs*1000);
    try{ await sleep(secs*1000,r); }
    finally{ if(r.stop) stopTone(); }
  },
  /* tone picker's Play button: hear the selected note without sending a BLE
     command — there may not even be a hub connected while building a program */
  preview(note,octave){
    const freq=Math.min(PIEZO_MAX_FREQUENCY,Math.round(noteToFrequency(note,octave)));
    playToneAudio(freq,PIEZO_PREVIEW_MS);
  }
};

registerCustomBlock('PlayToneBlock',{label:'♪ Tone',group:'Output'});
SOCKETED.add('PlayToneBlock');
DEFAULT_INPUT.PlayToneBlock=N('1');
RAND_RANGE.PlayToneBlock=[1,10];
