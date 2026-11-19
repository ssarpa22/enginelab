import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EngineGeometry } from "../packages/simulation-core/src/geometry";
import type { CylinderMechanicalState, EngineSystemsState } from "../packages/simulation-core/src/mechanics/engine-systems";
import { calculateValveState } from "../packages/simulation-core/src/mechanics/valve-timing";
import { calculateInlineFourCrankCoupling } from "../packages/simulation-core/src/mechanics/crankshaft-coupling";
import { INLINE_FOUR_CRANK_PHASES_DEG, INLINE_FOUR_CYCLE_OFFSETS_DEG } from "../packages/simulation-core/src/mechanics/inline-four";
import { createAdaptiveResolutionState, updateAdaptiveResolution } from "./rendering/adaptive-resolution";

type CylinderTelemetry={pressurePa:number;temperatureK:number;burnedFraction:number;intakeFlowKgPerS:number;exhaustFlowKgPerS:number};
type Props={geometry:EngineGeometry;angle:number;rpm:number;cylinderStates:CylinderTelemetry[];mechanics:CylinderMechanicalState[];systems:EngineSystemsState;sparkFlash:boolean};
const vec=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const mat=(color:number,roughness=.35,metalness=.72)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function between(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){const d=new THREE.Vector3().subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.set(1,d.length(),1);mesh.quaternion.setFromUnitVectors(vec(0,1,0),d.normalize());}
function makeTube(scene:THREE.Scene,points:THREE.Vector3[],radius:number,material:THREE.Material){const curve=new THREE.CatmullRomCurve3(points);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,48,radius,12,false),material);mesh.castShadow=true;scene.add(mesh);return curve;}
type Part={piston:THREE.Group;rod:THREE.Mesh;rodBigEnd:THREE.Mesh;rodSmallEnd:THREE.Mesh;throw:THREE.Group;intake:THREE.Group[];exhaust:THREE.Group[];intakeSprings:THREE.Mesh[];exhaustSprings:THREE.Mesh[];followers:THREE.Mesh[];inGas:THREE.Mesh[];outGas:THREE.Mesh[];flame:THREE.Mesh;};
type SceneState={parts:Part[];intakeCurves:THREE.CatmullRomCurve3[];exhaustCurves:THREE.CatmullRomCurve3[];crank:THREE.Group;cams:THREE.Group[];renderer:THREE.WebGLRenderer;controls:OrbitControls;frame:number;oilMaterial:THREE.MeshStandardMaterial;coolantMaterial:THREE.MeshStandardMaterial;metalMaterials:THREE.MeshStandardMaterial[];timingPulleys:THREE.Group[];oilPump:THREE.Group;};

