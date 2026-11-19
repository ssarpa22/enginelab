# Mechanical constraints and auxiliary engine systems

## Geometry and rigid kinematics

The cutaway is dimensioned from the selected bore, stroke, connecting-rod length and compression ratio. A common scene scale is derived from stroke; the bore, crank radius, rod length, deck height, cylinder spacing and block envelope use that scale. The block is built as a cast crankcase/deck/head assembly with a service-side cutaway rather than a single decorative box.

For each cylinder the piston pin is placed from the exact slider-crank solution. The crankpin is located at the crank radius and phased crank angle. The connecting rod is rendered between those two points, so its endpoint distance remains the configured rod length throughout a revolution. The crankshaft rotates as one assembly; throw pairs are phased 1/4 and 2/3. The DOHC shafts and cam pulleys rotate at half crank speed; the oil pump gears are driven from the crank representation.

## Valve train and interference guard

Each cylinder has two intake and two exhaust poppet valves, visible stems, seats, retainers, springs and bucket followers. Valve lift is taken from the configured 720-degree timing curve. Spring compression and follower travel are driven by that lift, rather than by independent decorative animation.

The mechanical state estimates deck clearance from clearance volume and piston area. It then subtracts valve lift and an explicit valve-pocket allowance to estimate piston-to-valve clearance. A conservative minimum clearance is enforced: commanded valve lift is clipped before the piston can intersect a valve head, and the UI exposes minimum clearance and any limiter activation. Piston skirt and connecting-rod-to-crankcase clearances are dimensioned from bore and crank geometry.

This is a rigid kinematic constraint and interference guard, not a general-purpose collision engine. It does not yet solve elastic contact, impact impulses, crankshaft bending, bearing deformation, piston slap, rod stretch, valve float or real contact-patch stress. The model should not be treated as a validated mechanical design.

## Oil system

The cutaway shows a wet sump, oil pump gears, a main oil gallery and moving oil-jet tracer particles aimed at the rotating assembly. A lumped oil model estimates pump delivery from RPM and a temperature-dependent viscosity factor, caps pressure at a relief-valve setting, tracks oil temperature and flow, and calculates a normalized bearing-film proxy. Low pressure or film ratio raises a lubrication warning.

The oil model does not solve Reynolds lubrication, hydrodynamic wedge pressure, cavitation, bearing clearances, oil aeration, filter pressure drop or local thermal gradients. The displayed film ratio is an educational indicator, not an EHL calculation.

## Cooling system

Water jackets surround the cylinder liners; a coolant rail, hoses and a radiator core complete the visible circuit. Coolant tracer particles circulate around each liner. A lumped thermal model tracks coolant and head temperature, pump flow, circuit pressure, thermostat opening and estimated radiator heat rejection. Temperatures change with RPM and a simple load proxy; after shutdown, oil and coolant cool by passive heat loss.

This does not solve conjugate heat transfer, local boiling, cavitation, pump maps, thermostat hysteresis, radiator airflow or detailed coolant chemistry. The displayed temperatures are illustrative estimates.

## Exhaust and sound

The existing per-cylinder open-system thermodynamic states drive the intake/exhaust tracer particles and combustion glow. The exhaust temperature display is an estimate derived from the cylinder thermal state, not a measured exhaust-port solution. An optional procedural four-cylinder firing tone is generated locally after the user explicitly enables audio; it is not a recording of a particular engine.

## Validation

Tests cover:
- fixed connecting-rod length over a full crank revolution;
- piston travel bounded by the configured stroke;
- minimum piston-to-valve clearance after the interference guard;
- oil pump pressure and flow response with RPM and relief-valve cap;
- thermostat opening and radiator heat rejection;
- invalid RPM and thermal integration steps.

The combustion/gas model remains a separate 0-D, single-zone model per cylinder. There is no CFD, 1-D manifold wave solver, detailed chemical kinetics or calibrated engine map.
