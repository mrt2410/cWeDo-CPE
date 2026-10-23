/* ================= Voltage (hub IO type 20) & Current (hub IO type 21) =================
   Both are hub-internal — not attachable devices, so they never go through
   the port-attach notification flow the way Tilt/Motion do. Instead they're
   configured once per connect, directly against their own fixed connect_id,
   same idea as the SDK's VoltageSensor/CurrentSensor classes (which write
   their input format in their own constructor). Ports 4 (voltage) and 3
   (current) are UNVERIFIED guesses by analogy with the LED's port 6 — needs
   confirming against real hardware. */
const VOLTAGE_PORT=4, CURRENT_PORT=3;   /* unverified */
const DEV_VOLTAGE=20, DEV_CURRENT=21;

Object.assign(Telemetry,{
  async wireVoltageCurrent(h,io){
    try{
      const c=await io.getCharacteristic(C_INPUT);
      const write=async(bytes)=>{
        const data=new Uint8Array(bytes);
        if(c.writeValueWithResponse) await c.writeValueWithResponse(data); else await c.writeValue(data);
      };
      await write(inputFormat(VOLTAGE_PORT,DEV_VOLTAGE,0,2));   /* mode 0, SI */
      await write(inputFormat(CURRENT_PORT,DEV_CURRENT,0,2));
    }catch(e){ log('voltage/current setup failed: '+e.message); }
    try{
      const val=await io.getCharacteristic(C_SENSOR);
      /* h.val (js/app.js's own sensor-value listener) already calls
         startNotifications() and adds its own listener — this adds a
         second listener on the same characteristic rather than replacing
         it, which the Web Bluetooth / EventTarget API supports directly */
      val.addEventListener('characteristicvaluechanged',ev=>{
        const buf=ev.target.value.buffer;
        const v=new Uint8Array(buf), dv=new DataView(buf);
        if(v.length<6) return;
        const port=v[1], reading=dv.getFloat32(2,true);
        if(port===VOLTAGE_PORT){ h.voltageMv=reading; renderHubs(); }
        else if(port===CURRENT_PORT){ h.currentMa=reading; renderHubs(); }
      });
    }catch(e){ log('voltage/current notifications unavailable: '+e.message); }
  }
});
