import { useEffect, useRef, useState } from "react";

type Props={rpm:number;running:boolean};

/** Procedural four-cylinder firing tone. Audio is created only after an explicit user click. */
export default function EngineAudio({rpm,running}:Props){
 const context=useRef<AudioContext|null>(null);
 const master=useRef<GainNode|null>(null);
 const oscillators=useRef<OscillatorNode[]>([]);
 const noiseGain=useRef<GainNode|null>(null);
 const [enabled,setEnabled]=useState(false);
 const start=()=>{
  const AudioContextClass=window.AudioContext;
  if(!context.current){
   const ctx=new AudioContextClass();context.current=ctx;
   const output=ctx.createGain();output.gain.value=0;output.connect(ctx.destination);master.current=output;
   const fundamental=ctx.createOscillator(),second=ctx.createOscillator(),third=ctx.createOscillator();
   fundamental.type="sawtooth";second.type="triangle";third.type="square";
   const gains=[.22,.08,.025];
   [fundamental,second,third].forEach((osc,i)=>{const gain=ctx.createGain();gain.gain.value=gains[i]!;osc.connect(gain);gain.connect(output);osc.start();oscillators.current.push(osc);});
   const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.22;
   const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
   const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=420;
   const noiseLevel=ctx.createGain();noiseLevel.gain.value=.09;noise.connect(filter);filter.connect(noiseLevel);noiseLevel.connect(output);noise.start();noiseGain.current=noiseLevel;
  }
  void context.current.resume();setEnabled(true);
 };
 const stop=()=>{if(context.current&&master.current){master.current.gain.setTargetAtTime(0,context.current.currentTime,.06);}setEnabled(false);};
 useEffect(()=>{
  const ctx=context.current;if(!ctx||!master.current)return;
  const firingHz=Math.max(0,rpm/30);
  oscillators.current.forEach((osc,i)=>{osc.frequency.setTargetAtTime(firingHz*(i===0?1:i===1?2.01:3.97),ctx.currentTime,.06);});
  const target=enabled&&running&&rpm>0?.16:0;
  master.current.gain.setTargetAtTime(target,ctx.currentTime,.09);
  if(noiseGain.current)noiseGain.current.gain.setTargetAtTime(target>0?Math.min(.1,.025+rpm/90000):0,ctx.currentTime,.12);
 },[rpm,running,enabled]);
 useEffect(()=>()=>{void context.current?.close();},[]);
 return <button className={`sound-button ${enabled?"sound-enabled":""}`} type="button" onClick={()=>enabled?stop():start()} aria-pressed={enabled}>{enabled?"♫ SONIDO ACTIVADO":"♫ ESCUCHAR MOTOR"}</button>;
}
