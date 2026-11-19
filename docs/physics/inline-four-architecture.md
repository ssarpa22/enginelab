# Inline-four engine architecture (L4 DOHC)

## What the 3D assembly represents

The inspection model is a conventional inline-four, four-stroke gasoline engine with a 180-degree crankshaft and a DOHC, four-valve-per-cylinder cylinder head.

- Four cylinder bores and replaceable-looking liners share one inline block.
- The crankshaft has five main-journal positions, four crankpins and counterweight masses.
- Cylinders 1 and 4 share a TDC pair; cylinders 2 and 3 are the companion pair at 180 degrees.
- The firing order is 1-3-4-2, with nominal ignition events separated by 180 crank degrees.
- Each cylinder has a piston, three visible ring lands, wrist pin and connecting rod.
- Each cylinder has two intake poppet valves and two exhaust poppet valves, with two longitudinal camshafts.
- Intake runners connect to a shared plenum; exhaust runners connect to a shared collector.
- The block is deliberately cut away on the inspection side. The blue-green windows are illustrative coolant-jacket passages, not a solved cooling circuit.
- A timing-drive representation links the crank and cam end of the engine.

The bore and stroke dimensions are scaled from the engine geometry inputs. The 3D assembly is an explanatory cutaway, not a manufacturing CAD model: clearances, fasteners, oil galleries, bearing shells, piston bowl details, gasket layers and casting draft are simplified.

## Kinematic phasing

The crank throw pairs use phases [0, 180, 180, 0] degrees for cylinders 1–4. The four-stroke cycle offsets are [0, 180, 540, 360] degrees. These offsets produce the conventional 1-3-4-2 firing order at 180-degree intervals.

The crankshaft rotates at crank speed. Both camshafts rotate at half crank speed. The valve lift curves still use the project's smooth timing approximation; the visible cam lobes are representative geometry and are not yet a contact-resolved cam/follower simulation. Valve spring surge, lash, bucket/tappet contact, rocker ratios and elastic deflection are not solved.

## Per-cylinder gas and combustion state

The application evaluates the existing coupled 0-D open-system cylinder model four times at the appropriate 720-degree phase offset. Each cylinder therefore has its own pressure, temperature, burned fraction, intake mass flow and exhaust mass flow at the current crank angle. The 3D tracer particles follow those per-cylinder flow signs and valve-open windows.

This is still a zero-dimensional, single-zone thermodynamic model per cylinder. It does not calculate spatial gas velocity, turbulence, swirl/tumble, port boundary layers, flame-front geometry, detailed chemical species, acoustic manifold waves or CFD particle trajectories. The tracer dots are visualization markers, not molecules. The shared manifold geometry is not yet coupled through a 1-D wave solver, so cylinder-to-cylinder manifold pulse interference is not represented.

## Validation added

The inline-four phasing helper is covered by tests for:
- paired crank throws and TDC/BDC relationships;
- 1-3-4-2 firing order and 180-degree event spacing;
- independent wrapping of crank and 720-degree cycle angles;
- invalid indices and non-finite inputs.

The application continues to run the existing typecheck, unit tests and production build in CI.
