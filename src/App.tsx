import { useEffect, useMemo, useState } from "react";
import { createEngineGeometry, type EngineGeometry } from "../packages/simulation-core/src/geometry";
import { calculateSliderCrankState } from "../packages/simulation-core/src/mechanics";
import { millimetresToMetres, metresToMillimetres } from "../packages/simulation-core/src/units";

type Setup = { boreMm: number; strokeMm: number; rodMm: number; rpm: number };
const INITIAL: Setup = { boreMm: 86, strokeMm: 86, rodMm: 143, rpm: 1800 };
const TAU = Math.PI * 2;
const fmt = (n: number, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : "—";
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

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

function Mechanism({ geometry, angle }: { geometry: EngineGeometry; angle: number }) {
  const scale = 130 / geometry.strokeM;
  const radius = geometry.crankRadiusM * scale;
  const rod = geometry.connectingRodLengthM * scale;
  const cx = 330, cy = 342;
  const crankX = cx + radius * Math.sin(angle);
  const crankY = cy - radius * Math.cos(angle);
  const displacement = calculateSliderCrankState(geometry, angle, 0).pistonDisplacementM;
  const pistonY = cy - (rod + radius) + displacement * scale;
  const boreWidth = clamp(geometry.boreM * scale * 1.28, 82, 126);
  const pistonTop = pistonY - 17;
  return <svg className="engine-drawing" viewBox="0 0 660 410" role="img" aria-label="Animated side view of a piston, connecting rod and crankshaft">
    <defs>
      <linearGradient id="pistonMetal" x1="0" x2="1"><stop offset="0" stopColor="#84929a"/><stop offset=".48" stopColor="#e1e8e9"/><stop offset="1" stopColor="#68777f"/></linearGradient>
      <linearGradient id="rodMetal" x1="0" x2="1"><stop offset="0" stopColor="#59666d"/><stop offset=".5" stopColor="#c2cdd0"/><stop offset="1" stopColor="#536168"/></linearGradient>
      <radialGradient id="crankMetal"><stop offset="0" stopColor="#d5dedf"/><stop offset=".72" stopColor="#74838a"/><stop offset="1" stopColor="#3b484e"/></radialGradient>
    </defs>
    <g className="drawing-grid">
      {Array.from({length:13},(_,i)=><line key={i} x1={40+i*48} y1="18" x2={40+i*48} y2="390"/>)}
      {Array.from({length:8},(_,i)=><line key={i} x1="34" y1={28+i*48} x2="626" y2={28+i*48}/>)}
    </g>
    <line x1={cx} y1="20" x2={cx} y2="365" className="centerline"/>
    <path d={`M ${cx-boreWidth/2-12} 24 V ${cy-76} M ${cx+boreWidth/2+12} 24 V ${cy-76}`} className="cylinder-wall"/>
    <path d={`M ${cx-boreWidth/2-12} 24 H ${cx+boreWidth/2+12}`} className="cylinder-head"/>
    <circle cx={cx} cy={cy} r={radius+14} className="crankcase"/>
    <circle cx={cx} cy={cy} r={radius} className="crank-orbit"/>
    <path d={`M ${cx-78} 372 H ${cx+78}`} className="crank-base"/>
    <line x1={cx} y1={cy} x2={crankX} y2={crankY} className="crank-arm"/>
    <line x1={cx} y1={cy} x2={crankX} y2={crankY} className="crank-highlight"/>
    <line x1={cx} y1={cy} x2={cx} y2={cy-radius} className="reference-arm"/>
    <line x1={cx} y1={cy} x2={cx} y2={cy-radius-25} className="reference-dash"/>
    <line x1={cx} y1={pistonY} x2={crankX} y2={crankY} className="connecting-rod-shadow"/>
    <line x1={cx} y1={pistonY} x2={crankX} y2={crankY} className="connecting-rod"/>
    <rect x={cx-boreWidth/2} y={pistonTop} width={boreWidth} height="34" rx="5" fill="url(#pistonMetal)" className="piston-body"/>
    <line x1={cx-boreWidth/2+5} y1={pistonTop+8} x2={cx+boreWidth/2-5} y2={pistonTop+8} className="piston-ring"/>
    <line x1={cx-boreWidth/2+5} y1={pistonTop+14} x2={cx+boreWidth/2-5} y2={pistonTop+14} className="piston-ring"/>
    <circle cx={cx} cy={pistonY} r="10" className="wrist-pin"/>
    <circle cx={crankX} cy={crankY} r="12" className="crank-pin"/>
    <circle cx={cx} cy={cy} r="19" fill="url(#crankMetal)" className="main-bearing"/>
    <circle cx={cx} cy={cy} r="6" className="bearing-center"/>
    <path d={`M ${cx+30} ${cy-2} A 30 30 0 0 0 ${cx+28*Math.sin(angle)} ${cy-28*Math.cos(angle)}`} className="angle-arc"/>
    <text x="468" y="58" className="diagram-label">PISTON</text>
    <path d={`M 458 64 L ${cx+boreWidth/2} ${pistonY-2}`} className="leader"/>
    <text x="470" y="208" className="diagram-label">CONNECTING ROD</text>
    <path d={`M 462 214 L ${(cx+crankX)/2+8} ${(pistonY+crankY)/2}`} className="leader"/>
    <text x="455" y="354" className="diagram-label">CRANKSHAFT</text>
    <path d="M 448 348 L 350 342" className="leader"/>
    <text x="54" y="55" className="diagram-small">TDC</text>
    <text x="54" y="194" className="diagram-small">BDC</text>
    <text x="54" y="382" className="diagram-small">KINEMATIC VIEW · NOT TO SCALE</text>
  </svg>;
}

function MotionChart({ title, unit, values, color, min, max, marker }: {
  title: string; unit: string; values: number[]; color: string; min: number; max: number; marker: number;
}) {
  const w=520,h=150,left=34,right=12,top=12,bottom=24,plotW=w-left-right,plotH=h-top-bottom;
  const range=Math.max(max-min,.001);
  const points=values.map((v,i)=>`${(left+i/(values.length-1)*plotW).toFixed(2)},${(top+(1-(v-min)/range)*plotH).toFixed(2)}`).join(" ");
  const markerX=left+marker/360*plotW;
  return <div className="chart-card">
    <div className="chart-heading"><span>{title}</span><small>{unit}</small></div>
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label={title}>
      {[0,.5,1].map(f=><line key={f} x1={left} x2={w-right} y1={top+f*plotH} y2={top+f*plotH} className="chart-gridline"/>)}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      <line x1={markerX} x2={markerX} y1={top} y2={h-bottom} className="chart-marker"/>
      <text x={left} y={h-5} className="chart-axis">0°</text>
      <text x={left+plotW/2} y={h-5} textAnchor="middle" className="chart-axis">180°</text>
      <text x={w-right} y={h-5} textAnchor="end" className="chart-axis">360°</text>
    </svg>
  </div>;
}

function App() {
  const [setup,setSetup]=useState<Setup>(INITIAL);
  const [angle,setAngle]=useState(0);
  const [running,setRunning]=useState(true);
  const [speedScale,setSpeedScale]=useState(1);
  const geometry=useMemo(()=>geometryFor(setup),[setup]);
  const current=useMemo(()=>calculateSliderCrankState(geometry,angle,setup.rpm),[geometry,angle,setup.rpm]);
  const chart=useMemo(()=>{
    const states=Array.from({length:181},(_,i)=>calculateSliderCrankState(geometry,i/180*TAU,setup.rpm));
    const positions=states.map(s=>metresToMillimetres(s.pistonDisplacementM));
    const velocities=states.map(s=>s.pistonVelocityMPerS);
    return {positions,velocities,maxVelocity:Math.max(...velocities.map(Math.abs),1)};
  },[geometry,setup.rpm]);

  useEffect(()=>{
    if(!running||setup.rpm===0)return;
    let frame=0,previous=0;
    const tick=(time:number)=>{
      if(previous!==0){
        const dt=Math.min((time-previous)/1000,.05);
        setAngle(value=>(value+dt*setup.rpm*speedScale*TAU/60)%TAU);
      }
      previous=time;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[running,setup.rpm,speedScale]);

  const update=(key:keyof Setup,value:number)=>{
    setSetup(previous=>{
      const next={...previous,[key]:value};
      if(key==="strokeMm"&&next.rodMm<=value/2)next.rodMm=Math.floor(value/2)+5;
      return next;
    });
  };
  const reset=()=>{setSetup(INITIAL);setAngle(0);setSpeedScale(1);setRunning(true);};
  const degrees=(angle*180/Math.PI+360)%360;
  const displacement=metresToMillimetres(current.pistonDisplacementM);
  const litres=geometry.totalDisplacementM3*1000;
  const rodMin=Math.floor(setup.strokeMm/2)+5;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="EngineLab home"><span className="brand-mark"><span/><span/><span/></span><span>ENGINE<span className="brand-light">LAB</span></span></a>
      <div className="topbar-center"><span className="status-dot"/> MECHANICAL PLAYGROUND <span className="version-tag">PREVIEW 01</span></div>
      <div className="topbar-right"><span className="live-indicator">{running?"SIMULATION LIVE":"SIMULATION PAUSED"}</span><span className="topbar-divider"/> SI UNITS</div>
    </header>
    <section className="intro">
      <div><div className="eyebrow">ENGINEERING WORKSPACE / 01</div><h1>Mechanical <em>playground.</em></h1><p>Explore the geometry and motion of a single-cylinder slider-crank mechanism.</p></div>
      <button className="reset-button" onClick={reset} type="button"><span>↺</span> RESET SETUP</button>
    </section>
    <section className="metric-strip" aria-label="Live engine metrics">
      <div className="metric"><span className="metric-label">DISPLACEMENT</span><strong>{fmt(litres,3)} <small>L</small></strong><span className="metric-note">single cylinder</span></div>
      <div className="metric"><span className="metric-label">CRANK ANGLE</span><strong>{fmt(degrees,1)}<small>°</small></strong><span className="metric-note">from top dead centre</span></div>
      <div className="metric"><span className="metric-label">PISTON POSITION</span><strong>{fmt(displacement,2)} <small>mm</small></strong><span className="metric-note">from TDC</span></div>
      <div className="metric"><span className="metric-label">PISTON VELOCITY</span><strong>{fmt(current.pistonVelocityMPerS,2)} <small>m/s</small></strong><span className="metric-note">positive = downstroke</span></div>
    </section>
    <div className="workspace-grid">
      <section className="panel mechanism-panel">
        <div className="panel-header"><div><div className="panel-kicker">01 / LIVE MECHANISM</div><h2>Slider-crank assembly</h2></div><span className="panel-chip"><span className="status-dot"/> IDEAL KINEMATICS</span></div>
        <div className="drawing-stage"><Mechanism geometry={geometry} angle={angle}/><div className="drawing-legend"><span><i className="legend-piston"/> PISTON</span><span><i className="legend-rod"/> CONNECTING ROD</span><span><i className="legend-crank"/> CRANK</span></div></div>
        <div className="transport">
          <button className="transport-button" onClick={()=>setRunning(v=>!v)} type="button" aria-label={running?"Pause simulation":"Run simulation"}>{running?"Ⅱ":"▶"}</button>
          <div className="transport-readout"><strong>{fmt(degrees,1)}°</strong><span>CRANKSHAFT POSITION</span></div>
          <div className="transport-speed"><label htmlFor="playback-speed">PLAYBACK</label><select id="playback-speed" value={speedScale} onChange={e=>setSpeedScale(Number(e.target.value))}><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></div>
        </div>
        <div className="angle-control"><div className="control-label-row"><label htmlFor="angle-control">CRANK ANGLE</label><output>{fmt(degrees,1)}°</output></div><input id="angle-control" type="range" min="0" max="360" step=".5" value={degrees} onChange={e=>{setRunning(false);setAngle(Number(e.target.value)*Math.PI/180);}}/><div className="range-ends"><span>0° · TDC</span><span>180° · BDC</span><span>360° · TDC</span></div></div>
      </section>
      <aside className="panel controls-panel">
        <div className="panel-header"><div><div className="panel-kicker">02 / ENGINE CONFIGURATION</div><h2>Geometry & speed</h2></div><span className="settings-icon">⚙</span></div>
        <div className="control-group"><div className="control-label-row"><label htmlFor="bore">BORE</label><output>{setup.boreMm} mm</output></div><input id="bore" type="range" min="60" max="120" step="1" value={setup.boreMm} onChange={e=>update("boreMm",Number(e.target.value))}/><div className="range-ends"><span>60 mm</span><span>120 mm</span></div></div>
        <div className="control-group"><div className="control-label-row"><label htmlFor="stroke">STROKE</label><output>{setup.strokeMm} mm</output></div><input id="stroke" type="range" min="50" max="120" step="1" value={setup.strokeMm} onChange={e=>update("strokeMm",Number(e.target.value))}/><div className="range-ends"><span>50 mm</span><span>120 mm</span></div></div>
        <div className="control-group"><div className="control-label-row"><label htmlFor="rod">CONNECTING ROD</label><output>{setup.rodMm} mm</output></div><input id="rod" type="range" min={rodMin} max="220" step="1" value={setup.rodMm} onChange={e=>update("rodMm",Number(e.target.value))}/><div className="range-ends"><span>{rodMin} mm</span><span>220 mm</span></div></div>
        <div className="control-group rpm-control"><div className="control-label-row"><label htmlFor="rpm">ENGINE SPEED</label><output>{setup.rpm.toLocaleString("en-US")} RPM</output></div><input id="rpm" type="range" min="0" max="8000" step="50" value={setup.rpm} onChange={e=>update("rpm",Number(e.target.value))}/><div className="range-ends"><span>0 RPM</span><span>8,000 RPM</span></div></div>
        <div className="derived-box"><div className="derived-heading">CALCULATED GEOMETRY <span>LIVE</span></div>
          <div className="derived-row"><span>Crank radius</span><strong>{fmt(metresToMillimetres(geometry.crankRadiusM),1)} mm</strong></div>
          <div className="derived-row"><span>Rod / crank ratio</span><strong>{fmt(geometry.rodToCrankRatio,2)} : 1</strong></div>
          <div className="derived-row"><span>Clearance volume</span><strong>{fmt(geometry.clearanceVolumePerCylinderM3*1e6,1)} cm³</strong></div>
          <div className="derived-row"><span>Compression ratio</span><strong>10.5 : 1 <small>fixed</small></strong></div>
        </div>
      </aside>
    </div>
    <section className="panel charts-panel">
      <div className="panel-header"><div><div className="panel-kicker">03 / MOTION ANALYSIS</div><h2>Piston motion over one revolution</h2></div><span className="chart-note">0° → 360° CRANK ANGLE</span></div>
      <div className="charts-grid">
        <MotionChart title="PISTON DISPLACEMENT" unit="mm" values={chart.positions} color="#e9a34b" min={0} max={setup.strokeMm} marker={degrees}/>
        <MotionChart title="PISTON VELOCITY" unit="m/s" values={chart.velocities} color="#61c6b0" min={-chart.maxVelocity} max={chart.maxVelocity} marker={degrees}/>
      </div>
    </section>
    <footer className="disclaimer"><span>ENGINEERING NOTE</span> This preview models ideal rigid slider-crank kinematics at constant crankshaft speed. It does not simulate combustion, pressure, torque, power, friction or thermal behaviour.</footer>
  </main>;
}

export default App;
