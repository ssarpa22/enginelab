import { useEffect, useMemo, useRef, useState } from "react";
import { createEngineGeometry, type EngineGeometry } from "../packages/simulation-core/src/geometry";
import { calculateSliderCrankState } from "../packages/simulation-core/src/mechanics";
import { millimetresToMetres, metresToMillimetres } from "../packages/simulation-core/src/units";
import { calculateValveState, DEFAULT_VALVE_TIMING } from "../packages/simulation-core/src/mechanics/valve-timing";
import { calculateCoupledCylinderState } from "../packages/simulation-core/src/mechanics/coupled-cylinder";
import EngineScene from "./EngineScene";

type Setup = { boreMm: number; strokeMm: number; rodMm: number; rpm: number };
const INITIAL: Setup = { boreMm: 86, strokeMm: 86, rodMm: 143, rpm: 1800 };
const TAU = Math.PI * 2;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : "—";

function geometryFor(s: Setup): EngineGeometry {
  return createEngineGeometry({
    cylinderCount: 1,
    boreM: millimetresToMetres(s.boreMm),
    strokeM: millimetresToMetres(s.strokeMm),
    connectingRodLengthM: millimetresToMetres(s.rodMm),
    compressionRatio: 10.5,
    bankAngleRad: Math.PI / 2
  });
}

type Phase = "Intake" | "Compression" | "Power" | "Exhaust";
function phaseAt(angle: number): Phase {
  if (angle < 180) return "Intake";
  if (angle < 360) return "Compression";
  if (angle < 540) return "Power";
  return "Exhaust";
}

