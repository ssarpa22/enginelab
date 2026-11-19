import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EngineGeometry } from "../packages/simulation-core/src/geometry";
import { calculateSliderCrankState } from "../packages/simulation-core/src/mechanics";
import { calculateValveState } from "../packages/simulation-core/src/mechanics/valve-timing";

type Props = {
  geometry: EngineGeometry;
  angle: number;
  pressurePa: number;
  burnedFraction: number;
  intakeFlowKgPerS: number;
  exhaustFlowKgPerS: number;
  sparkFlash: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const metal = (color: number, roughness = 0.36, metalness = 0.78) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const vector = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function placeBetween(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const direction = new THREE.Vector3().subVectors(b, a);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(1, direction.length(), 1);
  mesh.quaternion.setFromUnitVectors(vector(0, 1, 0), direction.normalize());
}

export default function EngineScene({
  geometry, angle, pressurePa, burnedFraction, intakeFlowKgPerS, exhaustFlowKgPerS, sparkFlash
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    piston: THREE.Group;
    rod: THREE.Mesh;
    crank: THREE.Group;
    intakeValve: THREE.Group;
    exhaustValve: THREE.Group;
    intakeCam: THREE.Group;
    exhaustCam: THREE.Group;
    intakeParticles: THREE.Mesh[];
    exhaustParticles: THREE.Mesh[];
    chamberParticles: THREE.Mesh[];
    flame: THREE.Mesh;
    spark: THREE.Group;
    animationFrame: number;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111719);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(5.4, 3.5, 7.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0.1, 0);
    controls.minDistance = 4.5;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.82;

    scene.add(new THREE.HemisphereLight(0xc8e4e2, 0x252b30, 2.0));
    const key = new THREE.DirectionalLight(0xffe0b7, 3.4);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x66b9b0, 2.1);
    rim.position.set(-5, 2, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(0xe99a48, 18, 9);
    fill.position.set(0, 0, 3);
    scene.add(fill);

    const steel = metal(0x7f9298, 0.29, 0.88);
    const darkSteel = metal(0x303c41, 0.42, 0.82);
    const brightSteel = metal(0xc5d0d1, 0.2, 0.9);
    const bronze = metal(0x9b7045, 0.3, 0.82);
    const blockMaterial = new THREE.MeshStandardMaterial({
      color: 0x56656a, metalness: 0.72, roughness: 0.34, transparent: true, opacity: 0.24,
      side: THREE.DoubleSide
    });
    const cylinderRadius = clamp(geometry.boreM * 7.2, 0.48, 0.78);
    const strokeWorld = 2.35;
    const crankRadius = strokeWorld / 2;
    const crankY = -1.45;
    const topY = crankY + strokeWorld;
    const crankAngle = ((angle % 360) + 360) % 360 * Math.PI / 180;

    const floor = new THREE.Mesh(new THREE.CircleGeometry(5.8, 64), new THREE.MeshStandardMaterial({
      color: 0x192225, roughness: 0.86, metalness: 0.16
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.95;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(9, 30, 0x344447, 0x263336);
    grid.position.y = -1.94;
    scene.add(grid);

    const block = new THREE.Mesh(new THREE.BoxGeometry(2.25, 3.1, 1.85), blockMaterial);
    block.position.set(0, -0.05, 0);
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);

    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, strokeWorld + 0.28, 48, 1, true),
      metal(0x89999e, 0.23, 0.94)
    );
    liner.position.y = crankY + crankRadius + 0.08;
    liner.material.side = THREE.DoubleSide;
    scene.add(liner);

    const head = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.42, 1.9), darkSteel);
    head.position.y = topY + 0.27;
    head.castShadow = true;
    scene.add(head);
    const headCover = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.58), steel);
    headCover.position.y = topY + 0.52;
    scene.add(headCover);

    const piston = new THREE.Group();
    const pistonBody = new THREE.Mesh(
      new THREE.CylinderGeometry(cylinderRadius * 0.91, cylinderRadius * 0.91, 0.34, 48),
      brightSteel
    );
    pistonBody.castShadow = true;
    piston.add(pistonBody);
    for (const y of [-0.1, -0.035, 0.04]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(cylinderRadius * 0.91, 0.018, 8, 48), darkSteel);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      piston.add(ring);
    }
    const wristPin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.25, 24), bronze);
    wristPin.rotation.z = Math.PI / 2;
    wristPin.position.z = 0.03;
    piston.add(wristPin);
    scene.add(piston);

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.16, 1, 20), steel);
    rod.castShadow = true;
    scene.add(rod);
    const rodCap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 12, 32), bronze);
    scene.add(rodCap);

    const crank = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.9, 32), brightSteel);
    shaft.rotation.x = Math.PI / 2;
    crank.add(shaft);
    const webGeometry = new THREE.BoxGeometry(0.2, crankRadius * 1.2, 0.95);
    const webA = new THREE.Mesh(webGeometry, darkSteel);
    webA.position.set(0, crankRadius * 0.5, 0);
    crank.add(webA);
    const webB = new THREE.Mesh(webGeometry, darkSteel);
    webB.position.set(0, crankRadius * 0.5, 0);
    webB.position.z = 0.66;
    crank.add(webB);
    const crankPin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.8, 24), bronze);
    crankPin.rotation.x = Math.PI / 2;
    crankPin.position.y = crankRadius;
    crank.add(crankPin);
    crank.position.y = crankY;
    scene.add(crank);

    const makeValve = (x: number, color: number) => {
      const group = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.68, 16), brightSteel);
      stem.position.y = -0.22;
      group.add(stem);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.075, 24), metal(color, 0.25, 0.85));
      face.position.y = -0.57;
      group.add(face);
      const spring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 24), steel);
      spring.position.y = 0.02;
      group.add(spring);
      group.position.set(x, topY + 0.63, 0);
      scene.add(group);
      return group;
    };
    const intakeValve = makeValve(-0.38, 0x61c6b0);
    const exhaustValve = makeValve(0.38, 0xe9a34b);

    const makeCam = (x: number, z: number) => {
      const group = new THREE.Group();
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.65, 24), bronze);
      axle.rotation.x = Math.PI / 2;
      group.add(axle);
      for (const zOffset of [-0.48, 0, 0.48]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), steel);
        lobe.scale.set(0.72, 1.28, 0.62);
        lobe.position.set(0, 0.12, zOffset);
        group.add(lobe);
      }
      group.position.set(x, topY + 0.88, z);
      scene.add(group);
      return group;
    };
    const intakeCam = makeCam(-0.38, 0.53);
    const exhaustCam = makeCam(0.38, -0.53);

    const makeDuct = (points: THREE.Vector3[], color: number) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.14, 16, false), metal(color, 0.3, 0.58));
      mesh.castShadow = true;
      scene.add(mesh);
      return curve;
    };
    const intakeCurve = makeDuct([
      vector(-1.8, topY + 0.55, 0.05), vector(-1.35, topY + 0.5, 0.05),
      vector(-0.95, topY + 0.25, 0.05), vector(-0.48, topY + 0.05, 0.05),
      vector(-0.38, topY - 0.12, 0.05), vector(-0.28, topY - 0.3, 0.05)
    ], 0x368f7d);
    const exhaustCurve = makeDuct([
      vector(0.28, topY - 0.3, -0.05), vector(0.38, topY - 0.12, -0.05),
      vector(0.48, topY + 0.05, -0.05), vector(0.95, topY + 0.25, -0.05),
      vector(1.35, topY + 0.5, -0.05), vector(1.8, topY + 0.55, -0.05)
    ], 0xb87532);

    const plug = new THREE.Group();
    const plugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.62, 20), brightSteel);
    plugBody.position.y = 0.25;
    plug.add(plugBody);
    const electrode = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 12), bronze);
    electrode.position.y = -0.13;
    plug.add(electrode);
    plug.position.set(0, topY + 0.67, 0.28);
    scene.add(plug);
    const spark = new THREE.Group();
    const sparkMaterial = new THREE.LineBasicMaterial({ color: 0xffe38a, linewidth: 2 });
    const boltPoints = [vector(0, 0, 0), vector(-0.07, -0.08, 0.015), vector(0.025, -0.14, 0.03), vector(-0.025, -0.22, 0.045)];
    spark.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(boltPoints), sparkMaterial));
    const sparkGlow = new THREE.PointLight(0xffbd48, 4, 1.1);
    sparkGlow.position.set(0, -0.1, 0.04);
    spark.add(sparkGlow);
    spark.position.set(0, topY + 0.48, 0.28);
    spark.visible = false;
    scene.add(spark);

    const flameMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8b2a, emissive: 0xff5b13, emissiveIntensity: 2.6,
      transparent: true, opacity: 0.2, roughness: 0.28, depthWrite: false
    });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), flameMaterial);
    flame.position.set(0, topY - 0.24, 0);
    scene.add(flame);

    const makeParticles = (count: number, color: number, radius: number) => {
      const material = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.32, roughness: 0.3, transparent: true, opacity: 0.9
      });
      return Array.from({ length: count }, () => {
        const particle = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), material);
        scene.add(particle);
        return particle;
      });
    };
    const intakeParticles = makeParticles(22, 0x5fe3c0, 0.035);
    const exhaustParticles = makeParticles(22, 0xffad55, 0.038);
    const chamberParticles = makeParticles(28, 0xb8d6d1, 0.025);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(300, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const state = {
      scene, camera, renderer, controls, piston, rod, crank, intakeValve, exhaustValve,
      intakeCam, exhaustCam, intakeParticles, exhaustParticles, chamberParticles, flame, spark,
      animationFrame: 0
    };
    sceneRef.current = state;

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      state.animationFrame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(state.animationFrame);
      observer.disconnect();
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const normalized = ((angle % 720) + 720) % 720;
    const crankRad = normalized % 360 * Math.PI / 180;
    const valve = calculateValveState(normalized);
    const displacement = calculateSliderCrankState(geometry, crankRad, 0).pistonDisplacementM;
    const strokeWorld = 2.35;
    const crankRadius = strokeWorld / 2;
    const crankY = -1.45;
    const topY = crankY + strokeWorld;
    const pistonY = topY - (displacement / geometry.strokeM) * strokeWorld;

    state.piston.position.set(0, pistonY - 0.12, 0);
    const wrist = vector(0, pistonY - 0.12, 0);
    const pin = vector(crankRadius * Math.sin(crankRad), crankY + crankRadius * Math.cos(crankRad), 0);
    placeBetween(state.rod, wrist, pin);
    state.crank.rotation.z = -crankRad;
    state.intakeValve.position.y = topY + 0.63 - valve.intakeLiftMm * 0.035;
    state.exhaustValve.position.y = topY + 0.63 - valve.exhaustLiftMm * 0.035;
    state.intakeCam.rotation.z = normalized * Math.PI / 360;
    state.exhaustCam.rotation.z = normalized * Math.PI / 360;

    const intakeIntensity = clamp(Math.abs(intakeFlowKgPerS) * 30, 0, 1);
    const exhaustIntensity = clamp(Math.abs(exhaustFlowKgPerS) * 30, 0, 1);
    const flowDirectionIntake = intakeFlowKgPerS >= 0 ? 1 : -1;
    const flowDirectionExhaust = exhaustFlowKgPerS >= 0 ? 1 : -1;
    state.intakeParticles.forEach((particle, index) => {
      const t = ((normalized / 720 * 2.5 + index / state.intakeParticles.length) % 1);
      const directed = flowDirectionIntake > 0 ? t : 1 - t;
      const point = intakeCurvePoint(directed);
      particle.position.copy(point);
      particle.visible = valve.intakeLiftMm > 0.12 && intakeIntensity > 0.015 && index < Math.ceil(intakeIntensity * state.intakeParticles.length);
    });
    state.exhaustParticles.forEach((particle, index) => {
      const t = ((normalized / 720 * 2.2 + index / state.exhaustParticles.length) % 1);
      const directed = flowDirectionExhaust > 0 ? t : 1 - t;
      particle.position.copy(exhaustCurvePoint(directed));
      particle.visible = valve.exhaustLiftMm > 0.12 && exhaustIntensity > 0.015 && index < Math.ceil(exhaustIntensity * state.exhaustParticles.length);
    });
    const powerProgress = clamp((normalized - 345) / 90, 0, 1);
    state.chamberParticles.forEach((particle, index) => {
      const spread = (index % 7) / 7;
      const around = Math.floor(index / 7) * Math.PI / 2;
      particle.position.set(
        Math.cos(around + normalized * 0.025) * (0.1 + spread * 0.3),
        topY - 0.18 - (index % 4) * 0.14 - powerProgress * 0.1,
        Math.sin(around + normalized * 0.025) * (0.1 + spread * 0.3)
      );
      particle.visible = normalized > 200 && normalized < 540 && burnedFraction < 0.98;
    });
    state.spark.visible = sparkFlash || valve.sparkActive;
    const pressureBoost = clamp((pressurePa - 100000) / 8_000_000, 0, 1);
    const flameScale = 0.15 + burnedFraction * 0.5 + pressureBoost * 0.35;
    state.flame.scale.set(flameScale, flameScale * 0.8, flameScale);
    (state.flame.material as THREE.MeshStandardMaterial).opacity =
      normalized > 340 && normalized < 500 ? clamp(burnedFraction * 1.3, 0.08, 0.82) : 0;
    state.flame.visible = normalized > 340 && normalized < 500;
  }, [geometry, angle, pressurePa, burnedFraction, intakeFlowKgPerS, exhaustFlowKgPerS, sparkFlash]);

  return <div className="engine-3d-host" ref={hostRef}>
    <div className="engine-3d-hint">ARRASTRÁ PARA ROTAR · SCROLL PARA ZOOM</div>
    <div className="engine-3d-axis">VISTA 3D · CORTE DEL MOTOR</div>
  </div>;
}

function intakeCurvePoint(t: number): THREE.Vector3 {
  const points = [
    vector(-1.8, 1.6, 0.05), vector(-1.35, 1.55, 0.05), vector(-0.95, 1.3, 0.05),
    vector(-0.48, 1.1, 0.05), vector(-0.38, 0.93, 0.05), vector(-0.28, 0.75, 0.05)
  ];
  return new THREE.CatmullRomCurve3(points).getPoint(clamp(t, 0, 1));
}

function exhaustCurvePoint(t: number): THREE.Vector3 {
  const points = [
    vector(0.28, 0.75, -0.05), vector(0.38, 0.93, -0.05), vector(0.48, 1.1, -0.05),
    vector(0.95, 1.3, -0.05), vector(1.35, 1.55, -0.05), vector(1.8, 1.6, -0.05)
  ];
  return new THREE.CatmullRomCurve3(points).getPoint(clamp(t, 0, 1));
}
