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
