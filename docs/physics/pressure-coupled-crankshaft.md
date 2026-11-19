# Pressure-coupled inline-four crankshaft

EngineLab now has a shared crankshaft coupling model for the four-cylinder inline-four preview.

## Mechanical dependency chain

- One crankshaft angle is the master coordinate for all four throws.
- The 180-degree crank phasing maps the shared angle to the four piston positions.
- Each piston position and velocity comes from the exact slider-crank equation using crank radius and connecting-rod length.
- Each connecting-rod angle follows the crankpin-to-wrist-pin geometry.
- Gas pressure in each cylinder produces piston force using bore area.
- The slider-crank displacement Jacobian converts piston force into instantaneous crank torque: `T = (p_cyl - p_ambient) A (dx/dθ)`.
- The four cylinder torques are summed at the common crankshaft.
- A bounded rotational integrator advances crank angle and RPM from indicated gas torque, load, friction and a proportional speed governor.
- The two camshafts are constrained to half crankshaft speed. The valve train continues to use the cylinder-specific 720-degree cam timing and lift model.

The 720-degree cycle phasing and 1-3-4-2 firing order remain defined by the inline-four phase module. Setting the speed target to zero cuts fuel/ignition torque and lets the rotating assembly coast down under load and friction.

## Visual articulation

The live 3D scene consumes the same crank coupling result for piston travel and camshaft phase. Connecting rods are positioned between the computed wrist-pin and crankpin locations. The crank throws rotate with the common shaft; valves and springs follow their cylinder-specific cam lift. This is a continuous state-driven scene, not a prerecorded animation or looping media.

## Scope and limitations

This is a deterministic, rigid, one-degree-of-freedom crankshaft model with pressure-derived gas torque and a simple governor/load model. It does not yet solve flexible rods/crankshaft, piston slap, hydrodynamic bearing films, full cranktrain torsional modes, finite-element stress, detailed fuel injection, knock chemistry, or CFD. The existing CAD inspection GLBs remain inspection assets; their arbitrary imported mesh nodes are not yet retargeted to the live articulated skeleton. The live mechanical scene currently uses separately constructed, articulated component meshes sized from the engine geometry.

The values are educational estimates, not a calibration of a specific production engine.
