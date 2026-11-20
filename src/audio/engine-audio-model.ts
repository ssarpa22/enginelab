export interface EngineAudioProfile {
  firingFrequencyHz: number;
  normalizedRpm: number;
  torqueFactor: number;
  exhaustGain: number;
  exhaustLowFrequencyHz: number;
  exhaustMidFrequencyHz: number;
  exhaustHighFrequencyHz: number;
  exhaustBrightness: number;
  intakeGain: number;
  intakeFrequencyHz: number;
  mechanicalGain: number;
  mechanicalFrequencyHz: number;
}

/** Four-stroke inline-four firing cadence: one exhaust event per 180 crank degrees. */
export function inlineFourFiringFrequencyHz(rpm: number): number {
  return Math.max(0, Number.isFinite(rpm) ? rpm : 0) / 30;
}

export function normalizeEngineLoad(load: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(load) ? load : 0.45));
}

/**
 * Approximate naturally-aspirated 2.0 L torque envelope used to shape sound,
 * not to replace the cylinder-pressure / crankshaft physics model.
 * Peak torque is centred near 4,300 RPM and falls toward the 7,000 RPM limit.
 */
export function inlineFourTorqueFactor(rpm: number): number {
  const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
  if (safeRpm === 0) return 0;
  const lowRpmRise = 0.68 + 0.34 * (1 - Math.exp(-safeRpm / 1_450));
  const highRpmFall = 1 - 0.000000018 * Math.max(0, safeRpm - 4_300) ** 2;
  return Math.max(0.48, Math.min(1.02, lowRpmRise * highRpmFall));
}

/** Dynamic sound character: exhaust body, induction and valvetrain respond differently. */
export function engineAudioProfile(rpm: number, load: number): EngineAudioProfile {
  const safeRpm = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
  const normalizedLoad = normalizeEngineLoad(load);
  const rpmPosition = Math.min(1, safeRpm / 7_000);
  const torqueFactor = inlineFourTorqueFactor(safeRpm);
  const loadEnergy = 0.22 + normalizedLoad * 0.78;
  const running = safeRpm > 0;
  return {
    firingFrequencyHz: inlineFourFiringFrequencyHz(safeRpm),
    normalizedRpm: rpmPosition,
    torqueFactor,
    exhaustGain: running ? (0.18 + normalizedLoad * 0.48) * (0.62 + torqueFactor * 0.48) : 0,
    exhaustLowFrequencyHz: 72 + rpmPosition * 52,
    exhaustMidFrequencyHz: 145 + rpmPosition * 155,
    exhaustHighFrequencyHz: 520 + rpmPosition * 1_150,
    exhaustBrightness: 0.12 + rpmPosition * 0.62 + normalizedLoad * 0.18,
    intakeGain: running ? (0.0015 + normalizedLoad * 0.018) * (0.45 + rpmPosition * 0.9) : 0,
    intakeFrequencyHz: 380 + rpmPosition * 1_900 + normalizedLoad * 520,
    mechanicalGain: running ? (0.001 + rpmPosition * 0.008) * (0.75 + normalizedLoad * 0.45) : 0,
    mechanicalFrequencyHz: 1_100 + rpmPosition * 2_800,
  };
}

/** Combustion pulse energy follows cylinder load and the broad torque envelope. */
export function exhaustPulseGain(rpm: number, load: number): number {
  const profile = engineAudioProfile(rpm, load);
  return profile.exhaustGain * (0.58 + profile.exhaustBrightness * 0.35);
}
