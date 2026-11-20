# Timing drive, piston underside and 2D gas-flow presentation

- Inline-four crank throws are phased from the established 180-degree geometry: cylinders 1/4 share a plane and cylinders 2/3 are opposed by 180 degrees.
- Timing pulleys use a 2:1 pitch-radius/tooth-count ratio. The cam pulleys rotate at half crankshaft speed.
- Belt tension is estimated from a 350 N pretension plus the differential torque required by the camshaft/valve train. Combustion torque remains in the crankshaft and is not incorrectly routed through the timing belt. The 4,800 N belt limit is an educational failure threshold, not an OEM rating.
- The timing belt follows a closed outer envelope around all three pulleys and uses a scrolling rib texture to make belt travel visible.
- Piston underside detail adds pin bosses, support gussets, an undercrown bridge, reinforcing ribs, inner skirt and lower skirt rim.
- WebGL no longer creates per-cylinder gas particle meshes or flame spheres. A separate SVG 2D panel displays aggregated instantaneous intake/exhaust flow and estimated exhaust temperature through a schematic catalyst, muffler and tailpipe.

## Limits

The belt is a kinematically driven visual representation, not a flexible belt/contact solver. The exhaust system is schematic: catalyst conversion, muffler acoustics, exhaust-wave propagation, back-pressure coupling and aftertreatment chemistry are not solved. Displayed discharge pressure is the model's atmospheric boundary condition, not a measured pipe pressure. The 2D animation is deliberately inexpensive compared with 3D particle simulation.
