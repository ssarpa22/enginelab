import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Props = { asset: "cutaway" | "piston" };
const ASSETS = {
  cutaway: { url: "/models/engine-cutaway.glb", label: "ENSAMBLE CAD · 269 COMPONENTES", fit: 1.18 },
  piston: { url: "/models/piston-with-rings-and-connecting-rod.glb", label: "PISTÓN · AROS · PERNO · BIELA", fit: 1.9 }
} as const;

export default function CadAssetScene({ asset }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [parts, setParts] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let frame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101719);
    scene.fog = new THREE.Fog(0x101719, 14, 42);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
    camera.position.set(5, 4, 7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: false });
    const dpr = Math.min(window.devicePixelRatio || 1, 1.15);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = false;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd9e8e6, 0x1b2427, 2.1));
    const key = new THREE.DirectionalLight(0xffe4c4, 3.0);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8aaeb0, 1.7);
    rim.position.set(-6, 3, -5);
    scene.add(rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 0.08;
    controls.maxDistance = 1000;
    controls.maxPolarAngle = Math.PI * 0.92;

    const resize = () => {
      const width = Math.max(1, el.clientWidth);
      const height = Math.max(300, el.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const selected = ASSETS[asset];
    new GLTFLoader().load(
      selected.url,
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
          });
          return;
        }
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const scale = selected.fit * 5 / maxDimension;
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.frustumCulled = true;
            o.castShadow = false;
            o.receiveShadow = false;
            if (o.material instanceof THREE.MeshStandardMaterial) {
              o.material.roughness = Math.max(0.28, o.material.roughness);
              o.material.envMapIntensity = 0.8;
            }
          }
        });
        scene.add(model);
        const fitted = new THREE.Box3().setFromObject(model);
        const fittedSize = fitted.getSize(new THREE.Vector3());
        const radius = Math.max(fittedSize.x, fittedSize.y, fittedSize.z);
        controls.target.set(0, 0, 0);
        camera.position.set(radius * 1.35, radius * 0.9, radius * 1.55);
        camera.near = Math.max(0.001, radius / 1000);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.minDistance = radius * 0.08;
        controls.maxDistance = radius * 12;
        let meshCount = 0;
        model.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
        setParts(meshCount);
        setStatus("ready");
      },
      undefined,
      (error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message.includes("404") || message.toLowerCase().includes("not found") ? "missing" : "error");
      }
    );

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [asset]);

  return <div className="engine-3d-host cad-asset-host" ref={host}>
    <div className="engine-3d-hint">{ASSETS[asset].label} · ORBITÁ Y ACERCÁ</div>
    <div className="cad-asset-status" aria-live="polite">
      {status === "loading" && "CARGANDO MODELO 3D…"}
      {status === "ready" && `${parts} MALLAS INDEPENDIENTES · VISTA CAD`}
      {status === "missing" && "FALTA EL ARCHIVO EN public/models · VER INSTRUCCIONES EN public/models/README.md"}
      {status === "error" && "NO SE PUDO LEER EL MODELO · REVISÁ EL ARCHIVO GLB"}
    </div>
  </div>;
}