export default function InlineFourScene(props:Props){
 const host=useRef<HTMLDivElement>(null),live=useRef<SceneState|null>(null);
 useEffect(()=>{
  const el=host.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x101719);scene.fog=new THREE.Fog(0x101719,18,38);
  const scale=2.2/props.geometry.strokeM,stroke=props.geometry.strokeM*scale,r=props.geometry.crankRadiusM*scale,rodLength=props.geometry.connectingRodLengthM*scale;
  const bore=props.geometry.boreM*scale,clearance=props.geometry.clearanceVolumePerCylinderM3/(Math.PI*props.geometry.boreM**2/4)*scale;
  const pistonTopOffset=.32,deck=rodLength+r+pistonTopOffset+clearance,crankY=0,spacing=Math.max(bore*1.18,bore+.18),length=spacing*3+bore*1.15,width=Math.max(bore*1.55,(2*r+bore*.2+.012*scale)*1.1);
  const zAt=(i:number)=>(i-1.5)*spacing;
  const camera=new THREE.PerspectiveCamera(38,1,.1,80);camera.position.set(width*2.8,deck*.95,length*.9);
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance",stencil:false,depth:true,preserveDrawingBuffer:false});}catch{el.textContent="Este navegador no pudo iniciar WebGL.";return;}
  const basePixelRatio=Math.min(window.devicePixelRatio||1,1.05);renderer.setPixelRatio(basePixelRatio);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;el.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,deck*.45,0);controls.minDistance=5;controls.maxDistance=32;controls.maxPolarAngle=Math.PI*.84;
  let resolution=createAdaptiveResolutionState(),interacting=false;
  const applyRenderScale=(scale:number)=>{renderer.setPixelRatio(basePixelRatio*scale);renderer.setSize(Math.max(1,el.clientWidth),Math.max(300,el.clientHeight),false);};
  const onInteractionStart=()=>{interacting=true;renderer.shadowMap.enabled=false;if(resolution.scale>.58){resolution={...resolution,scale:.58,lastAdjustmentMs:performance.now()};applyRenderScale(resolution.scale);}};
  const onInteractionEnd=()=>{interacting=false;renderer.shadowMap.enabled=true;};
  controls.addEventListener("start",onInteractionStart);controls.addEventListener("end",onInteractionEnd);
  scene.add(new THREE.HemisphereLight(0xd9e8e6,0x1b2427,2.1));
  const key=new THREE.DirectionalLight(0xffe4c4,3.2);key.position.set(7,deck+7,length*.6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.near=.5;key.shadow.camera.far=30;key.shadow.bias=-.00025;scene.add(key);
  const rim=new THREE.DirectionalLight(0x8aaeb0,1.8);rim.position.set(-width*2,deck*.7,-length*.7);scene.add(rim);
  const steel=mat(0xb6c2c4,.22,.92),forged=mat(0x56656b,.3,.86),aluminium=mat(0x879599,.32,.82),dark=mat(0x273236,.5,.65),bronze=mat(0x987047,.28,.84),black=mat(0x151d20,.55,.48);
  const oilMaterial=new THREE.MeshStandardMaterial({color:0x302512,roughness:.18,metalness:.12,transparent:true,opacity:.88});
  const coolantMaterial=new THREE.MeshStandardMaterial({color:0x247f8b,roughness:.2,metalness:.15,transparent:true,opacity:.24});
  const intakeMaterial=mat(0x368f7d,.32,.42),exhaustMaterial=mat(0x98532c,.42,.5);
  const metalMaterials=[aluminium,steel,forged];
  // The crankcase and block are separate cast sections. The front service face is removed for inspection.
  const lowerY=-.72,blockHeight=deck-lowerY,blockCenter=(deck+lowerY)/2;
  const sideWall=new THREE.Mesh(new RoundedBoxGeometry(.22,blockHeight,length,4,.045),dark);sideWall.position.set(-width/2,blockCenter,0);sideWall.castShadow=true;sideWall.receiveShadow=true;scene.add(sideWall);
  const rearWall=new THREE.Mesh(new RoundedBoxGeometry(width,blockHeight,.2,4,.045),dark);rearWall.position.set(0,blockCenter,-length/2);rearWall.castShadow=true;scene.add(rearWall);
  const frontRails=[-.42,.42].map(x=>{const rail=new THREE.Mesh(new RoundedBoxGeometry(width*.48,blockHeight*.88,.18,4,.035),dark);rail.position.set(x,blockCenter,length/2);scene.add(rail);return rail;});
  // Open deck cutaway: two structural rails leave the four bores visible.
  for(const x of [-1,1]){
   const rail=new THREE.Mesh(new RoundedBoxGeometry(.22,.16,length,4,.035),aluminium);
   rail.position.set(x*width*.43,deck-.05,0);rail.castShadow=true;rail.receiveShadow=true;scene.add(rail);
  }
  // Cast-iron block details: stiffening ribs, machined core plugs and visible head fasteners.
  const fastenerMaterial=mat(0xc1c9c7,.24,.9);
  const ribGeometry=new RoundedBoxGeometry(.075,.055,length*.86,3,.018);
  const ribs=new THREE.InstancedMesh(ribGeometry,forged,14);
  const ribTransform=new THREE.Object3D();let ribIndex=0;
  for(const side of [-1,1])for(let rib=0;rib<7;rib++){
   const y=lowerY+.24+rib*(blockHeight-.48)/6;
   ribTransform.position.set(side*(width/2+.018),y,0);ribTransform.updateMatrix();ribs.setMatrixAt(ribIndex++,ribTransform.matrix);
  }
  ribs.castShadow=true;scene.add(ribs);
  for(const side of [-1,1])for(let i=0;i<4;i++){
   const plug=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.035,32),steel);
   plug.rotation.z=Math.PI/2;plug.position.set(side*(width/2+.035),lowerY+.34+i*.31,zAt(i));scene.add(plug);
  }
  const headBoltGeometry=new THREE.CylinderGeometry(.052,.052,.065,6);
  const headBolts=new THREE.InstancedMesh(headBoltGeometry,fastenerMaterial,16);
  const boltTransform=new THREE.Object3D();let boltIndex=0;
  for(let i=0;i<4;i++)for(const side of [-1,1])for(const end of [-1,1]){
   boltTransform.position.set(side*width*.43,deck+.11,end*length*.47+(i-1.5)*.035);
   boltTransform.rotation.set(0,Math.PI/6,0);boltTransform.updateMatrix();headBolts.setMatrixAt(boltIndex++,boltTransform.matrix);
  }
  headBolts.castShadow=true;scene.add(headBolts);
  // Machined liners and water jackets, sized from the actual bore/stroke.
  for(let i=0;i<4;i++){
   const z=zAt(i),liner=new THREE.Mesh(new THREE.CylinderGeometry(bore*.5,bore*.5,stroke+.52,56,1,true),new THREE.MeshStandardMaterial({color:0x9ba8aa,metalness:.92,roughness:.2,side:THREE.DoubleSide}));liner.position.set(0,deck-stroke/2-.18,z);liner.castShadow=true;scene.add(liner);
   const jacket=new THREE.Mesh(new THREE.CylinderGeometry(bore*.67,bore*.67,stroke+.24,40,1,true),coolantMaterial);jacket.position.set(0,deck-stroke/2-.08,z);scene.add(jacket);
   const fireRing=new THREE.Mesh(new THREE.TorusGeometry(bore*.51,.035,10,56),steel);fireRing.rotation.x=Math.PI/2;fireRing.position.set(0,deck+.015,z);scene.add(fireRing);
   for(const x of [-1,1]){const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.18,12),steel);bolt.position.set(x*width*.39,deck+.07,z);scene.add(bolt);}
  }
  // Open cylinder-head cutaway: deck gasket rails, head casting rails and exposed DOHC gear.
  const gasketMaterial=mat(0x373e3f,.8,.12);
  for(const x of [-1,1]){
   const gasketRail=new THREE.Mesh(new RoundedBoxGeometry(.20,.035,length*.98,3,.012),gasketMaterial);
   gasketRail.position.set(x*width*.43,deck+.015,0);scene.add(gasketRail);
   const headRail=new THREE.Mesh(new RoundedBoxGeometry(.28,.48,length*.98,4,.055),aluminium);
   headRail.position.set(x*width*.43,deck+.27,0);headRail.castShadow=true;scene.add(headRail);
   const camCoverLip=new THREE.Mesh(new RoundedBoxGeometry(.34,.12,length*.92,4,.045),black);
   camCoverLip.position.set(x*width*.28,deck+.94,0);camCoverLip.castShadow=true;scene.add(camCoverLip);
  }
  for(const z of [-1,1]){
   const bridge=new THREE.Mesh(new RoundedBoxGeometry(width*.86,.42,.18,4,.045),aluminium);
   bridge.position.set(0,deck+.27,z*length*.48);bridge.castShadow=true;scene.add(bridge);
  }
  // DOHC shafts, eccentric lobes, bucket followers and real compression travel in visible valve springs.
  const cams:THREE.Group[]=[];
  for(const x of [-bore*.28,bore*.28]){
   const cam=new THREE.Group(),shaft=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,length*.94,28),bronze);shaft.rotation.x=Math.PI/2;cam.add(shaft);
   for(let i=0;i<4;i++)for(const dx of [-bore*.12,bore*.12]){
    const lobe=new THREE.Mesh(new THREE.SphereGeometry(.16,20,16),steel);lobe.scale.set(.78,1.35,1.08);lobe.position.set(0,.12,zAt(i)+dx);cam.add(lobe);
   }
   for(let i=0;i<5;i++){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.16,20),dark);cap.rotation.x=Math.PI/2;cap.position.z=-length*.43+i*length*.215;cam.add(cap);}
   cam.position.set(x,deck+.91,0);scene.add(cam);cams.push(cam);
  }
  // Crankshaft with five main journals, four throws, counterweights and crankpins.
  const crank=new THREE.Group(),main=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,length*.98,28),steel);main.rotation.x=Math.PI/2;crank.add(main);
  for(let i=0;i<5;i++){const z=-length*.43+i*length*.215,bearing=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.26,24),forged);bearing.rotation.x=Math.PI/2;bearing.position.z=z;crank.add(bearing);}
  const throws:THREE.Group[]=[];
  for(let i=0;i<4;i++){
   const t=new THREE.Group();t.position.z=zAt(i);
   for(const side of [-1,1]){
     const web=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0,-r*.78),new THREE.Vector2(.16,-r*.78),new THREE.Vector2(.24,-r*.55),new THREE.Vector2(.22,-r*.12),new THREE.Vector2(.16,r*.42),new THREE.Vector2(.11,r*.68),new THREE.Vector2(0,r*.68)],32),forged);
     web.rotation.x=Math.PI/2;web.scale.set(.78,1,.42);web.position.set(0,r*.48,side*.23);t.add(web);
    }
   const pin=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.52,24),bronze);pin.rotation.x=Math.PI/2;pin.position.y=r;t.add(pin);
   const counter=new THREE.Mesh(new RoundedBoxGeometry(.48,.56,.42,4,.12),dark);counter.position.set(0,-r*.7,0);t.add(counter);
   crank.add(t);throws.push(t);
  }
  scene.add(crank);
  // Front timing drive: toothed belt/pulleys are mechanically linked to crank and half-speed cams.
  const timing=new THREE.Group(),timingPulleys:THREE.Group[]=[],pulleyPositions=[[0,crankY,.34],[-bore*.28,deck+.91,.42],[bore*.28,deck+.91,.42]] as [number,number,number][];
  for(const [x,y,rad] of pulleyPositions){
    const pulley=new THREE.Group();pulley.position.set(x,y,length/2+.18);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(rad*.72,rad*.72,.19,48),forged);hub.rotation.x=Math.PI/2;pulley.add(hub);
    const face=new THREE.Mesh(new THREE.CylinderGeometry(rad*.48,rad*.48,.205,48),bronze);face.rotation.x=Math.PI/2;pulley.add(face);
    for(let toothIndex=0;toothIndex<28;toothIndex++){
     const a=toothIndex/28*Math.PI*2,tooth=new THREE.Mesh(new RoundedBoxGeometry(.055,.075,.15,3,.012),bronze);
     tooth.position.set(Math.cos(a)*(rad+.018),Math.sin(a)*(rad+.018),0);tooth.rotation.z=a;pulley.add(tooth);
    }
    timing.add(pulley);timingPulleys.push(pulley);
   }
  const belt=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([vec(-.34,crankY,length/2+.28),vec(-.5,deck*.35,length/2+.28),vec(-.55,deck+.91,length/2+.28),vec(.55,deck+.91,length/2+.28),vec(.5,deck*.35,length/2+.28),vec(.34,crankY,length/2+.28)]),96,.045,10,false),black);timing.add(belt);scene.add(timing);
  const parts:Part[]=[],intakeCurves:THREE.CatmullRomCurve3[]=[],exhaustCurves:THREE.CatmullRomCurve3[]=[];
  for(let i=0;i<4;i++){
   const z=zAt(i),piston=new THREE.Group();
   const crown=new THREE.Mesh(new THREE.CylinderGeometry(bore*.5-.0007*props.geometry.boreM*scale,bore*.5-.0007*props.geometry.boreM*scale,.22,64),steel);crown.position.y=.20;crown.castShadow=true;piston.add(crown);
   const bowl=new THREE.Mesh(new THREE.CylinderGeometry(bore*.25,bore*.25,.025,32),mat(0x879294,.38,.8));bowl.position.y=.315;piston.add(bowl);
   for(const y of [.08,-.015,-.11]){const ring=new THREE.Mesh(new THREE.TorusGeometry(bore*.5-.00035*props.geometry.boreM*scale,.014,12,64),y===-.11?bronze:dark);ring.rotation.x=Math.PI/2;ring.position.y=y;piston.add(ring);}
   const pin=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,bore*.78,24),bronze);pin.rotation.z=Math.PI/2;pin.position.y=-.04;piston.add(pin);
   const skirt=new THREE.Mesh(new THREE.CylinderGeometry(bore*.5-.0007*props.geometry.boreM*scale,bore*.5-.0007*props.geometry.boreM*scale,.24,40,1,true),aluminium);skirt.position.y=-.17;piston.add(skirt);
   scene.add(piston);
   const rodProfile=new THREE.Shape();
   rodProfile.moveTo(-.075,-.5);rodProfile.lineTo(.075,-.5);rodProfile.lineTo(.075,-.34);rodProfile.lineTo(.034,-.25);rodProfile.lineTo(.034,.25);rodProfile.lineTo(.075,.34);rodProfile.lineTo(.075,.5);rodProfile.lineTo(-.075,.5);rodProfile.lineTo(-.075,.34);rodProfile.lineTo(-.034,.25);rodProfile.lineTo(-.034,-.25);rodProfile.lineTo(-.075,-.34);rodProfile.closePath();
   const rodGeometry=new THREE.ExtrudeGeometry(rodProfile,{depth:.055,steps:1,bevelEnabled:true,bevelSegments:3,bevelThickness:.008,bevelSize:.008});rodGeometry.translate(0,0,-.0275);
   const rod=new THREE.Mesh(rodGeometry,forged);rod.castShadow=true;scene.add(rod);
   const rodBigEnd=new THREE.Mesh(new THREE.TorusGeometry(.17,.042,14,40),bronze);rodBigEnd.castShadow=true;scene.add(rodBigEnd);
   const rodSmallEnd=new THREE.Mesh(new THREE.TorusGeometry(.105,.032,14,36),bronze);rodSmallEnd.castShadow=true;scene.add(rodSmallEnd);
   const intake:THREE.Group[]=[],exhaust:THREE.Group[]=[],intakeSprings:THREE.Mesh[]=[],exhaustSprings:THREE.Mesh[]=[],followers:THREE.Mesh[]=[];
   const makeValve=(x:number,zz:number,color:number)=>{
    const g=new THREE.Group(),stem=new THREE.Mesh(new THREE.CylinderGeometry(.027,.027,.58,20),steel);stem.position.y=-.12;g.add(stem);
    const valveProfile=[new THREE.Vector2(0,-.49),new THREE.Vector2(.045,-.49),new THREE.Vector2(.075,-.465),new THREE.Vector2(.095,-.43),new THREE.Vector2(.105,-.405),new THREE.Vector2(.095,-.38),new THREE.Vector2(0,-.38)];
    const face=new THREE.Mesh(new THREE.LatheGeometry(valveProfile,36),mat(color,.2,.94));g.add(face);
    const retainer=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.06,18),bronze);retainer.position.y=.22;g.add(retainer);
    g.position.set(x,deck+.45,zz);scene.add(g);return g;
   };
   const makeSpring=(x:number,zz:number)=>{const points:THREE.Vector3[]=[];for(let k=0;k<=72;k++){const t=k/72,a=t*Math.PI*2*7;points.push(vec(Math.cos(a)*.075,-.21+t*.42,Math.sin(a)*.075));}const spring=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),180,.012,7,false),steel);spring.position.set(x,deck+.46,zz);scene.add(spring);return spring;};
   for(const zz of [-bore*.12,bore*.12]){const x=-bore*.28;intake.push(makeValve(x,z+zz,0x70cdb6));intakeSprings.push(makeSpring(x,z+zz));const bucket=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,24),steel);bucket.position.set(x,deck+.76,z+zz);scene.add(bucket);followers.push(bucket);}
   for(const zz of [-bore*.12,bore*.12]){const x=bore*.28;exhaust.push(makeValve(x,z+zz,0xe4a05a));exhaustSprings.push(makeSpring(x,z+zz));const bucket=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,24),steel);bucket.position.set(x,deck+.76,z+zz);scene.add(bucket);followers.push(bucket);}
   const inCurve=makeTube(scene,[vec(-width*.52,deck+.04,z+.16),vec(-width*.58,deck-.08,z+.16),vec(-width*.66,deck-.25,z+.16),vec(-width*.72,deck-.35,z+.16)],.12,intakeMaterial);
   const outCurve=makeTube(scene,[vec(width*.72,deck-.35,z-.16),vec(width*.66,deck-.25,z-.16),vec(width*.58,deck-.08,z-.16),vec(width*.52,deck+.04,z-.16)],.12,exhaustMaterial);
   intakeCurves.push(inCurve);exhaustCurves.push(outCurve);
   const particles=(color:number,n:number,rad:number)=>Array.from({length:n},()=>{const p=new THREE.Mesh(new THREE.SphereGeometry(rad,14,12),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.18}));scene.add(p);return p;});
   // Only intake charge and exhaust products are animated. Coolant and oil stay in their galleries.
   const inGas=particles(0x78d9bd,6,.024),outGas=particles(0xe6a064,6,.027);
   const flame=new THREE.Mesh(new THREE.SphereGeometry(1,20,16),new THREE.MeshStandardMaterial({color:0xff8b27,emissive:0xff4d0a,emissiveIntensity:2.2,transparent:true,opacity:0,depthWrite:false}));flame.position.set(0,deck-.12,z);scene.add(flame);
   parts.push({piston,rod,rodBigEnd,rodSmallEnd,throw:throws[i]!,intake,exhaust,intakeSprings,exhaustSprings,followers,inGas,outGas,flame});
  }
  // DOHC centreline ignition hardware: ceramic insulators, hex bodies and four coil packs.
  for(let i=0;i<4;i++){
   const z=zAt(i);
   const ceramic=new THREE.Mesh(new THREE.CylinderGeometry(.042,.052,.23,24),mat(0xe1e0d2,.28,.12));
   ceramic.position.set(0,deck+.47,z);scene.add(ceramic);
   const hex=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.075,6),steel);
   hex.position.set(0,deck+.34,z);hex.rotation.y=Math.PI/6;scene.add(hex);
   const electrode=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.09,12),bronze);
   electrode.position.set(0,deck+.20,z);scene.add(electrode);
   const coil=new THREE.Mesh(new RoundedBoxGeometry(.19,.22,.27,4,.035),black);
   coil.position.set(0,deck+1.18,z);coil.castShadow=true;scene.add(coil);
   const coilCap=new THREE.Mesh(new RoundedBoxGeometry(.13,.055,.19,4,.018),mat(0x414b4d,.48,.35));
   coilCap.position.set(0,deck+1.31,z);scene.add(coilCap);
   makeTube(scene,[vec(0,deck+1.16,z),vec(0,deck+.95,z),vec(0,deck+.62,z)],.026,black);
  }
  // Shared intake/exhaust castings, static coolant jackets, oil galleries, pump and sump reservoir.
  const plenum=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,length*.92,48),intakeMaterial);plenum.rotation.x=Math.PI/2;plenum.position.set(-width*.73,deck-.12,0);scene.add(plenum);
  const collector=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,length*.92,48),exhaustMaterial);collector.rotation.x=Math.PI/2;collector.position.set(width*.73,deck-.12,0);scene.add(collector);
  // Individual four-into-one runners give the gas paths a recognisable cast-manifold layout.
  for(let i=0;i<4;i++){
   const z=zAt(i);
   makeTube(scene,[vec(-width*.50,deck-.04,z),vec(-width*.62,deck-.14,z),vec(-width*.70,deck-.12,z),vec(-width*.73,deck-.12,z)],.072,intakeMaterial);
   makeTube(scene,[vec(width*.50,deck-.04,z),vec(width*.62,deck-.16,z),vec(width*.70,deck-.16,z),vec(width*.73,deck-.12,z)],.082,exhaustMaterial);
   for(const side of [-1,1]){
    const flange=new THREE.Mesh(new RoundedBoxGeometry(.10,.22,.24,3,.025),side<0?intakeMaterial:exhaustMaterial);
    flange.position.set(side*width*.52,deck-.04,z);scene.add(flange);
    for(const dz of [-.075,.075]){
     const stud=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.10,12),steel);
     stud.rotation.z=Math.PI/2;stud.position.set(side*(width*.52+.055),deck-.04,z+dz);scene.add(stud);
    }
   }
  }
  const coolantRail=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,length*.9,24),coolantMaterial);coolantRail.rotation.x=Math.PI/2;coolantRail.position.set(-width*.56,deck+.12,0);scene.add(coolantRail);
  const oilGallery=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,length*.92,20),bronze);oilGallery.rotation.x=Math.PI/2;oilGallery.position.set(width*.4,.25,0);scene.add(oilGallery);
  const pump=new THREE.Group();for(const x of [-.12,.12]){const gear=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.1,20),bronze);gear.rotation.x=Math.PI/2;gear.position.x=x;pump.add(gear);}pump.position.set(width*.4,-.35,length/2);scene.add(pump);
  const sump=new THREE.Mesh(new RoundedBoxGeometry(width*1.05,.62,length*.92,5,.12),black);sump.position.set(0,-.67,0);sump.castShadow=true;scene.add(sump);
  const oilSurface=new THREE.Mesh(new THREE.PlaneGeometry(width*.96,length*.85),oilMaterial);oilSurface.rotation.x=-Math.PI/2;oilSurface.position.set(0,-.35,0);scene.add(oilSurface);
  // External radiator core and coolant hoses close the cooling circuit visually.
  const radiator=new THREE.Group(),core=new THREE.Mesh(new RoundedBoxGeometry(.42,1.35,1.9,4,.055),dark);radiator.add(core);
  for(let i=0;i<11;i++){const fin=new THREE.Mesh(new RoundedBoxGeometry(.45,.035,1.84,3,.012),aluminium);fin.position.y=-.62+i*.124;radiator.add(fin);}
  radiator.position.set(-width*.95,deck*.38,-length*.38);scene.add(radiator);
  makeTube(scene,[vec(-width*.95,deck*.38,-length*.38),vec(-width*.85,deck*.65,-length*.3),vec(-width*.56,deck+.12,0)],.09,coolantMaterial);
  makeTube(scene,[vec(-width*.56,deck-.15,0),vec(-width*.8,deck*.15,length*.35),vec(-width*.95,deck*.38,length*.35)],.09,coolantMaterial);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(Math.max(length,width)*.85,96),mat(0x182225,.9,.1));floor.rotation.x=-Math.PI/2;floor.position.y=-1.05;floor.receiveShadow=true;scene.add(floor);
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(300,el.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const state:SceneState={parts,intakeCurves,exhaustCurves,crank,cams,renderer,controls,frame:0,oilMaterial,coolantMaterial,metalMaterials,timingPulleys,oilPump:pump};live.current=state;
  let previousFrameTime=performance.now();
  const render=()=>{const now=performance.now(),frameMs=now-previousFrameTime;previousFrameTime=now;
   const next=updateAdaptiveResolution(resolution,frameMs,now,interacting);if(next.scale!==resolution.scale)applyRenderScale(next.scale);resolution=next;
   controls.update();renderer.render(scene,camera);state.frame=requestAnimationFrame(render);};render();
  return()=>{cancelAnimationFrame(state.frame);observer.disconnect();controls.removeEventListener("start",onInteractionStart);controls.removeEventListener("end",onInteractionEnd);controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();live.current=null;};
 },[props.geometry]);

 useEffect(()=>{
  const s=live.current;if(!s)return;
  const stroke=props.geometry.strokeM*(2.2/props.geometry.strokeM),r=props.geometry.crankRadiusM*(2.2/props.geometry.strokeM);
  const rod=props.geometry.connectingRodLengthM*(2.2/props.geometry.strokeM),clearance=props.geometry.clearanceVolumePerCylinderM3/(Math.PI*props.geometry.boreM**2/4)*(2.2/props.geometry.strokeM);
  const bore=props.geometry.boreM*(2.2/props.geometry.strokeM),pistonTopOffset=.32,deck=rod+r+pistonTopOffset+clearance,spacing=Math.max(bore*1.18,bore+.18),crankAngle=((props.angle%360)+360)%360*Math.PI/180;
  const coupling=calculateInlineFourCrankCoupling(props.geometry,props.angle%360,props.rpm,props.cylinderStates.map(state=>state.pressurePa));
  s.parts.forEach((p,i)=>{
   const z=(i-1.5)*spacing,phase=(props.angle+(INLINE_FOUR_CYCLE_OFFSETS_DEG[i]??0))%720,theta=crankAngle+(INLINE_FOUR_CRANK_PHASES_DEG[i]??0)*Math.PI/180;
   const state=props.mechanics[i],gas=props.cylinderStates[i],kinematics=coupling.cylinders[i];if(!state||!gas||!kinematics)return;
   const pinY=rod+r-kinematics.pistonDisplacementM*(2.2/props.geometry.strokeM);
   p.piston.position.set(0,pinY-pistonTopOffset,z);
   const crankPin=vec(r*Math.sin(theta),r*Math.cos(theta),z),wristPin=vec(0,pinY,z);
   between(p.rod,wristPin,crankPin);
   p.rodBigEnd.position.copy(crankPin);p.rodSmallEnd.position.copy(wristPin);
   p.throw.rotation.z=0;
   const liftIn=state.intakeLiftActualMm/1000*(2.2/props.geometry.strokeM),liftOut=state.exhaustLiftActualMm/1000*(2.2/props.geometry.strokeM);
   p.intake.forEach((v,j)=>{v.position.y=deck+.45-liftIn;p.intakeSprings[j]!.scale.y=Math.max(.35,1-liftIn/.42);p.intakeSprings[j]!.position.y=deck+.46-liftIn/2;});
   p.exhaust.forEach((v,j)=>{v.position.y=deck+.45-liftOut;p.exhaustSprings[j]!.scale.y=Math.max(.35,1-liftOut/.42);p.exhaustSprings[j]!.position.y=deck+.46-liftOut/2;});
   p.followers.forEach((f,j)=>{const lift=j<2?liftIn:liftOut;f.position.y=deck+.76-lift;});
   const intake=calculateValveState(phase).intakeOpen&&Math.abs(gas.intakeFlowKgPerS)>.00001;
   const exhaust=calculateValveState(phase).exhaustOpen&&Math.abs(gas.exhaustFlowKgPerS)>.00001;
   p.inGas.forEach((dot,j)=>{const t=(j/p.inGas.length+props.angle/720*1.5)%1;dot.position.copy(s.intakeCurves[i]!.getPoint(gas.intakeFlowKgPerS>=0?t:1-t));dot.visible=intake&&j<Math.ceil(clamp(Math.abs(gas.intakeFlowKgPerS)*55,0,1)*p.inGas.length);});
   p.outGas.forEach((dot,j)=>{const t=(j/p.outGas.length+props.angle/720*1.7)%1;dot.position.copy(s.exhaustCurves[i]!.getPoint(gas.exhaustFlowKgPerS>=0?t:1-t));dot.visible=exhaust&&j<Math.ceil(clamp(Math.abs(gas.exhaustFlowKgPerS)*55,0,1)*p.outGas.length);});
   const flame=p.flame.material as THREE.MeshStandardMaterial;const intensity=clamp(gas.burnedFraction,0,1);p.flame.scale.set(.12+intensity*.36,.1+intensity*.26,.12+intensity*.36);flame.opacity=phase>350&&phase<500?intensity*.62:0;p.flame.visible=flame.opacity>.01;
  });
  s.crank.rotation.z=-crankAngle;s.cams.forEach(cam=>{cam.rotation.z=-coupling.camshaftAngleDeg*Math.PI/180;});
  s.timingPulleys.forEach((pulley,index)=>{pulley.rotation.z=index===0?-crankAngle:-coupling.camshaftAngleDeg*Math.PI/180;});
  s.oilPump.rotation.z=-crankAngle*2;
  s.oilMaterial.color.setHex(props.systems.oilTemperatureC>125?0x50300d:0x302512);
  s.metalMaterials[0]!.color.setHex(props.systems.headTemperatureC>180?0x9d5540:0x879599);
 },[props.geometry,props.angle,props.rpm,props.cylinderStates,props.mechanics,props.systems]);

 return <div className="engine-3d-host engine-3d-inline-four" ref={host}>
  <div className="engine-3d-hint">ROTÁ · ZOOM · INSPECCIONÁ EL CONJUNTO</div>
  <div className="engine-3d-axis">BLOQUE · CAMISAS · LUBRICACIÓN · REFRIGERACIÓN · DOHC</div>
 </div>;
}
