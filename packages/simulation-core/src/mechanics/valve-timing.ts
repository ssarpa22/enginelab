export type ValveTiming = {
  intakeOpensBtdc: number;
  intakeClosesAbdc: number;
  exhaustOpensBbdc: number;
  exhaustClosesAtdc: number;
  intakeMaxLiftMm: number;
  exhaustMaxLiftMm: number;
  sparkAdvanceBtdc: number;
};

export type ValveState = {
  intakeLiftMm: number;
  exhaustLiftMm: number;
  intakeOpen: boolean;
  exhaustOpen: boolean;
  sparkActive: boolean;
};

export const DEFAULT_VALVE_TIMING: ValveTiming = {
  intakeOpensBtdc: 10,
  intakeClosesAbdc: 40,
  exhaustOpensBbdc: 45,
  exhaustClosesAtdc: 10,
  intakeMaxLiftMm: 9,
  exhaustMaxLiftMm: 8,
  sparkAdvanceBtdc: 15
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothLift = (progress: number, maxLift: number) => maxLift * Math.sin(Math.PI * clamp(progress, 0, 1));

function windowProgress(angle: number, start: number, end: number): number | null {
  const normalized = ((angle % 720) + 720) % 720;
  const span = end >= start ? end - start : 720 - start + end;
  const elapsed = normalized >= start ? normalized - start : 720 - start + normalized;
  if (elapsed > span) return null;
  return span === 0 ? null : elapsed / span;
}

/** Returns a simple, smooth cam-lift approximation for a 720-degree four-stroke cycle. */
export function calculateValveState(angleDeg: number, timing: ValveTiming = DEFAULT_VALVE_TIMING): ValveState {
  if (!Number.isFinite(angleDeg)) throw new RangeError("Cycle angle must be finite");
  const intakeStart = 720 - timing.intakeOpensBtdc;
  const intakeEnd = 180 + timing.intakeClosesAbdc;
  const exhaustStart = 540 - timing.exhaustOpensBbdc;
  const exhaustEnd = timing.exhaustClosesAtdc;
  const intakeProgress = windowProgress(angleDeg, intakeStart, intakeEnd);
  const exhaustProgress = windowProgress(angleDeg, exhaustStart, exhaustEnd);
  const intakeLiftMm = intakeProgress === null ? 0 : smoothLift(intakeProgress, timing.intakeMaxLiftMm);
  const exhaustLiftMm = exhaustProgress === null ? 0 : smoothLift(exhaustProgress, timing.exhaustMaxLiftMm);
  const sparkAngle = 360 - timing.sparkAdvanceBtdc;
  const normalized = ((angleDeg % 720) + 720) % 720;
  const sparkDistance = Math.min(Math.abs(normalized - sparkAngle), 720 - Math.abs(normalized - sparkAngle));
  return {
    intakeLiftMm,
    exhaustLiftMm,
    intakeOpen: intakeLiftMm > 0.15,
    exhaustOpen: exhaustLiftMm > 0.15,
    sparkActive: sparkDistance <= 2.5
  };
}
