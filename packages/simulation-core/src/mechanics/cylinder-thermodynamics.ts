import type { EngineGeometry } from "../geometry/engine-geometry";
import { calculateSliderCrankState } from "./slider-crank";
import { DEFAULT_VALVE_TIMING } from "./valve-timing";

export type CylinderThermodynamicsConfig = {
  intakePressurePa: number;
  intakeTemperatureK: number;
  exhaustTemperatureK: number;
  compressionPolytropicExponent: number;
  expansionPolytropicExponent: number;
  heatAddedPerCycleJ: number;
  gasConstantJPerKgK: number;
  specificHeatCvJPerKgK: number;
};

export type CylinderThermodynamicState = {
  cycleAngleDeg: number;
  phase: "intake" | "compression" | "power" | "exhaust";
  cylinderVolumeM3: number;
  pressurePa: number;
  temperatureK: number;
  trappedMassKg: number;
  sparkActive: boolean;
  combustionComplete: boolean;
};

/**
 * First 0-D, single-zone cylinder model.
 *
 * Assumptions: ideal air with fixed properties; fixed trapped mass after
 * intake-valve closing; polytropic compression/expansion; instantaneous
 * constant-volume heat addition at TDC; ambient-pressure gas exchange.
 * It is an educational reference model, not a predictive combustion solver.
 */
export const DEFAULT_THERMODYNAMICS: CylinderThermodynamicsConfig = {
  intakePressurePa: 101_325,
  intakeTemperatureK: 300,
  exhaustTemperatureK: 650,
  compressionPolytropicExponent: 1.32,
  expansionPolytropicExponent: 1.25,
  heatAddedPerCycleJ: 450,
  gasConstantJPerKgK: 287.05,
  specificHeatCvJPerKgK: 718
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateCylinderThermodynamics(
  geometry: Pick<EngineGeometry, "crankRadiusM" | "connectingRodLengthM" | "strokeM" | "sweptVolumePerCylinderM3" | "clearanceVolumePerCylinderM3">,
  cycleAngleDeg: number,
  config: CylinderThermodynamicsConfig = DEFAULT_THERMODYNAMICS
): CylinderThermodynamicState {
  assertFinite(cycleAngleDeg, "cycleAngleDeg");
  validateConfig(config);
  const angle = ((cycleAngleDeg % 720) + 720) % 720;
  const ivcAngle = 180 + DEFAULT_VALVE_TIMING.intakeClosesAbdc;
  const evoAngle = 540 - DEFAULT_VALVE_TIMING.exhaustOpensBbdc;
  const volumeAt = (cycleDeg: number) => {
    const crankAngleRad = ((cycleDeg % 360) * Math.PI) / 180;
    const displacement = calculateSliderCrankState(geometry, crankAngleRad, 0).pistonDisplacementM;
    return geometry.clearanceVolumePerCylinderM3 +
      geometry.sweptVolumePerCylinderM3 * displacement / geometry.strokeM;
  };
  const volume = volumeAt(angle);
  const referenceVolume = volumeAt(ivcAngle);
  const clearanceVolume = geometry.clearanceVolumePerCylinderM3;
  const trappedMass = config.intakePressurePa * referenceVolume /
    (config.gasConstantJPerKgK * config.intakeTemperatureK);
  const compressionTemperature = config.intakeTemperatureK *
    Math.pow(referenceVolume / clearanceVolume, config.compressionPolytropicExponent - 1);
  const compressionPressure = config.intakePressurePa *
    Math.pow(referenceVolume / clearanceVolume, config.compressionPolytropicExponent);
  const combustionTemperature = compressionTemperature +
    config.heatAddedPerCycleJ / (trappedMass * config.specificHeatCvJPerKgK);
  const combustionPressure = trappedMass * config.gasConstantJPerKgK *
    combustionTemperature / clearanceVolume;
  const sparkAngle = 360 - DEFAULT_VALVE_TIMING.sparkAdvanceBtdc;

  if (angle < ivcAngle) {
    return {
      cycleAngleDeg: angle,
      phase: "intake",
      cylinderVolumeM3: volume,
      pressurePa: config.intakePressurePa,
      temperatureK: angle >= 540 ? config.exhaustTemperatureK : config.intakeTemperatureK,
      trappedMassKg: config.intakePressurePa * volume /
        (config.gasConstantJPerKgK * (angle >= 540 ? config.exhaustTemperatureK : config.intakeTemperatureK)),
      sparkActive: isNear(angle, sparkAngle),
      combustionComplete: false
    };
  }

  if (angle < 360) {
    const ratio = referenceVolume / volume;
    return {
      cycleAngleDeg: angle,
      phase: "compression",
      cylinderVolumeM3: volume,
      pressurePa: config.intakePressurePa * Math.pow(ratio, config.compressionPolytropicExponent),
      temperatureK: config.intakeTemperatureK * Math.pow(ratio, config.compressionPolytropicExponent - 1),
      trappedMassKg: trappedMass,
      sparkActive: isNear(angle, sparkAngle),
      combustionComplete: false
    };
  }

  if (angle < evoAngle) {
    const ratio = clearanceVolume / volume;
    return {
      cycleAngleDeg: angle,
      phase: "power",
      cylinderVolumeM3: volume,
      pressurePa: combustionPressure * Math.pow(ratio, config.expansionPolytropicExponent),
      temperatureK: combustionTemperature * Math.pow(ratio, config.expansionPolytropicExponent - 1),
      trappedMassKg: trappedMass,
      sparkActive: false,
      combustionComplete: true
    };
  }

  return {
    cycleAngleDeg: angle,
    phase: "exhaust",
    cylinderVolumeM3: volume,
    pressurePa: config.intakePressurePa,
    temperatureK: config.exhaustTemperatureK,
    trappedMassKg: config.intakePressurePa * volume /
      (config.gasConstantJPerKgK * config.exhaustTemperatureK),
    sparkActive: false,
    combustionComplete: true
  };
}

function isNear(angle: number, target: number): boolean {
  const distance = Math.abs(angle - target);
  return Math.min(distance, 720 - distance) <= 2.5;
}

function validateConfig(config: CylinderThermodynamicsConfig): void {
  for (const [key, value] of Object.entries(config)) {
    assertFinite(value, key);
    if (value <= 0) throw new RangeError(`${key} must be greater than zero.`);
  }
  if (config.compressionPolytropicExponent <= 1 || config.expansionPolytropicExponent <= 1) {
    throw new RangeError("Polytropic exponents must be greater than 1.");
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number.`);
}
