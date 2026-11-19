import { useEffect, useMemo, useState } from "react";
import type { EngineGeometry } from "../packages/simulation-core/src/geometry";
import { calculateSliderCrankState } from "../packages/simulation-core/src/mechanics";
import { calculateValveState } from "../packages/simulation-core/src/mechanics/valve-timing";
import GasFlowPanel from "./GasFlowPanel";

type Phase = "Intake" | "Compression" | "Power" | "Exhaust";
type Props = { geometry: EngineGeometry };
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const fmt=(value:number,digits=1)=>Number.isFinite(value)?value.toFixed(digits):"—";
const PHASE_LABEL:Record<Phase,string>={Intake:"ADMISIÓN",Compression:"COMPRESIÓN",Power:"EXPANSIÓN",Exhaust:"ESCAPE"};
const PHASE_COPY:Record<Phase,string>={
  Intake:"El pistón desciende. La leva empuja el taqué, comprime el resorte y separa la válvula de su asiento para admitir carga.",
  Compression:"Las dos levas dejan de empujar. Los resortes devuelven las válvulas a sus asientos y el pistón comprime la carga.",
  Power:"La combustión empuja el pistón hacia el PMI. Las válvulas permanecen asentadas y sellan la cámara.",
  Exhaust:"La leva de escape empuja su taqué y comprime el resorte. La válvula se separa del asiento y deja salir los gases."
};

