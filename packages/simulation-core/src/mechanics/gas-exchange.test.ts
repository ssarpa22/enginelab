import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { calculateGasExchangeState } from "./gas-exchange";

const geometry = createEngineGeometry({
  cylinderCount: 1,
  boreM: 0.086,
  strokeM: 0.086,
  connectingRodLengthM: 0.143,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("quasi-steady valve gas exchange", () => {
  it("estimates intake flow when the intake valve is lifted and piston descends", () => {
    const state = calculateGasExchangeState(geometry, 105, 1800, 101325, 300);
    expect(state.intakeValveLiftMm).toBeGreaterThan(0);
    expect(state.intakeMassFlowKgPerS).toBeGreaterThan(0);
    expect(state.exhaustMassFlowKgPerS).toBe(0);
  });

  it("estimates exhaust flow when the exhaust valve is lifted and piston rises", () => {
    const state = calculateGasExchangeState(geometry, 612.5, 1800, 101325, 650);
    expect(state.exhaustValveLiftMm).toBeGreaterThan(0);
    expect(state.exhaustMassFlowKgPerS).toBeGreaterThan(0);
    expect(state.intakeMassFlowKgPerS).toBe(0);
  });

  it("returns no valve flow while both valves are closed", () => {
    const state = calculateGasExchangeState(geometry, 300, 1800, 150000, 500);
    expect(state.intakeMassFlowKgPerS).toBe(0);
    expect(state.exhaustMassFlowKgPerS).toBe(0);
  });

  it("rejects invalid physical inputs", () => {
    expect(() => calculateGasExchangeState(geometry, 90, -1, 101325, 300)).toThrow(RangeError);
  });
});