function Mechanism({ geometry, angle, sparkFlash }: { geometry: EngineGeometry; angle: number; sparkFlash: boolean }) {
  const crankAngle = angle % 360 * Math.PI / 180;
  const phase = phaseAt(angle);
  const valveState = calculateValveState(angle);
  const intakeOpen = valveState.intakeOpen;
  const exhaustOpen = valveState.exhaustOpen;
  const intakeValveY = 43 + valveState.intakeLiftMm * 1.45;
  const exhaustValveY = 43 + valveState.exhaustLiftMm * 1.45;
  const spark = sparkFlash || valveState.sparkActive;
  const normalizedAngle = ((angle % 720) + 720) % 720;
  const powerProgress = clamp((normalizedAngle - 360) / 135, 0, 1);
  const intakeStrength = valveState.intakeLiftMm / DEFAULT_VALVE_TIMING.intakeMaxLiftMm;
  const exhaustStrength = valveState.exhaustLiftMm / DEFAULT_VALVE_TIMING.exhaustMaxLiftMm;
  const scale = 130 / geometry.strokeM;
  const radius = geometry.crankRadiusM * scale;
  const rod = geometry.connectingRodLengthM * scale;
  const cx = 330, cy = 342;
  const crankX = cx + radius * Math.sin(crankAngle);
  const crankY = cy - radius * Math.cos(crankAngle);
  const displacement = calculateSliderCrankState(geometry, crankAngle, 0).pistonDisplacementM;
  const pistonY = cy - (rod + radius) + displacement * scale;
  const boreWidth = clamp(geometry.boreM * scale * 1.28, 82, 126);
  const pistonTop = pistonY - 17;
  const headY = 24;
  const intakeX = cx - 28, exhaustX = cx + 28;
  return <svg className="engine-drawing" viewBox="0 0 660 410" role="img" aria-label="Four-stroke engine showing piston, valves, spark plug and gas flow">
    <defs>
      <linearGradient id="pistonMetal" x1="0" x2="1"><stop offset="0" stopColor="#84929a"/><stop offset=".48" stopColor="#e1e8e9"/><stop offset="1" stopColor="#68777f"/></linearGradient>
      <linearGradient id="rodMetal" x1="0" x2="1"><stop offset="0" stopColor="#59666d"/><stop offset=".5" stopColor="#c2cdd0"/><stop offset="1" stopColor="#536168"/></linearGradient>
      <radialGradient id="crankMetal"><stop offset="0" stopColor="#d5dedf"/><stop offset=".72" stopColor="#74838a"/><stop offset="1" stopColor="#3b484e"/></radialGradient>
      <marker id="intakeArrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#61c6b0" strokeWidth="1.2"/></marker>
      <marker id="exhaustArrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#e9a34b" strokeWidth="1.2"/></marker>
    </defs>
    <g className="drawing-grid">{Array.from({length:13},(_,i)=><line key={i} x1={40+i*48} y1="18" x2={40+i*48} y2="390"/>)}{Array.from({length:8},(_,i)=><line key={i} x1="34" y1={28+i*48} x2="626" y2={28+i*48}/>)}</g>
    <line x1={cx} y1="20" x2={cx} y2="365" className="centerline"/>
    <path d={`M ${cx-boreWidth/2-12} 24 V ${cy-76} M ${cx+boreWidth/2+12} 24 V ${cy-76}`} className="cylinder-wall"/>
    <path d={`M ${cx-boreWidth/2-12} 24 H ${cx+boreWidth/2+12}`} className="cylinder-head"/>
    <rect x={cx-boreWidth/2-12} y={headY-5} width={boreWidth+24} height="28" rx="3" className="head-metal"/>
    <path d={`M ${intakeX} 14 L ${intakeX} ${intakeValveY}`} className={`valve-stem intake-valve ${intakeOpen?"valve-open":""}`}/>
    <path d={`M ${intakeX-12} ${intakeValveY} L ${intakeX+12} ${intakeValveY}`} className="valve-head intake-valve"/>
    <path d={`M ${exhaustX} 14 L ${exhaustX} ${exhaustValveY}`} className={`valve-stem exhaust-valve ${exhaustOpen?"valve-open":""}`}/>
    <path d={`M ${exhaustX-12} ${exhaustValveY} L ${exhaustX+12} ${exhaustValveY}`} className="valve-head exhaust-valve"/>
    <path d={`M ${cx+3} 8 L ${cx+3} 50 L ${cx} 59 L ${cx-3} 50 L ${cx-3} 8 Z`} className="spark-plug"/>
    {spark&&<g className="spark-flash"><path d="M330 58 l-8 12 8-2-5 12 13-16-8 2 5-8z"/><circle cx="330" cy="68" r="17"/></g>}
    {intakeOpen&&<g opacity={0.35+intakeStrength*0.65}><path d="M220 38 C245 38 270 48 295 75" className="gas-flow intake-flow" markerEnd="url(#intakeArrow)"/>{[0,1,2,3,4].map(i=>{const t=(normalizedAngle*0.045+i*0.2)%1;return <circle key={`in-${i}`} cx={220+75*t} cy={38+37*t} r={2.2+intakeStrength} className="gas-particle intake-particle"/>;})}</g>}
    {exhaustOpen&&<g opacity={0.35+exhaustStrength*0.65}><path d="M365 75 C395 48 420 38 448 38" className="gas-flow exhaust-flow" markerEnd="url(#exhaustArrow)"/>{[0,1,2,3,4].map(i=>{const t=(normalizedAngle*0.045+i*0.2)%1;return <circle key={`out-${i}`} cx={365+83*t} cy={75-37*t} r={2.2+exhaustStrength} className="gas-particle exhaust-particle"/>;})}</g>}
    {phase==="Power"&&<g className="combustion-glow" opacity={1-powerProgress*.55}><ellipse cx={cx} cy={Math.max(85,pistonTop-10)} rx={25+powerProgress*42} ry={14+powerProgress*22}/><path d={`M ${cx-28-powerProgress*16} ${Math.max(85,pistonTop-7)} Q ${cx} ${Math.max(40,pistonTop-52-powerProgress*20)} ${cx+28+powerProgress*16} ${Math.max(85,pistonTop-7)}`}/></g>}
    <circle cx={cx} cy={cy} r={radius+14} className="crankcase"/><circle cx={cx} cy={cy} r={radius} className="crank-orbit"/>
    <path d={`M ${cx-78} 372 H ${cx+78}`} className="crank-base"/>
    <line x1={cx} y1={cy} x2={crankX} y2={crankY} className="crank-arm"/><line x1={cx} y1={cy} x2={crankX} y2={crankY} className="crank-highlight"/>
    <line x1={cx} y1={pistonY} x2={crankX} y2={crankY} className="connecting-rod-shadow"/><line x1={cx} y1={pistonY} x2={crankX} y2={crankY} className="connecting-rod"/>
    <rect x={cx-boreWidth/2} y={pistonTop} width={boreWidth} height="34" rx="5" fill="url(#pistonMetal)" className="piston-body"/>
    <line x1={cx-boreWidth/2+5} y1={pistonTop+8} x2={cx+boreWidth/2-5} y2={pistonTop+8} className="piston-ring"/>
    <line x1={cx-boreWidth/2+5} y1={pistonTop+14} x2={cx+boreWidth/2-5} y2={pistonTop+14} className="piston-ring"/>
    <circle cx={cx} cy={pistonY} r="10" className="wrist-pin"/><circle cx={crankX} cy={crankY} r="12" className="crank-pin"/>
    <circle cx={cx} cy={cy} r="19" fill="url(#crankMetal)" className="main-bearing"/><circle cx={cx} cy={cy} r="6" className="bearing-center"/>
    <text x="105" y="18" className="diagram-label intake-text">ADMISIÓN</text><text x="455" y="18" className="diagram-label exhaust-text">ESCAPE</text>
    <text x="356" y="82" className="diagram-small">BUJÍA</text><path d="M352 78 L336 66" className="leader"/>
    <text x="468" y="155" className="diagram-label">PISTÓN</text><path d={`M458 160 L${cx+boreWidth/2} ${pistonY-2}`} className="leader"/>
    <text x="470" y="220" className="diagram-label">BIELA</text><path d={`M462 224 L${(cx+crankX)/2+8} ${(pistonY+crankY)/2}`} className="leader"/>
    <text x="455" y="354" className="diagram-label">CIGÜEÑAL</text><path d="M448 348 L350 342" className="leader"/>
    <text x="54" y="382" className="diagram-small">ESQUEMA DIDÁCTICO · NO A ESCALA</text>
  </svg>;
}

