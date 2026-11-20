import { describe, expect, it } from "vitest";
import {
  engineAudioProfile,
  exhaustPulseGain,
  inlineFourFiringFrequencyHz,
  inlineFourTorqueFactor,
  normalizeEngineLoad,
} from "./engine-audio-model";

describe("inline-four audio model", () => {
  it("produces one firing event every 180 crank degrees", () => {
    expect(inlineFourFiringFrequencyHz(900)).toBe(30);
    expect(inlineFourFiringFrequencyHz(3000)).toBe(100);
    expect(inlineFourFiringFrequencyHz(0)).toBe(0);
  });

  it("clamps load and handles invalid values", () => {
    expect(normalizeEngineLoad(-1)).toBe(0);
    expect(normalizeEngineLoad(4)).toBe(1);
    expect(normalizeEngineLoad(Number.NaN)).toBe(0.45);
  });

  it("models a broad naturally aspirated torque peak and high-rpm falloff", () => {
    expect(inlineFourTorqueFactor(4300)).toBeGreaterThan(inlineFourTorqueFactor(900));
    expect(inlineFourTorqueFactor(4300)).toBeGreaterThan(inlineFourTorqueFactor(7000));
    expect(inlineFourTorqueFactor(0)).toBe(0);
  });

  it("changes exhaust brightness and intake spectrum with RPM and load", () => {
    const idle = engineAudioProfile(800, 0.2);
    const loaded = engineAudioProfile(4500, 0.85);
    expect(loaded.exhaustBrightness).toBeGreaterThan(idle.exhaustBrightness);
    expect(loaded.intakeGain).toBeGreaterThan(idle.intakeGain);
    expect(loaded.intakeFrequencyHz).toBeGreaterThan(idle.intakeFrequencyHz);
    expect(loaded.mechanicalFrequencyHz).toBeGreaterThan(idle.mechanicalFrequencyHz);
  });

  it("keeps combustion silent at zero RPM and increases pulse energy with load", () => {
    expect(exhaustPulseGain(0, 0.8)).toBe(0);
    expect(exhaustPulseGain(3000, 0.8)).toBeGreaterThan(exhaustPulseGain(3000, 0.2));
  });
});
