import { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EngineGeometry } from "../packages/simulation-core/src/geometry";
import type { CylinderMechanicalState, EngineSystemsState } from "../packages/simulation-core/src/mechanics/engine-systems";
import type { TimingDriveState } from "../packages/simulation-core/src/mechanics/timing-drive";
import { calculateInlineFourCrankCoupling } from "../packages/simulation-core/src/mechanics/crankshaft-coupling";
import { INLINE_FOUR_CRANK_PHASES_DEG, INLINE_FOUR_CYCLE_OFFSETS_DEG } from "../packages/simulation-core/src/mechanics/inline-four";
import { calculateCamFollowerCycleAngleDeg, calculateCamLobeProfileCycleAngleDeg, calculateValveState, DEFAULT_VALVE_TIMING } from "../packages/simulation-core/src/mechanics/valve-timing";
import { createAdaptiveResolutionState, updateAdaptiveResolution } from "./rendering/adaptive-resolution";

type CylinderTelemetry={pressurePa:number;intakeMassFlowKgPerS:number;exhaustMassFlowKgPerS:number;burnedFraction:number;heatReleaseRateW:number;temperatureK:number};
type EngineSection="block"|"head"|"valvetrain"|"bottomEnd"|"auxiliary";
type VisibleSections=Record<EngineSection,boolean>;
type Props={geometry:EngineGeometry;angle:number;rpm:number;cylinderStates:CylinderTelemetry[];mechanics:CylinderMechanicalState[];systems:EngineSystemsState;sparkFlash:boolean;starterActive:boolean;visibleSections:VisibleSections;timingDrive:TimingDriveState};
const vec=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
function convexHull(points:THREE.Vector2[]):THREE.Vector2[]{
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(o:THREE.Vector2,a:THREE.Vector2,b:THREE.Vector2)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
 const lower:THREE.Vector2[]=[],upper:THREE.Vector2[]=[];
 for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2]!,lower[lower.length-1]!,p)<=0)lower.pop();lower.push(p);}
 for(let i=sorted.length-1;i>=0;i--){const p=sorted[i]!;while(upper.length>=2&&cross(upper[upper.length-2]!,upper[upper.length-1]!,p)<=0)upper.pop();upper.push(p);}
 lower.pop();upper.pop();return lower.concat(upper);
}
function timingBeltPath(pulleys:{x:number;y:number;r:number}[],z:number){
 const samples:THREE.Vector2[]=[];
 for(const p of pulleys)for(let i=0;i<96;i++){const angle=i/96*Math.PI*2;samples.push(new THREE.Vector2(p.x+Math.cos(angle)*p.r,p.y+Math.sin(angle)*p.r));}
 const hull=convexHull(samples);
 return new THREE.CatmullRomCurve3(hull.map(point=>vec(point.x,point.y,z)),true,"centripetal");
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const wrapCycle=(angle:number)=>((angle%720)+720)%720;
function valveEventCenter(start:number,end:number){
 const span=end>=start?end-start:720-start+end;
 return wrapCycle(start+span/2);
}
const INTAKE_CAM_CENTER=valveEventCenter(720-DEFAULT_VALVE_TIMING.intakeOpensBtdc,180+DEFAULT_VALVE_TIMING.intakeClosesAbdc);
const EXHAUST_CAM_CENTER=valveEventCenter(540-DEFAULT_VALVE_TIMING.exhaustOpensBbdc,DEFAULT_VALVE_TIMING.exhaustClosesAtdc);
function createCamLobeShape(kind:"intake"|"exhaust",centerCycle:number,cylinderOffset:number,scale:number){
 const shape=new THREE.Shape();
 for(let step=0;step<=360;step++){
  const angleDeg=step/360*360;
  const localCycle=calculateCamLobeProfileCycleAngleDeg(angleDeg,centerCycle,cylinderOffset);
  const valve=calculateValveState(localCycle);
  const liftMm=kind==="intake"?valve.intakeLiftMm:valve.exhaustLiftMm;
  // A real cam is not a circular disc with a pointed bump: soften the lobe
  // into a broad, smoothly curved nose while preserving the valve lift envelope.
  const maxLift=kind==="intake"?DEFAULT_VALVE_TIMING.intakeMaxLiftMm:DEFAULT_VALVE_TIMING.exhaustMaxLiftMm;
  const normalizedLift=clamp(liftMm/Math.max(maxLift,1e-6),0,1);
  // Keep the heel exactly circular, use a broad rounded nose and smooth flanks.
  // The exponent widens the nose arc without changing the specified maximum lift.
  const broadLift=Math.pow(normalizedLift,.85);
  const curvedLift=broadLift*broadLift*(3-2*broadLift);
  const radius=.135+curvedLift*maxLift/1000*scale;
  const angle=angleDeg*Math.PI/180;
  const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
  if(step===0)shape.moveTo(x,y);else shape.lineTo(x,y);
 }
 shape.closePath();
 return shape;
}
const mat=(color:number,roughness=.35,metalness=.72)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function between(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){const d=new THREE.Vector3().subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.set(1,d.length(),1);mesh.quaternion.setFromUnitVectors(vec(0,1,0),d.normalize());}
function makeTube(add:(object:THREE.Object3D)=>void,points:THREE.Vector3[],radius:number,material:THREE.Material){const curve=new THREE.CatmullRomCurve3(points);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,48,radius,10,false),material);mesh.castShadow=true;add(mesh);return curve;}
type Part={piston:THREE.Group;rod:THREE.Mesh;rodBigEnd:THREE.Mesh;rodSmallEnd:THREE.Mesh;intake:THREE.Group[];exhaust:THREE.Group[];intakeSprings:THREE.Mesh[];exhaustSprings:THREE.Mesh[];followers:THREE.Mesh[];};
type SceneState={parts:Part[];crank:THREE.Group;cams:THREE.Group[];renderer:THREE.WebGLRenderer;controls:OrbitControls;frame:number;oilMaterial:THREE.MeshStandardMaterial;coolantMaterial:THREE.MeshStandardMaterial;metalMaterials:THREE.MeshStandardMaterial[];timingBeltMaterial:THREE.MeshStandardMaterial;timingBeltLengthM:number;timingBeltMesh:THREE.Mesh;brokenTimingBeltMeshes:THREE.Mesh[];oilPump:THREE.Group;oilPumpGears:THREE.Group[];flywheel:THREE.Group;starterMotor:THREE.Group;starterPinion:THREE.Group;starterShaft:THREE.Mesh;gasParticles:THREE.Mesh[][];gasParticleProgress:number[][];lastGasAngleDeg:number;gasParticleMaterials:THREE.MeshStandardMaterial[];sparkArcs:THREE.Group[];combustionFlames:THREE.Mesh[];sectionObjects:Record<EngineSection,THREE.Object3D[]>;};

