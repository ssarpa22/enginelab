# Architecture decisions

## Simulation core is framework-independent

The physical model package must not import React, Next.js, browser APIs, rendering engines, or audio APIs. This keeps it usable in tests, Web Workers, command-line tools, and a future desktop host.

## SI is the internal unit system

Use SI units throughout model calculations. Convert user-facing units at the boundaries and keep unit-bearing names explicit (for example, `boreM`, `crankAngleRad`, and `pistonVelocityMPerS`).

## Fidelity must be explicit

Each model documents its equations, assumptions, and limitations. A simplified model must not be presented as a complete engine simulation.

## Validate before expanding

New physical subsystems should be added only with documented equations, input validation, and automated tests. Visual rendering and audio are downstream consumers of simulation state, not substitutes for validated physics.
