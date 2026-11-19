# Fixed-step physics clock

## Why this exists

The browser render loop is variable-rate. Integrating the crankshaft, lubrication,
cooling and damage systems once per animation frame makes numerical behavior depend
on display refresh rate and dropped frames. The previous loop also capped a single
integration delta at 50 ms and silently discarded elapsed time above that cap.

## Current policy

- Physics integration uses a fixed step of 1/240 second (240 Hz).
- Render frames contribute elapsed wall-clock time to an accumulator.
- Every complete fixed step is simulated; fractional time is retained.
- A frame contributes at most 100 ms. Longer stalls are deliberately discarded.
- At most 24 physics steps run per rendered frame.
- Slow motion scales time before it enters the accumulator.
- React/Three.js rendering remains decoupled from the physics frequency and keeps
  its existing UI publication cadence.

## Limits

This improves integration consistency across ordinary render FPS. It does not make
the physical models more accurate, add contact/collision solving, or guarantee
bit-identical results across JavaScript engines. Long stalls intentionally lose
simulation time to protect responsiveness. Visual interpolation between physics
snapshots is not included in this change.
