import {
  advanceEngineSystems,
  type EngineSystemsInput,
  type EngineSystemsState
} from "./engine-systems";
import {
  advanceEngineDamage,
  type EngineDamageState
} from "./engine-damage";

export type EngineSimulationState = {
  systems: EngineSystemsState;
  damage: EngineDamageState;
};

/**
 * Advances coupled auxiliary systems and mechanical damage exactly once per
 * simulation step. Damage is evaluated from the newly advanced oil/coolant
 * state, so starvation and overheating have a causal path into wear.
 */
export function advanceEngineSimulation(
  previous: EngineSimulationState,
  input: EngineSystemsInput,
  dtSeconds: number
): EngineSimulationState {
  const systems = advanceEngineSystems(previous.systems, input, dtSeconds);
  const damage = advanceEngineDamage(previous.damage, systems, {
    rpm: input.rpm,
    load: input.load,
    oilPressureBar: systems.oilPressureBar,
    bearingFilmRatio: systems.bearingFilmRatio,
    oilTemperatureC: systems.oilTemperatureC,
    coolantTemperatureC: systems.coolantTemperatureC,
    headTemperatureC: systems.headTemperatureC
  }, dtSeconds);

  return { systems, damage };
}
