export const FIXED_PHYSICS_STEP_SECONDS = 1 / 240;
export const MAX_FRAME_DELTA_SECONDS = 0.1;
export const MAX_PHYSICS_STEPS_PER_FRAME = 24;

export interface FixedStepAccumulatorState {
  remainderSeconds: number;
}

export interface FixedStepFrameResult {
  state: FixedStepAccumulatorState;
  stepCount: number;
  simulatedSeconds: number;
  droppedSeconds: number;
}

export function createFixedStepAccumulator(): FixedStepAccumulatorState {
  return { remainderSeconds: 0 };
}

/**
 * Converts variable render-frame time into bounded fixed physics steps.
 * Large stalls are discarded rather than triggering a spiral of death.
 */
export function consumeFixedSteps(
  state: FixedStepAccumulatorState,
  elapsedSeconds: number,
  timeScale = 1
): FixedStepFrameResult {
  if (!Number.isFinite(state.remainderSeconds) || state.remainderSeconds < 0 || state.remainderSeconds >= FIXED_PHYSICS_STEP_SECONDS) {
    throw new RangeError("Accumulator remainder must be finite and within one physics step.");
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed frame time must be finite and non-negative.");
  }
  if (!Number.isFinite(timeScale) || timeScale < 0) {
    throw new RangeError("Time scale must be finite and non-negative.");
  }

  const acceptedElapsed = Math.min(elapsedSeconds, MAX_FRAME_DELTA_SECONDS);
  const available = state.remainderSeconds + acceptedElapsed * timeScale;
  const availableSteps = Math.floor((available + 1e-10) / FIXED_PHYSICS_STEP_SECONDS);
  const stepCount = Math.min(availableSteps, MAX_PHYSICS_STEPS_PER_FRAME);
  const simulatedSeconds = stepCount * FIXED_PHYSICS_STEP_SECONDS;
  const remaining = Math.max(0, available - simulatedSeconds);
  const fractionalRemainder = remaining % FIXED_PHYSICS_STEP_SECONDS;
  const droppedSeconds = (elapsedSeconds - acceptedElapsed) * timeScale
    + Math.max(0, remaining - fractionalRemainder);

  return {
    state: { remainderSeconds: fractionalRemainder },
    stepCount,
    simulatedSeconds,
    droppedSeconds
  };
}
