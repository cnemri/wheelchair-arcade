import * as THREE from 'three';
import {
  CURLING_ENTRY_Z,
  getIceSurfaceHeight,
  getPlayableHeight,
  getPlayableNormal,
  getSignedDistOutsideIce,
  getTrackCenterX,
  RINK_CENTER_Z,
  RINK_WALL_RADIUS,
  SLOPE_START_Z,
  SUMMIT_Z,
  type GateInstance,
} from './course';

export const PLAYER_RADIUS = 0.74;

export type GamePhase = 'slalom' | 'curling' | 'round_summary' | 'finished';

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  turnRate: number;
  forwardSpeed: number;
  lateralSpeed: number;
  boostEnergy: number; // 0..100
  isBoosting: boolean;
  isGripCarving: boolean;
  driftIntensity: number; // 0..1 for spray, skid marks, audio
  slopePitch: number;
  bankRoll: number;
  groundBump: number;
  inSnowBank: boolean;
}

export interface PhysicsInput {
  forward: number; // -1..1
  turn: number; // -1..1 (+1 left CCW, -1 right CW)
  gripCarve: boolean; // Space
  boost: boolean; // Shift
}

export interface PhysicsStepEvents {
  clearedGates: { gate: GateInstance; perfect: boolean }[];
  missedGates: GateInstance[];
  poleHits: { gate: GateInstance; side: 'left' | 'right'; speed: number }[];
  wallBumpIntensity: number;
  enteredCurlingArena: boolean;
  boostStarted: boolean;
}

export function createInitialPlayerState(): PlayerState {
  const y = getPlayableHeight(0, SUMMIT_Z);
  return {
    x: 0,
    y,
    z: SUMMIT_Z,
    vx: 0,
    vz: 0,
    yaw: 0,
    turnRate: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    boostEnergy: 100,
    isBoosting: false,
    isGripCarving: false,
    driftIntensity: 0,
    slopePitch: 0,
    bankRoll: 0,
    groundBump: 0,
    inSnowBank: false,
  };
}

export function resetPlayerToSummit(state: PlayerState): void {
  state.x = 0;
  state.z = SUMMIT_Z;
  state.y = getPlayableHeight(0, SUMMIT_Z);
  state.vx = 0;
  state.vz = 0;
  state.yaw = 0;
  state.turnRate = 0;
  state.forwardSpeed = 0;
  state.lateralSpeed = 0;
  state.boostEnergy = 100;
  state.isBoosting = false;
  state.isGripCarving = false;
  state.driftIntensity = 0;
  state.slopePitch = 0;
  state.bankRoll = 0;
  state.groundBump = 0;
  state.inSnowBank = false;
}

const tmpNormal = new THREE.Vector3();

