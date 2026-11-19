import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { advanceIncrementalCylinderState, createIncrementalCylinderState } from "./incremental-cylinder";

const geometry = createEngineGeometry({
  cylinderCount: 1, boreM: 0.086, strokeM: 0.086,
  connectingRodLengthM: 0.143, compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("incremental cylinder thermodynamics", () => {
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
