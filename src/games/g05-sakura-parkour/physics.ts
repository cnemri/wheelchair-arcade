import * as THREE from 'three';
import { evaluateSurfaceLocal } from './courseData';
import type {
  AnimatedSpringPad,
  CourseData,
  SolidCylinderCollider,
  WalkableSurface,
} from './types';

export interface PlayerPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  turnRate: number;
  forwardSpeed: number;
  grounded: boolean;
  currentSurface: WalkableSurface | null;
  currentIsland: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  airTime: number;
  airPeakY: number;
  launchKind: 'none' | 'hop' | 'ramp' | 'spring';
  boostEnergy: number; // 0..100
  isGroundBoosting: boolean;
  airDashTimer: number;
  airDashAvailable: boolean;
  surfacePitch: number;
  surfaceRoll: number;
  groundBump: number;
  respawnTimer: number;
  fallFloorY: number;
}

export interface PhysicsStepInput {
  forward: number; // [-1, 1]
  turn: number; // [-1, 1], +1 left (CCW)
  jumpDown: boolean;
  jumpPressed: boolean;
  boostDown: boolean;
  boostPressed: boolean;
}

export interface PhysicsCallbacks {
  onJump: (superRamp: boolean) => void;
  onRampLaunch: (speed: number) => void;
  onAirDash: () => void;
  onSpringLaunch: (pad: AnimatedSpringPad) => void;
  onLand: (airTime: number, launchKind: PlayerPhysicsState['launchKind'], impactVy: number) => void;
  onFallIntoClouds: () => void;
  onRespawnComplete: () => void;
}

export interface SurfaceHit {
  surface: WalkableSurface;
  y: number;
  lx: number;
  lz: number;
  worldSlopeX: number;
  worldSlopeZ: number;
}

const GRAVITY_UP_HOLD = -23.0;
const GRAVITY_UP_RELEASE = -34.0;
const GRAVITY_DOWN = -30.5;
const MAX_CRUISE_SPEED = 15.8;
const MAX_BOOST_SPEED = 23.6;
const REVERSE_SPEED = 7.2;
const HOP_VELOCITY = 12.2;
const COYOTE_TIME = 0.17;
const JUMP_BUFFER_TIME = 0.17;
const AIR_DASH_DURATION = 0.27;
const AIR_DASH_SPEED = 21.5;

export function createInitialPlayerState(course: CourseData): PlayerPhysicsState {
  const sp = course.startSpawn;
  return {
    x: sp.x,
    y: sp.y,
    z: sp.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: sp.yaw,
    turnRate: 0,
    forwardSpeed: 0,
    grounded: true,
    currentSurface: course.surfaces[0] ?? null,
    currentIsland: 1,
    coyoteTimer: COYOTE_TIME,
    jumpBufferTimer: 0,
    airTime: 0,
    airPeakY: sp.y,
    launchKind: 'none',
    boostEnergy: 100,
    isGroundBoosting: false,
    airDashTimer: 0,
    airDashAvailable: true,
    surfacePitch: 0,
    surfaceRoll: 0,
    groundBump: 0,
    respawnTimer: 0,
    fallFloorY: -12,
  };
}

/**
 * Finds the highest walkable surface supporting (x, y, z) within step-up/mantle tolerance.
 */
export function findSupportingSurface(
  x: number,
  y: number,
  z: number,
  surfaces: WalkableSurface[],
  maxStepUp: number,
  edgeMargin = 0.36,
): SurfaceHit | null {
  let best: SurfaceHit | null = null;

  for (const s of surfaces) {
    const dx = x - s.x;
    const dz = z - s.z;
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;

    if (Math.abs(lx) > s.halfW + edgeMargin || Math.abs(lz) > s.halfL + edgeMargin) {
      continue;
    }

    const clampedLx = Math.max(-s.halfW, Math.min(s.halfW, lx));
    const clampedLz = Math.max(-s.halfL, Math.min(s.halfL, lz));
    const ev = evaluateSurfaceLocal(s, clampedLx, clampedLz);

    if (ev.y <= y + maxStepUp) {
      if (!best || ev.y > best.y) {
        // Rotate local slope gradient to world space
        const worldSlopeX = ev.slopeX * c + ev.slopeZ * sn;
        const worldSlopeZ = -ev.slopeX * sn + ev.slopeZ * c;
        best = {
          surface: s,
          y: ev.y,
          lx,
          lz,
          worldSlopeX,
          worldSlopeZ,
        };
      }
    }
  }

  return best;
}

