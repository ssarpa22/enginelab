import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { calculateInlineFourCrankCoupling, stepCrankshaft } from "./crankshaft-coupling";

const geometry = createEngineGeometry({
  cylinderCount: 4,
  boreM: 0.086,
  strokeM: 0.086,
  connectingRodLengthM: 0.143,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("pressure-coupled inline-four crankshaft", () => {
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

  it("integrates gas torque into shared crankshaft speed and angle", () => {
    const initial = { cycleAngleDeg: 0, rpm: 1_000 };
    const next = stepCrankshaft(initial, 100, { targetRpm: 1_500, dtSeconds: 0.01, loadTorqueNm: 10, frictionTorqueNm: 2 });
    expect(next.rpm).toBeGreaterThan(initial.rpm);
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
    let state = { cycleAngleDeg: 0, rpm: 1_800 };
    for (let step = 0; step < 2_000; step += 1) {
      state = stepCrankshaft(state, 160, {
        targetRpm: 1_800,
        dtSeconds: 0.01,
        loadTorqueNm: 22,
        frictionTorqueNm: 3,
        inertiaKgM2: 0.42,
        governorGainNmPerRpm: 0.8
      });
    }
    expect(state.rpm).toBeGreaterThan(1_800);
    expect(state.rpm).toBeLessThan(2_300);
  });
});
