import { useEffect, useMemo, useRef, useState } from "react";
import { createEngineGeometry, type EngineGeometry } from "../packages/simulation-core/src/geometry";
import { calculateSliderCrankState } from "../packages/simulation-core/src/mechanics";
import { millimetresToMetres, metresToMillimetres } from "../packages/simulation-core/src/units";
import { calculateValveState, DEFAULT_VALVE_TIMING } from "../packages/simulation-core/src/mechanics/valve-timing";
import { createIncrementalCylinderState, advanceIncrementalCylinderState, type IncrementalCylinderState } from "../packages/simulation-core/src/mechanics/incremental-cylinder";
import EngineScene from "./InlineFourScene";
import { getInlineFourCylinderPhase } from "../packages/simulation-core/src/mechanics/inline-four";
import { calculateCylinderMechanics, INITIAL_ENGINE_SYSTEMS, type EngineSystemsState, type EngineSystemsInput } from "../packages/simulation-core/src/mechanics/engine-systems";
import { advanceEngineSimulation } from "../packages/simulation-core/src/mechanics/engine-simulation";
import { INITIAL_ENGINE_DAMAGE, type EngineDamageState } from "../packages/simulation-core/src/mechanics/engine-damage";
import { calculateCrankshaftSubstepSeconds, calculateInlineFourCrankCoupling, DEFAULT_ENGINE_IDLE_RPM, stepCrankshaft, type CrankshaftDynamicState } from "../packages/simulation-core/src/mechanics/crankshaft-coupling";
import EngineAudio from "./EngineAudio";
import FourStroke2DView from "./FourStroke2DView";
import { calculateStarterTorque, starterCanDisengage } from "../packages/simulation-core/src/mechanics/starter-system";
import { consumeFixedSteps, createFixedStepAccumulator, FIXED_PHYSICS_STEP_SECONDS } from "../packages/simulation-core/src/mechanics/fixed-step-clock";
import { INITIAL_TIMING_DRIVE_STATE, stepTimingDrive, TIMING_DRIVE_REFLECTED_LOAD_NM, type TimingDriveState } from "../packages/simulation-core/src/mechanics/timing-drive";

type Setup = { boreMm: number; strokeMm: number; rodMm: number; compressionRatio: number };
const IDLE_RPM = DEFAULT_ENGINE_IDLE_RPM;
const SIMULATION_SPEEDS = [
  { value: 1, label: "1×", description: "NORMAL" },
  { value: 0.5, label: "0.5×", description: "LENTA" },
  { value: 0.25, label: "0.25×", description: "MUY LENTA" },
  { value: 0.1, label: "0.1×", description: "DETALLE" },
  { value: 0.05, label: "0.05×", description: "ULTRA" },
  { value: 0.01, label: "0.01×", description: "MÍNIMA" }
] as const;
const INITIAL: Setup = { boreMm: 86, strokeMm: 86, rodMm: 143, compressionRatio: 10.5 };
const TAU = Math.PI * 2;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : "—";

