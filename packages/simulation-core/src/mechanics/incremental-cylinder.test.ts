import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { DEFAULT_COUPLED_CYLINDER } from "./coupled-cylinder";
import { advanceIncrementalCylinderState, calculateCylinderIntegrationAngleStepDeg, createIncrementalCylinderState } from "./incremental-cylinder";

const geometry = createEngineGeometry({
  cylinderCount: 1, boreM: 0.086, strokeM: 0.086,
  connectingRodLengthM: 0.143, compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("incremental cylinder thermodynamics", () => {
  it("uses a coarser bounded integration interval as RPM rises", () => {
    expect(calculateCylinderIntegrationAngleStepDeg(800)).toBe(0.5);
    expect(calculateCylinderIntegrationAngleStepDeg(3_000)).toBe(0.75);
    expect(calculateCylinderIntegrationAngleStepDeg(4_000)).toBe(1);
    expect(calculateCylinderIntegrationAngleStepDeg(6_500)).toBe(1.5);
    expect(() => calculateCylinderIntegrationAngleStepDeg(-1)).toThrow(RangeError);
  });

  it("advances fractional crank-angle steps without replaying prior history", () => {
    let state = createIncrementalCylinderState(geometry);
    const start = state.integratedAngleDeg;
    state = advanceIncrementalCylinderState(state, geometry, start + 0.2, 1800);
    expect(state.integratedAngleDeg).toBeCloseTo(start + 0.2, 8);
    const next = advanceIncrementalCylinderState(state, geometry, start + 0.4, 1800);
    expect(next.integratedAngleDeg).toBeCloseTo(start + 0.4, 8);
    expect(next.pressurePa).not.toBe(state.pressurePa);
  });

  it("retains thermodynamic history when the 720-degree cycle wraps", () => {
    let state = createIncrementalCylinderState(geometry);
    state = advanceIncrementalCylinderState(state, geometry, 719.8, 1800);
    const massBeforeWrap = state.massKg;
    state = advanceIncrementalCylinderState(state, geometry, 0.2, 1800);
    expect(state.integratedAngleDeg).toBeCloseTo(720.2, 8);
    expect(state.massKg).toBeGreaterThan(0);
    expect(state.massKg).toBeCloseTo(massBeforeWrap, 2);
    expect(state.cycleAngleDeg).toBeCloseTo(0.2, 8);
  });

  it("produces finite pressure, temperature, mass and torque through a complete cycle", () => {
    let state = createIncrementalCylinderState(geometry);
    for (let angle = 205; angle <= 1440; angle += 2.5) {
      state = advanceIncrementalCylinderState(state, geometry, angle % 720, 2400);
      expect(state.pressurePa).toBeGreaterThan(0);
      expect(state.temperatureK).toBeGreaterThanOrEqual(120);
      expect(state.temperatureK).toBeLessThanOrEqual(5000);
      expect(state.massKg).toBeGreaterThan(0);
      expect(Number.isFinite(state.indicatedTorqueNm)).toBe(true);
    }
  });

  it("preserves every cycle when advanced in small high-RPM crank-angle steps", () => {
    let state = createIncrementalCylinderState(geometry);
    const start = state.integratedAngleDeg;
    for (let offset = 4; offset <= 1_440; offset += 4) {
      state = advanceIncrementalCylinderState(state, geometry, (start + offset) % 720, 8_000);
    }
    expect(state.integratedAngleDeg).toBeCloseTo(start + 1_440, 7);
    expect(state.cycleAngleDeg).toBeCloseTo(start % 720, 7);
    expect(Number.isFinite(state.pressurePa)).toBe(true);
  });

  it("maintains ideal-gas pressure, mass, temperature and volume closure through the cycle", () => {
    let state = createIncrementalCylinderState(geometry);
    for (let angle = 225; angle <= 1440; angle += 5) {
      state = advanceIncrementalCylinderState(state, geometry, angle % 720, 2400);
      const idealGasPressure = state.massKg * DEFAULT_COUPLED_CYLINDER.gasConstantJPerKgK *
        state.temperatureK / state.volumeM3;
      expect(state.pressurePa).toBeCloseTo(idealGasPressure, 8);
    }
  });

  it("raises compression pressure and temperature, then releases heat after the spark advance", () => {
    let state = createIncrementalCylinderState(geometry);
    state = advanceIncrementalCylinderState(state, geometry, 330, 1800);
    expect(state.pressurePa).toBeGreaterThan(DEFAULT_COUPLED_CYLINDER.intakePressurePa);
    expect(state.temperatureK).toBeGreaterThan(DEFAULT_COUPLED_CYLINDER.intakeTemperatureK);

    state = advanceIncrementalCylinderState(state, geometry, 344, 1800);
    expect(state.burnedFraction).toBe(0);
    state = advanceIncrementalCylinderState(state, geometry, 365, 1800);
    expect(state.burnedFraction).toBeGreaterThan(0);
    expect(state.heatReleaseRateW).toBeGreaterThan(0);
  });

  it("rejects thermodynamic constants that are inconsistent with a fixed-property ideal gas", () => {
    expect(() => createIncrementalCylinderState(geometry, {
      ...DEFAULT_COUPLED_CYLINDER,
      gamma: 1.3
    })).toThrow(RangeError);
  });

  it("does not advance when the requested angle is unchanged", () => {
    const state = createIncrementalCylinderState(geometry);
    const same = advanceIncrementalCylinderState(state, geometry, state.cycleAngleDeg, 1800);
    expect(same.integratedAngleDeg).toBe(state.integratedAngleDeg);
    expect(same.massKg).toBe(state.massKg);
  });

  it("rejects invalid speed and angle", () => {
    const state = createIncrementalCylinderState(geometry);
    expect(() => advanceIncrementalCylinderState(state, geometry, 20, -1)).toThrow(RangeError);
    expect(() => advanceIncrementalCylinderState(state, geometry, Number.NaN, 1000)).toThrow(RangeError);
  });
});
