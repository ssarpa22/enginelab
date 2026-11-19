import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { calculateCylinderThermodynamics, DEFAULT_THERMODYNAMICS } from "./cylinder-thermodynamics";

const geometry = createEngineGeometry({
  cylinderCount: 1,
  boreM: 0.086,
  strokeM: 0.086,
  connectingRodLengthM: 0.143,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("single-zone cylinder thermodynamics", () => {
  it("uses intake boundary conditions before intake-valve closing", () => {
    const state = calculateCylinderThermodynamics(geometry, 100);
    expect(state.phase).toBe("intake");
    expect(state.pressurePa).toBe(DEFAULT_THERMODYNAMICS.intakePressurePa);
    expect(state.temperatureK).toBe(DEFAULT_THERMODYNAMICS.intakeTemperatureK);
  });

  it("raises pressure and temperature during closed-valve compression", () => {
    const early = calculateCylinderThermodynamics(geometry, 230);
    const late = calculateCylinderThermodynamics(geometry, 340);
    expect(early.phase).toBe("compression");
    expect(late.pressurePa).toBeGreaterThan(early.pressurePa);
    expect(late.temperatureK).toBeGreaterThan(early.temperatureK);
    expect(late.trappedMassKg).toBeCloseTo(early.trappedMassKg, 12);
  });

  it("adds heat at TDC at approximately constant volume", () => {
    const before = calculateCylinderThermodynamics(geometry, 359.9);
    const after = calculateCylinderThermodynamics(geometry, 360);
    expect(after.phase).toBe("power");
    expect(after.cylinderVolumeM3).toBeCloseTo(before.cylinderVolumeM3, 8);
    expect(after.pressurePa).toBeGreaterThan(before.pressurePa * 1.5);
    expect(after.temperatureK).toBeGreaterThan(before.temperatureK);
    expect(after.trappedMassKg).toBeCloseTo(before.trappedMassKg, 12);
  });

  it("expands and cools the charge during the power stroke", () => {
    const early = calculateCylinderThermodynamics(geometry, 365);
    const late = calculateCylinderThermodynamics(geometry, 480);
    expect(early.phase).toBe("power");
    expect(late.pressurePa).toBeLessThan(early.pressurePa);
    expect(late.temperatureK).toBeLessThan(early.temperatureK);
    expect(late.trappedMassKg).toBeCloseTo(early.trappedMassKg, 12);
  });

  it("returns ambient-pressure exhaust conditions after exhaust-valve opening", () => {
    const state = calculateCylinderThermodynamics(geometry, 520);
    expect(state.phase).toBe("exhaust");
    expect(state.pressurePa).toBe(DEFAULT_THERMODYNAMICS.intakePressurePa);
    expect(state.temperatureK).toBe(DEFAULT_THERMODYNAMICS.exhaustTemperatureK);
  });

  it("normalizes angles over the full 720-degree cycle", () => {
    expect(calculateCylinderThermodynamics(geometry, 820).phase).toBe(
      calculateCylinderThermodynamics(geometry, 100).phase
    );
  });

  it("rejects non-finite angles and invalid physical parameters", () => {
    expect(() => calculateCylinderThermodynamics(geometry, Number.NaN)).toThrow(RangeError);
    expect(() => calculateCylinderThermodynamics(geometry, 300, {
      ...DEFAULT_THERMODYNAMICS,
      compressionPolytropicExponent: 1
    })).toThrow(RangeError);
  });
});