function geometryFor(s: Setup): EngineGeometry {
  return createEngineGeometry({
    cylinderCount: 4,
    boreM: millimetresToMetres(s.boreMm),
    strokeM: millimetresToMetres(s.strokeMm),
    connectingRodLengthM: millimetresToMetres(s.rodMm),
    compressionRatio: s.compressionRatio,
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

function App() {
  const [setup,setSetup]=useState<Setup>(INITIAL);
  const targetRpm=IDLE_RPM;
  const [cycleAngle,setCycleAngle]=useState(0);
  const cylinderModelStatesRef=useRef<(IncrementalCylinderState|null)[]>([null,null,null,null]);
  const cylinderModelGeometryRef=useRef<EngineGeometry|null>(null);
  const [shaftRpm,setShaftRpm]=useState(0);
  const crankshaftRef=useRef<CrankshaftDynamicState>({cycleAngleDeg:0,rpm:0});
  const [timingDrive,setTimingDrive]=useState<TimingDriveState>({...INITIAL_TIMING_DRIVE_STATE});
  const timingDriveRef=useRef<TimingDriveState>({...INITIAL_TIMING_DRIVE_STATE});

  const [running,setRunning]=useState(true);
  const [engineMode,setEngineMode]=useState<"off"|"cranking"|"running">("off");
  const [assetView,setAssetView]=useState<"3d"|"2d">("3d");
  const [visibleSections,setVisibleSections]=useState({block:true,head:true,valvetrain:true,bottomEnd:true,auxiliary:true});
  const sectionLabels=[["block","BLOQUE"],["head","CULATA"],["valvetrain","DISTRIBUCIÓN"],["bottomEnd","TREN INFERIOR"],["auxiliary","AUXILIARES"]] as const;
  const [visualRate,setVisualRate]=useState(1);
  const [sparkFlash,setSparkFlash]=useState(false);
  const [systems,setSystems]=useState<EngineSystemsState>(INITIAL_ENGINE_SYSTEMS);
  const systemsRef=useRef<EngineSystemsState>({...INITIAL_ENGINE_SYSTEMS});
  const [damage,setDamage]=useState<EngineDamageState>(INITIAL_ENGINE_DAMAGE);
  const damageRef=useRef<EngineDamageState>({...INITIAL_ENGINE_DAMAGE});
  const effectiveRpm=damage.seized?0:shaftRpm;
  const frictionTorquePerCylinder=damage.frictionTorqueNm/4;
  const frictionPowerPerCylinder=frictionTorquePerCylinder*effectiveRpm*TAU/60;
  const systemInputRef=useRef<EngineSystemsInput>({rpm:0,load:0,exhaustGasTemperatureC:25,ambientTemperatureC:25});
  const geometry=useMemo(()=>geometryFor(setup),[setup.boreMm,setup.strokeMm,setup.rodMm,setup.compressionRatio]);
  const crankAngle=(cycleAngle%360)*Math.PI/180;
  const current=useMemo(()=>calculateSliderCrankState(geometry,crankAngle,effectiveRpm),[geometry,crankAngle,effectiveRpm]);
  const phase=phaseAt(cycleAngle);
  const valveState=calculateValveState(cycleAngle);
  const cylinderStates = useMemo(() => {
    if (cylinderModelGeometryRef.current !== geometry) {
      cylinderModelGeometryRef.current = geometry;
      cylinderModelStatesRef.current = [null,null,null,null];
    }
    return [0, 1, 2, 3].map(index => {
      const state = cylinderModelStatesRef.current[index] ?? createIncrementalCylinderState(geometry);
      cylinderModelStatesRef.current[index] = state;
      return {
        ...state,
        pressurePa:state.pressurePa*(1-damage.misfireProbability*.65)*(engineMode==="off"?0.35:1),
        burnedFraction:state.burnedFraction*(1-damage.misfireProbability)*(engineMode==="running"?1:0),
        indicatedTorqueNm:Math.max(0,state.indicatedTorqueNm*damage.powerFactor-frictionTorquePerCylinder),
        indicatedPowerW:Math.max(0,state.indicatedPowerW*damage.powerFactor-frictionPowerPerCylinder),
        heatReleaseRateW:state.heatReleaseRateW*(1-damage.misfireProbability)*(engineMode==="running"?1:0)
      };
    });
  }, [geometry, cycleAngle, effectiveRpm, engineMode, damage.misfireProbability, damage.powerFactor, damage.frictionTorqueNm]);
  const crankCoupling=useMemo(()=>calculateInlineFourCrankCoupling(geometry,cycleAngle%360,effectiveRpm,cylinderStates.map(state=>state.pressurePa),101325,cycleAngle),[geometry,cycleAngle,effectiveRpm,cylinderStates]);
  const sceneTelemetry=useMemo(()=>cylinderStates.map(state=>({pressurePa:state.pressurePa,intakeMassFlowKgPerS:state.intakeMassFlowKgPerS,exhaustMassFlowKgPerS:state.exhaustMassFlowKgPerS,burnedFraction:state.burnedFraction,heatReleaseRateW:state.heatReleaseRateW,temperatureK:state.temperatureK})),[cylinderStates]);

  const thermodynamics = cylinderStates[0]!;
  const mechanicalStates = useMemo(() => [0,1,2,3].map(index =>
    calculateCylinderMechanics(geometry,cycleAngle%360,cycleAngle,index,effectiveRpm,DEFAULT_VALVE_TIMING,damage.valveFloatSeverity,damage.thermalExpansionMm)
  ),[geometry,cycleAngle,effectiveRpm,damage.valveFloatSeverity,damage.thermalExpansionMm]);
  const meanGasTemperature = cylinderStates.reduce((sum,state)=>sum+state.temperatureK,0)/cylinderStates.length;
  const meanBurn = cylinderStates.reduce((sum,state)=>sum+state.burnedFraction,0)/cylinderStates.length;
  systemInputRef.current = {
    rpm:effectiveRpm,
    load:engineMode==="running"?clamp(.12+meanBurn*.78,.1,.95):0,
    exhaustGasTemperatureC:clamp(meanGasTemperature*.42-90,25,950),
    ambientTemperatureC:25,
    oilLeakLPerMin:damageRef.current.bearingWear*.004+damageRef.current.pistonScuffing*.003,
    coolantLeakLPerMin:damageRef.current.headGasketDamage*.012,
    oilPickupAvailability:1,
    coolantPumpEfficiency:1
  };
  const intakeOpen=valveState.intakeOpen;
  const exhaustOpen=valveState.exhaustOpen;
  const spark=engineMode==="running"&&valveState.sparkActive;
  const displacement=metresToMillimetres(current.pistonDisplacementM);
  const litres=geometry.totalDisplacementM3*1000;
  const update=(key:keyof Setup,value:number)=>setSetup(previous=>{
    const next={...previous,[key]:value};
    if(key==="strokeMm"&&next.rodMm<=value/2)next.rodMm=Math.floor(value/2)+5;
    return next;
  });
  useEffect(()=>{
    if(!running)return;
    let frame=0,previous=0,sparkTimer=0,lastSystemPaint=0,lastUiPaint=0;
    let accumulator=createFixedStepAccumulator();
    let activeEngineMode=engineMode;
    const sparkAngle=360-DEFAULT_VALVE_TIMING.sparkAdvanceBtdc;
    const tick=(time:number)=>{
      if(previous!==0){
        const timing=consumeFixedSteps(accumulator,(time-previous)/1000,visualRate);
        accumulator=timing.state;
        let seized=false;
        for(let step=0;step<timing.stepCount;step++){
          const dt=FIXED_PHYSICS_STEP_SECONDS;
          const actualRpm=damageRef.current.seized?0:crankshaftRef.current.rpm;
          const nextSimulation=advanceEngineSimulation(
            {systems:systemsRef.current,damage:damageRef.current},
            {...systemInputRef.current,rpm:actualRpm},
            dt
          );
          systemsRef.current=nextSimulation.systems;
          damageRef.current=nextSimulation.damage;
          if(nextSimulation.damage.seized){
            crankshaftRef.current={...crankshaftRef.current,rpm:0};
            activeEngineMode="off";
            seized=true;
            break;
          }

          // Subdivide each fixed step so high RPM never jumps across a large
          // part of the four-stroke cycle in one crankshaft integration.
          let remaining=dt;
          while(remaining>1e-10){
            const current=crankshaftRef.current;
            const substepSeconds=calculateCrankshaftSubstepSeconds(remaining,current.rpm,activeEngineMode==="running"?targetRpm:0);
            const from=((current.cycleAngleDeg%720)+720)%720;
            const distance=(sparkAngle-from+720)%720;
            const currentCylinderStates=cylinderModelStatesRef.current.map((state,index)=>{
              const initialized=state??createIncrementalCylinderState(geometry);
              cylinderModelStatesRef.current[index]=initialized;
              return initialized;
            });
            const cylinderPressures=currentCylinderStates.map(state=>
              state.pressurePa*(1-damageRef.current.misfireProbability*.65)*(activeEngineMode==="off"?0.35:1)
            );
            const coupling=calculateInlineFourCrankCoupling(
              geometry,current.cycleAngleDeg%360,current.rpm,cylinderPressures,101_325,current.cycleAngleDeg
            );
            const gasTorque=activeEngineMode==="running"?coupling.indicatedGasTorqueNm:0;
            const starterTorque=activeEngineMode==="cranking"?calculateStarterTorque(current.rpm,true):0;
            const nextCrankshaft=stepCrankshaft(current,gasTorque,{
              targetRpm:activeEngineMode==="running"?targetRpm:0,
              dtSeconds:substepSeconds,
              loadTorqueNm:(activeEngineMode==="cranking"?8:22)+(timingDriveRef.current.beltBroken?0:TIMING_DRIVE_REFLECTED_LOAD_NM),
              frictionTorqueNm:3,
              inertiaKgM2:.42,
              governorGainNmPerRpm:.8,
              maximumGasTorqueNm:220,
              externalTorqueNm:starterTorque
            });
            crankshaftRef.current=nextCrankshaft;
            // The timing belt is a positive mechanical constraint. Its camshaft
            // speed comes from pulley tooth ratio; overload breaks the belt and
            // removes combustion so the crank coasts while the cam train winds down.
            timingDriveRef.current=stepTimingDrive(timingDriveRef.current,{
              crankCycleAngleDeg:nextCrankshaft.cycleAngleDeg,
              crankRpm:nextCrankshaft.rpm,
              dtSeconds:substepSeconds,
              crankDriveTorqueNm:Math.abs(gasTorque+starterTorque)+(!timingDriveRef.current.beltBroken?TIMING_DRIVE_REFLECTED_LOAD_NM:0)
            });
            if(timingDriveRef.current.beltBroken&&activeEngineMode==="running")activeEngineMode="off";
            // Advance each cylinder on every crank substep. This prevents the
            // 30 Hz UI angle from wrapping past one or more 720° cycles at high RPM.
            cylinderModelStatesRef.current=cylinderModelStatesRef.current.map((previous,index)=>{
              const state=previous??createIncrementalCylinderState(geometry);
              const phase=getInlineFourCylinderPhase(nextCrankshaft.cycleAngleDeg%360,nextCrankshaft.cycleAngleDeg,index);
              return advanceIncrementalCylinderState(state,geometry,phase.cycleAngleDeg,nextCrankshaft.rpm);
            });
            const advance=(nextCrankshaft.cycleAngleDeg-from+720)%720;
            if(activeEngineMode==="running"&&advance>0&&distance<=advance){
              setSparkFlash(true);
              window.clearTimeout(sparkTimer);
              sparkTimer=window.setTimeout(()=>setSparkFlash(false),Math.min(95/visualRate,9_500));
            }
            if(activeEngineMode==="cranking"&&!timingDriveRef.current.beltBroken&&starterCanDisengage(nextCrankshaft.rpm))activeEngineMode="running";
            if(activeEngineMode==="running"&&nextCrankshaft.rpm<8)activeEngineMode="off";
            remaining-=substepSeconds;
          }
        }
        if(activeEngineMode!==engineMode)setEngineMode(activeEngineMode);
        if(time-lastSystemPaint>120||seized){
          setSystems({...systemsRef.current});
          setDamage({...damageRef.current});
          lastSystemPaint=time;
        }
        if(seized){
          setShaftRpm(0);
          setRunning(false);
        }else if(time-lastUiPaint>=16){
          setCycleAngle(crankshaftRef.current.cycleAngleDeg);
          setTimingDrive({...timingDriveRef.current});
          setShaftRpm(crankshaftRef.current.rpm);
          lastUiPaint=time;
        }
      }
      previous=time;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(frame);window.clearTimeout(sparkTimer);};
  },[running,targetRpm,visualRate,engineMode,geometry]);
  const reset=()=>{cylinderModelStatesRef.current=[null,null,null,null];cylinderModelGeometryRef.current=null;setSetup(INITIAL);crankshaftRef.current={cycleAngleDeg:0,rpm:0};timingDriveRef.current={...INITIAL_TIMING_DRIVE_STATE};setTimingDrive({...INITIAL_TIMING_DRIVE_STATE});setCycleAngle(0);setShaftRpm(0);setEngineMode("off");setVisualRate(1);setSparkFlash(false);systemsRef.current={...INITIAL_ENGINE_SYSTEMS};setSystems({...INITIAL_ENGINE_SYSTEMS});damageRef.current={...INITIAL_ENGINE_DAMAGE};setDamage({...INITIAL_ENGINE_DAMAGE});setRunning(true);};
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
      <div className="topbar-right"><span className="live-indicator">{timingDrive.beltBroken?"CORREA DE DISTRIBUCIÓN ROTA":damage.seized?"MOTOR GRIPADO":engineMode==="cranking"?"ACCIONANDO BURRO":engineMode==="running"?"MOTOR ENCENDIDO":"MOTOR APAGADO"}</span><span className="topbar-divider"/> L4 · 4T · 16V</div>
    </header>
    <section className="intro">
      <div><div className="eyebrow">LABORATORIO DE MECÁNICA / 01</div><h1>Motor <em>L4 DOHC.</em></h1><p>Cuatro cilindros en línea, 16 válvulas, doble árbol de levas y distribución sincronizada. Explorá su mecánica interna en un corte 3D.</p></div>
      <button className="reset-button" onClick={reset} type="button"><span>↺</span> REINICIAR</button>
    </section>
    {assetView==="3d"&&<section className="metric-strip" aria-label="Datos principales del motor">
      <div className="metric"><span className="metric-label">CILINDRADA</span><strong>{fmt(litres,3)} <small>L</small></strong></div>
      <div className="metric"><span className="metric-label">RPM SIMULADAS DEL CIGÜEÑAL</span><strong>{Math.round(effectiveRpm).toLocaleString("es-AR")} <small>RPM</small></strong><span className="metric-note">Ralentí fijo: {IDLE_RPM.toLocaleString("es-AR")} RPM · tiempo {visualRate.toFixed(2)}×</span></div>
      <div className="metric"><span className="metric-label">RECORRIDO DEL PISTÓN</span><strong>{fmt(displacement,1)} <small>mm</small></strong><span className="metric-note">desde el PMS</span></div>
      <div className="metric"><span className="metric-label">ETAPA ACTUAL</span><strong className="phase-metric">{phase.toUpperCase()}</strong><span className="metric-note">{Math.floor(cycleAngle)}° / 720°</span></div>
    </section>}
    <div className="workspace-grid">
      <section className="panel mechanism-panel">
        <div className="panel-header engine-view-header"><div><div className="panel-kicker">01 / MOTOR EN MOVIMIENTO</div><h2>{assetView==="3d"?"Conjunto mecánico · vista 3D":"Ciclo de cuatro tiempos · vista 2D"}</h2></div><div className="scene-view-switch" role="group" aria-label="Vista del motor"><button type="button" className={assetView==="3d"?"active":""} aria-pressed={assetView==="3d"} onClick={()=>setAssetView("3d")}>3D · MECÁNICA</button><button type="button" className={assetView==="2d"?"active":""} aria-pressed={assetView==="2d"} onClick={()=>setAssetView("2d")}>2D · CICLO</button></div></div>
        <div className={`drawing-stage engine-view-stage ${assetView==="2d"?"is-2d-view":"is-3d-view"}`}>{assetView==="3d"?<><div className="scene-section-toolbar" role="group" aria-label="Secciones visibles del motor">{sectionLabels.map(([key,label])=><button key={key} type="button" className={visibleSections[key]?"is-visible":""} aria-pressed={visibleSections[key]} onClick={()=>setVisibleSections(current=>({...current,[key]:!current[key]}))}>{label}</button>)}</div><EngineScene geometry={geometry} angle={cycleAngle} rpm={effectiveRpm} mechanics={mechanicalStates} systems={systems} cylinderStates={sceneTelemetry} sparkFlash={sparkFlash} starterActive={engineMode==="cranking"} visibleSections={visibleSections} timingDrive={timingDrive}/><div className="drawing-legend"><span><i className="legend-piston"/> PISTÓN / BIELA / CIGÜEÑAL</span><span><i className="legend-intake"/> ADMISIÓN</span><span><i className="legend-exhaust"/> ESCAPE</span><span><i className="legend-spark"/> COMBUSTIÓN</span><span className={`legend-note ${timingDrive.beltBroken?"timing-drive-failed":""}`}>{timingDrive.beltBroken?"FALLA DE DISTRIBUCIÓN · CORREA ROTA":"CORREA DENTADA · CIGÜEÑAL 24T → ÁRBOLES 48T · 2:1"}</span><span className="legend-note">VOLANTE / CORONA DE ARRANQUE: EXTREMO OPUESTO</span></div></>:<><FourStroke2DView geometry={geometry} angle={cycleAngle} rpm={effectiveRpm} playing={running} visualRate={visualRate} onTogglePlaying={()=>setRunning(value=>!value)} onVisualRateChange={setVisualRate} engineMode={engineMode} onStart={()=>setEngineMode(engineMode==="running"?"off":"cranking")} cylinderState={cylinderStates[0]!}/></>}</div>
        {assetView==="3d"&&<div className="transport">
          <button className={`starter-button ${engineMode==="cranking"?"starter-active":""}`} type="button" disabled={damage.seized} onClick={()=>setEngineMode(engineMode==="running"||engineMode==="cranking"?"off":"cranking")}>{engineMode==="running"?"DETENER MOTOR":engineMode==="cranking"?"DETENER ARRANQUE":timingDrive.beltBroken?"⏻ GIRAR SIN DISTRIBUCIÓN":"⏻ START"}</button>
          <button className="transport-button" onClick={()=>setRunning(v=>!v)} type="button" aria-label={running?"Pausar simulación":"Reanudar simulación"}>{running?"Ⅱ":"▶"}</button>
          <div className="transport-readout"><strong>{phase}</strong><span>FASE DEL CICLO</span></div><EngineAudio rpm={effectiveRpm*visualRate} running={running&&!damage.seized} load={clamp(.18+meanBurn*.58+(1-damage.powerFactor)*.12,.12,.95)} cycleAngle={cycleAngle} engineMode={engineMode}/>
          <div className="transport-speed"><span className="speed-mode-label">VELOCIDAD DE SIMULACIÓN</span><div className="speed-mode-buttons">{SIMULATION_SPEEDS.map(speed=><button key={speed.value} type="button" className={visualRate===speed.value?"is-active":""} aria-pressed={visualRate===speed.value} onClick={()=>setVisualRate(speed.value)} title={speed.description}>{speed.label}</button>)}</div></div>
        </div>}
        {assetView==="3d"&&<><div className="phase-explainer"><span className="phase-dot"/><div><strong>{phase}</strong><p>{phaseCopy[phase]}</p><div className="valve-live-state"><span className={intakeOpen?"is-open":"is-closed"}>ADMISIÓN: {intakeOpen?"ABIERTA":"CERRADA"} · {fmt(valveState.intakeLiftMm,1)} mm</span><span className={exhaustOpen?"is-open":"is-closed"}>ESCAPE: {exhaustOpen?"ABIERTO":"CERRADO"} · {fmt(valveState.exhaustLiftMm,1)} mm</span><span className={spark?"spark-live":""}>ENCENDIDO: {spark?"CHISPA":"EN ESPERA"}</span><span>FLUJO: {intakeOpen?"ADMISIÓN":exhaustOpen?"GASES DE ESCAPE":"SIN INTERCAMBIO"}</span></div></div></div>
        <div className="timing-card"><div className="timing-card-heading">CALADO DE DISTRIBUCIÓN <span>REFERENCIA INICIAL</span></div><div className="timing-grid"><div><span>Admisión abre</span><strong>{DEFAULT_VALVE_TIMING.intakeOpensBtdc}° antes PMS</strong></div><div><span>Admisión cierra</span><strong>{DEFAULT_VALVE_TIMING.intakeClosesAbdc}° después PMI</strong></div><div><span>Escape abre</span><strong>{DEFAULT_VALVE_TIMING.exhaustOpensBbdc}° antes PMI</strong></div><div><span>Escape cierra</span><strong>{DEFAULT_VALVE_TIMING.exhaustClosesAtdc}° después PMS</strong></div><div><span>Avance de encendido</span><strong>{DEFAULT_VALVE_TIMING.sparkAdvanceBtdc}° antes PMS</strong></div><div><span>Alzada máxima</span><strong>{DEFAULT_VALVE_TIMING.intakeMaxLiftMm} / {DEFAULT_VALVE_TIMING.exhaustMaxLiftMm} mm</strong></div></div><p>Perfil de leva simplificado con apertura y cierre progresivos; valores orientativos, no corresponden a un motor comercial específico.</p></div>
        <div className="thermo-card"><div className="timing-card-heading">ESTADO TERMODINÁMICO · CILINDRO 1 <span>MODELO 0D · 1 ZONA</span></div><div className="cylinder-state-grid">{cylinderStates.map((state,index)=><div key={index}><span>CILINDRO {index+1}</span><strong>{fmt(state.pressurePa/100000,2)} <small>bar</small></strong><small>{fmt(state.temperatureK-273.15,0)} °C</small><small>{fmt(crankCoupling.cylinders[index]!.gasTorqueNm,1)} Nm al cigüeñal</small></div>)}</div><div className="thermo-values"><div><span>PAR DE GASES AL CIGÜEÑAL</span><strong>{fmt(crankCoupling.indicatedGasTorqueNm,1)} <small>Nm</small></strong></div><div><span>ÁRBOL DE LEVAS</span><strong>{fmt(timingDrive.camshaftAngleDeg,1)} <small>°</small></strong><small>{fmt(timingDrive.camshaftRpm,0)} RPM</small></div><div><span>TENSIÓN CALCULADA DE CORREA</span><strong>{fmt(timingDrive.beltTensionN,0)} <small>N</small></strong></div><div><span>PRESIÓN INTERNA</span><strong>{fmt(thermodynamics.pressurePa/100000,2)} <small>bar</small></strong></div><div><span>TEMPERATURA DEL GAS</span><strong>{fmt(thermodynamics.temperatureK-273.15,0)} <small>°C</small></strong></div><div><span>VOLUMEN INSTANTÁNEO</span><strong>{fmt(thermodynamics.volumeM3*1e6,1)} <small>cm³</small></strong></div><div><span>MASA ATRAPADA</span><strong>{fmt(thermodynamics.massKg*1000,3)} <small>g</small></strong></div><div><span>CAUDAL DE ADMISIÓN</span><strong>{fmt(thermodynamics.intakeMassFlowKgPerS*1000,1)} <small>g/s</small></strong></div><div><span>CAUDAL DE ESCAPE</span><strong>{fmt(thermodynamics.exhaustMassFlowKgPerS*1000,1)} <small>g/s</small></strong></div><div><span>FRACCIÓN QUEMADA</span><strong>{fmt(thermodynamics.burnedFraction*100,1)} <small>%</small></strong></div><div><span>LIBERACIÓN DE CALOR</span><strong>{fmt(thermodynamics.heatReleaseRateW/1000,2)} <small>kW</small></strong></div><div><span>PAR INDICADO INSTANTÁNEO</span><strong>{fmt(thermodynamics.indicatedTorqueNm,1)} <small>Nm</small></strong></div><div><span>POTENCIA INDICADA INSTANTÁNEA</span><strong>{fmt(thermodynamics.indicatedPowerW/1000,2)} <small>kW</small></strong></div></div><p>Modelo 0D de masa y energía: flujo compresible por válvulas con estrangulamiento, calor liberado con ley Wiebe y pérdidas térmicas a paredes. Los resultados son estimaciones didácticas, no datos de un motor calibrado ni CFD.</p>
          <div className="systems-card"><div className="timing-card-heading">DESGASTE Y CONSECUENCIAS MECÁNICAS <span>MODELO DE DAÑO PROGRESIVO</span></div>
            <div className="systems-grid">
              <div><span>SALUD MECÁNICA</span><strong>{Math.round(100-Math.max(damage.bearingWear,damage.pistonScuffing,damage.valveTrainWear,damage.rodFatigue,damage.headGasketDamage))} <small>%</small></strong></div>
              <div><span>PÉRDIDA DE POTENCIA</span><strong>{fmt((1-damage.powerFactor)*100,1)} <small>%</small></strong></div>
              <div><span>DESGASTE COJINETES</span><strong>{fmt(damage.bearingWear,1)} <small>%</small></strong></div>
              <div><span>RAYADO DE PISTÓN</span><strong>{fmt(damage.pistonScuffing,1)} <small>%</small></strong></div>
              <div><span>DESGASTE DISTRIBUCIÓN</span><strong>{fmt(damage.valveTrainWear,1)} <small>%</small></strong></div>
              <div><span>FATIGA DE BIELAS</span><strong>{fmt(damage.rodFatigue,1)} <small>%</small></strong></div>
              <div><span>DAÑO JUNTA DE TAPA</span><strong>{fmt(damage.headGasketDamage,1)} <small>%</small></strong></div>
              <div><span>EXPANSIÓN TÉRMICA ESTIMADA</span><strong>{fmt(damage.thermalExpansionMm,3)} <small>mm</small></strong></div>
            </div>
            <div className="system-alerts">{damage.warnings.length===0?<span className="healthy-state">✓ SIN DAÑO MECÁNICO DETECTADO</span>:damage.warnings.map((warning,index)=><span key={index} className="warning-state">⚠ {warning}</span>)}</div>
          </div>
          <div className="systems-card"><div className="timing-card-heading">SISTEMAS AUXILIARES <span>MODELO TÉRMICO LUMPED</span></div>
            <div className="systems-grid">
              <div><span>ACEITE · TEMPERATURA</span><strong>{fmt(systems.oilTemperatureC,1)} <small>°C</small></strong></div>
              <div><span>ACEITE · PRESIÓN</span><strong>{fmt(systems.oilPressureBar,2)} <small>bar</small></strong></div>
              <div><span>CAUDAL DE ACEITE</span><strong>{fmt(systems.oilFlowLPerMin,1)} <small>L/min</small></strong></div>
              <div><span>NIVEL DE ACEITE</span><strong>{fmt(systems.oilLevelL,1)} <small>L</small></strong></div>
              <div><span>REFRIGERANTE</span><strong>{fmt(systems.coolantTemperatureC,1)} <small>°C</small></strong></div>
              <div><span>PRESIÓN REFRIGERANTE</span><strong>{fmt(systems.coolantPressureBar,2)} <small>bar</small></strong></div>
              <div><span>CAUDAL REFRIGERANTE</span><strong>{fmt(systems.coolantFlowLPerMin,1)} <small>L/min</small></strong></div>
              <div><span>NIVEL REFRIGERANTE</span><strong>{fmt(systems.coolantLevelL,1)} <small>L</small></strong></div>
              <div><span>TEMPERATURA DE TAPA</span><strong>{fmt(systems.headTemperatureC,1)} <small>°C</small></strong></div>
              <div><span>TEMPERATURA DE ESCAPE</span><strong>{fmt(systems.exhaustTemperatureC,0)} <small>°C</small></strong></div>
            </div>
            <div className="system-alerts">
              <span className={systems.lubricationWarning?"warning-state":"healthy-state"}>{systems.lubricationWarning?"⚠ PRESIÓN / PELÍCULA DE ACEITE BAJA":"✓ LUBRICACIÓN DENTRO DEL RANGO"}</span>
              <span className={systems.overheating?"warning-state":"healthy-state"}>{systems.overheating?"⚠ TEMPERATURA EXCESIVA":"✓ REFRIGERACIÓN ESTABLE"}</span>
              {mechanicalStates.some(state=>state.valveCollision)&&<span className="warning-state">⚠ LIMITADOR DE INTERFERENCIA ACTIVADO</span>}
              {mechanicalStates.some(state=>state.mechanicalWarning)&&<span className="warning-state">{mechanicalStates.find(state=>state.mechanicalWarning)!.mechanicalWarning}</span>}
            </div>
            <div className="derived-row"><span>Holgura mínima pistón-válvula</span><strong>{fmt(Math.min(...mechanicalStates.map(state=>state.minimumValveClearanceMm)),2)} mm</strong></div>
            <div className="derived-row"><span>Holgura biela / bloque</span><strong>{fmt(Math.min(...mechanicalStates.map(state=>state.rodToBlockClearanceMm)),2)} mm</strong></div>
            <div className="derived-row"><span>Holgura radial de falda</span><strong>{fmt(mechanicalStates[0]!.skirtClearanceMm,3)} mm</strong></div>
            <div className="derived-row"><span>Alzada efectiva admisión / escape</span><strong>{fmt(mechanicalStates[0]!.intakeLiftActualMm,2)} / {fmt(mechanicalStates[0]!.exhaustLiftActualMm,2)} mm</strong></div>
          </div></div></>}
      </section>
      <aside className="panel controls-panel">
        <div className="panel-header"><div><div className="panel-kicker">02 / CONFIGURACIÓN</div><h2>Dimensiones del motor</h2></div><span className="settings-icon">⚙</span></div>
        <div className="control-group rpm-control"><div className="control-label-row"><span>RÉGIMEN DE RALENTÍ</span><output>{IDLE_RPM.toLocaleString("es-AR")} RPM</output></div><p className="control-help">Fijo para mantener una referencia mecánica constante. Solo se modifica la velocidad de reproducción de la simulación.</p></div>
        <div className="derived-box"><div className="derived-heading">DATOS MECÁNICOS <span>CALCULADOS</span></div>
          <div className="derived-row"><span>Radio del cigüeñal</span><strong>{fmt(metresToMillimetres(geometry.crankRadiusM),1)} mm</strong></div>
          <div className="derived-row"><span>Relación biela / manivela</span><strong>{fmt(geometry.rodToCrankRatio,2)} : 1</strong></div>
          <div className="derived-row"><span>Relación de compresión</span><strong>{fmt(geometry.compressionRatio,1)} : 1</strong></div>
        </div>
      </aside>
    </div>
    <footer className="disclaimer"><span>ALCANCE FÍSICO</span> Cinemática rígida con holguras y limitador de interferencia pistón-válvula; lubricación y refrigeración de parámetros concentrados; cilindros termodinámicos 0D. No es todavía un solucionador de contacto deformable, tribología EHL, CFD ni un modelo calibrado de un motor comercial.</footer>
  </main>;
}

export default App;