export default function FourStroke2DView({geometry}:Props){
  const [cycleAngle,setCycleAngle]=useState(0);
  const [speed,setSpeed]=useState(.45);
  const [playing,setPlaying]=useState(true);
  useEffect(()=>{
    if(!playing)return;
    let frame=0,last=0;
    const tick=(time:number)=>{
      if(last!==0){
        const elapsed=Math.min((time-last)/1000,.05);
        // The teaching animation is deliberately independent from the 3D engine clock.
        setCycleAngle(angle=>(angle+elapsed*90*speed)%720);
      }
      last=time;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[playing,speed]);
  const cycle=((cycleAngle%720)+720)%720;
  const phase:Phase=cycle<180?"Intake":cycle<360?"Compression":cycle<540?"Power":"Exhaust";
  const crankAngle=(cycleAngle%360)*Math.PI/180;
  const valve=calculateValveState(cycleAngle);
  const scale=150/geometry.strokeM;
  const radius=geometry.crankRadiusM*scale;
  const rod=geometry.connectingRodLengthM*scale;
  const cx=370,crankY=458;
  const crankX=cx+radius*Math.sin(crankAngle);
  const crankPinY=crankY-radius*Math.cos(crankAngle);
  const displacement=calculateSliderCrankState(geometry,crankAngle,0).pistonDisplacementM;
  const wristY=crankY-(rod+radius)+displacement*scale;
  const pistonTop=wristY-19;
  const boreWidth=clamp(geometry.boreM*scale*1.38,128,178);
  const left=cx-boreWidth/2,right=cx+boreWidth/2;
  const intakeLift=valve.intakeLiftMm*scale/1000;
  const exhaustLift=valve.exhaustLiftMm*scale/1000;
  const intakeValveY=73+intakeLift,exhaustValveY=73+exhaustLift;
  const chamberTop=84,chamberHeight=Math.max(0,pistonTop-chamberTop);
  const pressureBar=phase==="Power"?Math.max(8,18*Math.sin(Math.PI*clamp((cycle-360)/180,0,1))):phase==="Compression"?1+5*clamp((cycle-180)/180,0,1):phase==="Exhaust"?1.08:0.92;
  const tempC=phase==="Power"?Math.round(520+780*Math.sin(Math.PI*clamp((cycle-360)/180,0,1))):phase==="Compression"?Math.round(90+230*clamp((cycle-180)/180,0,1)):phase==="Exhaust"?480:65;
  const intakeStrength=valve.intakeOpen?.8:0;
  const exhaustStrength=valve.exhaustOpen?.8:0;
  const gasFill=phase==="Intake"?"url(#gasFresh)":phase==="Compression"?"url(#gasCompressed)":phase==="Power"?"url(#gasBurned)":"url(#gasSpent)";
  const spark=cycle>=342&&cycle<=348;
  const intakeFlow=valve.intakeOpen?.024:0;
  const exhaustFlow=valve.exhaustOpen?.021:0;
  const speedLabel=speed<.3?"MUY LENTA":speed<.7?"LENTA":"NORMAL";
  const phaseProgress=cycle%180/180;
  const camAngle=cycle*Math.PI/360;
  const intakeCamRotation=-18+valve.intakeLiftMm*2.1;
  const exhaustCamRotation=18-valve.exhaustLiftMm*2.1;
  const rpm=useMemo(()=>Math.round(speed*30),[speed]);
  return <section className="four-stroke-2d" aria-label="Corte bidimensional independiente del ciclo de cuatro tiempos">
    <div className="four-stroke-2d-toolbar"><div><span className="view-live-dot"/><span>SECCIÓN LONGITUDINAL · CICLO DIDÁCTICO INDEPENDIENTE</span></div><span className="view-angle">{fmt(cycle,0)}° / 720°</span></div>
    <div className="two-d-controls">
      <button type="button" className="two-d-play" onClick={()=>setPlaying(value=>!value)}>{playing?"Ⅱ PAUSAR":"▶ REPRODUCIR"}</button>
      <label htmlFor="two-d-speed">VELOCIDAD DE ANIMACIÓN <strong>{speedLabel} · {speed.toFixed(2)}×</strong></label>
      <input id="two-d-speed" type="range" min="0.15" max="1" step="0.05" value={speed} onChange={event=>setSpeed(Number(event.target.value))}/>
      <div className="two-d-speed-ends"><span>MUY LENTA</span><span>VELOCIDAD NORMAL</span></div>
    </div>
    <svg className="four-stroke-2d-svg" viewBox="0 0 760 500" role="img" aria-label="Corte de cilindro con conductos conectados a las válvulas, levas, resortes, pistón, biela y cigüeñal">
      <defs>
        <linearGradient id="sectionBlock" x1="0" x2="1"><stop offset="0" stopColor="#263438"/><stop offset=".5" stopColor="#526166"/><stop offset="1" stopColor="#202b2e"/></linearGradient>
        <linearGradient id="sectionPiston" x1="0" x2="1"><stop offset="0" stopColor="#596970"/><stop offset=".22" stopColor="#d7e0df"/><stop offset=".52" stopColor="#89999c"/><stop offset=".82" stopColor="#e1e8e6"/><stop offset="1" stopColor="#526168"/></linearGradient>
        <linearGradient id="freshCharge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#75dfc4" stopOpacity=".72"/><stop offset="1" stopColor="#267e76" stopOpacity=".28"/></linearGradient>
        <radialGradient id="gasBurned"><stop offset="0" stopColor="#ffd47b" stopOpacity=".95"/><stop offset=".7" stopColor="#f08a3c" stopOpacity=".68"/><stop offset="1" stopColor="#9f3828" stopOpacity=".35"/></radialGradient>
        <linearGradient id="gasFresh" href="#freshCharge"/><linearGradient id="gasCompressed" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6ccdbb" stopOpacity=".78"/><stop offset="1" stopColor="#287d78" stopOpacity=".62"/></linearGradient>
        <linearGradient id="gasSpent" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c48b58" stopOpacity=".5"/><stop offset="1" stopColor="#5d5147" stopOpacity=".25"/></linearGradient>
        <pattern id="sectionHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8c9a9a" strokeWidth="1" opacity=".3"/></pattern>
        <clipPath id="cylinderChamber"><rect x={left+4} y={chamberTop} width={boreWidth-8} height={chamberHeight}/></clipPath>
        <filter id="combustionGlow"><feGaussianBlur stdDeviation="9"/></filter>
        <marker id="freshArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#78dfc4" strokeWidth="1.4"/></marker>
        <marker id="spentArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#efad6a" strokeWidth="1.4"/></marker>
      </defs>
      <g className="section-grid">{Array.from({length:16},(_,i)=><line key={`gx${i}`} x1={20+i*48} y1="18" x2={20+i*48} y2="478"/>)}{Array.from({length:10},(_,i)=><line key={`gy${i}`} x1="18" y1={28+i*48} x2="742" y2={28+i*48}/>)}</g>
      <g className="section-hardware">
        <path d={`M${left-42} 34 H${right+42} V70 H${right+15} V246 H${right+31} V318 H${left-31} V246 H${left-15} V70 H${left-42} Z`} fill="url(#sectionBlock)" stroke="#91a0a2" strokeWidth="2"/>
        <path d={`M${left-12} 72 V318 H${right+12} V72`} fill="none" stroke="#aebbbb" strokeWidth="5"/>
        <path d={`M${left-38} 36 H${right+38} V65 H${left-38} Z`} fill="url(#sectionHatch)" stroke="#829194" strokeWidth="1.5"/>
        <rect x={left-13} y="69" width={boreWidth+26} height="13" rx="2" fill="#77878b" stroke="#bac5c2" strokeWidth="1.5"/>
        <path d={`M${left-34} 246 H${right+34} V300 H${left-34} Z`} fill="#1a2427" stroke="#59696d" strokeWidth="2"/>
      </g>
      <g className="section-ports">
        <path d={`M20 94 H${cx-70} Q${cx-52} 94 ${cx-42} 73`} className="section-intake-port"/>
        <path d={`M${cx+42} 73 Q${cx+52} 94 ${cx+70} 94 H740`} className="section-exhaust-port"/>
        <path d={`M20 94 H${cx-70} Q${cx-52} 94 ${cx-42} 73`} className="section-port-glass"/>
        <path d={`M${cx+42} 73 Q${cx+52} 94 ${cx+70} 94 H740`} className="section-port-glass"/>
        <path d={`M22 94 H${cx-70} Q${cx-52} 94 ${cx-42} 73`} className="section-intake-flow" style={{opacity:intakeStrength}}/>
        <path d={`M${cx+42} 73 Q${cx+52} 94 ${cx+70} 94 H738`} className="section-exhaust-flow" style={{opacity:exhaustStrength}}/>
        <text x="24" y="67" className="section-label intake">COLECTOR DE ADMISIÓN</text><text x="736" y="67" textAnchor="end" className="section-label exhaust">COLECTOR DE ESCAPE</text>
      </g>
      <g className="section-valves">
        <g className="section-cam-assembly" transform={`rotate(${intakeCamRotation+Math.sin(camAngle)*8} ${cx-42} 18)`}>
          <circle cx={cx-42} cy="18" r="12" className="section-cam-base"/><ellipse cx={cx-42} cy="7" rx="8" ry="15" className="section-cam-lobe"/>
        </g>
        <g className="section-cam-assembly" transform={`rotate(${exhaustCamRotation+Math.sin(camAngle+Math.PI)*8} ${cx+42} 18)`}>
          <circle cx={cx+42} cy="18" r="12" className="section-cam-base"/><ellipse cx={cx+42} cy="7" rx="8" ry="15" className="section-cam-lobe"/>
        </g>
        <rect x={cx-53} y={53-intakeLift} width="22" height="9" rx="2" className="section-follower"/>
        <rect x={cx+31} y={53-exhaustLift} width="22" height="9" rx="2" className="section-follower"/>
        <path d={`M${cx-42} 30 V${intakeValveY}`} className="section-valve-stem intake"/>
        <path d={`M${cx-57} ${intakeValveY} Q${cx-42} ${intakeValveY+7} ${cx-27} ${intakeValveY}`} className="section-valve-head intake"/>
        <path d={`M${cx+42} 30 V${exhaustValveY}`} className="section-valve-stem exhaust"/>
        <path d={`M${cx+27} ${exhaustValveY} Q${cx+42} ${exhaustValveY+7} ${cx+57} ${exhaustValveY}`} className="section-valve-head exhaust"/>
        <path d={`M${cx-42} 27 C${cx-63} 27 ${cx-63} 36 ${cx-42} 39 S${cx-21} 51 ${cx-42} ${61+intakeLift} S${cx-63} ${70+intakeLift} ${cx-42} ${73+intakeLift}`} className="section-valve-spring"/>
        <path d={`M${cx+42} 27 C${cx+21} 27 ${cx+21} 36 ${cx+42} 39 S${cx+63} 51 ${cx+42} ${61+exhaustLift} S${cx+63} ${70+exhaustLift} ${cx+42} ${73+exhaustLift}`} className="section-valve-spring"/>
        {spark&&<g className="section-spark"><path d={`M${cx} 69 l-9 13 8-2-4 13 14-17-9 2 5-9z`}/><circle cx={cx} cy="80" r="17"/></g>}
      </g>
      <g clipPath="url(#cylinderChamber)">
        <rect x={left+4} y={chamberTop} width={boreWidth-8} height={chamberHeight} fill={gasFill} opacity={phase==="Power"?.92:.78}/>
        {phase==="Power"&&<ellipse cx={cx} cy={chamberTop+chamberHeight*.52} rx={boreWidth*.42} ry={Math.max(8,chamberHeight*.42)} fill="#ff9b48" opacity={.35} filter="url(#combustionGlow)"/>}
        {phase==="Intake"&&[0,1,2,3,4].map(i=><path key={i} d={`M${left+18+i*18} ${chamberTop+18} q-10 18 0 32`} className="section-chamber-flow"/>)}
        {phase==="Exhaust"&&[0,1,2,3].map(i=><path key={i} d={`M${left+20+i*24} ${pistonTop-14} q-8 -18 0 -30`} className="section-chamber-flow exhaust"/>)}
      </g>
      <g className="section-moving-parts">
        <rect x={left+3} y={pistonTop} width={boreWidth-6} height="38" rx="5" fill="url(#sectionPiston)" stroke="#d5dfdd" strokeWidth="1.5"/>
        <path d={`M${left+7} ${pistonTop+7} H${right-7} M${left+7} ${pistonTop+13} H${right-7} M${left+7} ${pistonTop+20} H${right-7}`} className="section-piston-rings"/>
        <circle cx={cx} cy={wristY+10} r="13" className="section-wrist-pin"/>
        <path d={`M${cx-10} ${wristY+10} L${crankX-9} ${crankPinY} L${crankX+9} ${crankPinY} L${cx+10} ${wristY+10} Z`} className="section-connecting-rod"/>
        <path d={`M${crankX-15} ${crankPinY-9} Q${cx} ${crankY+radius*.28} ${cx} ${crankY+radius*.34} Q${cx} ${crankY+radius*.28} ${crankX+15} ${crankPinY+9} Z`} className="section-crank-web"/>
        <circle cx={cx} cy={crankY} r="24" className="section-main-bearing"/><circle cx={crankX} cy={crankPinY} r="14" className="section-crank-pin"/><circle cx={crankX} cy={crankPinY} r="5" className="section-crank-pin-center"/>
        <path d={`M${cx-108} 442 H${cx+108} V470 H${cx-108} Z`} className="section-sump"/>
      </g>
      <g className="section-labels">
        <text x="24" y="286" className="section-micro">CARGA: {phase==="Power"?"COMBUSTIÓN":phase==="Exhaust"?"GASES QUEMADOS":"MEZCLA / AIRE"}</text>
        <text x="736" y="286" textAnchor="end" className="section-micro">{PHASE_LABEL[phase]} · {fmt(cycle,0)}°</text>
        <text x={cx} y="488" textAnchor="middle" className="section-label">MECANISMO BIELA · MANIVELA</text>
      </g>
    </svg>
    <div className="four-stroke-readouts"><div><span>FASE</span><strong>{PHASE_LABEL[phase]}</strong></div><div><span>VELOCIDAD</span><strong>{speed.toFixed(2)} <small>×</small></strong></div><div><span>PRESIÓN ILUSTRATIVA</span><strong>{fmt(pressureBar,1)} <small>bar</small></strong></div><div><span>TEMPERATURA ILUSTRATIVA</span><strong>{tempC} <small>°C</small></strong></div></div>
    <div className="four-stroke-phase-note"><span className={`phase-indicator phase-${phase.toLowerCase()}`}/><div><strong>{PHASE_LABEL[phase]} · {fmt(cycle,0)}°</strong><p>{PHASE_COPY[phase]}</p></div><span className="four-stroke-status">{playing?"ANIMACIÓN ACTIVA":"EN PAUSA"}</span></div>
    <GasFlowPanel intakeFlowKgPerS={intakeFlow} exhaustFlowKgPerS={exhaustFlow} exhaustTemperatureC={tempC} exhaustPressurePa={101325+exhaustFlow*180000} running={playing}/>
  </section>;
}
