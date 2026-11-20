export function inlineFourFiringFrequencyHz(rpm:number):number {
  return Math.max(0,Number.isFinite(rpm)?rpm:0)/30;
}
export function normalizeEngineLoad(load:number):number {
  return Math.max(.12,Math.min(.95,Number.isFinite(load)?load:.45));
}
/** Exhaust pressure impulse amplitude responds to engine speed and load. */
export function exhaustPulseGain(rpm:number,load:number):number {
  const safeRpm=Math.max(0,Number.isFinite(rpm)?rpm:0);
  return safeRpm===0?0:(.12+normalizeEngineLoad(load)*.34)*Math.min(1.25,.55+safeRpm/5_000);
}
