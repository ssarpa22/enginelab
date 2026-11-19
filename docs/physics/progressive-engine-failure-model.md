# Progressive mechanical wear and failure model

EngineLab now includes a deterministic, time-stepped failure layer on top of its idealized four-cylinder kinematics and lumped thermal systems.

## Feedback paths

- **Oil starvation:** low gallery pressure or a weak bearing-film proxy increases bearing wear and friction. Accumulated wear reduces effective engine speed and power; a fully worn bearing state latches a seizure.
- **Piston / liner thermal growth:** estimated differential expansion reduces the modeled skirt clearance. Sustained hot operation increases scuffing; negative clearance is surfaced as an interference warning and continued damage can seize the engine.
- **Valve float:** above the illustrative 6,100 RPM onset, the valve train progressively loses effective lift. This reduces gas exchange and power while adding valvetrain wear.
- **Connecting-rod fatigue:** sustained operation above the illustrative 6,500 RPM safe-speed reference accumulates fatigue and reduces available power.
- **Head-gasket damage:** sustained coolant or head over-temperature accumulates gasket damage and raises the model's misfire probability.

## State and reset behavior

Wear is cumulative and is not automatically repaired by cooling down or restoring oil pressure. The simulation reset restores a new undamaged engine. A seized state is latched until reset.

## Interpretation and limitations

All rates and thresholds are demonstration parameters, not durability predictions for a specific production engine. The model does not calculate local bearing contact stress, elastic rod deformation, oil-film hydrodynamics, crack propagation, gasket sealing pressure, or finite-element thermal stress. The mechanical envelope is a rigid kinematic / clearance guard, not a general collision solver.

The model is intended to make cause-and-effect visible and testable, not to certify a real engine design.
