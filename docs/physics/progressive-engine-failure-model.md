# Progressive mechanical wear and failure model

EngineLab now includes a deterministic, time-stepped failure layer on top of its idealized four-cylinder kinematics and lumped thermal systems.

## Feedback paths

- **Oil starvation:** low gallery pressure or a weak bearing-film proxy increases bearing wear and friction. The pump now maintains regulated gallery pressure at idle, with pressure rising with speed and viscosity and capped by the relief valve. A healthy full-sump engine should not be classified as dry at 800 RPM; low oil level, pickup loss, or severe overheating can still cause starvation.
- **Piston / liner thermal growth:** estimated differential expansion reduces the modeled skirt clearance. Sustained hot operation increases scuffing; negative clearance is surfaced as an interference warning and continued damage can seize the engine.
- **Valve float:** above the illustrative 6,100 RPM onset, the valve train progressively loses effective lift. This reduces gas exchange and power while adding valvetrain wear.
- **Connecting-rod fatigue:** sustained operation above the illustrative 6,500 RPM safe-speed reference accumulates fatigue and reduces available power.
- **Head-gasket damage:** sustained coolant or head over-temperature accumulates gasket damage and raises the model's misfire probability.

## State and reset behavior

Wear is cumulative and is not automatically repaired by cooling down or restoring oil pressure. The simulation reset restores a new undamaged engine. A seized state is latched until reset.

## Interpretation and limitations

All rates and thresholds are demonstration parameters, not durability predictions for a specific production engine. The model does not calculate local bearing contact stress, elastic rod deformation, oil-film hydrodynamics, crack propagation, gasket sealing pressure, or finite-element thermal stress. The mechanical envelope is a rigid kinematic / clearance guard, not a general collision solver.

The crankshaft now accepts a 7,000 RPM simulation ceiling so the RPM control can exercise the illustrative 6,100 RPM valve-float onset and 6,500 RPM rod-fatigue reference. Wear penalties now feed back into indicated crank torque and crankshaft friction instead of appearing only in the telemetry panel. These remain educational parameters, not durability predictions.

The RPM slider controls the engine governor target; playback speed is separate and only changes how quickly simulated time is presented. A seized engine remains latched until reset and its start control reports the required reset rather than silently accepting a start command.

The model is intended to make cause-and-effect visible and testable, not to certify a real engine design.
