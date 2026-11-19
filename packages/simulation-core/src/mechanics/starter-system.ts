export const STARTER_CUTOUT_RPM = 65;
export const STARTER_STALL_TORQUE_NM = 48;
export const STARTER_NO_LOAD_RPM = 420;

/**
 * Approximate permanent-magnet starter torque curve.
 * Torque falls with motor speed and reaches zero near its no-load speed.
 */
export function calculateStarterTorque(rpm: number, engaged: boolean): number {
  if (!Number.isFinite(rpm) || rpm < 0) throw new RangeError("Starter RPM must be finite and non-negative.");
  if (!engaged || rpm >= STARTER_NO_LOAD_RPM) return 0;
  return STARTER_STALL_TORQUE_NM * (1 - rpm / STARTER_NO_LOAD_RPM);
}

export function starterCanDisengage(rpm: number): boolean {
  return Number.isFinite(rpm) && rpm >= STARTER_CUTOUT_RPM;
}
