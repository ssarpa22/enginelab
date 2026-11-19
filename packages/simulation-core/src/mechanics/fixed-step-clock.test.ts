import { describe, expect, it } from "vitest";
import {
  consumeFixedSteps,
  createFixedStepAccumulator,
  FIXED_PHYSICS_STEP_SECONDS,
  MAX_FRAME_DELTA_SECONDS,
  MAX_PHYSICS_STEPS_PER_FRAME
} from "./fixed-step-clock";

function runFrames(frameDurations: number[], timeScale = 1) {
  let state = createFixedStepAccumulator();
  let steps = 0;
  let dropped = 0;
  for (const elapsed of frameDurations) {
    const result = consumeFixedSteps(state, elapsed, timeScale);
    state = result.state;
    steps += result.stepCount;
    dropped += result.droppedSeconds;
  }
  return { state, steps, dropped };
}

describe("fixed-step physics clock", () => {
  it("produces the same step count at 30, 60 and 144 render FPS", () => {
    const at30Fps = runFrames(Array(30).fill(1 / 30));
    const at60Fps = runFrames(Array(60).fill(1 / 60));
    const at144Fps = runFrames(Array(144).fill(1 / 144));

    expect(at30Fps.steps).toBe(240);
    expect(at60Fps.steps).toBe(240);
    expect(at144Fps.steps).toBe(240);
    expect(at30Fps.state.remainderSeconds).toBeCloseTo(at60Fps.state.remainderSeconds, 10);
    expect(at60Fps.state.remainderSeconds).toBeCloseTo(at144Fps.state.remainderSeconds, 10);
  });

  it("preserves fractional time between frames", () => {
    let state = createFixedStepAccumulator();
    const first = consumeFixedSteps(state, FIXED_PHYSICS_STEP_SECONDS * 0.4);
    state = first.state;
    const second = consumeFixedSteps(state, FIXED_PHYSICS_STEP_SECONDS * 0.6);
    expect(first.stepCount).toBe(0);
    expect(second.stepCount).toBe(1);
    expect(second.state.remainderSeconds).toBeCloseTo(0, 10);
  });

  it("caps a long frame stall and reports discarded time", () => {
    const result = consumeFixedSteps(createFixedStepAccumulator(), 1);
    expect(result.stepCount).toBe(MAX_PHYSICS_STEPS_PER_FRAME);
    expect(result.simulatedSeconds).toBeCloseTo(MAX_FRAME_DELTA_SECONDS, 10);
    expect(result.droppedSeconds).toBeCloseTo(0.9, 10);
    expect(result.state.remainderSeconds).toBeCloseTo(0, 10);
  });

  it("scales elapsed simulation time for slow motion", () => {
    const normal = consumeFixedSteps(createFixedStepAccumulator(), 0.1, 1);
    const slow = consumeFixedSteps(createFixedStepAccumulator(), 0.1, 0.15);
    expect(normal.stepCount).toBe(24);
    expect(slow.stepCount).toBe(3);
  });

  it("rejects invalid elapsed time, time scale and accumulator state", () => {
    expect(() => consumeFixedSteps(createFixedStepAccumulator(), -0.01)).toThrow(RangeError);
    expect(() => consumeFixedSteps(createFixedStepAccumulator(), 0.01, -1)).toThrow(RangeError);
    expect(() => consumeFixedSteps({ remainderSeconds: FIXED_PHYSICS_STEP_SECONDS }, 0.01)).toThrow(RangeError);
  });
});