function InlineFourScene(props:Props){
 const host=useRef<HTMLDivElement>(null),live=useRef<SceneState|null>(null);
 useEffect(()=>{
  const el=host.current;if(!el)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x101719);scene.fog=new THREE.Fog(0x101719,18,38);
  const sectionObjects:Record<EngineSection,THREE.Object3D[]>={block:[],head:[],valvetrain:[],bottomEnd:[],auxiliary:[]};
  let activeSection:EngineSection="block";
  const addSceneObject=(object:THREE.Object3D)=>{sectionObjects[activeSection].push(object);scene.add(object);};
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
  const linerMaterial=new THREE.MeshStandardMaterial({color:0x9ba8aa,metalness:.92,roughness:.2,side:THREE.DoubleSide});
  const pistonBowlMaterial=mat(0x879294,.38,.8);
  const pistonBossMaterial=mat(0x647277,.3,.88);
  const metalMaterials=[aluminium,steel,forged];
  activeSection="block";
  // The crankcase and block are separate cast sections. The front service face is removed for inspection.
  const lowerY=-.72,blockHeight=deck-lowerY,blockCenter=(deck+lowerY)/2;
  const sideWall=new THREE.Mesh(new RoundedBoxGeometry(.22,blockHeight,length,4,.045),dark);sideWall.position.set(-width/2,blockCenter,0);sideWall.castShadow=true;sideWall.receiveShadow=true;addSceneObject(sideWall);
  // Rear inspection opening exposes the flywheel and starter ring gear on the opposite crankshaft end.
  const rearWallShape=new THREE.Shape();
  rearWallShape.moveTo(-width/2,lowerY);rearWallShape.lineTo(width/2,lowerY);rearWallShape.lineTo(width/2,deck);rearWallShape.lineTo(-width/2,deck);rearWallShape.closePath();
  const crankcaseInspectionOpening=new THREE.Path();crankcaseInspectionOpening.absarc(0,0,1.05,0,Math.PI*2,true);rearWallShape.holes.push(crankcaseInspectionOpening);
  const rearWallGeometry=new THREE.ExtrudeGeometry(rearWallShape,{depth:.2,bevelEnabled:false});rearWallGeometry.translate(0,0,-.1);
  const rearWall=new THREE.Mesh(rearWallGeometry,dark);rearWall.position.z=-length/2;rearWall.castShadow=true;addSceneObject(rearWall);
  const frontRails=[-.42,.42].map(x=>{const rail=new THREE.Mesh(new RoundedBoxGeometry(width*.48,blockHeight*.88,.18,4,.035),dark);rail.position.set(x,blockCenter,length/2);addSceneObject(rail);return rail;});
  // Open deck cutaway: two structural rails leave the four bores visible.
  for(const x of [-1,1]){
   const rail=new THREE.Mesh(new RoundedBoxGeometry(.22,.16,length,4,.035),aluminium);
   rail.position.set(x*width*.43,deck-.05,0);rail.castShadow=true;rail.receiveShadow=true;addSceneObject(rail);
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
  ribs.castShadow=true;addSceneObject(ribs);
  for(const side of [-1,1])for(let i=0;i<4;i++){
   const plug=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.035,32),steel);
   plug.rotation.z=Math.PI/2;plug.position.set(side*(width/2+.035),lowerY+.34+i*.31,zAt(i));addSceneObject(plug);
  }
  const headBoltGeometry=new THREE.CylinderGeometry(.052,.052,.065,6);
  const headBolts=new THREE.InstancedMesh(headBoltGeometry,fastenerMaterial,16);
  const boltTransform=new THREE.Object3D();let boltIndex=0;
  for(let i=0;i<4;i++)for(const side of [-1,1])for(const end of [-1,1]){
   boltTransform.position.set(side*width*.43,deck+.11,end*length*.47+(i-1.5)*.035);
   boltTransform.rotation.set(0,Math.PI/6,0);boltTransform.updateMatrix();headBolts.setMatrixAt(boltIndex++,boltTransform.matrix);
  }
  headBolts.castShadow=true;addSceneObject(headBolts);
  // Machined liners and water jackets, sized from the actual bore/stroke.
  for(let i=0;i<4;i++){
   const z=zAt(i),liner=new THREE.Mesh(new THREE.CylinderGeometry(bore*.5,bore*.5,stroke+.52,56,1,true),linerMaterial);liner.position.set(0,deck-stroke/2-.18,z);liner.castShadow=true;addSceneObject(liner);
   const jacket=new THREE.Mesh(new THREE.CylinderGeometry(bore*.67,bore*.67,stroke+.24,40,1,true),coolantMaterial);jacket.position.set(0,deck-stroke/2-.08,z);addSceneObject(jacket);
   const fireRing=new THREE.Mesh(new THREE.TorusGeometry(bore*.51,.035,10,56),steel);fireRing.rotation.x=Math.PI/2;fireRing.position.set(0,deck+.015,z);addSceneObject(fireRing);
   for(const x of [-1,1]){const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.18,12),steel);bolt.position.set(x*width*.39,deck+.07,z);addSceneObject(bolt);}
  }
  activeSection="head";
  // Open cylinder-head cutaway: deck gasket rails, head casting rails and exposed DOHC gear.
  const gasketMaterial=mat(0x373e3f,.8,.12);
  for(const x of [-1,1]){
   const gasketRail=new THREE.Mesh(new RoundedBoxGeometry(.20,.035,length*.98,3,.012),gasketMaterial);
   gasketRail.position.set(x*width*.43,deck+.015,0);addSceneObject(gasketRail);
   const headRail=new THREE.Mesh(new RoundedBoxGeometry(.28,.48,length*.98,4,.055),aluminium);
   headRail.position.set(x*width*.43,deck+.27,0);headRail.castShadow=true;addSceneObject(headRail);
   const camCoverLip=new THREE.Mesh(new RoundedBoxGeometry(.34,.12,length*.92,4,.045),black);
   camCoverLip.position.set(x*width*.28,deck+.94,0);camCoverLip.castShadow=true;addSceneObject(camCoverLip);
  }
  for(const z of [-1,1]){
   const bridge=new THREE.Mesh(new RoundedBoxGeometry(width*.86,.42,.18,4,.045),aluminium);
   bridge.position.set(0,deck+.27,z*length*.48);bridge.castShadow=true;addSceneObject(bridge);
  }
  activeSection="valvetrain";
  // DOHC cam lobes are profiled from the same valve-timing curve as the followers.
  // Their base circles touch the buckets at zero lift; the nose adds the exact nominal lift.
  const cams:THREE.Group[]=[];
  for(const x of [-bore*.28,bore*.28]){
   const intakeCam=x<0,camCenter=intakeCam?INTAKE_CAM_CENTER:EXHAUST_CAM_CENTER;
   const cam=new THREE.Group(),shaft=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,length*.94,28),bronze);shaft.rotation.x=Math.PI/2;cam.add(shaft);
   for(let i=0;i<4;i++)for(const dx of [-bore*.12,bore*.12]){
    const profile=createCamLobeShape(intakeCam?"intake":"exhaust",camCenter,INLINE_FOUR_CYCLE_OFFSETS_DEG[i]!,scale);
    const lobeGeometry=new THREE.ExtrudeGeometry(profile,{depth:.14,steps:1,bevelEnabled:true,bevelSegments:3,bevelThickness:.012,bevelSize:.008});lobeGeometry.translate(0,0,-.07);
    const lobe=new THREE.Mesh(lobeGeometry,steel);lobe.position.set(0,0,zAt(i)+dx);lobe.castShadow=true;cam.add(lobe);
   }
   for(let i=0;i<5;i++){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.16,20),dark);cap.rotation.x=Math.PI/2;cap.position.z=-length*.43+i*length*.215;cam.add(cap);}
   cam.position.set(x,deck+.955,0);addSceneObject(cam);cams.push(cam);
  }
  activeSection="bottomEnd";
  // Forged inline-four crankshaft: five main-journal spans, four offset crankpins,
  // paired crank webs and integral counterweight lobes. All throws share the
  // real 1/4 and 2/3 phasing defined by INLINE_FOUR_CRANK_PHASES_DEG.
  const crank=new THREE.Group();
  const crankWebThickness=.12,crankWebOffset=.29,crankWebInnerFace=crankWebOffset-crankWebThickness/2;
  const crankpinRadius=.16,crankpinLength=crankWebInnerFace*2;
  for(let mainIndex=0;mainIndex<5;mainIndex++){
   const start=mainIndex===0?-length/2:zAt(mainIndex-1)+crankWebInnerFace;
   const end=mainIndex===4?length/2:zAt(mainIndex)-crankWebInnerFace;
   const journalLength=Math.max(.12,end-start),journalCenter=(start+end)/2;
   const journal=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,journalLength,36),steel);
   journal.rotation.x=Math.PI/2;journal.position.z=journalCenter;journal.castShadow=true;crank.add(journal);
   const bearing=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.26,32),forged);
   bearing.rotation.x=Math.PI/2;bearing.position.z=journalCenter;bearing.castShadow=true;crank.add(bearing);
  }
  const webShape=new THREE.Shape();
  webShape.moveTo(-.18,.04);
  webShape.quadraticCurveTo(-.30,.30,-.29,.56*r);
  webShape.quadraticCurveTo(-.28,.82*r,-.16,.94*r);
  webShape.quadraticCurveTo(0,1.10*r,.16,.94*r);
  webShape.quadraticCurveTo(.28,.82*r,.29,.56*r);
  webShape.quadraticCurveTo(.30,.30,.18,.04);
  webShape.quadraticCurveTo(.29,-.22*r,.34,-.58*r);
  webShape.quadraticCurveTo(.38,-.93*r,.18,-1.02*r);
  webShape.quadraticCurveTo(0,-1.08*r,-.18,-1.02*r);
  webShape.quadraticCurveTo(-.38,-.93*r,-.34,-.58*r);
  webShape.quadraticCurveTo(-.29,-.22*r,-.18,.04);
  webShape.closePath();
  const webGeometry=new THREE.ExtrudeGeometry(webShape,{depth:crankWebThickness,steps:1,bevelEnabled:true,bevelSegments:3,bevelThickness:.012,bevelSize:.012});
  webGeometry.translate(0,0,-crankWebThickness/2);
  for(let i=0;i<4;i++){
   const throwGroup=new THREE.Group();
   throwGroup.position.z=zAt(i);
   throwGroup.rotation.z=-(INLINE_FOUR_CRANK_PHASES_DEG[i]??0)*Math.PI/180;
   for(const side of [-1,1]){
    const web=new THREE.Mesh(webGeometry,forged);
    web.position.z=side*crankWebOffset;
    web.castShadow=true;web.receiveShadow=true;throwGroup.add(web);
   }
   const crankpin=new THREE.Mesh(new THREE.CylinderGeometry(crankpinRadius,crankpinRadius,crankpinLength,36),bronze);
   crankpin.rotation.x=Math.PI/2;crankpin.position.y=r;crankpin.castShadow=true;throwGroup.add(crankpin);
   crank.add(throwGroup);
  }
  // Exposed crankshaft nose physically bridges the main shaft to the lower timing pulley.
  const crankNose=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.48,40),steel);crankNose.rotation.x=Math.PI/2;crankNose.position.z=length/2+.015;crank.add(crankNose);
  const crankNoseCollar=new THREE.Mesh(new THREE.CylinderGeometry(.205,.205,.10,40),forged);crankNoseCollar.rotation.x=Math.PI/2;crankNoseCollar.position.z=length/2+.16;crank.add(crankNoseCollar);
  const flywheelNose=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.28,40),steel);flywheelNose.rotation.x=Math.PI/2;flywheelNose.position.z=-length/2-.13;crank.add(flywheelNose);
  addSceneObject(crank);
  // Flywheel and ring gear share the crankshaft axis; the starter pinion engages only while cranking.
  const flywheel=new THREE.Group();
  const flywheelDisc=new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.18,64),forged);flywheelDisc.rotation.x=Math.PI/2;flywheel.add(flywheelDisc);
  const flywheelHub=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.24,40),steel);flywheelHub.rotation.x=Math.PI/2;flywheel.add(flywheelHub);
  const ringGear=new THREE.Mesh(new THREE.TorusGeometry(.61,.055,12,96),bronze);flywheel.add(ringGear);
  for(let tooth=0;tooth<56;tooth++){const a=tooth/56*Math.PI*2,gearTooth=new THREE.Mesh(new RoundedBoxGeometry(.075,.11,.16,3,.012),steel);gearTooth.position.set(Math.cos(a)*.655,Math.sin(a)*.655,0);gearTooth.rotation.z=a;flywheel.add(gearTooth);}
  flywheel.position.set(0,0,-length/2-.12);addSceneObject(flywheel);
  const starterMotor=new THREE.Group();
  const motorCan=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.62,36),dark);motorCan.rotation.x=Math.PI/2;motorCan.position.set(.96,-.38,0);starterMotor.add(motorCan);
  const motorEnd=new THREE.Mesh(new THREE.CylinderGeometry(.205,.205,.12,36),forged);motorEnd.rotation.x=Math.PI/2;motorEnd.position.set(.96,-.38,-.32);starterMotor.add(motorEnd);
  const solenoid=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.42,28),bronze);solenoid.rotation.x=Math.PI/2;solenoid.position.set(1.18,-.16,.02);starterMotor.add(solenoid);
  starterMotor.position.z=-length/2-.12;addSceneObject(starterMotor);
  const starterPinion=new THREE.Group();
  const pinionCore=new THREE.Mesh(new THREE.CylinderGeometry(.125,.125,.16,32),bronze);pinionCore.rotation.x=Math.PI/2;starterPinion.add(pinionCore);
  for(let tooth=0;tooth<14;tooth++){const a=tooth/14*Math.PI*2,gearTooth=new THREE.Mesh(new RoundedBoxGeometry(.065,.07,.14,3,.01),steel);gearTooth.position.set(Math.cos(a)*.145,Math.sin(a)*.145,0);gearTooth.rotation.z=a;starterPinion.add(gearTooth);}
  starterPinion.position.set(.96,0,-length/2-.12);addSceneObject(starterPinion);
  const starterShaft=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1,18),bronze);starterShaft.castShadow=true;addSceneObject(starterShaft);
  // Front timing drive: toothed belt/pulleys are mechanically linked to crank and half-speed cams.
  const timing=new THREE.Group(),pulleyPositions=[[0,crankY,.24],[-bore*.28,deck+.955,.48],[bore*.28,deck+.955,.48]] as [number,number,number][];
  for(const [index,[x,y,rad]] of pulleyPositions.entries()){
    // Each sprocket is a child of the shaft it drives: no separately animated pulley state.
    const pulley=new THREE.Group();pulley.position.set(0,0,length/2+.18);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(rad*.72,rad*.72,.19,48),forged);hub.rotation.x=Math.PI/2;pulley.add(hub);
    const face=new THREE.Mesh(new THREE.CylinderGeometry(rad*.48,rad*.48,.205,48),bronze);face.rotation.x=Math.PI/2;pulley.add(face);
    const toothCount=index===0?24:48;
    for(let toothIndex=0;toothIndex<toothCount;toothIndex++){
     const a=toothIndex/toothCount*Math.PI*2,tooth=new THREE.Mesh(new RoundedBoxGeometry(.045,.055,.15,3,.01),bronze);
     tooth.position.set(Math.cos(a)*(rad+.012),Math.sin(a)*(rad+.012),0);tooth.rotation.z=a;pulley.add(tooth);
    }
    if(index===0)crank.add(pulley);else cams[index-1]!.add(pulley);
   }
  // Reinforced rubber timing belt: matte elastomer with repeated molded tooth ribs.
  const beltCanvas=document.createElement("canvas");beltCanvas.width=256;beltCanvas.height=64;
  const beltContext=beltCanvas.getContext("2d");
  if(beltContext){
   beltContext.fillStyle="#151b1d";beltContext.fillRect(0,0,256,64);
   beltContext.fillStyle="#252f32";beltContext.fillRect(0,5,256,54);
   for(let x=0;x<256;x+=16){
    beltContext.fillStyle="#080d0f";beltContext.fillRect(x,8,7,48);
    beltContext.fillStyle="#3b4649";beltContext.fillRect(x+7,8,3,48);
    beltContext.fillStyle="#1c2528";beltContext.fillRect(x+10,8,6,48);
   }
   beltContext.strokeStyle="#526064";beltContext.lineWidth=2;
   beltContext.beginPath();beltContext.moveTo(0,7);beltContext.lineTo(256,7);beltContext.moveTo(0,57);beltContext.lineTo(256,57);beltContext.stroke();
  }
  const beltTexture=new THREE.CanvasTexture(beltCanvas);beltTexture.wrapS=THREE.RepeatWrapping;beltTexture.wrapT=THREE.RepeatWrapping;beltTexture.repeat.set(3,1);
  const timingBeltMaterial=new THREE.MeshStandardMaterial({color:0x596266,map:beltTexture,roughness:.94,metalness:0});
  const beltCurve=timingBeltPath(pulleyPositions.map(([x,y,r])=>({x,y,r:r+.045})),length/2+.28);
  const belt=new THREE.Mesh(new THREE.TubeGeometry(beltCurve,384,.045,12,true),timingBeltMaterial);belt.castShadow=true;timing.add(belt);
  const beltPoints=beltCurve.getPoints(256),brokenTimingBeltMeshes:THREE.Mesh[]=[];
  for(const [start,end] of [[0,112],[144,256]]){
   const segmentPoints=beltPoints.slice(start,end+1);
   const segmentCurve=new THREE.CatmullRomCurve3(segmentPoints);
   const segment=new THREE.Mesh(new THREE.TubeGeometry(segmentCurve,Math.max(32,segmentPoints.length*2),.045,12,false),timingBeltMaterial);
   segment.castShadow=true;segment.visible=false;timing.add(segment);brokenTimingBeltMeshes.push(segment);
  }
  addSceneObject(timing);
  const parts:Part[]=[],gasParticles:THREE.Mesh[][]=[],gasParticleProgress:number[][]=[],gasParticleMaterials=[new THREE.MeshStandardMaterial({color:0x7de4c7,emissive:0x1a7563,emissiveIntensity:.7,roughness:.3}),new THREE.MeshStandardMaterial({color:0xf2a36a,emissive:0x8a3d19,emissiveIntensity:.65,roughness:.35})];
  for(let i=0;i<4;i++){
   activeSection="bottomEnd";
   const z=zAt(i),piston=new THREE.Group();
   const crown=new THREE.Mesh(new THREE.CylinderGeometry(bore*.5-.0007*props.geometry.boreM*scale,bore*.5-.0007*props.geometry.boreM*scale,.22,64),steel);crown.position.y=.20;crown.castShadow=true;piston.add(crown);
   const bowl=new THREE.Mesh(new THREE.CylinderGeometry(bore*.25,bore*.25,.025,32),pistonBowlMaterial);bowl.position.y=.315;piston.add(bowl);
   for(const y of [.08,-.015,-.11]){const ring=new THREE.Mesh(new THREE.TorusGeometry(bore*.5-.00035*props.geometry.boreM*scale,.014,12,64),y===-.11?bronze:dark);ring.rotation.x=Math.PI/2;ring.position.y=y;piston.add(ring);}
   const pin=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,bore*.78,32),bronze);pin.rotation.z=Math.PI/2;pin.position.y=-.015;piston.add(pin);
   for(const side of [-1,1]){
    const boss=new THREE.Mesh(new THREE.CylinderGeometry(.145,.145,.20,32),aluminium);boss.rotation.z=Math.PI/2;boss.position.set(side*bore*.22,-.015,0);piston.add(boss);
    const gusset=new THREE.Mesh(new RoundedBoxGeometry(.13,.19,.16,4,.035),pistonBossMaterial);gusset.position.set(side*bore*.22,-.105,0);piston.add(gusset);
   }
   const undercrown=new THREE.Mesh(new THREE.CylinderGeometry(bore*.47,bore*.47,.055,48),forged);undercrown.position.y=.065;piston.add(undercrown);
   for(let ribIndex=0;ribIndex<8;ribIndex++){const angle=ribIndex*Math.PI/4;const rib=new THREE.Mesh(new RoundedBoxGeometry(.035,.16,bore*.68,3,.012),pistonBossMaterial);rib.position.set(Math.cos(angle)*bore*.27,-.055,Math.sin(angle)*bore*.27);rib.rotation.y=-angle;piston.add(rib);}
   const skirt=new THREE.Mesh(new THREE.CylinderGeometry(bore*.5-.0007*props.geometry.boreM*scale,bore*.5-.0007*props.geometry.boreM*scale,.30,64,1,true),aluminium);skirt.position.y=-.18;piston.add(skirt);
   const skirtLowerRim=new THREE.Mesh(new THREE.TorusGeometry(bore*.49,.018,10,64),steel);skirtLowerRim.rotation.x=Math.PI/2;skirtLowerRim.position.y=-.33;piston.add(skirtLowerRim);
   const innerSkirt=new THREE.Mesh(new THREE.CylinderGeometry(bore*.455,bore*.455,.22,48,1,true),dark);innerSkirt.position.y=-.19;piston.add(innerSkirt);
   addSceneObject(piston);
   const rodProfile=new THREE.Shape();
   rodProfile.moveTo(-.075,-.5);rodProfile.lineTo(.075,-.5);rodProfile.lineTo(.075,-.34);rodProfile.lineTo(.034,-.25);rodProfile.lineTo(.034,.25);rodProfile.lineTo(.075,.34);rodProfile.lineTo(.075,.5);rodProfile.lineTo(-.075,.5);rodProfile.lineTo(-.075,.34);rodProfile.lineTo(-.034,.25);rodProfile.lineTo(-.034,-.25);rodProfile.lineTo(-.075,-.34);rodProfile.closePath();
   const rodGeometry=new THREE.ExtrudeGeometry(rodProfile,{depth:.11,steps:1,bevelEnabled:true,bevelSegments:3,bevelThickness:.012,bevelSize:.01});rodGeometry.translate(0,0,-.055);
   const rod=new THREE.Mesh(rodGeometry,forged);rod.castShadow=true;addSceneObject(rod);
   // Big-end housing follows the crankpin; its split cap and paired fasteners
   // make the bearing connection legible instead of a loose decorative ring.
   const rodBigEnd=new THREE.Mesh(new THREE.TorusGeometry(.17,.045,16,48),bronze);
   rodBigEnd.castShadow=true;
   const bigEndCap=new THREE.Mesh(new THREE.TorusGeometry(.17,.048,12,28,Math.PI),forged);
   bigEndCap.rotation.z=Math.PI;rodBigEnd.add(bigEndCap);
   for(const boltSide of [-1,1]){
    const capBolt=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.075,12),steel);
    capBolt.rotation.x=Math.PI/2;capBolt.position.set(boltSide*.145,-.105,0);capBolt.castShadow=true;rodBigEnd.add(capBolt);
   }
   addSceneObject(rodBigEnd);
   // The small-end bush is perpendicular to the wrist-pin axis (X), unlike
   // the big-end bearing which surrounds the crankpin axis (Z).
   const rodSmallEnd=new THREE.Mesh(new THREE.TorusGeometry(.105,.032,14,40),bronze);
   rodSmallEnd.rotation.y=Math.PI/2;rodSmallEnd.castShadow=true;addSceneObject(rodSmallEnd);
   activeSection="valvetrain";
   const intake:THREE.Group[]=[],exhaust:THREE.Group[]=[],intakeSprings:THREE.Mesh[]=[],exhaustSprings:THREE.Mesh[]=[],followers:THREE.Mesh[]=[];
   const makeValve=(x:number,zz:number,color:number)=>{
    const g=new THREE.Group(),stem=new THREE.Mesh(new THREE.CylinderGeometry(.038,.038,.64,24),steel);stem.position.y=-.105;stem.castShadow=true;g.add(stem);
    const valveProfile=[new THREE.Vector2(0,-.535),new THREE.Vector2(.19,-.535),new THREE.Vector2(.255,-.515),new THREE.Vector2(.30,-.475),new THREE.Vector2(.31,-.445),new THREE.Vector2(.275,-.415),new THREE.Vector2(.20,-.395),new THREE.Vector2(0,-.395)];
    const face=new THREE.Mesh(new THREE.LatheGeometry(valveProfile,48),mat(color,.2,.94));face.castShadow=true;g.add(face);
    const keeper=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.075,20),steel);keeper.position.y=.205;g.add(keeper);
    const retainer=new THREE.Mesh(new THREE.CylinderGeometry(.115,.115,.065,24),bronze);retainer.position.y=.255;g.add(retainer);
    const guide=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.24,24),dark);guide.position.set(x,deck+.25,zz);addSceneObject(guide);
    const seat=new THREE.Mesh(new THREE.TorusGeometry(.285,.026,10,48),steel);seat.rotation.x=Math.PI/2;seat.position.set(x,deck+.015,zz);addSceneObject(seat);
    g.position.set(x,deck+.45,zz);addSceneObject(g);return g;
   };
   activeSection="valvetrain";
   const makeSpring=(x:number,zz:number)=>{const points:THREE.Vector3[]=[];for(let k=0;k<=96;k++){const t=k/96,a=t*Math.PI*2*9;points.push(vec(Math.cos(a)*.095,-.22+t*.44,Math.sin(a)*.095));}const spring=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),220,.016,8,false),steel);spring.position.set(x,deck+.46,zz);spring.castShadow=true;addSceneObject(spring);return spring;};
   for(const zz of [-bore*.12,bore*.12]){const x=-bore*.28;intake.push(makeValve(x,z+zz,0x70cdb6));intakeSprings.push(makeSpring(x,z+zz));const bucket=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,24),steel);bucket.position.set(x,deck+.76,z+zz);addSceneObject(bucket);followers.push(bucket);}
   for(const zz of [-bore*.12,bore*.12]){const x=bore*.28;exhaust.push(makeValve(x,z+zz,0xe4a05a));exhaustSprings.push(makeSpring(x,z+zz));const bucket=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.12,24),steel);bucket.position.set(x,deck+.76,z+zz);addSceneObject(bucket);followers.push(bucket);}
   activeSection="auxiliary";
   makeTube(addSceneObject,[vec(-width*.52,deck+.04,z+.16),vec(-width*.58,deck-.08,z+.16),vec(-width*.66,deck-.25,z+.16),vec(-width*.72,deck-.35,z+.16)],.12,intakeMaterial);
   makeTube(addSceneObject,[vec(width*.72,deck-.35,z-.16),vec(width*.66,deck-.25,z-.16),vec(width*.58,deck-.08,z-.16),vec(width*.52,deck+.04,z-.16)],.12,exhaustMaterial);
   const cylinderGasParticles:THREE.Mesh[]=[];for(let particle=0;particle<8;particle++){const material=particle%2===0?gasParticleMaterials[0]!:gasParticleMaterials[1]!;const bead=new THREE.Mesh(new THREE.SphereGeometry(.025,10,8),material);bead.visible=false;addSceneObject(bead);cylinderGasParticles.push(bead);}gasParticles.push(cylinderGasParticles);gasParticleProgress.push(Array.from({length:8},(_,particle)=>(particle%4)/4));
   parts.push({piston,rod,rodBigEnd,rodSmallEnd,intake,exhaust,intakeSprings,exhaustSprings,followers});
  }
  activeSection="valvetrain";
  // DOHC centreline ignition hardware: ceramic insulators, hex bodies and four coil packs.
  const sparkArcs:THREE.Group[]=[],combustionFlames:THREE.Mesh[]=[];
  const sparkMaterial=new THREE.LineBasicMaterial({color:0xfff3a1,transparent:true,opacity:1});
  const flameMaterials:THREE.MeshBasicMaterial[]=[];
  for(let i=0;i<4;i++){
   const z=zAt(i);
   const spark=new THREE.Group();
   const sparkPoints=[
    [vec(-.035,0,0),vec(-.012,.035,.012),vec(.006,.012,-.008),vec(.028,.052,.006)],
    [vec(.035,.004,0),vec(.014,.031,-.012),vec(-.004,.014,.01),vec(-.026,.047,-.004)]
   ];
   for(const points of sparkPoints){
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    spark.add(new THREE.Line(geometry,sparkMaterial));
   }
   spark.position.set(0,deck+.025,z);spark.visible=false;addSceneObject(spark);sparkArcs.push(spark);
   const flameMaterial=new THREE.MeshBasicMaterial({color:0xff8a24,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
   const flame=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),flameMaterial);
   flame.position.set(0,deck-.10,z);flame.scale.setScalar(.001);flame.visible=false;addSceneObject(flame);
   combustionFlames.push(flame);flameMaterials.push(flameMaterial);
   const ceramic=new THREE.Mesh(new THREE.CylinderGeometry(.042,.052,.23,24),mat(0xe1e0d2,.28,.12));
   ceramic.position.set(0,deck+.47,z);addSceneObject(ceramic);
   const hex=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.075,6),steel);
   hex.position.set(0,deck+.34,z);hex.rotation.y=Math.PI/6;addSceneObject(hex);
   const electrode=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.09,12),bronze);
   electrode.position.set(0,deck+.20,z);addSceneObject(electrode);
   const coil=new THREE.Mesh(new RoundedBoxGeometry(.19,.22,.27,4,.035),black);
   coil.position.set(0,deck+1.18,z);coil.castShadow=true;addSceneObject(coil);
   const coilCap=new THREE.Mesh(new RoundedBoxGeometry(.13,.055,.19,4,.018),mat(0x414b4d,.48,.35));
   coilCap.position.set(0,deck+1.31,z);addSceneObject(coilCap);
   makeTube(addSceneObject,[vec(0,deck+1.16,z),vec(0,deck+.95,z),vec(0,deck+.62,z)],.026,black);
  }
  activeSection="auxiliary";
  // Shared intake/exhaust castings, static coolant jackets, oil galleries, pump and sump reservoir.
  const plenum=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,length*.92,48),intakeMaterial);plenum.rotation.x=Math.PI/2;plenum.position.set(-width*.73,deck-.12,0);addSceneObject(plenum);
  const collector=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,length*.92,48),exhaustMaterial);collector.rotation.x=Math.PI/2;collector.position.set(width*.73,deck-.12,0);addSceneObject(collector);
  // Physical exhaust hardware only; moving gas is rendered in the lightweight 2D panel.
  const exhaustRoute=[vec(width*.73,deck-.12,length*.43),vec(width*.91,deck-.18,length*.50),vec(width*1.02,-.12,length*.58),vec(width*1.02,-.34,length*.72)];
  makeTube(addSceneObject,exhaustRoute,.115,exhaustMaterial);
  const muffler=new THREE.Group();
  const mufflerBody=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,1.05,40),forged);mufflerBody.rotation.x=Math.PI/2;muffler.add(mufflerBody);
  const mufflerCapA=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,.10,36),steel);mufflerCapA.rotation.x=Math.PI/2;mufflerCapA.position.z=-.53;muffler.add(mufflerCapA);
  const mufflerCapB=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,.10,36),steel);mufflerCapB.rotation.x=Math.PI/2;mufflerCapB.position.z=.53;muffler.add(mufflerCapB);
  muffler.position.set(width*1.02,-.34,length*.80);addSceneObject(muffler);
  makeTube(addSceneObject,[vec(width*1.02,-.34,length*.80+.50),vec(width*1.10,-.34,length*.92),vec(width*1.18,-.34,length*1.02)],.105,steel);
  // Each port starts at its own valve seat, then joins the corresponding intake/exhaust collector.
  for(let i=0;i<4;i++){
   const z=zAt(i);
   for(const dz of [-bore*.12,bore*.12]){
    makeTube(addSceneObject,[vec(-bore*.28,deck-.005,z+dz),vec(-bore*.36,deck-.035,z+dz),vec(-width*.43,deck-.08,z+dz*.72),vec(-width*.50,deck-.04,z+.16)],.058,intakeMaterial);
    makeTube(addSceneObject,[vec(bore*.28,deck-.005,z+dz),vec(bore*.36,deck-.035,z+dz),vec(width*.43,deck-.08,z+dz*.72),vec(width*.50,deck-.04,z-.16)],.061,exhaustMaterial);
   }
  }
  // Individual four-into-one runners give the gas paths a recognisable cast-manifold layout.
  for(let i=0;i<4;i++){
   const z=zAt(i);
   makeTube(addSceneObject,[vec(-width*.50,deck-.04,z),vec(-width*.62,deck-.14,z),vec(-width*.70,deck-.12,z),vec(-width*.73,deck-.12,z)],.072,intakeMaterial);
   makeTube(addSceneObject,[vec(width*.50,deck-.04,z),vec(width*.62,deck-.16,z),vec(width*.70,deck-.16,z),vec(width*.73,deck-.12,z)],.082,exhaustMaterial);
   for(const side of [-1,1]){
    const flange=new THREE.Mesh(new RoundedBoxGeometry(.10,.22,.24,3,.025),side<0?intakeMaterial:exhaustMaterial);
    flange.position.set(side*width*.52,deck-.04,z);addSceneObject(flange);
    for(const dz of [-.075,.075]){
     const stud=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.10,12),steel);
     stud.rotation.z=Math.PI/2;stud.position.set(side*(width*.52+.055),deck-.04,z+dz);addSceneObject(stud);
    }
   }
  }
  const coolantRail=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,length*.9,24),coolantMaterial);coolantRail.rotation.x=Math.PI/2;coolantRail.position.set(-width*.56,deck+.12,0);addSceneObject(coolantRail);
  const oilGallery=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,length*.92,20),bronze);oilGallery.rotation.x=Math.PI/2;oilGallery.position.set(width*.4,.25,0);addSceneObject(oilGallery);
  const pump=new THREE.Group(),oilPumpGears:THREE.Group[]=[];for(const x of [-.12,.12]){const gearGroup=new THREE.Group();gearGroup.position.x=x;const gear=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.1,20),bronze);gear.rotation.x=Math.PI/2;gearGroup.add(gear);for(let tooth=0;tooth<12;tooth++){const a=tooth/12*Math.PI*2,tip=new THREE.Mesh(new RoundedBoxGeometry(.055,.075,.1,3,.01),steel);tip.position.set(Math.cos(a)*.16,Math.sin(a)*.16,0);tip.rotation.z=a;gearGroup.add(tip);}pump.add(gearGroup);oilPumpGears.push(gearGroup);}pump.position.set(width*.4,-.35,length/2);addSceneObject(pump);
  const sump=new THREE.Mesh(new RoundedBoxGeometry(width*1.05,.62,length*.92,5,.12),black);sump.position.set(0,-.67,0);sump.castShadow=true;addSceneObject(sump);
  const oilSurface=new THREE.Mesh(new THREE.PlaneGeometry(width*.96,length*.85),oilMaterial);oilSurface.rotation.x=-Math.PI/2;oilSurface.position.set(0,-.35,0);addSceneObject(oilSurface);
  // External radiator core and coolant hoses close the cooling circuit visually.
  const radiator=new THREE.Group(),core=new THREE.Mesh(new RoundedBoxGeometry(.42,1.35,1.9,4,.055),dark);radiator.add(core);
  for(let i=0;i<11;i++){const fin=new THREE.Mesh(new RoundedBoxGeometry(.45,.035,1.84,3,.012),aluminium);fin.position.y=-.62+i*.124;radiator.add(fin);}
  radiator.position.set(-width*.95,deck*.38,-length*.38);addSceneObject(radiator);
  makeTube(addSceneObject,[vec(-width*.95,deck*.38,-length*.38),vec(-width*.85,deck*.65,-length*.3),vec(-width*.56,deck+.12,0)],.09,coolantMaterial);
  makeTube(addSceneObject,[vec(-width*.56,deck-.15,0),vec(-width*.8,deck*.15,length*.35),vec(-width*.95,deck*.38,length*.35)],.09,coolantMaterial);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(Math.max(length,width)*.85,96),mat(0x182225,.9,.1));floor.rotation.x=-Math.PI/2;floor.position.y=-1.05;floor.receiveShadow=true;addSceneObject(floor);
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(300,el.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const state:SceneState={parts,crank,cams,renderer,controls,frame:0,oilMaterial,coolantMaterial,metalMaterials,timingBeltMaterial,timingBeltLengthM:beltCurve.getLength()/scale,timingBeltMesh:belt,brokenTimingBeltMeshes,oilPump:pump,oilPumpGears,flywheel,starterMotor,starterPinion,starterShaft,gasParticles,gasParticleProgress,lastGasAngleDeg:0,gasParticleMaterials,sparkArcs,combustionFlames,sectionObjects};live.current=state;
  let previousFrameTime=performance.now();
  const render=()=>{const now=performance.now(),frameMs=now-previousFrameTime;previousFrameTime=now;
   const next=updateAdaptiveResolution(resolution,frameMs,now,interacting);if(next.scale!==resolution.scale)applyRenderScale(next.scale);resolution=next;
   controls.update();renderer.render(scene,camera);state.frame=requestAnimationFrame(render);};render();
  return()=>{cancelAnimationFrame(state.frame);observer.disconnect();controls.removeEventListener("start",onInteractionStart);controls.removeEventListener("end",onInteractionEnd);controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});state.timingBeltMaterial.map?.dispose();renderer.dispose();renderer.domElement.remove();live.current=null;};
 },[props.geometry]);

 useEffect(()=>{
  const s=live.current;if(!s)return;
  const stroke=props.geometry.strokeM*(2.2/props.geometry.strokeM),r=props.geometry.crankRadiusM*(2.2/props.geometry.strokeM);
  (Object.keys(s.sectionObjects) as EngineSection[]).forEach(section=>s.sectionObjects[section].forEach(object=>{object.visible=props.visibleSections[section];}));
  const rod=props.geometry.connectingRodLengthM*(2.2/props.geometry.strokeM),clearance=props.geometry.clearanceVolumePerCylinderM3/(Math.PI*props.geometry.boreM**2/4)*(2.2/props.geometry.strokeM);
  const bore=props.geometry.boreM*(2.2/props.geometry.strokeM),pistonTopOffset=.32,deck=rod+r+pistonTopOffset+clearance,spacing=Math.max(bore*1.18,bore+.18),length=spacing*3+bore*1.15,width=Math.max(bore*1.55,(2*r+bore*.2+.012*(2.2/props.geometry.strokeM))*1.1),crankAngle=((props.angle%360)+360)%360*Math.PI/180;
  const coupling=calculateInlineFourCrankCoupling(props.geometry,props.angle%360,props.rpm,props.cylinderStates.map(state=>state.pressurePa),101325,props.angle);
  const rawAngleDelta=props.angle-s.lastGasAngleDeg;
  const forwardAngleDelta=rawAngleDelta>=0?rawAngleDelta:rawAngleDelta < -360?rawAngleDelta+720:0;
  s.lastGasAngleDeg=props.angle;
  const motionDeltaSeconds=props.rpm>0?forwardAngleDelta/(props.rpm*6):0;
  s.parts.forEach((p,i)=>{
   const z=(i-1.5)*spacing,theta=crankAngle+(INLINE_FOUR_CRANK_PHASES_DEG[i]??0)*Math.PI/180;
   const state=props.mechanics[i],kinematics=coupling.cylinders[i];if(!state||!kinematics)return;
   const pinY=rod+r-kinematics.pistonDisplacementM*(2.2/props.geometry.strokeM);
   p.piston.position.set(0,pinY,z);
   const crankPin=vec(r*Math.sin(theta),r*Math.cos(theta),z),wristPin=vec(0,pinY,z);
   between(p.rod,wristPin,crankPin);
   p.rodBigEnd.position.copy(crankPin);p.rodSmallEnd.position.copy(wristPin);
   // The rotating cam surface is the valve-lift source. The mechanics model may
   // reduce effective lift for float/wear, but it cannot command a valve independently
   // of the lobe currently touching its bucket follower.
   const cylinderOffset=INLINE_FOUR_CYCLE_OFFSETS_DEG[i]!;
   const camIntakeCycle=calculateCamFollowerCycleAngleDeg(props.timingDrive.camshaftAngleDeg,INTAKE_CAM_CENTER,cylinderOffset);
   const camExhaustCycle=calculateCamFollowerCycleAngleDeg(props.timingDrive.camshaftAngleDeg,EXHAUST_CAM_CENTER,cylinderOffset);
   const camIntakeLift=calculateValveState(camIntakeCycle).intakeLiftMm;
   const camExhaustLift=calculateValveState(camExhaustCycle).exhaustLiftMm;
   const intakeEffectiveness=state.intakeLiftCommandMm>.001?clamp(state.intakeLiftActualMm/state.intakeLiftCommandMm,0,1):0;
   const exhaustEffectiveness=state.exhaustLiftCommandMm>.001?clamp(state.exhaustLiftActualMm/state.exhaustLiftCommandMm,0,1):0;
   const liftIn=camIntakeLift*intakeEffectiveness/1000*(2.2/props.geometry.strokeM);
   const liftOut=camExhaustLift*exhaustEffectiveness/1000*(2.2/props.geometry.strokeM);
   p.intake.forEach((v,j)=>{v.position.y=deck+.45-liftIn;p.intakeSprings[j]!.scale.y=Math.max(.35,1-liftIn/.42);p.intakeSprings[j]!.position.y=deck+.46-liftIn/2;});
   p.exhaust.forEach((v,j)=>{v.position.y=deck+.45-liftOut;p.exhaustSprings[j]!.scale.y=Math.max(.35,1-liftOut/.42);p.exhaustSprings[j]!.position.y=deck+.46-liftOut/2;});
   p.followers.forEach((f,j)=>{const lift=j<2?liftIn:liftOut;f.position.y=deck+.76-lift;});
   // Gas beads are driven by thermodynamic mass flow and are hidden when the valve is seated.
   const gas=props.cylinderStates[i]!;
   // Ignition is phased per cylinder on the 720° cycle. The arc is a short
   // event; the expanding glow follows the thermodynamic burned-fraction state.
   const ignition=calculateValveState(state.cycleAngleDeg).sparkActive;
   s.sparkArcs[i]!.visible=ignition&&props.rpm>0;
   const burn=clamp(gas.burnedFraction,0,1);
   const flame=s.combustionFlames[i]!;
   const flameMaterial=flame.material as THREE.MeshBasicMaterial;
   flame.visible=burn>.008;
   flame.scale.set(.08+burn*.42,.045+burn*.22,.08+burn*.42);
   flameMaterial.opacity=clamp(burn*.82,0,.82);
   flameMaterial.color.setHSL(.075-burn*.045,.98,.56);
   const intakeRate=clamp(Math.abs(gas.intakeMassFlowKgPerS)/.004,0,1),exhaustRate=clamp(Math.abs(gas.exhaustMassFlowKgPerS)/.004,0,1);
   s.gasParticles[i]!.forEach((bead,index)=>{const intakePath=index<4,rate=intakePath?intakeRate:exhaustRate,open=intakePath?state.intakeLiftActualMm:state.exhaustLiftActualMm;const active=rate>.015&&open>.05;bead.visible=active;if(!active)return;const direction=intakePath?1:-1;const previous=s.gasParticleProgress[i]![index]!;const progress=((previous+direction*rate*motionDeltaSeconds*.8)%1+1)%1;s.gasParticleProgress[i]![index]=progress;const start=intakePath?vec(-width*.50,deck-.04,z):vec(width*.50,deck-.04,z);const end=intakePath?vec(-bore*.28,deck+.02,z):vec(bore*.28,deck+.02,z);bead.position.lerpVectors(start,end,progress);bead.scale.setScalar(.55+rate*.8);});
  });
  s.crank.rotation.z=-crankAngle;s.flywheel.rotation.z=-crankAngle;
  const pinionX=props.starterActive ? .755 : .96;
  s.starterPinion.position.x=pinionX;
  s.starterPinion.rotation.z=props.starterActive?-s.flywheel.rotation.z*(56/14):0;
  between(s.starterShaft,vec(.96,-.38,-length/2-.12),vec(pinionX,0,-length/2-.12));
  s.cams.forEach((cam,index)=>{const center=index===0?INTAKE_CAM_CENTER:EXHAUST_CAM_CENTER;cam.rotation.z=(-props.timingDrive.camshaftAngleDeg+center/2)*Math.PI/180;});
  // Pump gears remain stationary until a visible mechanical drive is modeled.
  // Oil pressure and flow remain an RPM-dependent lumped system, not a claim of
  // fully modeled pump-gear kinematics.
  void s.oilPumpGears;
  // Sprockets are children of the crankshaft/camshaft groups; their angular
  // velocity and phase are therefore exactly inherited from their own shafts.
  if(s.timingBeltMaterial.map)s.timingBeltMaterial.map.offset.x=-(props.timingDrive.beltTravelM/Math.max(s.timingBeltLengthM,.001));
   s.timingBeltMesh.visible=!props.timingDrive.beltBroken;
   s.brokenTimingBeltMeshes.forEach(segment=>{segment.visible=props.timingDrive.beltBroken;});
   s.timingBeltMaterial.color.setHex(props.timingDrive.beltBroken?0x8c2929:0x596266);
  // Oil-pump gear meshes are intentionally not animated without a visible drive train.
  s.oilMaterial.color.setHex(props.systems.oilTemperatureC>125?0x50300d:0x302512);
  s.metalMaterials[0]!.color.setHex(props.systems.headTemperatureC>180?0x9d5540:0x879599);
 },[props.geometry,props.angle,props.rpm,props.cylinderStates,props.mechanics,props.systems,props.starterActive,props.visibleSections,props.timingDrive]);

 return <div className="engine-3d-host engine-3d-inline-four" ref={host}>
  <div className="engine-3d-hint">ROTÁ · ZOOM · INSPECCIONÁ EL CONJUNTO</div>
  <div className="engine-3d-axis">BLOQUE · VÁLVULAS · DISTRIBUCIÓN · VOLANTE · BURRO DE ARRANQUE</div>
 </div>;
}

export default memo(InlineFourScene);
