import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { calculateCrankshaftMaxAngleStepDeg, calculateCrankshaftSubstepSeconds, calculateInlineFourCrankCoupling, DEFAULT_ENGINE_IDLE_RPM, MAX_CRANKSHAFT_RPM, stepCrankshaft } from "./crankshaft-coupling";

const geometry = createEngineGeometry({
  cylinderCount: 4,
  boreM: 0.086,
  strokeM: 0.086,
  connectingRodLengthM: 0.143,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("pressure-coupled inline-four crankshaft", () => {
  it("uses a wider angular step at high RPM to reduce integration calls", () => {
    expect(calculateCrankshaftMaxAngleStepDeg(800)).toBe(4);
    expect(calculateCrankshaftMaxAngleStepDeg(2_500)).toBe(6);
    expect(calculateCrankshaftMaxAngleStepDeg(4_000)).toBe(8);
    expect(calculateCrankshaftMaxAngleStepDeg(6_500)).toBe(12);
    expect(() => calculateCrankshaftMaxAngleStepDeg(-1)).toThrow(RangeError);
  });

  it("keeps the 800 RPM default while allowing a higher experimental ceiling", () => {
    expect(DEFAULT_ENGINE_IDLE_RPM).toBe(800);
    expect(MAX_CRANKSHAFT_RPM).toBe(7_000);
  });
  it("keeps piston positions on the exact slider-crank geometry", () => {
    const state = calculateInlineFourCrankCoupling(geometry, 0, 1_800, [101_325, 101_325, 101_325, 101_325]);
    expect(state.cylinders).toHaveLength(4);
    expect(state.cylinders[0]!.pistonDisplacementM).toBeCloseTo(0, 12);
    expect(state.cylinders[1]!.pistonDisplacementM).toBeCloseTo(0.086, 12);
    expect(state.cylinders[2]!.pistonDisplacementM).toBeCloseTo(0.086, 12);
    expect(state.cylinders[3]!.pistonDisplacementM).toBeCloseTo(0, 12);
  });

  it("synchronizes the camshaft at half crankshaft speed", () => {
    const state = calculateInlineFourCrankCoupling(geometry, 270, 1_800, [101_325, 101_325, 101_325, 101_325]);
    expect(state.camshaftAngleDeg).toBeCloseTo(135, 12);
  });

  it("keeps camshaft phase continuous across the second crank revolution", () => {
    const state = calculateInlineFourCrankCoupling(geometry, 180, 1_800, [101_325, 101_325, 101_325, 101_325], 101_325, 540);
    expect(state.camshaftAngleDeg).toBeCloseTo(270, 12);
    expect(state.cylinders[0]!.cycleAngleDeg).toBeCloseTo(540, 12);
  });

  it("converts pressure force through the slider-crank Jacobian into crank torque", () => {
    const low = calculateInlineFourCrankCoupling(geometry, 90, 1_800, [101_325, 101_325, 101_325, 101_325]);
    const high = calculateInlineFourCrankCoupling(geometry, 90, 1_800, [2_000_000, 101_325, 101_325, 101_325]);
    expect(high.cylinders[0]!.gasForceN).toBeGreaterThan(0);
    expect(high.indicatedGasTorqueNm).toBeGreaterThan(low.indicatedGasTorqueNm);
  });

  it("subdivides high-RPM steps to keep crank-angle integration bounded", () => {
    expect(calculateCrankshaftSubstepSeconds(1 / 240, 1_800, 1_800)).toBeCloseTo(6 / 10_800, 12);
    expect(calculateCrankshaftSubstepSeconds(1 / 240, 8_000, 8_000)).toBeCloseTo(12 / 48_000, 12);
    expect(calculateCrankshaftSubstepSeconds(0.001, 0, 0)).toBe(0.001);
    expect(() => calculateCrankshaftSubstepSeconds(-0.01, 1_000, 1_000)).toThrow(RangeError);
  });

  it("integrates gas torque into shared crankshaft speed and angle", () => {
    const initial = { cycleAngleDeg: 0, rpm: 50 };
    const next = stepCrankshaft(initial, 100, { targetRpm: 80, dtSeconds: 0.01, loadTorqueNm: 10, frictionTorqueNm: 2 });
    expect(next.rpm).toBeGreaterThan(initial.rpm);
    expect(next.rpm).toBeLessThanOrEqual(MAX_CRANKSHAFT_RPM);
    expect(next.cycleAngleDeg).toBeGreaterThan(initial.cycleAngleDeg);
  });

  it("allows the starter motor to turn a fuel-cut crankshaft from rest", () => {
    const next = stepCrankshaft({ cycleAngleDeg: 0, rpm: 0 }, 0, {
      targetRpm: 0,
      dtSeconds: 0.02,
      loadTorqueNm: 15,
      frictionTorqueNm: 3,
      inertiaKgM2: 0.42,
      externalTorqueNm: 48
    });
    expect(next.rpm).toBeGreaterThan(0);
    expect(next.cycleAngleDeg).toBeGreaterThan(0);
  });

  it("coasts down when the speed target is zero and rejects unstable time steps", () => {
    const next = stepCrankshaft({ cycleAngleDeg: 20, rpm: 1_000 }, 100, { targetRpm: 0, dtSeconds: 0.01 });
    expect(next.rpm).toBeLessThan(1_000);
    expect(() => stepCrankshaft({ cycleAngleDeg: 0, rpm: 1_000 }, 0, { targetRpm: 1_000, dtSeconds: 0.2 })).toThrow(RangeError);
  });

  it("uses the governor to settle near the requested speed under sustained gas torque", () => {
    let state = { cycleAngleDeg: 0, rpm: 80 };
    for (let step = 0; step < 2_000; step += 1) {
      state = stepCrankshaft(state, 160, {
        targetRpm: 80,
        dtSeconds: 0.01,
        loadTorqueNm: 22,
        frictionTorqueNm: 3,
        inertiaKgM2: 0.42,
        governorGainNmPerRpm: 0.8
      });
    }
    expect(state.rpm).toBeGreaterThan(80);
    expect(state.rpm).toBeLessThanOrEqual(MAX_CRANKSHAFT_RPM);
  });

  it("allows high-RPM operation for failure-limit experiments", () => {
    const state = stepCrankshaft({ cycleAngleDeg: 0, rpm: 6_800 }, 80, {
      targetRpm: 6_800, dtSeconds: .001, loadTorqueNm: 0, frictionTorqueNm: 0,
      inertiaKgM2: .42, governorGainNmPerRpm: .8, maximumGasTorqueNm: 220
    });
    expect(state.rpm).toBeGreaterThan(6_700);
    expect(state.rpm).toBeLessThanOrEqual(7_000);
  });

  it("hard-limits the crankshaft even when a caller requests an unsafe target", () => {
    const next = stepCrankshaft({ cycleAngleDeg: 0, rpm: MAX_CRANKSHAFT_RPM - 1 }, 220, {
      targetRpm: 8_000,
      dtSeconds: 0.01,
      loadTorqueNm: 0,
      frictionTorqueNm: 0
    });
    expect(next.rpm).toBe(MAX_CRANKSHAFT_RPM);
  });
});
