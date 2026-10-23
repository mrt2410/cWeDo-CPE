/* ================= Motion/Distance Sensor (hub IO type 35) ================= */
const DIST_EPS=0.2;     /* how much movement counts as a distance change */

const Motion={
  state:{port:null,value:null,prev:null,raw:null},
  reset(){ Motion.state={port:null,value:null,prev:null,raw:null}; },
  onAttach(port){ Motion.state.port=port; configurePort(port,DEV_DISTANCE); },
  onDetach(port){ if(Motion.state.port===port) Motion.reset(); },
  onValue(val,raw){
    const prev=Motion.state.value, cur=Math.max(0,Math.min(10,val));
    Motion.state.prev=prev; Motion.state.value=cur; Motion.state.raw=raw;
    if(prev!=null){
      const d=cur-prev;
      if(Math.abs(d)>DIST_EPS) bump('AnyDistanceChange');
      if(d<-DIST_EPS) bump('DistanceChangeCloser');
      if(d> DIST_EPS) bump('DistanceChangeFurther');
    }
  },
  attached(){ return Motion.state.port!=null; },
  describe(){
    const d=Motion.state;
    return '<div class="prow"><b>Distance</b> '+(d.port?'port '+d.port+
        (d.value!=null?' — '+d.value.toFixed(1):''):'not attached')+
        (d.raw?'<span class="raw">'+d.raw+'</span>':'')+'</div>';
  }
};
