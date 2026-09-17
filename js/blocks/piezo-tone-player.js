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
