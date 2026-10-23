/* ================= Hub button + battery (standard GATT services,
   not covered by the WeDo2 IOType enum — these aren't attachable devices,
   they're the hub itself) ================= */
const C_BUTTON='00001526-1212-efde-1523-785feabcd123';

const Telemetry={
  async wireButtonBattery(h,svc,server){
    try{
      const bc=await svc.getCharacteristic(C_BUTTON);await bc.startNotifications();
      bc.addEventListener('characteristicvaluechanged',ev=>{
        h.pressed=ev.target.value.getUint8(0)===1;log('button '+(h.pressed?'DOWN':'up'));
        if(h.pressed) triggerButtonPress();
        renderHubs();
      });
      try{h.pressed=(await bc.readValue()).getUint8(0)===1;}catch(e){}
      log('button notifications on');
    }catch(e){log('button characteristic failed: '+e.message);}
    try{
      const bs=await server.getPrimaryService('battery_service');
      const bl=await bs.getCharacteristic('battery_level');
      h.battery=(await bl.readValue()).getUint8(0);await bl.startNotifications();
      bl.addEventListener('characteristicvaluechanged',ev=>{h.battery=ev.target.value.getUint8(0);renderHubs();});
    }catch(e){log('battery unavailable: '+e.message);}
  }
};
