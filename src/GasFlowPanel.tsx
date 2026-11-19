import { memo } from "react";

type Props={intakeFlowKgPerS:number;exhaustFlowKgPerS:number;exhaustTemperatureC:number;exhaustPressurePa:number;running:boolean};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
function GasFlowPanel({intakeFlowKgPerS,exhaustFlowKgPerS,exhaustTemperatureC,exhaustPressurePa,running}:Props){
 const intake=Math.max(0,intakeFlowKgPerS),exhaust=Math.max(0,exhaustFlowKgPerS);
 const exhaustIntensity=clamp(exhaust/.035,0,1),heat=clamp((exhaustTemperatureC-80)/800,0,1);
 const active=running&&exhaustIntensity>.015;
 return <section className="gas-flow-card" aria-label="Animación bidimensional del flujo de gases">
  <div className="timing-card-heading">CIRCUITO DE GASES · VISTA 2D <span>FLUJO SEGÚN SIMULACIÓN</span></div>
  <svg className="gas-flow-diagram" viewBox="0 0 760 210" role="img" aria-label="Admisión, cilindros, colector, catalizador, silenciador y salida de escape">
   <defs><linearGradient id="muffler" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#536267"/><stop offset=".5" stopColor="#263338"/><stop offset="1" stopColor="#11191c"/></linearGradient></defs>
   <g className="gas-hardware">
    <rect x="18" y="42" width="112" height="124" rx="9"/><text x="74" y="34">ADMISIÓN</text>
    {[0,1,2,3].map(i=>{const cy=54+i*30;return <g key={i}><path d={`M130 ${cy} H198`}/><rect x="198" y={cy-12} width="78" height="24" rx="5"/><text x="237" y={cy+4}>C{i+1}</text><path d={`M276 ${cy} H300 Q320 ${cy} 320 105 H355`}/></g>;})}
    <path d="M320 105 H355" className="gas-hot-pipe"/><rect x="355" y="72" width="75" height="66" rx="7" className="gas-device"/><text x="392" y="64">CATALIZADOR</text>
    <path d="M430 105 H480" className="gas-hot-pipe"/><rect x="480" y="67" width="132" height="76" rx="25" fill="url(#muffler)" stroke="#75858a" strokeWidth="2"/><path d="M497 82 Q545 105 497 128 M595 82 Q547 105 595 128" className="muffler-baffle"/><text x="546" y="57">SILENCIADOR</text>
    <path d="M612 105 H704" className="gas-hot-pipe"/><path d="M704 91 L736 91 L746 105 L736 119 L704 119 Z" className="tailpipe"/><text x="713" y="77">SALIDA</text>
   </g>
   <path d="M18 104 H130" className="gas-intake-stream" style={{opacity:clamp(intake/.035,0,1)}}/>
   <path d="M130 54 H198 M130 84 H198 M130 114 H198 M130 144 H198" className="gas-intake-stream" style={{opacity:clamp(intake/.035,0,1)}}/>
   <path d="M320 105 H746" className={active?"gas-exhaust-stream flowing":"gas-exhaust-stream"} style={{opacity:exhaustIntensity}}/>
   {active&&[0,1,2,3,4,5,6,7].map(i=><circle key={i} cx="350" cy="105" r={2.5+heat*2} className="gas-exhaust-particle" style={{animationDelay:`${-i*.22}s`,opacity:exhaustIntensity}}/>)}
   <g className="gas-outlet-plume" style={{opacity:active?exhaustIntensity:0}}><path d="M746 105 C755 84 770 84 778 98 M746 105 C760 105 770 112 778 124 M746 105 C758 94 768 94 780 104"/></g>
   <text x="18" y="174" className="gas-caption">CARGA FRESCA · {(intake*1000).toFixed(1)} g/s</text><text x="480" y="174" className="gas-caption">ESCAPE · {(exhaust*1000).toFixed(1)} g/s</text>
  </svg>
  <div className="gas-flow-readouts"><div><span>CAUDAL DE ESCAPE</span><strong>{(exhaust*1000).toFixed(2)} <small>g/s</small></strong></div><div><span>TEMPERATURA ESTIMADA</span><strong>{Math.round(exhaustTemperatureC)} <small>°C</small></strong></div><div><span>PRESIÓN DE DESCARGA</span><strong>{(exhaustPressurePa/1000).toFixed(1)} <small>kPa</small></strong></div><div><span>ESTADO DEL ESCAPE</span><strong>{active?"FLUYENDO":"SIN DESCARGA"}</strong></div></div>
  <p>Esquema 2D de flujo agregado: la intensidad y la animación responden al caudal calculado. Catalizador, silenciador y salida son una representación funcional simplificada; no se resuelven acústica ni contrapresión calibrada.</p>
 </section>;
}
export default memo(GasFlowPanel);