/**
 * Projects straight downward from (x, y, z) to locate the highest surface underneath
 * for the drop-shadow & landing precision ring indicator.
 */
export function findDropShadowSurface(
  x: number,
  y: number,
  z: number,
  surfaces: WalkableSurface[],
): { y: number; heightAbove: number } | null {
  let bestY = -Infinity;
  for (const s of surfaces) {
    const dx = x - s.x;
    const dz = z - s.z;
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    if (Math.abs(lx) > s.halfW + 0.1 || Math.abs(lz) > s.halfL + 0.1) continue;
    const ev = evaluateSurfaceLocal(s, lx, lz);
    if (ev.y <= y + 0.35 && ev.y > bestY) {
      bestY = ev.y;
    }
  }
  if (!Number.isFinite(bestY)) return null;
  return { y: bestY, heightAbove: Math.max(0, y - bestY) };
}

/**
 * Advances wheelchair momentum platforming physics by `dt` seconds.
 */
export function stepPlayerPhysics(
  state: PlayerPhysicsState,
  input: PhysicsStepInput,
  dt: number,
  surfaces: WalkableSurface[],
  springPads: AnimatedSpringPad[],
  solidCylinders: SolidCylinderCollider[],
  activeCheckpoint: { spawnX: number; spawnY: number; spawnZ: number; spawnYaw: number; islandIndex: number },
  callbacks: PhysicsCallbacks,
): void {
  state.groundBump = 0;

  // Handle brief 0.4s soft cloud respawn transition
  if (state.respawnTimer > 0) {
    state.respawnTimer -= dt;
    state.vx *= Math.exp(-5 * dt);
    state.vz *= Math.exp(-5 * dt);
    state.vy = Math.max(state.vy * 0.85, -3);
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    state.z += state.vz * dt;
    if (state.respawnTimer <= 0) {
      state.x = activeCheckpoint.spawnX;
      state.y = activeCheckpoint.spawnY + 0.2;
      state.z = activeCheckpoint.spawnZ;
      state.yaw = activeCheckpoint.spawnYaw;
      state.vx = 0;
      state.vy = 0;
      state.vz = 0;
      state.forwardSpeed = 0;
      state.grounded = true;
      state.airTime = 0;
      state.launchKind = 'none';
      state.boostEnergy = 100;
      state.airDashAvailable = true;
      state.airDashTimer = 0;
      state.coyoteTimer = COYOTE_TIME;
      state.jumpBufferTimer = 0;
      state.currentIsland = activeCheckpoint.islandIndex;
      callbacks.onRespawnComplete();
    }
    return;
  }

  // Update jump buffer & coyote timers
  if (input.jumpPressed) {
    state.jumpBufferTimer = JUMP_BUFFER_TIME;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.grounded) {
    state.coyoteTimer = COYOTE_TIME;
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
  }

  // Steering (responsive at low speed, smoothly stable at high boost speed)
  const horizSpeed = Math.hypot(state.vx, state.vz);
  const speedRatio = Math.min(1, horizSpeed / MAX_BOOST_SPEED);
  const turnSpeed = state.grounded
    ? THREE.MathUtils.lerp(2.75, 1.85, speedRatio)
    : 2.35;
  state.turnRate = input.turn * turnSpeed;
  state.yaw += state.turnRate * dt;

  // Forward unit vector in Three.js -Z facing convention
  const fwdX = -Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  // Decompose current horizontal velocity into forward & lateral components
  let vFwd = state.vx * fwdX + state.vz * fwdZ;
  let vLat = state.vx * rightX + state.vz * rightZ;

  // 1. Aero-Boost Thruster (ground turbo vs. mid-air horizontal jet burst)
  state.isGroundBoosting = false;
  if (state.grounded) {
    if (input.boostDown && state.boostEnergy > 1 && input.forward >= -0.1) {
      state.isGroundBoosting = true;
      state.boostEnergy = Math.max(0, state.boostEnergy - 32 * dt);
    } else {
      state.boostEnergy = Math.min(100, state.boostEnergy + 34 * dt);
    }
  } else {
    // Mid-air Aero-Dash trigger!
    if (input.boostPressed && state.airDashAvailable && state.boostEnergy >= 16) {
      state.airDashAvailable = false;
      state.airDashTimer = AIR_DASH_DURATION;
      state.boostEnergy = Math.max(0, state.boostEnergy - 22);
      const dashSpeed = Math.max(vFwd + 5.5, AIR_DASH_SPEED);
      state.vx = fwdX * dashSpeed;
      state.vz = fwdZ * dashSpeed;
      state.vy = Math.max(state.vy, 3.2);
      vFwd = dashSpeed;
      vLat = 0;
      callbacks.onAirDash();
    } else if (state.airDashTimer <= 0) {
      state.boostEnergy = Math.min(100, state.boostEnergy + 14 * dt);
    }
  }

  // 2. Ground vs. Air horizontal acceleration
  if (state.airDashTimer > 0) {
    state.airDashTimer = Math.max(0, state.airDashTimer - dt);
    // Keep high forward momentum and gently hover during dash
    const dashFwd = Math.max(vFwd, AIR_DASH_SPEED * 0.92);
    state.vx = fwdX * dashFwd;
    state.vz = fwdZ * dashFwd;
    state.vy = Math.max(state.vy, 0.8);
  } else if (state.grounded) {
    const maxSpeed = state.isGroundBoosting ? MAX_BOOST_SPEED : MAX_CRUISE_SPEED;
    const accel = state.isGroundBoosting ? 46 : 30;
    const brakeDecel = 38;
    const coastDrag = 11.5;

    if (state.isGroundBoosting) {
      vFwd += accel * dt;
      if (vFwd > maxSpeed) vFwd = Math.max(maxSpeed, vFwd - 14 * dt);
    } else if (input.forward > 0.05) {
      vFwd += input.forward * accel * dt;
      if (vFwd > maxSpeed) vFwd = Math.max(maxSpeed, vFwd - 16 * dt);
    } else if (input.forward < -0.05) {
      if (vFwd > 0.5) {
        vFwd = Math.max(0, vFwd - brakeDecel * dt);
      } else {
        vFwd = Math.max(-REVERSE_SPEED, vFwd + input.forward * 22 * dt);
      }
    } else {
      // Natural rolling deceleration
      const sign = Math.sign(vFwd);
      const mag = Math.max(0, Math.abs(vFwd) - coastDrag * dt);
      vFwd = sign * mag;
    }

    // Crisp tire grip absorbs sideways slide while leaving a tiny agile feel
    vLat *= Math.exp(-13.5 * dt);

    state.vx = fwdX * vFwd + rightX * vLat;
    state.vz = fwdZ * vFwd + rightZ * vLat;
  } else {
    // Crisp, forgiving air control so landing precision feels super satisfying
    const airAccel = 18.5;
    if (Math.abs(input.forward) > 0.05) {
      vFwd += input.forward * airAccel * dt;
      vFwd = THREE.MathUtils.clamp(vFwd, -6.5, MAX_BOOST_SPEED + 2.0);
    } else {
      vFwd *= Math.exp(-0.55 * dt);
    }
    // Slight directional redirection when turning in mid-air so steering shifts trajectory cleanly
    vLat *= Math.exp(-4.2 * dt);

    state.vx = fwdX * vFwd + rightX * vLat;
    state.vz = fwdZ * vFwd + rightZ * vLat;
  }

  // 3. Hydraulic Hop (with generous Coyote Time & Jump Buffering!)
  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    const onRamp = state.currentSurface?.kind === 'ramp';
    const rampBonus = onRamp ? Math.max(2.0, Math.min(5.2, Math.abs(vFwd) * 0.25)) : 0;
    state.vy = HOP_VELOCITY + rampBonus;
    state.grounded = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    state.launchKind = onRamp ? 'ramp' : 'hop';
    state.airPeakY = state.y;
    state.groundBump = 0.28;
    callbacks.onJump(onRamp);
  }

  // Track previous ramp state before horizontal move to detect crisp ramp lip launches!
  const prevSurface = state.currentSurface;
  const wasGrounded = state.grounded;
  const prevY = state.y;

  // 4. Integrate horizontal position
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // 5. Gravity & vertical movement
  if (!state.grounded) {
    const g =
      state.airDashTimer > 0
        ? -4.5
        : state.vy > 0
          ? input.jumpDown
            ? GRAVITY_UP_HOLD
            : GRAVITY_UP_RELEASE
          : GRAVITY_DOWN;
    state.vy += g * dt;
    state.vy = Math.max(state.vy, -36);
    state.y += state.vy * dt;
    state.airTime += dt;
    if (state.y > state.airPeakY) state.airPeakY = state.y;
  }

  // 6. Resolve Walkable Surface Support, Ramp Lip Launch & Ledge Mantle Forgiveness
  const maxStepUp = wasGrounded ? 0.62 : 0.68;
  const support = findSupportingSurface(state.x, state.y, state.z, surfaces, maxStepUp, 0.38);

  if (wasGrounded) {
    if (support && state.y - support.y <= 0.72) {
      // Stay smoothly glued to rooftop, bridge arch, or curved ramp!
      const prevSurfY = state.y;
      state.y = support.y;
      state.vy = 0;
      state.grounded = true;
      state.currentSurface = support.surface;
      state.currentIsland = Math.max(state.currentIsland, support.surface.islandIndex);
      state.fallFloorY = support.surface.fallFloorY;

      // Check if player just drove off the upper lip of a curved ramp onto open air or higher momentum!
      if (
        prevSurface &&
        prevSurface.kind === 'ramp' &&
        support.surface.id !== prevSurface.id &&
        vFwd > 6.0 &&
        prevSurfY > support.y + 0.35
      ) {
        // Launched right off the ramp exit lip!
        const rampSlope = ((prevSurface.rampRise ?? 1.8) / (prevSurface.halfL * 2)) * 1.45;
        const launchVy = Math.max(7.2, vFwd * rampSlope * (prevSurface.launchBoost ?? 1.2) + 2.6);
        state.y = prevSurfY + launchVy * dt;
        state.vy = launchVy;
        state.vx *= 1.07;
        state.vz *= 1.07;
        state.grounded = false;
        state.coyoteTimer = 0;
        state.currentSurface = null;
        state.launchKind = 'ramp';
        state.airPeakY = state.y;
        callbacks.onRampLaunch(Math.hypot(state.vx, state.vz));
      } else {
        // Compute figurine pitch & roll from surface slope in chair local space
        const slopeAlongFwd = support.worldSlopeX * fwdX + support.worldSlopeZ * fwdZ;
        const slopeAlongRight = support.worldSlopeX * rightX + support.worldSlopeZ * rightZ;
        // Positive pitch (+X) lifts chair nose upward when going uphill (slopeAlongFwd > 0)
        state.surfacePitch = THREE.MathUtils.clamp(Math.atan(slopeAlongFwd), -0.45, 0.52);
        state.surfaceRoll = THREE.MathUtils.clamp(-Math.atan(slopeAlongRight), -0.3, 0.3);
      }
    } else {
      // Left a rooftop/ramp edge into the air!
      state.grounded = false;
      state.currentSurface = null;
      if (prevSurface && prevSurface.kind === 'ramp' && vFwd > 5.5) {
        const rampSlope = ((prevSurface.rampRise ?? 1.8) / (prevSurface.halfL * 2)) * 1.5;
        const boostMult = prevSurface.launchBoost ?? 1.2;
        state.vy = Math.max(7.6, vFwd * rampSlope * boostMult + 2.8);
        state.vx *= 1.08;
        state.vz *= 1.08;
        state.coyoteTimer = 0; // Ramp launch already sent you flying!
        state.launchKind = 'ramp';
        state.airPeakY = state.y;
        callbacks.onRampLaunch(Math.hypot(state.vx, state.vz));
      } else {
        state.launchKind = 'none';
        state.airPeakY = state.y;
      }
    }
  } else {
    // Airborne -> check touchdown (swept check so fast falls never tunnel through decks!)
    if (state.vy <= 0 && support) {
      const crossedDeck = prevY >= support.y - 0.55 && state.y <= support.y + 0.14;
      if (crossedDeck) {
        const impactVy = Math.abs(state.vy);
        const landedAirTime = state.airTime;
        const landedKind = state.launchKind;

        state.y = support.y;
        state.vy = 0;
        state.grounded = true;
        state.currentSurface = support.surface;
        state.currentIsland = Math.max(state.currentIsland, support.surface.islandIndex);
        state.fallFloorY = support.surface.fallFloorY;
        state.airDashAvailable = true;
        state.airDashTimer = 0;
        state.airTime = 0;
        state.launchKind = 'none';
        state.groundBump = -Math.min(0.45, impactVy * 0.025);

        callbacks.onLand(landedAirTime, landedKind, impactVy);
      }
    }
  }

  // Smoothly return airborne tilt toward expressive flight nose angle
  if (!state.grounded) {
    const targetAirPitch = THREE.MathUtils.clamp(state.vy * 0.018, -0.22, 0.24);
    state.surfacePitch += (targetAirPitch - state.surfacePitch) * (1 - Math.exp(-8 * dt));
    state.surfaceRoll *= Math.exp(-8 * dt);
  }

  // 7. Guardrail Soft Deflection on Guarded Edges (only when low enough to hit the rail)
  const surf = state.currentSurface;
  const rails = surf?.rails;
  if (surf && rails) {
    const dx = state.x - surf.x;
    const dz = state.z - surf.z;
    const c = Math.cos(surf.yaw);
    const sn = Math.sin(surf.yaw);
    let lx = dx * c - dz * sn;
    let lz = dx * sn + dz * c;
    const limX = surf.halfW - 0.62;
    const limZ = surf.halfL - 0.62;
    let clamped = false;

    if (rails.left && lx < -limX) {
      lx = -limX;
      clamped = true;
    }
    if (rails.right && lx > limX) {
      lx = limX;
      clamped = true;
    }
    if (rails.back && lz > limZ) {
      lz = limZ;
      clamped = true;
    }
    if (rails.front && lz < -limZ) {
      lz = -limZ;
      clamped = true;
    }

    if (clamped) {
      state.x = surf.x + lx * c + lz * sn;
      state.z = surf.z - lx * sn + lz * c;
      // Damp velocity component pushing into the rail while keeping smooth forward slide
      state.vx *= 0.88;
      state.vz *= 0.88;
    }
  }

  // Smooth cylindrical obstacle push-out for Torii pillars & sakura tree trunks
  const chairRadius = 0.56;
  for (const cyl of solidCylinders) {
    if (state.y > cyl.y + cyl.height || state.y + 1.5 < cyl.y) continue;
    const dx = state.x - cyl.x;
    const dz = state.z - cyl.z;
    const minDist = cyl.radius + chairRadius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      state.x = cyl.x + nx * minDist;
      state.z = cyl.z + nz * minDist;
      const vn = state.vx * nx + state.vz * nz;
      if (vn < 0) {
        state.vx -= nx * vn * 1.15;
        state.vz -= nz * vn * 1.15;
      }
    }
  }

  // Keep player out of the solid Golden Sky Pagoda foundation on Island 10
  if (state.z < -271.2 && state.y < 36) {
    const px = 0;
    const pz = -277.3;
    const halfPW = 6.35;
    const halfPL = 5.95;
    if (Math.abs(state.x - px) < halfPW && Math.abs(state.z - pz) < halfPL) {
      const pushFront = pz + halfPL - state.z;
      const pushLeft = state.x - (px - halfPW);
      const pushRight = px + halfPW - state.x;
      if (pushFront <= pushLeft && pushFront <= pushRight) {
        state.z = pz + halfPL;
        state.vz = Math.max(0, state.vz);
      } else if (pushLeft < pushRight) {
        state.x = px - halfPW;
        state.vx = Math.min(0, state.vx);
      } else {
        state.x = px + halfPW;
        state.vx = Math.max(0, state.vx);
      }
    }
  }

  // 8. Turquoise-Gold Spring Jump Pad Triggers
  for (const pad of springPads) {
    if (pad.cooldown > 0) {
      pad.cooldown = Math.max(0, pad.cooldown - dt);
      continue;
    }
    const distXZ = Math.hypot(state.x - pad.def.x, state.z - pad.def.z);
    const dy = state.y - pad.def.y;
    if (distXZ <= pad.def.radius + 0.55 && dy >= -0.6 && dy <= 1.35) {
      pad.cooldown = 0.42;
      pad.recoil = 1.0;
      state.vy = pad.def.launchVy;
      if (pad.def.assistVx !== undefined && pad.def.assistVz !== undefined) {
        // Blend generously toward ideal upper-island trajectory while keeping player control!
        state.vx = state.vx * 0.35 + pad.def.assistVx * 0.92;
        state.vz = state.vz * 0.35 + pad.def.assistVz * 0.92;
      }
      state.y = Math.max(state.y, pad.def.y + 0.25);
      state.grounded = false;
      state.currentSurface = null;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
      state.airDashAvailable = true;
      state.airDashTimer = 0;
      state.boostEnergy = Math.min(100, state.boostEnergy + 38);
      state.launchKind = 'spring';
      state.airPeakY = state.y;
      state.groundBump = 0.45;
      callbacks.onSpringLaunch(pad);
      break;
    }
  }

  // 9. Cloud-Sea Fall Detection -> Gentle 0.4s Respawn at Active Checkpoint!
  if (state.y < state.fallFloorY) {
    state.respawnTimer = 0.4;
    callbacks.onFallIntoClouds();
  }

  state.forwardSpeed = state.vx * fwdX + state.vz * fwdZ;
}
