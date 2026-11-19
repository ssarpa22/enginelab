# Starter, idle and combustion audio

## Engine states

The engine now starts in the stopped state. The simulation clock can remain active while the crankshaft is stationary. Pressing START engages a modeled starter torque curve against the crankshaft; the starter pinion is shown moving into the flywheel ring gear and rotates at a reduction ratio while engaged.

The starter torque falls with motor speed. At the cut-out threshold (180 RPM in this educational model), the starter disengages and the engine transitions to running. The combustion torque then becomes the source of crankshaft drive. STOP cuts combustion torque and allows the rotating assembly to coast down under load and friction.

The starter is an approximate permanent-magnet motor model, not a detailed electromagnetic or solenoid circuit model. Compression pulses, battery voltage sag, pinion tooth impact and starter thermal limits are not yet solved.

## Valve and cam geometry

The valve assembly uses a poppet profile with a distinct stem, keeper, retainer and enlarged mushroom head, plus a visible guide and seat. The spring compression and valve travel remain driven by the cylinder's cam-lift state. Cam lobes use an asymmetric extruded nose profile instead of spherical placeholders.

## Sound

The audio path is user-activated to respect browser audio permissions. Engine exhaust pulses are one-shot synthesized transients triggered by the live 180-degree firing intervals, with a short pressure front, low-frequency resonances and a decaying noise tail. Separate low-frequency engine-body tones and intake/mechanical noise scale with RPM and load. During cranking, a separate starter-motor whine is used.

This is procedural audio, not a recording of a specific engine. The current combustion pulse envelope and resonances are approximations; matching a real exhaust requires measured recordings or a calibrated acoustic model.

## UI responsiveness

The RPM slider keeps its immediate display value while the physics target uses React's deferred value. The 3D scene receives memoized telemetry and is memoized itself, so each pointer movement does not force the scene to rebuild or re-run its geometry update effect. The simulation loop only restarts when the deferred target actually changes.

## Validation limits

Automated tests cover the starter torque curve, starter cut-out and external torque driving a stationary crankshaft. Manual browser checks are still needed for the perceived sound, pinion engagement visibility, valve clearances and frame pacing on the user's hardware.
