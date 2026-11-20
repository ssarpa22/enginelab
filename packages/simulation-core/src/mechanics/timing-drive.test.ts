import { describe, expect, it } from "vitest";
import {
  INITIAL_TIMING_DRIVE_STATE,
  INLINE_FOUR_TIMING_DRIVE,
  stepTimingDrive,
  TIMING_DRIVE_RATIO
} from "./timing-drive";

describe("positive-drive timing belt", () => {
  it("derives the 2:1 camshaft ratio from pulley tooth counts", () => {
    expect(TIMING_DRIVE_RATIO).toBe(2);
    expect(INLINE_FOUR_TIMING_DRIVE.crankPulleyTeeth).toBe(24);
    expect(INLINE_FOUR_TIMING_DRIVE.camPulleyTeeth).toBe(48);
  });

  it("locks camshaft angle and speed to the crank while the belt is intact", () => {
    const state = stepTimingDrive(INITIAL_TIMING_DRIVE_STATE, {
      crankCycleAngleDeg: 540,
      crankRpm: 800,
      dtSeconds: 0.01,
      timingDriveTorqueNm: 12
    });
    expect(state.camshaftAngleDeg).toBeCloseTo(270, 10);
    expect(state.camshaftRpm).toBe(400);
    expect(state.beltSpeedMPerS).toBeGreaterThan(0);
    expect(state.beltTravelM).toBeGreaterThan(0);
    expect(state.beltTensionN).toBeGreaterThan(INLINE_FOUR_TIMING_DRIVE.beltPretensionN);
    expect(state.beltBroken).toBe(false);
  });

  it("survives normal camshaft load without reacting to combustion torque", () => {
    const state = stepTimingDrive(INITIAL_TIMING_DRIVE_STATE, {
      crankCycleAngleDeg: 360,
      crankRpm: 800,
      dtSeconds: 0.01,
      timingDriveTorqueNm: 0.9
    });
    expect(state.beltTensionN).toBeCloseTo(
      INLINE_FOUR_TIMING_DRIVE.beltPretensionN + 0.9 / INLINE_FOUR_TIMING_DRIVE.crankPitchRadiusM,
      8
    );
    expect(state.beltBroken).toBe(false);
  });

  it("breaks the belt when calculated tensile load exceeds its rating", () => {
    const state = stepTimingDrive(INITIAL_TIMING_DRIVE_STATE, {
      crankCycleAngleDeg: 90,
      crankRpm: 800,
      dtSeconds: 0.01,
      timingDriveTorqueNm: INLINE_FOUR_TIMING_DRIVE.maximumBeltTensionN *
        INLINE_FOUR_TIMING_DRIVE.crankPitchRadiusM * 1.1
    });
    expect(state.beltBroken).toBe(true);
    expect(state.failureReason).toContain("Sobrecarga");
    expect(state.beltSpeedMPerS).toBe(0);
  });

  it("does not magically keep the camshaft synchronized after belt failure", () => {
    const synchronized = stepTimingDrive(INITIAL_TIMING_DRIVE_STATE, {
      crankCycleAngleDeg: 120,
      crankRpm: 800,
      dtSeconds: 0.01,
      timingDriveTorqueNm: 20
    });
    const broken = stepTimingDrive(synchronized, {
      crankCycleAngleDeg: 140,
      crankRpm: 800,
      dtSeconds: 0.01,
      timingDriveTorqueNm: 220
    });
    const coasting = stepTimingDrive(broken, {
      crankCycleAngleDeg: 180,
      crankRpm: 800,
      dtSeconds: 0.01,
      timingDriveTorqueNm: 10
    });
    expect(coasting.beltBroken).toBe(true);
    expect(coasting.camshaftRpm).toBeLessThan(broken.camshaftRpm);
    expect(coasting.beltTravelM).toBe(broken.beltTravelM);
    expect(coasting.camshaftAngleDeg).not.toBeCloseTo(90, 4);
    expect(broken.camshaftRpm).toBeLessThan(synchronized.camshaftRpm);
  });

  it("rejects invalid integration values", () => {
    expect(() => stepTimingDrive(INITIAL_TIMING_DRIVE_STATE, {
      crankCycleAngleDeg: 0, crankRpm: -1, dtSeconds: 0.01, timingDriveTorqueNm: 1
    })).toThrow(RangeError);
  });
});
