import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EngineGeometry } from "../packages/simulation-core/src/geometry";
import { calculateSliderCrankState } from "../packages/simulation-core/src/mechanics";
import { calculateValveState } from "../packages/simulation-core/src/mechanics/valve-timing";

type CylinderTelemetry = { pressurePa: number; burnedFraction: number; intakeFlowKgPerS: number; exhaustFlowKgPerS: number };
type Props = { geometry: EngineGeometry; angle: number; pressurePa: number; burnedFraction: number; intakeFlowKgPerS: number; exhaustFlowKgPerS: number; cylinderStates: CylinderTelemetry[]; sparkFlash: boolean };
const V = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const clamp = (v:number,a:number,b:number) => Math.max(a,Math.min(b,v));
const metal = (c:number,r=.36,m=.78) => new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
function between(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3) {
 const d=new THREE.Vector3().subVectors(b,a); mesh.position.copy(a).add(b).multiplyScalar(.5);
 mesh.scale.set(1,d.length(),1); mesh.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());
}
function tube(scene:THREE.Scene,points:THREE.Vector3[],radius:number,material:THREE.Material) {
 const curve=new THREE.CatmullRomCurve3(points); const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,36,radius,10,false),material);
 mesh.castShadow=true; scene.add(mesh); return curve;
}
type CylinderParts={piston:THREE.Group;rod:THREE.Mesh;intake:THREE.Group[];exhaust:THREE.Group[];spark:THREE.Group;flame:THREE.Mesh;inGas:THREE.Mesh[];outGas:THREE.Mesh[];chamber:THREE.Mesh[];throw:THREE.Group};

