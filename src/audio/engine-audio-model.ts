export function inlineFourFiringFrequencyHz(rpm:number):number {
  return Math.max(0,Number.isFinite(rpm)?rpm:0)/30;
}
export function inlineFourBodyFrequencies(rpm:number):[number,number,number] {
  const safe=Math.max(0,Number.isFinite(rpm)?rpm:0);
  if(safe===0)return [0,0,0];
  return [28+safe*.025,56+safe*.05,84+safe*.075];
}
export function normalizeEngineLoad(load:number):number {
  return Math.max(.12,Math.min(.95,Number.isFinite(load)?load:.45));
}
