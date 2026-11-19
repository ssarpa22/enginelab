# EngineLab

EngineLab is a modular, physics-first laboratory for building, modifying, measuring, and experimenting with internal combustion engines.

The project combines a framework-independent simulation core with a lightweight browser workspace. Physical calculations stay in the core; the interface is a consumer of those models, not a substitute for them.

## Requirements

- Node.js 20.19 or newer
- npm 11.6 or newer (Vitest 4.1.12 requires a newer npm resolver than the npm 10 bundled with Node 22)

## Setup

```bash
npm install
npm run validate
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

Create a production build with `npm run build`, or serve that build locally with `npm run preview`.

## Current browser workspace

The first Mechanical Playground milestone provides an interactive single-cylinder slider-crank view:

- Live piston, connecting-rod, and crank animation.
- Adjustable bore, stroke, connecting-rod length, and engine speed.
- Pause/resume, playback-rate selection, and manual crank-angle control.
- Live displacement, crank angle, piston position, and piston velocity readouts.
- Position and velocity plots over one crankshaft revolution.

The UI calls the same TypeScript geometry and kinematics functions covered by the simulation-core tests. All internal lengths and angles use SI units; controls display millimetres, RPM, and degrees.

## Simulation fidelity and limitations

The current mechanism is an ideal rigid slider-crank evaluated at constant crankshaft speed. It does **not** simulate combustion, cylinder pressure, torque, power, gas exchange, friction, thermal behaviour, material stress, or crankshaft dynamics. The displayed 10.5:1 compression ratio is a fixed geometric reference value, not a combustion model.

Do not interpret this preview as a complete engine performance simulator.

## Workspace

- `src`: browser application and Mechanical Playground UI.
- `packages/simulation-core`: framework-independent physical and mechanical models.
- `docs/physics`: equations, assumptions, and model limitations.
- `docs/architecture`: architectural decisions.

## Engineering principles

- **Physics before presentation:** validate models and numerical behaviour before adding visual effects.
- **Explicit fidelity:** every model documents its equations, assumptions, and known limitations.
- **SI internally:** use metres, kilograms, seconds, pascals, kelvin, and radians inside the simulation core. Convert units at application boundaries.
- **Modular by design:** keep domain logic independent from React, rendering, and audio.
- **Progressive complexity:** add combustion, gas exchange, thermal behaviour, friction, and dynamics as separately testable models.
- **Honest outputs:** never present a simplified model as a complete physical simulation.