export default function InlineFourScene(props:Props) {
 const host=useRef<HTMLDivElement>(null);
 const live=useRef<{
  parts:CylinderParts[]; inCurves:THREE.CatmullRomCurve3[]; outCurves:THREE.CatmullRomCurve3[];
  intakeCam:THREE.Group; exhaustCam:THREE.Group; crank:THREE.Group;
  renderer:THREE.WebGLRenderer; camera:THREE.PerspectiveCamera; controls:OrbitControls; frame:number
 }|null>(null);

 useEffect(()=>{
  const el=host.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x111719);
  const camera=new THREE.PerspectiveCamera(37,1,.1,100);camera.position.set(7.5,5.1,8.8);
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}
  catch{el.textContent="Este navegador no pudo iniciar WebGL.";el.classList.add("engine-3d-unavailable");return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;el.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;
  controls.target.set(0,.05,0);controls.minDistance=5.5;controls.maxDistance=16;controls.maxPolarAngle=Math.PI*.83;
  scene.add(new THREE.HemisphereLight(0xd8e9e7,0x20282b,2));
  const key=new THREE.DirectionalLight(0xffe2bf,3.3);key.position.set(5,8,6);key.castShadow=true;key.shadow.mapSize.set(1536,1536);scene.add(key);
  const rim=new THREE.DirectionalLight(0x69bcb1,2.2);rim.position.set(-6,3,-5);scene.add(rim);
  const aluminum=metal(0x87969a,.3,.8),dark=metal(0x354247,.42,.78),steel=metal(0xc1ccce,.22,.9),forged=metal(0x56656a,.3,.86),bronze=metal(0x9b7045,.3,.8),black=metal(0x20292c,.58,.45);
  const inMat=metal(0x368f7d,.34,.58),outMat=metal(0xa65e2c,.4,.58);
  const bore=clamp(props.geometry.boreM*4.35,.31,.43),stroke=2.05,cr=stroke/2,crankY=-1.48,deck=crankY+stroke+.18,headY=deck+.36,spacing=.98;
  const zAt=(i:number)=>(i-1.5)*spacing;
  const mechanical=[0,Math.PI,Math.PI,0],cycleOffsets=[0,180,540,360];

  // One-piece inline block, cutaway skirt and four machined cylinder liners.
  const block=new THREE.Mesh(new THREE.BoxGeometry(2.18,2.85,4.28),dark);block.position.y=-.02;block.castShadow=true;block.receiveShadow=true;scene.add(block);
  const openFace=new THREE.Mesh(new THREE.BoxGeometry(2.2,2.5,2.2),new THREE.MeshStandardMaterial({color:0x718186,transparent:true,opacity:.13,metalness:.5,side:THREE.DoubleSide,depthWrite:false}));
  openFace.position.set(-.04,.03,0);scene.add(openFace);
  for(let i=0;i<4;i++){
   const z=zAt(i);
   const liner=new THREE.Mesh(new THREE.CylinderGeometry(bore,bore,stroke+.28,48,1,true),new THREE.MeshStandardMaterial({color:0xa5b1b3,metalness:.9,roughness:.22,side:THREE.DoubleSide}));
   liner.position.set(0,crankY+cr+.1,z);scene.add(liner);
   const rimMesh=new THREE.Mesh(new THREE.TorusGeometry(bore,.032,9,44),steel);rimMesh.rotation.x=Math.PI/2;rimMesh.position.set(0,deck-.06,z);scene.add(rimMesh);
   for(const x of [-.82,.82]){const water=new THREE.Mesh(new THREE.BoxGeometry(.1,1.5,.42),new THREE.MeshStandardMaterial({color:0x3c8c91,transparent:true,opacity:.2}));water.position.set(x,.02,z);scene.add(water);}
  }
  const sump=new THREE.Mesh(new THREE.BoxGeometry(1.94,.72,4.02),black);sump.position.set(0,crankY-.46,0);sump.castShadow=true;scene.add(sump);
  const head=new THREE.Mesh(new THREE.BoxGeometry(2.25,.5,4.35),aluminum);head.position.set(0,deck+.22,0);head.castShadow=true;scene.add(head);
  const cover=new THREE.Mesh(new THREE.BoxGeometry(1.86,.2,4.22),dark);cover.position.set(0,headY+.42,0);scene.add(cover);
  for(let i=0;i<4;i++){const chamber=new THREE.Mesh(new THREE.CylinderGeometry(bore*.82,bore*.82,.1,36),metal(0x687579,.55,.48));chamber.position.set(0,deck+.49,zAt(i));scene.add(chamber);}

  // DOHC valvetrain: two camshafts and four poppet valves per cylinder.
  const makeCam=(x:number)=>{
   const g=new THREE.Group();const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.073,.073,4.2,24),bronze);shaft.rotation.x=Math.PI/2;g.add(shaft);
   for(let i=0;i<4;i++)for(const dx of [-.14,.14]){
    const lobe=new THREE.Mesh(new THREE.SphereGeometry(.105,16,12),steel);lobe.scale.set(1.2,1.55,1);lobe.position.set(0,.07,zAt(i)+dx);g.add(lobe);
   }
   for(let i=0;i<5;i++){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,20),dark);cap.rotation.x=Math.PI/2;cap.position.z=-1.9+i*.95;g.add(cap);}
   g.position.set(x,headY+.25,0);scene.add(g);return g;
  };
  const intakeCam=makeCam(-.52),exhaustCam=makeCam(.52);

  // Forged crankshaft: five mains, four throws, counterweights and crankpins.
  const crank=new THREE.Group();const main=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,4.3,28),steel);main.rotation.x=Math.PI/2;crank.add(main);
  for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.2,24),forged);b.rotation.x=Math.PI/2;b.position.z=-1.9+i*.95;crank.add(b);}
  const throws:THREE.Group[]=[];
  for(let i=0;i<4;i++){
   const g=new THREE.Group();g.position.set(0,crankY,zAt(i));
   for(const dz of [-.22,.22]){const web=new THREE.Mesh(new THREE.BoxGeometry(.18,.9,.15),forged);web.position.set(0,cr*.42,dz);g.add(web);}
   const pin=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.48,22),bronze);pin.rotation.x=Math.PI/2;pin.position.y=cr;g.add(pin);
   const cw=new THREE.Mesh(new THREE.BoxGeometry(.34,.46,.38),dark);cw.position.y=-cr*.72;g.add(cw);
   crank.add(g);throws.push(g);
  }
  scene.add(crank);

  // Timing belt and sprockets at the front of the engine.
  const drive=new THREE.Group();
  for(const [r,y] of [[.28,crankY],[.35,headY+.25],[.35,headY+.25]] as number[][]){
   const wheel=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.12,40),bronze);wheel.rotation.x=Math.PI/2;wheel.position.set(0,y,2.2-(drive.children.length?drive.children.length*.35:0));drive.add(wheel);
  }
  const beltPath=new THREE.CatmullRomCurve3([V(-.28,crankY,2.24),V(-.34,-.5,2.24),V(-.35,.7,2.24),V(-.34,headY+.55,2.24),V(.34,headY+.55,2.24),V(.35,.7,2.24),V(.34,-.5,2.24),V(.28,crankY,2.24)]);
  drive.add(new THREE.Mesh(new THREE.TubeGeometry(beltPath,64,.035,8,true),steel));scene.add(drive);

  const parts:CylinderParts[]=[],inCurves:THREE.CatmullRomCurve3[]=[],outCurves:THREE.CatmullRomCurve3[]=[];
  for(let i=0;i<4;i++){
   const z=zAt(i),piston=new THREE.Group();
   const crown=new THREE.Mesh(new THREE.CylinderGeometry(bore*.91,bore*.91,.24,40),steel);crown.castShadow=true;piston.add(crown);
   for(const y of [-.08,-.025,.035]){const ring=new THREE.Mesh(new THREE.TorusGeometry(bore*.91,.015,8,40),dark);ring.rotation.x=Math.PI/2;ring.position.y=y;piston.add(ring);}
   const wrist=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.82,18),bronze);wrist.rotation.z=Math.PI/2;piston.add(wrist);piston.position.z=z;scene.add(piston);
   const rod=new THREE.Mesh(new THREE.CylinderGeometry(.08,.13,1,18),forged);rod.castShadow=true;scene.add(rod);
   const makeValve=(x:number,zz:number,color:number)=>{
    const g=new THREE.Group();const stem=new THREE.Mesh(new THREE.CylinderGeometry(.023,.023,.46,12),steel);stem.position.y=-.2;g.add(stem);
    const face=new THREE.Mesh(new THREE.CylinderGeometry(.085,.06,.04,20),metal(color,.25,.88));face.position.y=-.43;g.add(face);
    const spring=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.19,14,1,true),steel);spring.position.y=.015;g.add(spring);
    g.position.set(x,headY+.04,zz);g.rotation.z=x<0?-.18:.18;scene.add(g);return g;
   };
   const intake=[-.22,-.38].map(x=>makeValve(x,z+.13,0x61c6b0));
   const exhaust=[.22,.38].map(x=>makeValve(x,z-.13,0xe9a34b));
   const spark=new THREE.Group();const plug=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.42,14),steel);plug.position.y=.18;spark.add(plug);
   const tip=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.1,10),bronze);tip.position.y=-.08;spark.add(tip);spark.position.set(0,headY+.04,z);scene.add(spark);
   const flame=new THREE.Mesh(new THREE.SphereGeometry(1,18,14),new THREE.MeshStandardMaterial({color:0xff8a2a,emissive:0xff5410,emissiveIntensity:2,transparent:true,opacity:0,depthWrite:false}));
   flame.position.set(0,deck+.5,z);scene.add(flame);
   const particles=(color:number,n:number,r:number)=>Array.from({length:n},()=>{const p=new THREE.Mesh(new THREE.SphereGeometry(r,7,7),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.28}));scene.add(p);return p;});
   const inGas=particles(0x6de0bd,7,.026),outGas=particles(0xffad55,7,.028),chamber=particles(0xc6d8d4,7,.018);
   const inCurve=tube(scene,[V(-1.12,headY-.02,z+.18),V(-.96,headY-.04,z+.18),V(-.72,headY-.14,z+.16),V(-.46,headY-.25,z+.13),V(-.28,headY-.38,z+.13)],.095,inMat);
   const outCurve=tube(scene,[V(.28,headY-.38,z-.13),V(.46,headY-.25,z-.13),V(.72,headY-.14,z-.16),V(.96,headY-.04,z-.18),V(1.12,headY-.02,z-.18)],.095,outMat);
   inCurves.push(inCurve);outCurves.push(outCurve);
   parts.push({piston,rod,intake,exhaust,spark,flame,inGas,outGas,chamber,throw:throws[i]});
  }
  // Common intake plenum and exhaust collector link the four individual runners.
  const plenum=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,4.05,28),inMat);plenum.rotation.x=Math.PI/2;plenum.position.set(-1.24,headY+.02,0);scene.add(plenum);
  const collector=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,4.05,28),outMat);collector.rotation.x=Math.PI/2;collector.position.set(1.24,headY+.02,0);scene.add(collector);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(7,56),metal(0x192225,.88,.12));floor.rotation.x=-Math.PI/2;floor.position.y=-1.9;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(11,36,0x344447,0x263336);grid.position.y=-1.89;scene.add(grid);

  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(300,el.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const state={parts,inCurves,outCurves,intakeCam,exhaustCam,crank,renderer,camera,controls,frame:0};live.current=state;
  const render=()=>{controls.update();renderer.render(scene,camera);state.frame=requestAnimationFrame(render);};render();
  return ()=>{cancelAnimationFrame(state.frame);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();live.current=null;};
 },[props.geometry]);

 useEffect(()=>{
  const s=live.current;if(!s)return;
  const stroke=2.05,cr=stroke/2,crankY=-1.48,deck=crankY+stroke+.18,headY=deck+.36,spacing=.98;
  const mech=[0,Math.PI,Math.PI,0],offsets=[0,180,540,360],crankRad=((props.angle%360)+360)%360*Math.PI/180;
  s.parts.forEach((c,i)=>{
   const z=(i-1.5)*spacing,local=crankRad+mech[i],cycle=props.angle+offsets[i],v=calculateValveState(cycle),telemetry=props.cylinderStates[i];
   const k=calculateSliderCrankState(props.geometry,local,0),dy=k.pistonDisplacementM/props.geometry.strokeM*stroke,pistonY=deck-dy-.12;
   c.piston.position.set(0,pistonY,z);between(c.rod,V(0,pistonY,z),V(cr*Math.sin(local),crankY+cr*Math.cos(local),z));c.throw.rotation.z=-local;
   c.intake.forEach(x=>{x.position.y=headY+.04-v.intakeLiftMm*.035;});
   c.exhaust.forEach(x=>{x.position.y=headY+.04-v.exhaustLiftMm*.035;});
   c.spark.visible=v.sparkActive||(props.sparkFlash&&i===0);
   const localCycle=((cycle%720)+720)%720,flame=c.flame.material as THREE.MeshStandardMaterial;
   const flameScale=.12+clamp(telemetry.burnedFraction,0,1)*.32+clamp((telemetry.pressurePa-1e5)/9e6,0,1)*.12;
   c.flame.scale.set(flameScale,flameScale*.72,flameScale);
   flame.opacity=localCycle>340&&localCycle<500?clamp(telemetry.burnedFraction*.9,.04,.68):0;c.flame.visible=flame.opacity>0;
   const inStrength=clamp(Math.abs(telemetry.intakeFlowKgPerS)*38,0,1),outStrength=clamp(Math.abs(telemetry.exhaustFlowKgPerS)*38,0,1);
   c.inGas.forEach((p,j)=>{const t=(j/c.inGas.length+props.angle/720*1.6)%1;p.position.copy(s.inCurves[i].getPoint(telemetry.intakeFlowKgPerS>=0?t:1-t));p.visible=v.intakeLiftMm>.1&&inStrength>.02&&j<Math.ceil(inStrength*c.inGas.length);});
   c.outGas.forEach((p,j)=>{const t=(j/c.outGas.length+props.angle/720*1.8)%1;p.position.copy(s.outCurves[i].getPoint(telemetry.exhaustFlowKgPerS>=0?t:1-t));p.visible=v.exhaustLiftMm>.1&&outStrength>.02&&j<Math.ceil(outStrength*c.outGas.length);});
   c.chamber.forEach((p,j)=>{const a=j*Math.PI*2/c.chamber.length+props.angle*.008,r=.06+(j%3)*.05;p.position.set(Math.cos(a)*r,deck+.42-(j%3)*.04,z+Math.sin(a)*r);p.visible=localCycle>180&&localCycle<540&&props.burnedFraction<.98;});
  });
  s.intakeCam.rotation.z=crankRad*.5;s.exhaustCam.rotation.z=crankRad*.5;s.crank.rotation.z=-crankRad;
 },[props.geometry,props.angle,props.pressurePa,props.burnedFraction,props.intakeFlowKgPerS,props.exhaustFlowKgPerS,props.cylinderStates,props.sparkFlash]);

 return <div className="engine-3d-host engine-3d-inline-four" ref={host}>
  <div className="engine-3d-hint">ROTÁ · ZOOM · INSPECCIONÁ EL CONJUNTO</div>
  <div className="engine-3d-axis">4 CILINDROS EN LÍNEA · DOHC · 16V · CORTE TÉCNICO</div>
 </div>;
}
