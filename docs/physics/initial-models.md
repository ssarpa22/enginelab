# Initial physical models

All calculations in the simulation core use SI units. Lengths are metres, volumes are cubic metres, angular positions are radians, speed is revolutions per minute at the public API boundary, and angular velocity is radians per second internally.

## Engine displacement

For bore \(B\), stroke \(S\), and cylinder count \(N\):

\[
V_{d,cyl} = \frac{\pi}{4} B^2 S
\]

\[
V_{d,total} = N V_{d,cyl}
\]

The initial reference configuration is a generic 90-degree V8:
- 8 cylinders
- 92 mm bore
- 94 mm stroke
- 150 mm connecting-rod centre distance
- 10.5:1 geometric compression ratio
- naturally aspirated, four-stroke reference context

Its calculated displacement is approximately 4.999 litres. This is a geometric result, not a claim about power or torque.

## Clearance volume and compression ratio

For geometric compression ratio \(r_c\):

\[
r_c = \frac{V_d + V_c}{V_c}
\qquad
V_c = \frac{V_d}{r_c - 1}
\]

Here \(V_c\) is the clearance volume per cylinder. This calculation does not model chamber shape, gasket volume, piston dish/dome, deck clearance, or deposits. Those details may be represented explicitly in a later geometry model.

## Ideal slider-crank kinematics

Let:
- \(r\) be crank radius (half the stroke),
- \(l\) be connecting-rod centre distance,
- \(\theta\) be crank angle measured from top dead centre,
- \(x\) be piston displacement from top dead centre, positive toward bottom dead centre.

The rigid slider-crank displacement is:

\[
x(\theta)=r+l-r\cos\theta-\sqrt{l^2-r^2\sin^2\theta}
\]

At constant angular velocity \(\omega\), piston velocity is:

\[
v(\theta)=\frac{dx}{d\theta}\omega
\]

\[
\frac{dx}{d\theta} =
r\sin\theta +
\frac{r^2\sin\theta\cos\theta}
{\sqrt{l^2-r^2\sin^2\theta}}
\]

\[
\omega = RPM \frac{2\pi}{60}
\]

The implementation accepts crank angle and RPM and returns displacement and velocity. The angle is not normalized; periodic trigonometric behavior applies for any finite angle.

## Assumptions and limitations

- Rigid crank, connecting rod, and piston.
- Ideal planar slider-crank geometry.
- Constant crankshaft speed during each evaluation.
- No pin offset, bearing clearance, elastic deformation, friction, or side-force calculation.
- No cylinder pressure, combustion, gas exchange, thermal state, torque, or power.
- No firing order or crankpin phasing. A bank angle is stored as engine geometry metadata only; it does not determine cylinder timing.

The model is intentionally kinematic. It must not be used to infer mechanical loads or engine performance.


## First single-zone cylinder pressure and temperature model

The first thermodynamic pass is a zero-dimensional (0-D), single-zone ideal-gas approximation. It calculates one representative pressure and temperature for the cylinder contents at each crank angle. It is intended to make the four-stroke cycle physically coherent at a teaching level, not to predict a real engine's performance.

### Reference assumptions

- Working fluid: dry air represented by a fixed ideal-gas constant, \(R=287.05\;J/(kg\cdot K)\).
- Intake boundary: \(p_1=101325\;Pa\), \(T_1=300\;K\).
- Exhaust boundary: ambient pressure and a fixed illustrative gas temperature of \(650\;K\).
- Intake valve closing: 40° after BDC, using the current illustrative valve-timing configuration (cycle angle 220°).
- Exhaust valve opening: 45° before BDC (cycle angle 495°).
- Compression exponent: \(n_c=1.32\); expansion exponent: \(n_e=1.25\).
- Specific heat at constant volume: \(c_v=718\;J/(kg\cdot K)\).
- Idealized heat release: \(Q=450\;J\) per cylinder per cycle, added instantaneously at TDC at constant volume.
- The spark event is displayed at the configured 15° BTDC. The model does not resolve flame travel or the delay between spark and heat release.

### Equations

Cylinder volume comes from the slider-crank piston position:

\[
V(\theta)=V_c+V_d\frac{x(\theta)}{S}
\]

At intake-valve closing, the trapped mass is initialized with the ideal-gas equation:

\[
m=\frac{p_1 V_{IVC}}{R T_1}
\]

During closed-valve compression:

\[
pV^{n_c}=constant,\qquad TV^{n_c-1}=constant
\]

At TDC, heat is added at constant volume:

\[
T_{after}=T_{before}+\frac{Q}{m c_v},
\qquad p_{after}=\frac{mRT_{after}}{V_c}
\]

During the power stroke, the charge expands polytropically:

\[
pV^{n_e}=constant,\qquad TV^{n_e-1}=constant
\]

During intake and exhaust, the current implementation uses fixed boundary conditions rather than solving valve-flow mass and energy balances. The exhaust temperature is a display-oriented assumption, not a computed exhaust result.

### What this model does not yet include

No fuel/air equivalence ratio, fuel chemistry, variable specific heats, dissociation, finite-rate combustion, Wiebe heat-release curve, wall heat transfer, blow-by, residual-gas fraction, pressure losses, intake/exhaust manifold dynamics, valve flow coefficients, turbocharging, or crankshaft work integration. The fixed heat input and polytropic exponents are adjustable reference assumptions, not calibrated values for a specific engine.

The pressure and temperature outputs should therefore be labelled as a simplified model, not measured or validated engine data. Future refinements should introduce a finite-duration heat-release model and gas-exchange mass/energy balances before attempting torque, power, emissions, or performance predictions.
