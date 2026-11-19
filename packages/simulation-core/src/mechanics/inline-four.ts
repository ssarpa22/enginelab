/**
 * Kinematic phasing for a conventional 180-degree inline-four crankshaft.
 * Cylinders 1/4 share a TDC pair; cylinders 2/3 are the companion pair.
 * The four-stroke firing order is 1-3-4-2 at 180 crank-degree intervals.
 */
export const INLINE_FOUR_CRANK_PHASES_DEG = [0, 180, 180, 0] as const;
export const INLINE_FOUR_CYCLE_OFFSETS_DEG = [0, 180, 540, 360] as const;
export const INLINE_FOUR_FIRING_ORDER = [1, 3, 4, 2] as const;

export interface InlineFourCylinderPhase {
  cylinderNumber: 1 | 2 | 3 | 4;
  crankAngleDeg: number;
  cycleAngleDeg: number;
}

const wrap = (angle: number, period: number) => ((angle % period) + period) % period;

/** Returns the local crank and 720-degree cycle angles for one cylinder. */
export function getInlineFourCylinderPhase(globalCrankAngleDeg: number, globalCycleAngleDeg: number, cylinderIndex: number): InlineFourCylinderPhase {
  if (!Number.isFinite(globalCrankAngleDeg) || !Number.isFinite(globalCycleAngleDeg)) {
    throw new RangeError("Engine angles must be finite.");
  }
  if (!Number.isInteger(cylinderIndex) || cylinderIndex < 0 || cylinderIndex > 3) {
    throw new RangeError("Cylinder index must be between 0 and 3.");
  }
  return {
    cylinderNumber: (cylinderIndex + 1) as 1 | 2 | 3 | 4,
    crankAngleDeg: wrap(globalCrankAngleDeg + INLINE_FOUR_CRANK_PHASES_DEG[cylinderIndex]!, 360),
    cycleAngleDeg: wrap(globalCycleAngleDeg + INLINE_FOUR_CYCLE_OFFSETS_DEG[cylinderIndex]!, 720)
  };
}

/** Crank-angle positions of firing events in chronological order over one 720° cycle. */
export function getInlineFourFiringEvents(sparkAdvanceBtdcDeg = 15): Array<{ cylinderNumber: 1 | 2 | 3 | 4; crankAngleDeg: number }> {
  if (!Number.isFinite(sparkAdvanceBtdcDeg) || sparkAdvanceBtdcDeg < 0 || sparkAdvanceBtdcDeg >= 180) {
    throw new RangeError("Spark advance must be between 0 and 180 degrees BTDC.");
  }
  const sparkAngle = 360 - sparkAdvanceBtdcDeg;
  return INLINE_FOUR_CYCLE_OFFSETS_DEG
    .map((offset, index) => ({
      cylinderNumber: (index + 1) as 1 | 2 | 3 | 4,
      crankAngleDeg: wrap(sparkAngle - offset, 720)
    }))
    .sort((a, b) => ((a.crankAngleDeg - sparkAngle + 720) % 720) - ((b.crankAngleDeg - sparkAngle + 720) % 720));
}
