import { useEffect, useRef, useState } from "react";
import { inlineFourBodyFrequencies,inlineFourFiringFrequencyHz,normalizeEngineLoad } from "./audio/engine-audio-model";

type Props={rpm:number;running:boolean;load?:number};
type AudioRig={context:AudioContext;master:GainNode;body:OscillatorNode[];pulse:OscillatorNode;noise:AudioBufferSourceNode;noiseGain:GainNode;noiseFilter:BiquadFilterNode};

/** Procedural four-stroke audio. One pulse every 180 crank degrees; activated only by user gesture. */
export default function EngineAudio({rpm,running,load=.45}:Props){
 const rig=useRef<AudioRig|null>(null);
 const [enabled,setEnabled]=useState(false);
 const start=()=>{
  if(!rig.current){
   const context=new AudioContext(),master=context.createGain(),compressor=context.createDynamicsCompressor();
   master.gain.value=0;compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=3.2;compressor.attack.value=.008;compressor.release.value=.12;
   master.connect(compressor);compressor.connect(context.destination);
   const body:OscillatorNode[]=[];
   const makeTone=(type:OscillatorType,frequency:number,gainValue:number)=>{
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.value=frequency;gain.gain.value=gainValue;oscillator.connect(gain);gain.connect(master);oscillator.start();body.push(oscillator);
   };
   makeTone("sine",42,.46);makeTone("triangle",84,.13);makeTone("sawtooth",126,.035);
   const pulse=context.createOscillator(),pulseGain=context.createGain(),pulseFilter=context.createBiquadFilter();
   pulse.type="square";pulse.frequency.value=24;pulseGain.gain.value=.055;pulseFilter.type="lowpass";pulseFilter.frequency.value=520;
   pulse.connect(pulseGain);pulseGain.connect(pulseFilter);pulseFilter.connect(master);pulse.start();
   const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.5;
   const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
   const noiseFilter=context.createBiquadFilter();noiseFilter.type="bandpass";noiseFilter.frequency.value=680;noiseFilter.Q.value=.65;
   const noiseGain=context.createGain();noiseGain.gain.value=.018;noise.connect(noiseFilter);noiseFilter.connect(noiseGain);noiseGain.connect(master);noise.start();
   rig.current={context,master,body,pulse,noise,noiseGain,noiseFilter};
  }
  void rig.current.context.resume();setEnabled(true);
 };
 const stop=()=>{const active=rig.current;if(active)active.master.gain.setTargetAtTime(0,active.context.currentTime,.045);setEnabled(false);};
 useEffect(()=>{
  const active=rig.current;if(!active)return;
  const {context,master,body,pulse,noiseGain,noiseFilter}=active,now=context.currentTime;
  const safeRpm=Math.max(0,rpm),firingHz=inlineFourFiringFrequencyHz(safeRpm),normalizedLoad=normalizeEngineLoad(load);
  const frequencies=inlineFourBodyFrequencies(safeRpm);
  body.forEach((oscillator,index)=>oscillator.frequency.setTargetAtTime(frequencies[index]??0,now,.07));
  pulse.frequency.setTargetAtTime(Math.max(1,firingHz),now,.045);
  noiseFilter.frequency.setTargetAtTime(420+normalizedLoad*1050+safeRpm*.035,now,.09);
  noiseGain.gain.setTargetAtTime(enabled&&running&&safeRpm>0?.012+normalizedLoad*.025:0,now,.07);
  master.gain.setTargetAtTime(enabled&&running&&safeRpm>0?.12+normalizedLoad*.15:0,now,.09);
 },[rpm,running,load,enabled]);
 useEffect(()=>()=>{void rig.current?.context.close();},[]);
 return <button className={`sound-button ${enabled?"sound-enabled":""}`} type="button" onClick={()=>enabled?stop():start()} aria-pressed={enabled}>{enabled?"♫ SONIDO ACTIVADO":"♫ ESCUCHAR MOTOR"}</button>;
}
