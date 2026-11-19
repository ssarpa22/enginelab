import type { EngineSystemsState } from "./engine-systems";

export type EngineDamageState = {
  bearingWear: number;
  pistonScuffing: number;
  valveTrainWear: number;
  rodFatigue: number;
  headGasketDamage: number;
  thermalExpansionMm: number;
  valveFloatSeverity: number;
  frictionTorqueNm: number;
  powerFactor: number;
  misfireProbability: number;
  seized: boolean;
  warnings: string[];
};

export type EngineDamageInput = {
  rpm: number;
  load: number;
  oilPressureBar: number;
  bearingFilmRatio: number;
  oilTemperatureC: number;
  coolantTemperatureC: number;
  headTemperatureC: number;
  minimumOilPressureBar?: number;
  maximumSafeRpm?: number;
};

export const INITIAL_ENGINE_DAMAGE: EngineDamageState = {
  bearingWear: 0,
  pistonScuffing: 0,
  valveTrainWear: 0,
  rodFatigue: 0,
  headGasketDamage: 0,
  thermalExpansionMm: 0,
  valveFloatSeverity: 0,
  frictionTorqueNm: 0,
  powerFactor: 1,
  misfireProbability: 0,
  seized: false,
  warnings: []
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const approach = (current: number, target: number, amount: number) =>
  current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);

/**
 * Irreversible wear and failure progression for an educational engine model.
 * Rates are deliberately conservative and normalized for visible demonstrations;
 * they are not calibrated durability predictions for a production engine.
 */
export function advanceEngineDamage(
  previous: EngineDamageState,
  systems: EngineSystemsState,
  input: EngineDamageInput,
  dtSeconds: number
): EngineDamageState {
  const values = [
    input.rpm, input.load, input.oilPressureBar, input.bearingFilmRatio,
    input.oilTemperatureC, input.coolantTemperatureC, input.headTemperatureC,
    dtSeconds
  ];
  if (!values.every(Number.isFinite) || input.rpm < 0 || dtSeconds < 0 || dtSeconds > 1) {
    throw new RangeError("Invalid engine damage input or integration step.");
  }

  const rpm = input.rpm;
  const load = clamp(input.load, 0, 1);
  const safeRpm = input.maximumSafeRpm ?? 6500;
  const oilStarvation = rpm > 650 && (
    input.oilPressureBar < (input.minimumOilPressureBar ?? 1.0) ||
    input.bearingFilmRatio < 0.48
  );
  const oilOverheat = input.oilTemperatureC > 135;
  const coolantOverheat = input.coolantTemperatureC > 112 || input.headTemperatureC > 220;
  const overRev = rpm > safeRpm;
  const valveFloatTarget = clamp((rpm - 6100) / 1900, 0, 1);

  const bearingWear = clamp(previous.bearingWear + dtSeconds * (
    oilStarvation ? (0.9 + load * 2.1) * Math.max(1, rpm / 1800) :
    oilOverheat ? 0.035 * Math.max(1, rpm / 2500) : 0.001
  ), 0, 100);
  const pistonScuffing = clamp(previous.pistonScuffing + dtSeconds * (
    oilStarvation ? (0.42 + load) * Math.max(1, rpm / 2200) :
    input.headTemperatureC > 235 ? 0.45 : 0.0005) + Math.max(0, thermalExpansionMm - 0.06) * 3
  ), 0, 100);
  const valveTrainWear = clamp(previous.valveTrainWear + dtSeconds * (
    valveFloatTarget > 0 ? valveFloatTarget * (0.08 + load * 0.18) : 0.0004
  ), 0, 100);
  const rodFatigue = clamp(previous.rodFatigue + dtSeconds * (
    overRev ? ((rpm / safeRpm) ** 3) * (0.12 + load * 0.28) : 0.0002
  ), 0, 100);
  const headGasketDamage = clamp(previous.headGasketDamage + dtSeconds * (
    coolantOverheat ? (0.32 + Math.max(0, input.headTemperatureC - 220) * 0.018) : 0.0002
  ), 0, 100);

  // Aluminum piston growth is approximated relative to a 20 °C reference.
  const thermalExpansionMm = clamp(
    Math.max(0, input.headTemperatureC - 20) * 0.000012 * 86,
    0, 0.45
  );
  const valveFloatSeverity = approach(previous.valveFloatSeverity, valveFloatTarget, dtSeconds * 1.8);
  const frictionTorqueNm = bearingWear * 0.075 + pistonScuffing * 0.11 +
    valveTrainWear * 0.018 + (oilStarvation ? 8 * load : 0);
  const damagePenalty = bearingWear * 0.0028 + pistonScuffing * 0.0035 +
    valveTrainWear * 0.0012 + rodFatigue * 0.0018 + headGasketDamage * 0.0025;
  const powerFactor = clamp(1 - damagePenalty - valveFloatSeverity * 0.16, 0, 1);
  const misfireProbability = clamp(
    headGasketDamage * 0.004 + valveTrainWear * 0.002 +
    (coolantOverheat ? 0.12 : 0) + (valveFloatSeverity > 0.55 ? (valveFloatSeverity - 0.55) * 0.7 : 0),
    0, 0.95
  );
  const seized = previous.seized || bearingWear >= 100 || pistonScuffing >= 100 ||
    (input.headTemperatureC >= 285 && input.coolantTemperatureC >= 125);

  const warnings: string[] = [];
  if (oilStarvation) warnings.push("PELÍCULA DE ACEITE INSUFICIENTE: desgaste de cojinetes acelerado");
  if (bearingWear >= 20) warnings.push("COJINETES: desgaste acumulado y fricción elevada");
  if (pistonScuffing >= 15 || thermalExpansionMm >= 0.28) warnings.push("PISTÓN: riesgo de rayado por temperatura y holgura reducida");
  if (valveFloatSeverity > 0.12) warnings.push("DISTRIBUCIÓN: flotación de válvulas a alto régimen");
  if (rodFatigue >= 15) warnings.push("BIELAS: fatiga acumulada por exceso de RPM");
  if (headGasketDamage >= 10) warnings.push("JUNTA DE TAPA: daño progresivo y posible pérdida de compresión");
  if (coolantOverheat) warnings.push("SOBRETEMPERATURA: el daño térmico continúa mientras no se enfríe");
  if (seized) warnings.push("MOTOR GRIPADO: el cigüeñal queda bloqueado hasta reiniciar la simulación");

  return {
    bearingWear, pistonScuffing, valveTrainWear, rodFatigue, headGasketDamage,
    thermalExpansionMm, valveFloatSeverity, frictionTorqueNm,
    powerFactor: seized ? 0 : powerFactor, misfireProbability, seized, warnings
  };
}

export function engineDamageSummary(damage: EngineDamageState) {
  return {
    overallHealth: Math.round(100 - Math.max(
      damage.bearingWear, damage.pistonScuffing, damage.valveTrainWear,
      damage.rodFatigue, damage.headGasketDamage
    )),
    activeFailures: damage.warnings.length,
    seized: damage.seized
  };
}
