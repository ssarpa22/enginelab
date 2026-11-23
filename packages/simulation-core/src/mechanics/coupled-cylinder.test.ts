import { describe, expect, it } from "vitest";
import { createEngineGeometry } from "../geometry/engine-geometry";
import { calculateCoupledCylinderState, DEFAULT_COUPLED_CYLINDER } from "./coupled-cylinder";

const geometry = createEngineGeometry({
  cylinderCount: 1,
  boreM: 0.086,
  strokeM: 0.086,
  connectingRodLengthM: 0.143,
  compressionRatio: 10.5,
  bankAngleRad: Math.PI / 2
});

describe("coupled open-system cylinder model", () => {
  it("raises pressure and temperature during closed-valve compression", () => {
    const intake = calculateCoupledCylinderState(geometry, 220, 1800);
    const compression = calculateCoupledCylinderState(geometry, 330, 1800);
    expect(compression.pressurePa).toBeGreaterThan(intake.pressurePa);
    expect(compression.temperatureK).toBeGreaterThan(intake.temperatureK);
  });

  it("releases heat over a finite crank-angle interval", () => {
    const before = calculateCoupledCylinderState(geometry, 345, 1800);
    const during = calculateCoupledCylinderState(geometry, 365, 1800);
    const after = calculateCoupledCylinderState(geometry, 420, 1800);
    expect(during.burnedFraction).toBeGreaterThan(before.burnedFraction);
    expect(after.burnedFraction).toBeGreaterThan(during.burnedFraction);
    expect(after.burnedFraction).toBeCloseTo(1, 3);
  });

  it("models intake and exhaust flow through their valve events", () => {
    const intake = calculateCoupledCylinderState(geometry, 100, 1800);
    const exhaust = calculateCoupledCylinderState(geometry, 600, 1800);
    expect(intake.intakeValveLiftMm).toBeGreaterThan(0);
    expect(exhaust.exhaustValveLiftMm).toBeGreaterThan(0);
    expect(Number.isFinite(intake.intakeMassFlowKgPerS)).toBe(true);
    expect(Number.isFinite(exhaust.exhaustMassFlowKgPerS)).toBe(true);
  });

  it("returns finite pressure, temperature, mass and work metrics across the full cycle", () => {
    for (let angle = 0; angle <= 720; angle += 15) {
      const state = calculateCoupledCylinderState(geometry, angle, 2400);
      expect(state.pressurePa).toBeGreaterThan(0);
      expect(state.temperatureK).toBeGreaterThan(0);
      expect(state.massKg).toBeGreaterThan(0);
      expect(Number.isFinite(state.indicatedTorqueNm)).toBe(true);
      expect(Number.isFinite(state.indicatedPowerW)).toBe(true);
    }
  });

  it("rejects gas properties that violate the constant-property ideal-gas relation", () => {
    expect(() => calculateCoupledCylinderState(geometry, 300, 1800, {
      ...DEFAULT_COUPLED_CYLINDER,
      gamma: 1.3
    })).toThrow(RangeError);
  });

  it("rejects valve curtain diameter ratios greater than the cylinder bore", () => {
    expect(() => calculateCoupledCylinderState(geometry, 300, 1800, {
      ...DEFAULT_COUPLED_CYLINDER,
      intakeValveDiameterRatio: 1.1
    })).toThrow(RangeError);
  });

  it("rejects invalid RPM", () => {
    expect(() => calculateCoupledCylinderState(geometry, 90, -100)).toThrow(RangeError);
  });
});