export function stepGlacierPhysics(
  state: PlayerState,
  input: PhysicsInput,
  dt: number,
  phase: GamePhase,
  gates: GateInstance[],
): PhysicsStepEvents {
  const safeDt = Math.min(Math.max(dt, 0.0001), 0.05);
  const events: PhysicsStepEvents = {
    clearedGates: [],
    missedGates: [],
    poleHits: [],
    wallBumpIntensity: 0,
    enteredCurlingArena: false,
    boostStarted: false,
  };

  state.groundBump = 0;

  // During round summary or final screen, glide gently to a graceful halt
  const isControlActive = phase === 'slalom' || phase === 'curling';
  const fwdIn = isControlActive ? input.forward : 0;
  const turnIn = isControlActive ? input.turn : 0;
  const gripHeld = isControlActive && input.gripCarve;
  const wantBoost = isControlActive && input.boost;

  // Boost energy management
  const wasBoosting = state.isBoosting;
  if (wantBoost && state.boostEnergy > (wasBoosting ? 1.5 : 10)) {
    state.isBoosting = true;
    state.boostEnergy = Math.max(0, state.boostEnergy - safeDt * 34);
    if (!wasBoosting) events.boostStarted = true;
  } else {
    state.isBoosting = false;
    const regenRate = phase === 'curling' ? 22 : 13;
    state.boostEnergy = Math.min(100, state.boostEnergy + safeDt * regenRate);
  }

  // Steering & yaw dynamics (studded-tire grip sharpens carve turn-in!)
  const speedMag = Math.hypot(state.vx, state.vz);
  const baseTurnSpeed = phase === 'curling' ? 2.85 : 2.35;
  const gripTurnBonus = gripHeld ? 1.32 : 1.0;
  const speedSteerScale = phase === 'curling' ? 1.0 : THREE.MathUtils.clamp(0.75 + speedMag * 0.025, 0.75, 1.15);
  const targetTurnRate = turnIn * baseTurnSpeed * gripTurnBonus * speedSteerScale;
  const turnAlpha = 1 - Math.exp(-13 * safeDt);
  state.turnRate += (targetTurnRate - state.turnRate) * turnAlpha;
  state.yaw += state.turnRate * safeDt;

  // Heading basis vectors (-Z forward when yaw = 0)
  const fwdX = -Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  // Decompose current horizontal velocity into forward & lateral components
  let vFwd = state.vx * fwdX + state.vz * fwdZ;
  let vLat = state.vx * rightX + state.vz * rightZ;

  // Forward thrust / tuck / brake
  if (phase === 'slalom') {
    if (fwdIn > 0.02) {
      vFwd += fwdIn * 16.5 * safeDt;
    } else if (fwdIn < -0.02) {
      // Air brake (allows slowing cleanly before sharp hairpins without easily reversing uphill)
      const brakeStrength = vFwd > 0 ? 22.0 : 9.0;
      vFwd += fwdIn * brakeStrength * safeDt;
    }
  } else if (phase === 'curling') {
    // Nimble curling rink thruster + reverse for tactical second shots!
    if (fwdIn > 0.02) {
      vFwd += fwdIn * 21.0 * safeDt;
    } else if (fwdIn < -0.02) {
      const decel = vFwd > 0.5 ? 26.0 : 14.5;
      vFwd += fwdIn * decel * safeDt;
    }
  }

  // Ice-Rocket Surge forward impulse
  if (state.isBoosting) {
    vFwd += (phase === 'curling' ? 26.0 : 23.0) * safeDt;
  }

  // Studded-Tire Grip Brake / Snap-Carve (`Space`)
  // Massively bites lateral ice slip AND trims runaway speed for crisp slalom gates or Curling Grip-Stop Spin!
  const lateralGrip = gripHeld
    ? phase === 'curling'
      ? 11.5
      : 10.2
    : phase === 'curling'
      ? 3.6
      : 2.85;
  vLat *= Math.exp(-lateralGrip * safeDt);

  if (gripHeld) {
    const gripBrake = phase === 'curling' ? 3.2 : 1.45;
    vFwd *= Math.exp(-gripBrake * safeDt);
  } else {
    // Low-friction mirror-ice longitudinal glide damping
    const iceDrag = phase === 'curling' ? 0.62 : 0.24;
    vFwd *= Math.exp(-iceDrag * safeDt);
  }

  // Clamp top speeds cleanly
  const maxFwd = state.isBoosting ? 35.5 : phase === 'curling' ? 25.0 : 28.5;
  const minFwd = phase === 'curling' ? -11.5 : -6.0;
  vFwd = THREE.MathUtils.clamp(vFwd, minFwd, maxFwd);

  // Reconstruct world velocity
  let vx = fwdX * vFwd + rightX * vLat;
  let vz = fwdZ * vFwd + rightZ * vLat;

  // Natural alpine gravity downhill pull once tipped over the glacier crest!
  // Keeps the figurine poised calmly at the flat summit start gate until the player launches.
  if (phase === 'slalom' && state.z < SLOPE_START_Z + 0.5 && state.z > CURLING_ENTRY_Z) {
    const hHere = getIceSurfaceHeight(state.z);
    const hAhead = getIceSurfaceHeight(state.z - 1.0);
    const slopeGrad = Math.max(0, hHere - hAhead); // positive downhill drop per meter
    const gravityPull = slopeGrad * 58.0 + 1.1;
    vz -= gravityPull * safeDt;
  }

  // Gentle auto-stop when phase is summary/finished
  if (!isControlActive) {
    vx *= Math.exp(-2.8 * safeDt);
    vz *= Math.exp(-2.8 * safeDt);
  }

  const prevX = state.x;
  const prevZ = state.z;
  let nextX = prevX + vx * safeDt;
  let nextZ = prevZ + vz * safeDt;

  // Keep player cleanly behind the summit back ridge
  if (nextZ > 9.0) {
    nextZ = 9.0;
    if (vz > 0) vz *= -0.35;
  }

  // Snowbank & Curling Arena Boundary Containment
  state.inSnowBank = false;
  if (phase === 'slalom' && nextZ > -170.0) {
    const sd = getSignedDistOutsideIce(nextX, nextZ);
    if (sd > 0.2) {
      state.inSnowBank = true;
      const cx = getTrackCenterX(nextZ);
      const dirIn = nextX > cx ? -1 : 1;
      // Soft powder snow bank banking push back toward the gleaming ice lane
      const bankPush = Math.min(28.0, sd * 11.5);
      vx += dirIn * bankPush * safeDt;
      // Powder snow drag slows off-line excursions gently
      const snowDrag = Math.exp(-Math.min(3.5, sd * 0.9) * safeDt);
      vx *= snowDrag;
      vz *= snowDrag;

      // Hard outer snow-berm wall at sd = 4.6m so player never leaves valley
      if (sd > 4.6) {
        const excess = sd - 4.6;
        nextX += dirIn * excess;
        if (vx * dirIn < 0) {
          events.wallBumpIntensity = Math.min(1, Math.abs(vx) / 14);
          vx *= -0.45;
          state.groundBump = 0.45;
        }
      }
    }
  } else {
    // Inside the circular Olympic Curling Arena
    // Softly keep player south of the curling entry hog-border once Phase 2 has begun
    if (phase === 'curling' && nextZ > CURLING_ENTRY_Z - 0.8) {
      nextZ = CURLING_ENTRY_Z - 0.8;
      if (vz > 0) {
        vz *= -0.4;
      }
    }

    const rx = nextX;
    const rz = nextZ - RINK_CENTER_Z;
    const dist = Math.hypot(rx, rz);
    const maxR = RINK_WALL_RADIUS - PLAYER_RADIUS - 0.12;
    if (dist > maxR && dist > 1e-5) {
      const nx = rx / dist;
      const nz = rz / dist;
      nextX = nx * maxR;
      nextZ = RINK_CENTER_Z + nz * maxR;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        if (vn > 2.2) {
          events.wallBumpIntensity = Math.min(1, vn / 16);
          state.groundBump = Math.min(0.8, vn * 0.05);
        }
        vx -= 1.48 * vn * nx;
        vz -= 1.48 * vn * nz;
      }
    }
  }

  // Swept Slalom Gate Crossing & Breakaway Pole Check (Phase 1)
  if (phase === 'slalom') {
    for (const gate of gates) {
      if (gate.status !== 'upcoming') continue;
      const gz = gate.def.z;

      // Check pole physical graze near the gate plane
      if (Math.abs(nextZ - gz) < 1.15) {
        const dLeft = Math.hypot(nextX - gate.leftPoleWorldX, nextZ - gz);
        const dRight = Math.hypot(nextX - gate.rightPoleWorldX, nextZ - gz);
        if (dLeft < 0.78 && Math.abs(gate.leftBendVelX) < 1.5) {
          events.poleHits.push({ gate, side: 'left', speed: Math.hypot(vx, vz) });
          vx *= 0.86;
          vz *= 0.88;
          state.groundBump = 0.55;
        } else if (dRight < 0.78 && Math.abs(gate.rightBendVelX) < 1.5) {
          events.poleHits.push({ gate, side: 'right', speed: Math.hypot(vx, vz) });
          vx *= 0.86;
          vz *= 0.88;
          state.groundBump = 0.55;
        }
      }

      // Swept crossing across gate Z plane
      if (prevZ > gz && nextZ <= gz) {
        const frac = (prevZ - gz) / Math.max(0.0001, prevZ - nextZ);
        const crossX = prevX + (nextX - prevX) * frac;
        const offsetFromCenter = Math.abs(crossX - gate.def.centerX);
        if (offsetFromCenter <= gate.def.halfWidth + 0.42) {
          const perfect = offsetFromCenter <= gate.def.halfWidth * 0.44;
          events.clearedGates.push({ gate, perfect });
        } else {
          events.missedGates.push(gate);
        }
      }
    }

    // Detect clean entry into the Olympic Curling Arena!
    if (prevZ > CURLING_ENTRY_Z && nextZ <= CURLING_ENTRY_Z) {
      events.enteredCurlingArena = true;
    }
  }

  // Finalize position, ground height & terrain-matched pitch/roll
  state.x = nextX;
  state.z = nextZ;
  state.vx = vx;
  state.vz = vz;
  state.y = getPlayableHeight(nextX, nextZ);

  state.forwardSpeed = vx * fwdX + vz * fwdZ;
  state.lateralSpeed = vx * rightX + vz * rightZ;

  // Drift / grip-carve intensity drives sparkling ice-spray particles & ski-edge audio
  const absLat = Math.abs(state.lateralSpeed);
  const absSpd = Math.hypot(vx, vz);
  state.isGripCarving = gripHeld && absSpd > 2.2;
  const rawDrift = state.isGripCarving
    ? THREE.MathUtils.clamp(0.45 + absSpd * 0.03 + absLat * 0.08, 0, 1)
    : THREE.MathUtils.clamp((absLat - 2.4) / 8.5, 0, 1);
  state.driftIntensity += (rawDrift - state.driftIntensity) * (1 - Math.exp(-10 * safeDt));

  // Project surface normal into chair local frame for authentic downhill nose pitch & carve roll!
  getPlayableNormal(nextX, nextZ, tmpNormal);
  // Forward dot normal > 0 when nose points downhill -> tilt nose down (-X rotation in -Z forward frame)
  const fwdDotN = fwdX * tmpNormal.x + fwdZ * tmpNormal.z;
  const rightDotN = rightX * tmpNormal.x + rightZ * tmpNormal.z;
  const targetSlopePitch = THREE.MathUtils.clamp(-Math.asin(THREE.MathUtils.clamp(fwdDotN, -0.5, 0.5)), -0.35, 0.35);
  // Add dramatic athletic edge-carve lean when carving or grip-sliding on ice!
  const carveLean = THREE.MathUtils.clamp(
    state.turnRate * 0.075 * THREE.MathUtils.clamp(absSpd / 14, 0.25, 1.35) * (gripHeld ? 1.45 : 1.0),
    -0.28,
    0.28,
  );
  const targetBankRoll = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(rightDotN, -0.5, 0.5)), -0.32, 0.32) + carveLean;

  const orientAlpha = 1 - Math.exp(-11 * safeDt);
  state.slopePitch += (targetSlopePitch - state.slopePitch) * orientAlpha;
  state.bankRoll += (targetBankRoll - state.bankRoll) * orientAlpha;

  return events;
}
