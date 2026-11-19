# Visual and audio asset policy

## Visual direction
EngineLab uses Real Engine Simulator's inline-four DOHC presentation as a visual reference, not its source code or proprietary assets. The scene remains a mechanically driven cutaway: piston travel, crank phase, cam half-speed, valve lift and gas exchange are driven by the simulation state.

The current scene pass replaces sharp block-like castings with bevelled cast geometry, adds cast ribs, core plugs, head fasteners, ignition coils, ceramic spark plugs and individual intake/exhaust manifold runners. Coolant and oil remain inside their galleries; only intake charge and exhaust products are animated as flow tracers.

## Third-party asset candidates
- Grab3D, **Car Engine**: https://grab3d.com/models/vehicles/car-engine/ — CC0 1.0, 19,668 triangles, PBR textures. Stylized exterior asset; useful as an exterior-view starting point, not a substitute for a rigged cutaway.
- Grab3D, **Crankshaft**: https://grab3d.com/models/vehicles/crankshaft/ — CC0 1.0, 7,604 triangles; separate crankshaft asset.
- Innerscene, **Four-cylinder inline piston engine, cutaway**: https://www.innerscene.com/tools/library/3d-parts/four-cylinder-inline-piston-engine-cutaway-e0417b1b — CC0; STEP source that can be exported to GLB/OBJ.
- Engine-X inline-four DOHC: CC BY-NC 4.0; do not bundle in a commercial distribution without separate permission.

## Audio
The browser audio engine is synthesized locally with Web Audio and requires a click to start. The firing pulse cadence is RPM / 30 Hz for a four-cylinder four-stroke engine (one firing event every 180 crank degrees). This is a procedural approximation, not a recording of a specific engine. Load affects the exhaust-noise layer and overall level.

## Next asset milestone
A downloadable GLB should only be added after checking that it contains separable component nodes and a compatible license. Whole-engine static meshes cannot honestly be presented as independently animated pistons, valves or crankshaft components.
