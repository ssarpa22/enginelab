# Incremental cylinder thermodynamics

The live application previously called the cycle solver from the intake-valve-closing reference on every telemetry render. That repeated all prior crank-angle work for each cylinder and quantized integration to whole crank degrees. The 240 Hz physics clock therefore did not mean the open-system gas state itself advanced at 240 Hz.

The incremental solver keeps mass, temperature, pressure, burned fraction and the unwrapped cycle angle between calls. It advances only the newly elapsed crank-angle interval, including fractional degrees, with an RPM-dependent maximum substep of 0.5–1.5 crank degrees. Each elapsed interval is subdivided so no substep exceeds the selected limit. The first state is initialized at intake-valve closing; subsequent calls preserve state across the 720-degree cycle boundary.

The constant-property ideal-gas assumption uses fixed specific heats with
\(c_p=\gamma c_v\) and \(R=c_p-c_v\), so the configuration enforces
\(\gamma=1+R/c_v\) within 1%. This keeps the compressible-flow relation and
internal-energy balance thermodynamically consistent.

Each substep applies:
- slider-crank volume change and pressure-volume work;
- compressible isentropic valve-curtain flow with choking;
- inlet/outlet enthalpy transport;
- finite-duration Wiebe heat release;
- lumped wall heat transfer;
- pressure-derived indicated torque.

The UI now uses one persistent state per cylinder and resets those states when engine geometry changes. The existing cycle-replay function remains available as a reference implementation and for comparison tests.

## Limits

This is still a single-zone ideal-gas 0-D model with fixed gas properties, simplified valve discharge and wall area, no residual-gas species tracking, no fuel-air equivalence ratio, no knock, no turbulence, no multi-zone flame propagation, and no calibrated engine map. It is not CFD. The model's first-cycle initialization and numerical stability should be reviewed against reference pressure traces before using it predictively.