function App() {
  const [setup,setSetup]=useState<Setup>(INITIAL);
  const [cycleAngle,setCycleAngle]=useState(0);
  const cycleAngleRef=useRef(0);
  const [running,setRunning]=useState(true);
  const [visualRate,setVisualRate]=useState(1);
  const [sparkFlash,setSparkFlash]=useState(false);
  const geometry=useMemo(()=>geometryFor(setup),[setup]);
  const crankAngle=(cycleAngle%360)*Math.PI/180;
  const current=useMemo(()=>calculateSliderCrankState(geometry,crankAngle,setup.rpm),[geometry,crankAngle,setup.rpm]);
  const phase=phaseAt(cycleAngle);
  const valveState=calculateValveState(cycleAngle);
  const thermodynamics=useMemo(()=>calculateCoupledCylinderState(geometry,cycleAngle,setup.rpm),[geometry,cycleAngle,setup.rpm]);
  const intakeOpen=valveState.intakeOpen;
  const exhaustOpen=valveState.exhaustOpen;
  const spark=valveState.sparkActive;
  const displacement=metresToMillimetres(current.pistonDisplacementM);
  const litres=geometry.totalDisplacementM3*1000;
  const rodMin=Math.floor(setup.strokeMm/2)+5;
  const update=(key:keyof Setup,value:number)=>setSetup(previous=>{
    const next={...previous,[key]:value};
    if(key==="strokeMm"&&next.rodMm<=value/2)next.rodMm=Math.floor(value/2)+5;
    return next;
  });
  useEffect(()=>{
    if(!running||setup.rpm===0)return;
    let frame=0,previous=0,sparkTimer=0;
    const sparkAngle=360-DEFAULT_VALVE_TIMING.sparkAdvanceBtdc;
    const tick=(time:number)=>{
      if(previous!==0){
        const dt=Math.min((time-previous)/1000,.05);
        const advance=dt*setup.rpm*6*visualRate;
        const from=((cycleAngleRef.current%720)+720)%720;
        const distance=(sparkAngle-from+720)%720;
        if(advance>0&&distance<=advance){
          setSparkFlash(true);
          window.clearTimeout(sparkTimer);
          sparkTimer=window.setTimeout(()=>setSparkFlash(false),95);
        }
        const next=(from+advance)%720;
        cycleAngleRef.current=next;
        setCycleAngle(next);
      }
      previous=time;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(frame);window.clearTimeout(sparkTimer);};
  },[running,setup.rpm,visualRate]);
  const reset=()=>{setSetup(INITIAL);cycleAngleRef.current=0;setCycleAngle(0);setVisualRate(1);setSparkFlash(false);setRunning(true);};
  const phaseCopy:Record<Phase,string>={
    Intake:"La admisión permanece abierta durante la carrera descendente. El cierre se retrasa hasta después del PMI.",
    Compression:"Las válvulas están cerradas y el pistón comprime la carga. La chispa salta antes del PMS.",
    Power:"La combustión comienza cerca del PMS y la expansión empuja el pistón hacia el PMI.",
    Exhaust:"El escape abre antes del PMI y evacúa los gases; cierra después del PMS."
  };
  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="EngineLab home"><span className="brand-mark"><span/><span/><span/></span><span>ENGINE<span className="brand-light">LAB</span></span></a>
      <div className="topbar-center"><span className="status-dot"/> SIMULADOR DE MOTOR <span className="version-tag">3D PHYSICS PREVIEW</span></div>
      <div className="topbar-right"><span className="live-indicator">{running?"EN MARCHA":"EN PAUSA"}</span><span className="topbar-divider"/> CICLO 4T</div>
    </header>
    <section className="intro">
      <div><div className="eyebrow">LABORATORIO DE MECÁNICA / 01</div><h1>Motor de <em>cuatro tiempos.</em></h1><p>Explorá el interior del motor en 3D y seguí el intercambio de gases, la combustión y el movimiento del conjunto mecánico.</p></div>
      <button className="reset-button" onClick={reset} type="button"><span>↺</span> REINICIAR</button>
    </section>
    <section className="metric-strip" aria-label="Datos principales del motor">
      <div className="metric"><span className="metric-label">CILINDRADA</span><strong>{fmt(litres,3)} <small>L</small></strong></div>
      <div className="metric"><span className="metric-label">RÉGIMEN CONFIGURADO</span><strong>{setup.rpm.toLocaleString("es-AR")} <small>RPM</small></strong></div>
      <div className="metric"><span className="metric-label">RECORRIDO DEL PISTÓN</span><strong>{fmt(displacement,1)} <small>mm</small></strong><span className="metric-note">desde el PMS</span></div>
      <div className="metric"><span className="metric-label">ETAPA ACTUAL</span><strong className="phase-metric">{phase.toUpperCase()}</strong><span className="metric-note">{Math.floor(cycleAngle)}° / 720°</span></div>
    </section>
    <div className="workspace-grid">
      <section className="panel mechanism-panel">
        <div className="panel-header"><div><div className="panel-kicker">01 / MOTOR EN MOVIMIENTO</div><h2>Conjunto mecánico y distribución</h2></div><span className="panel-chip"><span className="status-dot"/> VISTA ANIMADA</span></div>
        <div className="drawing-stage"><EngineScene geometry={geometry} angle={cycleAngle} pressurePa={thermodynamics.pressurePa} burnedFraction={thermodynamics.burnedFraction} intakeFlowKgPerS={thermodynamics.intakeMassFlowKgPerS} exhaustFlowKgPerS={thermodynamics.exhaustMassFlowKgPerS} sparkFlash={sparkFlash}/><div className="drawing-legend"><span><i className="legend-piston"/> PISTÓN / BIELA / CIGÜEÑAL</span><span><i className="legend-intake"/> MEZCLA FRESCA</span><span><i className="legend-exhaust"/> GASES QUEMADOS</span><span><i className="legend-spark"/> COMBUSTIÓN</span></div></div>
        <div className="transport">
          <button className="transport-button" onClick={()=>setRunning(v=>!v)} type="button" aria-label={running?"Pausar simulación":"Reanudar simulación"}>{running?"Ⅱ":"▶"}</button>
          <div className="transport-readout"><strong>{phase}</strong><span>FASE DEL CICLO</span></div>
          <div className="transport-speed"><label htmlFor="playback-speed">VELOCIDAD DE SIMULACIÓN <strong>{visualRate.toFixed(1)}x</strong></label><input id="playback-speed" type="range" min="0.1" max="1" step="0.1" value={visualRate} onChange={e=>setVisualRate(Number(e.target.value))}/><span className="speed-endpoints">0.1x — 1.0x</span></div>
        </div>
        <div className="angle-control"><div className="control-label-row"><label htmlFor="angle-control">RECORRER EL CICLO COMPLETO</label><output>{Math.round(cycleAngle)}° / 720°</output></div><input id="angle-control" type="range" min="0" max="720" step="1" value={cycleAngle} onChange={e=>{const next=Number(e.target.value);setRunning(false);cycleAngleRef.current=next;setCycleAngle(next);}}/><div className="range-ends"><span>0° · ADMISIÓN</span><span>360° · COMBUSTIÓN</span><span>720° · FIN</span></div></div>
        <div className="phase-explainer"><span className="phase-dot"/><div><strong>{phase}</strong><p>{phaseCopy[phase]}</p><div className="valve-live-state"><span className={intakeOpen?"is-open":"is-closed"}>ADMISIÓN: {intakeOpen?"ABIERTA":"CERRADA"} · {fmt(valveState.intakeLiftMm,1)} mm</span><span className={exhaustOpen?"is-open":"is-closed"}>ESCAPE: {exhaustOpen?"ABIERTO":"CERRADO"} · {fmt(valveState.exhaustLiftMm,1)} mm</span><span className={spark?"spark-live":""}>ENCENDIDO: {spark?"CHISPA":"EN ESPERA"}</span><span>FLUJO: {intakeOpen?"ADMISIÓN":exhaustOpen?"GASES DE ESCAPE":"SIN INTERCAMBIO"}</span></div></div></div>
        <div className="timing-card"><div className="timing-card-heading">CALADO DE DISTRIBUCIÓN <span>REFERENCIA INICIAL</span></div><div className="timing-grid"><div><span>Admisión abre</span><strong>{DEFAULT_VALVE_TIMING.intakeOpensBtdc}° antes PMS</strong></div><div><span>Admisión cierra</span><strong>{DEFAULT_VALVE_TIMING.intakeClosesAbdc}° después PMI</strong></div><div><span>Escape abre</span><strong>{DEFAULT_VALVE_TIMING.exhaustOpensBbdc}° antes PMI</strong></div><div><span>Escape cierra</span><strong>{DEFAULT_VALVE_TIMING.exhaustClosesAtdc}° después PMS</strong></div><div><span>Avance de encendido</span><strong>{DEFAULT_VALVE_TIMING.sparkAdvanceBtdc}° antes PMS</strong></div><div><span>Alzada máxima</span><strong>{DEFAULT_VALVE_TIMING.intakeMaxLiftMm} / {DEFAULT_VALVE_TIMING.exhaustMaxLiftMm} mm</strong></div></div><p>Perfil de leva simplificado con apertura y cierre progresivos; valores orientativos, no corresponden a un motor comercial específico.</p></div>
        <div className="thermo-card"><div className="timing-card-heading">ESTADO TERMODINÁMICO <span>MODELO 0D · 1 ZONA</span></div><div className="thermo-values"><div><span>PRESIÓN INTERNA</span><strong>{fmt(thermodynamics.pressurePa/100000,2)} <small>bar</small></strong></div><div><span>TEMPERATURA DEL GAS</span><strong>{fmt(thermodynamics.temperatureK-273.15,0)} <small>°C</small></strong></div><div><span>VOLUMEN INSTANTÁNEO</span><strong>{fmt(thermodynamics.cylinderVolumeM3*1e6,1)} <small>cm³</small></strong></div><div><span>MASA ATRAPADA</span><strong>{fmt(thermodynamics.trappedMassKg*1000,3)} <small>g</small></strong></div><div><span>CAUDAL DE ADMISIÓN</span><strong>{fmt(thermodynamics.intakeMassFlowKgPerS*1000,1)} <small>g/s</small></strong></div><div><span>CAUDAL DE ESCAPE</span><strong>{fmt(thermodynamics.exhaustMassFlowKgPerS*1000,1)} <small>g/s</small></strong></div><div><span>FRACCIÓN QUEMADA</span><strong>{fmt(thermodynamics.burnedFraction*100,1)} <small>%</small></strong></div><div><span>LIBERACIÓN DE CALOR</span><strong>{fmt(thermodynamics.heatReleaseRateW/1000,2)} <small>kW</small></strong></div><div><span>PAR INDICADO INSTANTÁNEO</span><strong>{fmt(thermodynamics.indicatedTorqueNm,1)} <small>Nm</small></strong></div><div><span>POTENCIA INDICADA INSTANTÁNEA</span><strong>{fmt(thermodynamics.indicatedPowerW/1000,2)} <small>kW</small></strong></div></div><p>Modelo 0D de masa y energía: flujo compresible por válvulas con estrangulamiento, calor liberado con ley Wiebe y pérdidas térmicas a paredes. Los resultados son estimaciones didácticas, no datos de un motor calibrado ni CFD.</p></div>
      </section>
      <aside className="panel controls-panel">
        <div className="panel-header"><div><div className="panel-kicker">02 / CONFIGURACIÓN</div><h2>Dimensiones del motor</h2></div><span className="settings-icon">⚙</span></div>
        <div className="control-group"><div className="control-label-row"><label htmlFor="bore">DIÁMETRO DEL CILINDRO</label><output>{setup.boreMm} mm</output></div><input id="bore" type="range" min="60" max="120" step="1" value={setup.boreMm} onChange={e=>update("boreMm",Number(e.target.value))}/><div className="range-ends"><span>60 mm</span><span>120 mm</span></div></div>
        <div className="control-group"><div className="control-label-row"><label htmlFor="stroke">CARRERA</label><output>{setup.strokeMm} mm</output></div><input id="stroke" type="range" min="50" max="120" step="1" value={setup.strokeMm} onChange={e=>update("strokeMm",Number(e.target.value))}/><div className="range-ends"><span>50 mm</span><span>120 mm</span></div></div>
        <div className="control-group"><div className="control-label-row"><label htmlFor="rod">LARGO DE BIELA</label><output>{setup.rodMm} mm</output></div><input id="rod" type="range" min={rodMin} max="220" step="1" value={setup.rodMm} onChange={e=>update("rodMm",Number(e.target.value))}/><div className="range-ends"><span>{rodMin} mm</span><span>220 mm</span></div></div>
        <div className="control-group rpm-control"><div className="control-label-row"><label htmlFor="rpm">RÉGIMEN DEL MOTOR</label><output>{setup.rpm.toLocaleString("es-AR")} RPM</output></div><input id="rpm" type="range" min="0" max="8000" step="50" value={setup.rpm} onChange={e=>update("rpm",Number(e.target.value))}/><div className="range-ends"><span>0 RPM</span><span>8.000 RPM</span></div></div>
        <div className="derived-box"><div className="derived-heading">DATOS MECÁNICOS <span>CALCULADOS</span></div>
          <div className="derived-row"><span>Radio del cigüeñal</span><strong>{fmt(metresToMillimetres(geometry.crankRadiusM),1)} mm</strong></div>
          <div className="derived-row"><span>Relación biela / manivela</span><strong>{fmt(geometry.rodToCrankRatio,2)} : 1</strong></div>
          <div className="derived-row"><span>Relación de compresión</span><strong>10,5 : 1 <small>referencia</small></strong></div>
        </div>
      </aside>
    </div>
    <footer className="disclaimer"><span>ALCANCE FÍSICO</span> Vista 3D interactiva con geometría cinemática, válvulas, árbol de levas, conductos y partículas de gas. El cilindro integra masa y energía con flujo compresible 0D, combustión finita tipo Wiebe, trabajo presión-volumen y pérdidas térmicas simplificadas. No resuelve turbulencia, química detallada, ondas acústicas ni CFD; los valores no sustituyen datos experimentales.</footer>
  </main>;
}

export default App;
