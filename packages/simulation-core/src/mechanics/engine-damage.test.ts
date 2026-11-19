import { describe, expect, it } from "vitest";
import { advanceEngineDamage, INITIAL_ENGINE_DAMAGE } from "./engine-damage";
import { INITIAL_ENGINE_SYSTEMS } from "./engine-systems";

const healthy = {
  rpm: 2500, load: .55, oilPressureBar: 3.2, bearingFilmRatio: 1,
  oilTemperatureC: 95, coolantTemperatureC: 90, headTemperatureC: 105
};

describe("progressive engine damage", () => {
  it("keeps a healthy engine effectively undamaged during normal operation", () => {
    let damage = INITIAL_ENGINE_DAMAGE;
    for (let i = 0; i < 600; i++) {
      damage = advanceEngineDamage(damage, INITIAL_ENGINE_SYSTEMS, healthy, .05);
    }
    expect(damage.bearingWear).toBeLessThan(1);
    expect(damage.pistonScuffing).toBeLessThan(1);
    expect(damage.powerFactor).toBeGreaterThan(.98);
    expect(damage.seized).toBe(false);
  });

  it("turns oil starvation into bearing wear, friction and power loss", () => {
    let damage = INITIAL_ENGINE_DAMAGE;
    for (let i = 0; i < 500; i++) {
      damage = advanceEngineDamage(damage, INITIAL_ENGINE_SYSTEMS, {
        ...healthy, rpm: 3200, load: .8, oilPressureBar: .15, bearingFilmRatio: .08
      }, .1);
    }
    expect(damage.bearingWear).toBeGreaterThan(20);
    expect(damage.frictionTorqueNm).toBeGreaterThan(2);
    expect(damage.powerFactor).toBeLessThan(1);
    expect(damage.warnings.some(w => w.includes("cojinetes"))).toBe(true);
  });

  it("models valve float and fatigue under sustained over-rev", () => {
    let damage = INITIAL_ENGINE_DAMAGE;
    for (let i = 0; i < 800; i++) {
      damage = advanceEngineDamage(damage, INITIAL_ENGINE_SYSTEMS, {
        ...healthy, rpm: 7900, load: .9
      }, .1);
    }
    expect(damage.valveFloatSeverity).toBeGreaterThan(.9);
    expect(damage.rodFatigue).toBeGreaterThan(10);
    expect(damage.powerFactor).toBeLessThan(1);
    expect(damage.warnings.some(w => w.includes("BIELAS"))).toBe(true);
  });

  it("accumulates head-gasket damage during overheating", () => {
    let damage = INITIAL_ENGINE_DAMAGE;
    for (let i = 0; i < 500; i++) {
      damage = advanceEngineDamage(damage, INITIAL_ENGINE_SYSTEMS, {
        ...healthy, coolantTemperatureC: 125, headTemperatureC: 250
      }, .1);
    }
    expect(damage.headGasketDamage).toBeGreaterThan(10);
    expect(damage.thermalExpansionMm).toBeGreaterThan(.4);
    expect(damage.warnings.some(w => w.includes("JUNTA DE TAPA"))).toBe(true);
  });

  it("latches a seized engine and rejects invalid time steps", () => {
    const seized = advanceEngineDamage({
      ...INITIAL_ENGINE_DAMAGE, bearingWear: 100
    }, INITIAL_ENGINE_SYSTEMS, healthy, .01);
    expect(seized.seized).toBe(true);
    expect(seized.powerFactor).toBe(0);
    expect(() => advanceEngineDamage(INITIAL_ENGINE_DAMAGE, INITIAL_ENGINE_SYSTEMS, healthy, 2))
      .toThrow(RangeError);
  });
});
