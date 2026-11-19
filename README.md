# EngineLab

EngineLab is a modular, physics-first laboratory for building, modifying, measuring, and experimenting with internal combustion engines.

The project starts as a lightweight web application, while keeping its simulation core independent from the browser and UI so it can later run in Web Workers, command-line tools, automated tests, and a desktop application.

## Principles

- **Physics before presentation:** validate models and numerical behavior before adding visual effects.
- **Explicit fidelity:** every model documents its equations, assumptions, and known limitations.
- **SI internally:** use metres, kilograms, seconds, pascals, kelvin, and radians inside the simulation core. Convert units at application boundaries.
- **Modular by design:** keep domain logic independent of Next.js, React, rendering, and audio.
- **Progressive complexity:** add combustion, gas exchange, thermal behavior, friction, and dynamics as separately testable models.
- **Honest outputs:** never present a simplified model as a complete physical simulation.

## Current status

The first milestone establishes the TypeScript workspace and the initial geometry and ideal slider-crank kinematics models.

Reference engine for initial tests: generic 90-degree V8, 8 cylinders, 92 mm bore, 94 mm stroke, 150 mm connecting rods, and 10.5:1 geometric compression ratio. It is a reference configuration, not a representation of a specific production engine.

## Requirements

- Node.js 20 or newer
- npm 10 or newer recommended

## Setup

```bash
npm install
npm run validate
```

## Workspace

- `packages/simulation-core`: framework-independent physical and mechanical models.
- `docs/physics`: equations, assumptions, and model limitations.
- `docs/architecture`: architectural decisions.

## Initial scope and exclusions

Included:
- SI unit constants and explicit unit conversions.
- Engine geometry and displacement.
- Geometric clearance volume from compression ratio.
- Ideal slider-crank piston position and velocity at constant crankshaft speed.

Not included yet:
- Combustion, cylinder pressure, torque, or power.
- Intake/exhaust gas exchange or volumetric efficiency.
- Heat transfer, cooling, and material properties.
- Friction, bearing losses, component elasticity, or structural stress.
- Crankshaft phasing, firing order, and bank-specific cylinder placement.
- Fuel chemistry, ignition, injection, or emissions.

These are future milestones, not hidden features of the current model.
