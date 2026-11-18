export interface EngineGeometryInput {
  cylinderCount: number;
  boreM: number;
  strokeM: number;
  connectingRodLengthM: number;
  compressionRatio: number;
  bankAngleRad: number;
}

export interface EngineGeometry extends EngineGeometryInput {
  crankRadiusM: number;
  sweptVolumePerCylinderM3: number;
  totalDisplacementM3: number;
  clearanceVolumePerCylinderM3: number;
  rodToCrankRatio: number;
}

/**
 * Creates validated geometric properties for a generic reciprocating engine.
 * All lengths are metres and angles are radians.
 */
export function createEngineGeometry(input: EngineGeometryInput): EngineGeometry {
  assertPositiveInteger(input.cylinderCount, "cylinderCount");
  assertPositiveFinite(input.boreM, "boreM");
  assertPositiveFinite(input.strokeM, "strokeM");
  assertPositiveFinite(input.connectingRodLengthM, "connectingRodLengthM");
  assertPositiveFinite(input.compressionRatio, "compressionRatio");
  assertFinite(input.bankAngleRad, "bankAngleRad");

  if (input.compressionRatio <= 1) {
    throw new RangeError("compressionRatio must be greater than 1.");
  }
  if (input.bankAngleRad <= 0 || input.bankAngleRad >= Math.PI) {
    throw new RangeError("bankAngleRad must be between 0 and PI radians.");
  }

  const crankRadiusM = input.strokeM / 2;
  if (input.connectingRodLengthM <= crankRadiusM) {
    throw new RangeError("connectingRodLengthM must be greater than the crank radius.");
  }

  const pistonAreaM2 = (Math.PI * input.boreM ** 2) / 4;
  const sweptVolumePerCylinderM3 = pistonAreaM2 * input.strokeM;
  const totalDisplacementM3 = sweptVolumePerCylinderM3 * input.cylinderCount;
  const clearanceVolumePerCylinderM3 =
    sweptVolumePerCylinderM3 / (input.compressionRatio - 1);

  return {
    ...input,
    crankRadiusM,
    sweptVolumePerCylinderM3,
    totalDisplacementM3,
    clearanceVolumePerCylinderM3,
    rodToCrankRatio: input.connectingRodLengthM / crankRadiusM
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero.`);
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}
