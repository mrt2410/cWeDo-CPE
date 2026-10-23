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
