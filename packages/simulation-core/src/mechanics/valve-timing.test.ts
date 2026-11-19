import { describe, expect, it } from "vitest";
import { calculateCamFollowerCycleAngleDeg, calculateCamLobeProfileCycleAngleDeg, calculateValveState, DEFAULT_VALVE_TIMING } from "./valve-timing";

describe("four-stroke valve timing", () => {
  it("keeps the rotating cam lobe in phase with the valve at the bucket follower", () => {
    const camCenter = 350;
    const cylinderOffset = 180;
    for (const crankCycleAngle of [0, 120, 350, 540, 719]) {
      const camshaftAngle = crankCycleAngle / 2;
      const followerCycle = calculateCamFollowerCycleAngleDeg(camshaftAngle, camCenter, cylinderOffset);
      expect(followerCycle).toBeCloseTo((crankCycleAngle + cylinderOffset) % 720, 10);
      const followerLocalAngle = 270 + camshaftAngle - camCenter / 2;
      expect(calculateCamLobeProfileCycleAngleDeg(followerLocalAngle, camCenter, cylinderOffset))
        .toBeCloseTo((crankCycleAngle + cylinderOffset) % 720, 10);
    }
  });


  it("samples the physical underside of each cam lobe at the bucket follower", () => {
    const camCenter = 350;
    const cylinderOffset = 180;
    for (const crankCycleAngle of [0, 120, 350, 540, 719]) {
      const camshaftAngle = crankCycleAngle / 2;
      const undersideCycle = calculateCamLobeProfileCycleAngleDeg(
        270 + camshaftAngle - camCenter / 2,
        camCenter,
        cylinderOffset
      );
      const expectedCycle = (crankCycleAngle + cylinderOffset) % 720;
      expect(undersideCycle).toBeCloseTo(expectedCycle, 10);
      expect(calculateValveState(undersideCycle).intakeLiftMm)
        .toBeCloseTo(calculateValveState(expectedCycle).intakeLiftMm, 10);
    }
  });

  it("opens the intake valve before TDC and keeps it open into compression", () => {
    expect(calculateValveState(715).intakeOpen).toBe(true);
    expect(calculateValveState(200).intakeOpen).toBe(true);
    expect(calculateValveState(230).intakeOpen).toBe(false);
  });

  it("opens the exhaust valve before BDC and closes after TDC", () => {
    expect(calculateValveState(500).exhaustOpen).toBe(true);
    expect(calculateValveState(5).exhaustOpen).toBe(true);
    expect(calculateValveState(20).exhaustOpen).toBe(false);
  });

  it("models valve overlap around the exhaust-to-intake transition", () => {
    const state = calculateValveState(5);
    expect(state.intakeOpen).toBe(true);
    expect(state.exhaustOpen).toBe(true);
  });

  it("peaks each valve near the middle of its opening event", () => {
    expect(calculateValveState(100).intakeLiftMm).toBeCloseTo(DEFAULT_VALVE_TIMING.intakeMaxLiftMm, 1);
    expect(calculateValveState(612.5).exhaustLiftMm).toBeCloseTo(DEFAULT_VALVE_TIMING.exhaustMaxLiftMm, 1);
  });

  it("fires the spark before the power stroke at the configured advance", () => {
    expect(calculateValveState(345).sparkActive).toBe(true);
    expect(calculateValveState(360).sparkActive).toBe(false);
  });

  it("rejects non-finite cycle angles", () => {
    expect(() => calculateValveState(Number.NaN)).toThrow(RangeError);
  });
});
