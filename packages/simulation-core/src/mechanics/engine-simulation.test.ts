import { describe, expect, it } from "vitest";
import { INITIAL_ENGINE_DAMAGE } from "./engine-damage";
import {
  advanceEngineSimulation,
  type EngineSimulationState
} from "./engine-simulation";
import { INITIAL_ENGINE_SYSTEMS } from "./engine-systems";

const initial: EngineSimulationState = {
  systems: INITIAL_ENGINE_SYSTEMS,
  damage: INITIAL_ENGINE_DAMAGE
};

describe("coupled engine simulation step", () => {
  it("does not accumulate mechanical wear while the crankshaft is stopped", () => {
    let state = initial;
    for (let i = 0; i < 1200; i++) {
      state = advanceEngineSimulation(state, {
        rpm: 0, load: 0, exhaustGasTemperatureC: 25
      }, .05);
    }
    expect(state.damage.bearingWear).toBe(0);
    expect(state.damage.pistonScuffing).toBe(0);
    expect(state.damage.valveTrainWear).toBe(0);
    expect(state.damage.rodFatigue).toBe(0);
    expect(state.damage.headGasketDamage).toBe(0);
  });

  it("keeps normal operation stable without creating meaningful wear", () => {
    let state = initial;
    for (let i = 0; i < 600; i++) {
      state = advanceEngineSimulation(state, {
        rpm: 2500, load: .55, exhaustGasTemperatureC: 450
      }, .05);
    }
    expect(state.systems.oilPressureBar).toBeGreaterThan(1);
    expect(state.damage.bearingWear).toBeLessThan(1);
    expect(state.damage.pistonScuffing).toBeLessThan(1);
    expect(state.damage.powerFactor).toBeGreaterThan(.98);
    expect(state.damage.seized).toBe(false);
  });

  it("turns oil pickup failure into pressure loss, bearing wear and eventual seizure", () => {
    let state = initial;
    for (let i = 0; i < 500; i++) {
      state = advanceEngineSimulation(state, {
        rpm: 3200, load: .8, exhaustGasTemperatureC: 520,
        oilPickupAvailability: 0
      }, .05);
    }
    expect(state.systems.oilPressureBar).toBe(0);
    expect(state.damage.bearingWear).toBeGreaterThan(20);
    expect(state.damage.frictionTorqueNm).toBeGreaterThan(2);
    expect(state.damage.powerFactor).toBeLessThan(1);
    expect(state.damage.warnings.some(warning => warning.includes("cojinetes"))).toBe(true);

    for (let i = 0; i < 500; i++) {
      if (state.damage.seized) break;
      state = advanceEngineSimulation(state, {
        rpm: 3200, load: .8, exhaustGasTemperatureC: 520,
        oilPickupAvailability: 0
      }, .05);
    }
    expect(state.damage.seized).toBe(true);
    expect(state.damage.powerFactor).toBe(0);
  });

  it("feeds overheating from the cooling model into head-gasket damage", () => {
    let state: EngineSimulationState = {
      systems: {
        ...INITIAL_ENGINE_SYSTEMS,
        coolantTemperatureC: 120,
        headTemperatureC: 250
      },
      damage: INITIAL_ENGINE_DAMAGE
    };
    for (let i = 0; i < 100; i++) {
      state = advanceEngineSimulation(state, {
        rpm: 2200, load: .7, exhaustGasTemperatureC: 800
      }, .05);
    }
    expect(state.damage.headGasketDamage).toBeGreaterThan(1);
    expect(state.damage.warnings.some(warning => warning.includes("JUNTA DE TAPA"))).toBe(true);
  });

  it("rejects invalid integration steps without partially updating state", () => {
    expect(() => advanceEngineSimulation(initial, {
      rpm: 2000, load: .5, exhaustGasTemperatureC: 500
    }, 2)).toThrow(RangeError);
  });
});
