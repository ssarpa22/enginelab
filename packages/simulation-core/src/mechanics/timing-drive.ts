export const INLINE_FOUR_TIMING_DRIVE = {
  crankPulleyTeeth: 24,
  camPulleyTeeth: 48,
  crankPitchRadiusM: 0.038,
  beltPretensionN: 350,
  maximumBeltTensionN: 4_800,
  camshaftInertiaKgM2: 0.018,
  camshaftDragTorqueNm: 0.22
} as const;

export interface TimingDriveState {
  camshaftAngleDeg: number;
  camshaftRpm: number;
  beltSpeedMPerS: number;
  beltTravelM: number;
  beltTensionN: number;
  beltBroken: boolean;
  failureReason: string | null;
}

export interface TimingDriveStepInput {
  crankCycleAngleDeg: number;
  crankRpm: number;
  dtSeconds: number;
  timingDriveTorqueNm: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number, period: number) => ((value % period) + period) % period;

export const TIMING_DRIVE_RATIO =
  INLINE_FOUR_TIMING_DRIVE.camPulleyTeeth / INLINE_FOUR_TIMING_DRIVE.crankPulleyTeeth;
/** Lumped valve-spring/friction load reflected through the 2:1 belt ratio. */
export const TIMING_DRIVE_REFLECTED_LOAD_NM = 0.9;

export const INITIAL_TIMING_DRIVE_STATE: TimingDriveState = {
  camshaftAngleDeg: 0,
  camshaftRpm: 0,
  beltSpeedMPerS: 0,
  beltTravelM: 0,
  beltTensionN: 0,
  beltBroken: false,
  failureReason: null
};

/**
 * A toothed timing belt is a positive-drive constraint, not a separately
 * animated propeller. While the belt is intact, pulley tooth counts impose
 * the exact cam/crank ratio and the belt's linear speed follows the crank
 * pitch radius. If calculated tension exceeds the belt's rated limit, the
 * belt fails and the camshaft is allowed to coast down under drag.
 *
 * This is a lumped drive model, not an elastic tooth-contact or belt-vibration
 * finite-element solver. The rating is an educational default, not an OEM spec.
 */
export function stepTimingDrive(
  previous: TimingDriveState,
  input: TimingDriveStepInput
): TimingDriveState {
  const values = [
    input.crankCycleAngleDeg, input.crankRpm, input.dtSeconds,
    input.timingDriveTorqueNm, previous.camshaftAngleDeg, previous.camshaftRpm,
    previous.beltTravelM
  ];
  if (!values.every(Number.isFinite) || input.crankRpm < 0 ||
      input.dtSeconds < 0 || input.dtSeconds > 0.1 ||
      input.timingDriveTorqueNm < 0) {
    throw new RangeError("Invalid timing-drive input or integration step.");
  }

  const pitchRadius = INLINE_FOUR_TIMING_DRIVE.crankPitchRadiusM;
  // Belt tension is pretension plus the differential load needed to transmit
  // camshaft/valve-train torque. Combustion torque is carried by the crankshaft,
  // not transmitted through the timing belt.
  const beltTensionN = INLINE_FOUR_TIMING_DRIVE.beltPretensionN +
    input.timingDriveTorqueNm / pitchRadius;
  const newlyBroken = !previous.beltBroken &&
    beltTensionN > INLINE_FOUR_TIMING_DRIVE.maximumBeltTensionN;
  const beltBroken = previous.beltBroken || newlyBroken;

  if (!beltBroken) {
    const beltSpeedMPerS = 2 * Math.PI * pitchRadius * input.crankRpm / 60;
    return {
      camshaftAngleDeg: wrap(input.crankCycleAngleDeg / TIMING_DRIVE_RATIO, 360),
      camshaftRpm: input.crankRpm / TIMING_DRIVE_RATIO,
      beltSpeedMPerS,
      beltTravelM: previous.beltTravelM + beltSpeedMPerS * input.dtSeconds,
      beltTensionN,
      beltBroken: false,
      failureReason: null
    };
  }

  const angularVelocity = previous.camshaftRpm * Math.PI / 30;
  const drag = INLINE_FOUR_TIMING_DRIVE.camshaftDragTorqueNm;
  const deceleration = drag / INLINE_FOUR_TIMING_DRIVE.camshaftInertiaKgM2;
  const nextAngularVelocity = Math.max(0, angularVelocity - deceleration * input.dtSeconds);
  const averageAngularVelocity = (angularVelocity + nextAngularVelocity) / 2;
  return {
    camshaftAngleDeg: wrap(
      previous.camshaftAngleDeg + averageAngularVelocity * input.dtSeconds * 180 / Math.PI,
      360
    ),
    camshaftRpm: nextAngularVelocity * 30 / Math.PI,
    beltSpeedMPerS: 0,
    beltTravelM: previous.beltTravelM,
    beltTensionN,
    beltBroken: true,
    failureReason: newlyBroken
      ? "Sobrecarga: la tensión calculada superó el límite de la correa de distribución"
      : previous.failureReason
  };
}
