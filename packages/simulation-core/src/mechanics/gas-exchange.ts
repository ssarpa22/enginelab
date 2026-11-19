import type { EngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";
import { calculateValveState, DEFAULT_VALVE_TIMING } from "./valve-timing";

export type GasExchangeState = {
  intakeMassFlowKgPerS: number;
  exhaustMassFlowKgPerS: number;
  cylinderPressurePa: number;
  intakePressurePa: number;
  exhaustPressurePa: number;
  intakeValveLiftMm: number;
  exhaustValveLiftMm: number;
};

export type GasExchangeConfig = {
  intakePressurePa: number;
  exhaustPressurePa: number;
  intakeTemperatureK: number;
  exhaustTemperatureK: number;
  gasConstantJPerKgK: number;
  dischargeCoefficient: number;
  intakePressureDropFraction: number;
  exhaustPressureRiseFraction: number;
};

export const DEFAULT_GAS_EXCHANGE: GasExchangeConfig = {
  intakePressurePa: 101325,
  exhaustPressurePa: 101325,
  intakeTemperatureK: 300,
  exhaustTemperatureK: 650,
  gasConstantJPerKgK: 287.05,
  dischargeCoefficient: 0.68,
  intakePressureDropFraction: 0.025,
  exhaustPressureRiseFraction: 0.04
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Quasi-steady valve-curtain/orifice estimate. It uses piston speed to estimate
 * a small intake depression and exhaust overpressure, then applies the
 * incompressible orifice equation. It is not a compressible-flow/CFD solver.
 */
export function calculateGasExchangeState(
  geometry: Pick<EngineGeometry, "boreM" | "crankRadiusM" | "connectingRodLengthM">,
  cycleAngleDeg: number,
  rpm: number,
  cylinderPressurePa: number,
  cylinderTemperatureK: number,
  config: GasExchangeConfig = DEFAULT_GAS_EXCHANGE
): GasExchangeState {
  for (const [name, value] of Object.entries({ cycleAngleDeg, rpm, cylinderPressurePa, cylinderTemperatureK, ...config })) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  }
  if (rpm < 0 || cylinderPressurePa <= 0 || cylinderTemperatureK <= 0) {
    throw new RangeError("RPM must be non-negative and cylinder pressure/temperature must be positive.");
  }
  if (config.dischargeCoefficient <= 0 || config.dischargeCoefficient > 1) {
    throw new RangeError("dischargeCoefficient must be in the interval (0, 1].");
  }

  const valves = calculateValveState(cycleAngleDeg);
  const crankAngleRad = (((cycleAngleDeg % 360) + 360) % 360) * Math.PI / 180;
  const piston = calculateSliderCrankState(geometry, crankAngleRad, rpm);
  const angularSpeed = rpm * 2 * Math.PI / 60;
  const referencePistonSpeed = Math.max(0.001, angularSpeed * geometry.crankRadiusM * 1.65);
  const speedFraction = clamp(Math.abs(piston.pistonVelocityMPerS) / referencePistonSpeed, 0, 1);

  const intakeCylinderPressure = config.intakePressurePa * (1 - config.intakePressureDropFraction * (piston.pistonVelocityMPerS > 0 ? speedFraction : 0));
  const exhaustCylinderPressure = config.exhaustPressurePa * (1 + config.exhaustPressureRiseFraction * (piston.pistonVelocityMPerS < 0 ? speedFraction : 0));
  const intakePressure = config.intakePressurePa;
  const exhaustPressure = config.exhaustPressurePa;
  const intakeArea = Math.PI * geometry.boreM * 0.28 * (valves.intakeLiftMm / 1000);
  const exhaustArea = Math.PI * geometry.boreM * 0.28 * (valves.exhaustLiftMm / 1000);

  const intakeDensity = intakePressure / (config.gasConstantJPerKgK * config.intakeTemperatureK);
  const effectiveExhaustPressure = Math.max(cylinderPressurePa, exhaustCylinderPressure);
  const exhaustDensity = effectiveExhaustPressure / (config.gasConstantJPerKgK * cylinderTemperatureK);
  const intakeDelta = Math.max(0, intakePressure - Math.min(cylinderPressurePa, intakeCylinderPressure));
  const exhaustDelta = Math.max(0, effectiveExhaustPressure - exhaustPressure);
  const intakeMassFlow = valves.intakeOpen
    ? config.dischargeCoefficient * intakeArea * Math.sqrt(2 * intakeDensity * intakeDelta)
    : 0;
  const exhaustMassFlow = valves.exhaustOpen
    ? config.dischargeCoefficient * exhaustArea * Math.sqrt(2 * exhaustDensity * exhaustDelta)
    : 0;

  return {
    intakeMassFlowKgPerS: intakeMassFlow,
    exhaustMassFlowKgPerS: exhaustMassFlow,
    cylinderPressurePa: Math.min(cylinderPressurePa, intakeCylinderPressure),
    intakePressurePa: intakePressure,
    exhaustPressurePa: exhaustPressure,
    intakeValveLiftMm: valves.intakeLiftMm,
    exhaustValveLiftMm: valves.exhaustLiftMm
  };
}
