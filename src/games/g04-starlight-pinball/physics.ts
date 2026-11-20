import {
  APRON_WALLS,
  ASTROLABE_CENTER,
  BALL_MAX_SPEED,
  BALL_MIN_SPEED,
  BALL_RADIUS,
  BUMPERS,
  DASH_COOLDOWN_SEC,
  DASH_DURATION_SEC,
  DROP_TARGETS,
  FLIPPERS,
  GRAVITY_Z,
  LANE_DIVIDERS,
  PHYSICS_SUBSTEPS,
  PLAYFIELD_ARCH_CENTER_Z,
  PLAYFIELD_ARCH_RADIUS,
  PLAYFIELD_DRAIN_Z,
  PLAYFIELD_HALF_W,
  PLAYER_RADIUS,
  PLAYER_START_X,
  PLAYER_START_Z,
  SHOCKWAVE_RADIUS,
  SLINGSHOTS,
  VORTICES,
  ZODIAC_LANES,
} from './constants';

export interface PinballState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  isGolden: boolean;
  stuckTimer: number;
  trailAccum: number;
  /** Cooldown per lane so a single pass doesn't retrigger immediately */
  laneCooldowns: number[];
}

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  speed: number;
  turnRate: number;
  dashTimer: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirZ: number;
  groundBump: number;
  laneCooldowns: number[];
}

export interface FlipperState {
  angle: number;
  omega: number;
  pressed: boolean;
}

export interface VortexState {
  id: number;
  active: boolean;
  timer: number;
  cooldown: number;
}

export interface PhysicsCallbacks {
  onBumperHit: (bumperId: number, x: number, z: number, speed: number, byPlayer: boolean) => void;
  onDropTargetHit: (targetId: number, x: number, z: number, byPlayer: boolean) => void;
  onZodiacLaneLit: (laneId: number, x: number, z: number, byPlayer: boolean) => void;
  onSlingshotHit: (slingId: number, x: number, z: number) => void;
  onFlipperHit: (side: 'left' | 'right', x: number, z: number, speed: number) => void;
  onPlayerBallHit: (x: number, z: number, wasDash: boolean, speed: number) => void;
  onBallBallHit: (x: number, z: number, speed: number) => void;
  onBallDrainReturn: (ball: PinballState, lostCombo: boolean) => void;
  onDashTrigger: (x: number, z: number) => void;
  onVortexShatter: (vortexId: number, x: number, z: number) => void;
}

export interface PhysicsInput {
  moveX: number; // +1 right, -1 left
  moveZ: number; // +1 down (+Z), -1 up (-Z)
  dashPressed: boolean;
  leftFlipper: boolean;
  rightFlipper: boolean;
}

export interface PhysicsWorld {
  player: PlayerState;
  balls: PinballState[];
  flippers: [FlipperState, FlipperState];
  dropTargetsDown: boolean[];
  zodiacLanesLit: boolean[];
  vortices: VortexState[];
  plungerPull: number;
  nextBallId: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { cx: number; cz: number; t: number; distSq: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const abLenSq = abx * abx + abz * abz;
  let t = 0;
  if (abLenSq > 1e-8) {
    t = clamp(((px - ax) * abx + (pz - az) * abz) / abLenSq, 0, 1);
  }
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { cx, cz, t, distSq: dx * dx + dz * dz };
}

export function createPhysicsWorld(): PhysicsWorld {
  const world: PhysicsWorld = {
    player: {
      x: PLAYER_START_X,
      z: PLAYER_START_Z,
      vx: 0,
      vz: 0,
      yaw: 0,
      speed: 0,
      turnRate: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashDirX: 0,
      dashDirZ: -1,
      groundBump: 0,
      laneCooldowns: ZODIAC_LANES.map(() => 0),
    },
    balls: [],
    flippers: [
      { angle: FLIPPERS[0].restAngle, omega: 0, pressed: false },
      { angle: FLIPPERS[1].restAngle, omega: 0, pressed: false },
    ],
    dropTargetsDown: DROP_TARGETS.map(() => false),
    zodiacLanesLit: ZODIAC_LANES.map(() => false),
    vortices: VORTICES.map((v, idx) => ({
      id: v.id,
      active: false,
      timer: 0,
      cooldown: idx === 0 ? 11 : 22,
    })),
    plungerPull: 0,
    nextBallId: 1,
  };

  spawnPinball(world, -5.8, -1.5, 5.2, -16.5, false);
  spawnPinball(world, 6.2, 2.2, -6.5, -18.0, false);

  return world;
}

export function spawnPinball(
  world: PhysicsWorld,
  x: number,
  z: number,
  vx: number,
  vz: number,
  isGolden: boolean,
): PinballState {
  const ball: PinballState = {
    id: world.nextBallId++,
    x,
    z,
    vx,
    vz,
    radius: BALL_RADIUS,
    isGolden,
    stuckTimer: 0,
    trailAccum: 0,
    laneCooldowns: ZODIAC_LANES.map(() => 0),
  };
  world.balls.push(ball);
  return ball;
}

export function stepPhysics(
  world: PhysicsWorld,
  input: PhysicsInput,
  dt: number,
  frenzyActive: boolean,
  cb: PhysicsCallbacks,
): void {
  const player = world.player;
  player.groundBump = 0;

  // Cooldown decay
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  if (player.dashTimer > 0) player.dashTimer = Math.max(0, player.dashTimer - dt);
  for (let i = 0; i < player.laneCooldowns.length; i++) {
    if (player.laneCooldowns[i] > 0) player.laneCooldowns[i] = Math.max(0, player.laneCooldowns[i] - dt);
  }
  for (const b of world.balls) {
    for (let i = 0; i < b.laneCooldowns.length; i++) {
      if (b.laneCooldowns[i] > 0) b.laneCooldowns[i] = Math.max(0, b.laneCooldowns[i] - dt);
    }
  }
  if (world.plungerPull > 0) {
    world.plungerPull = Math.max(0, world.plungerPull - dt * 4.5);
  }

  // Update Magnetic Nebula Vortices lifecycle (dormant during Frenzy)
  updateVortices(world, dt, frenzyActive);

  // Trigger Kinetic Dash-Ram + Shockwave Pulse
  if (input.dashPressed && player.dashCooldown <= 0) {
    const inLen = Math.hypot(input.moveX, input.moveZ);
    if (inLen > 0.15) {
      player.dashDirX = input.moveX / inLen;
      player.dashDirZ = input.moveZ / inLen;
    } else {
      player.dashDirX = -Math.sin(player.yaw);
      player.dashDirZ = -Math.cos(player.yaw);
    }
    player.dashTimer = DASH_DURATION_SEC;
    player.dashCooldown = DASH_COOLDOWN_SEC;
    player.vx = player.dashDirX * 26.5;
    player.vz = player.dashDirZ * 26.5;
    player.groundBump = 0.7;
    cb.onDashTrigger(player.x, player.z);

    // Immediate kinetic shockwave pulse against nearby balls & active vortices!
    for (const ball of world.balls) {
      const dx = ball.x - player.x;
      const dz = ball.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < SHOCKWAVE_RADIUS && dist > 1e-4) {
        const nx = dx / dist;
        const nz = dz / dist;
        const falloff = 1 - dist / SHOCKWAVE_RADIUS;
        const impulse = 15 + 15 * falloff;
        ball.vx += nx * impulse + player.dashDirX * 7.5;
        ball.vz += nz * impulse + player.dashDirZ * 7.5 - 4.5;
        clampBallSpeed(ball);
        cb.onPlayerBallHit(ball.x, ball.z, true, Math.hypot(ball.vx, ball.vz));
      }
    }

    for (const v of world.vortices) {
      if (!v.active) continue;
      const vDef = VORTICES[v.id];
      const dist = Math.hypot(player.x - vDef.x, player.z - vDef.z);
      if (dist < SHOCKWAVE_RADIUS + vDef.coreRadius) {
        v.active = false;
        v.cooldown = 16;
        cb.onVortexShatter(v.id, vDef.x, vDef.z);
      }
    }
  }

  // Sub-stepped integration for rock-solid zero-tunneling arcade feel
  const subDt = dt / PHYSICS_SUBSTEPS;
  for (let step = 0; step < PHYSICS_SUBSTEPS; step++) {
    stepFlippers(world, input.leftFlipper, input.rightFlipper, subDt);
    stepPlayer(world, input, subDt, cb);
    stepBalls(world, subDt, frenzyActive, cb);
  }

  // Compute figurine forward speed & yaw turn rate for character rig animation
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  player.speed = player.vx * fx + player.vz * fz;
}

function updateVortices(world: PhysicsWorld, dt: number, frenzyActive: boolean): void {
  if (frenzyActive) {
    for (const v of world.vortices) {
      if (v.active) {
        v.active = false;
        v.cooldown = 8;
      }
    }
    return;
  }

  const anyActive = world.vortices.some((v) => v.active);
  for (const v of world.vortices) {
    if (v.active) {
      v.timer -= dt;
      if (v.timer <= 0) {
        v.active = false;
        v.cooldown = 14 + Math.random() * 6;
      }
    } else {
      v.cooldown -= dt;
      if (v.cooldown <= 0 && !anyActive) {
        v.active = true;
        v.timer = 11.5;
      }
    }
  }
}

function stepFlippers(
  world: PhysicsWorld,
  leftPressed: boolean,
  rightPressed: boolean,
  dt: number,
): void {
  const inputs = [leftPressed, rightPressed];
  for (let i = 0; i < 2; i++) {
    const def = FLIPPERS[i];
    const st = world.flippers[i];
    st.pressed = inputs[i];
    const target = inputs[i] ? def.activeAngle : def.restAngle;
    const diff = target - st.angle;
    const maxRate = inputs[i] ? 26.5 : 15.5;
    const maxStep = maxRate * dt;
    const prevAngle = st.angle;

    if (Math.abs(diff) <= maxStep) {
      st.angle = target;
    } else {
      st.angle += Math.sign(diff) * maxStep;
    }
    st.omega = (st.angle - prevAngle) / Math.max(dt, 1e-5);
  }
}

function stepPlayer(
  world: PhysicsWorld,
  input: PhysicsInput,
  dt: number,
  cb: PhysicsCallbacks,
): void {
  const p = world.player;
  const inLen = Math.hypot(input.moveX, input.moveZ);
  const normX = inLen > 1e-4 ? input.moveX / Math.max(1, inLen) : 0;
  const normZ = inLen > 1e-4 ? input.moveZ / Math.max(1, inLen) : 0;

  if (p.dashTimer > 0) {
    // High-momentum kinetic ram with subtle steering authority
    p.vx += (p.dashDirX * 26.0 - p.vx) * (1 - Math.exp(-10 * dt));
    p.vz += (p.dashDirZ * 26.0 - p.vz) * (1 - Math.exp(-10 * dt));
  } else {
    const maxCruise = 14.2;
    const accel = 62.0;
    const damp = 8.4;
    if (inLen > 0.05) {
      p.vx += normX * accel * dt;
      p.vz += normZ * accel * dt;
      const spd = Math.hypot(p.vx, p.vz);
      if (spd > maxCruise) {
        const s = maxCruise / spd;
        p.vx *= s;
        p.vz *= s;
      }
    } else {
      const f = Math.exp(-damp * dt);
      p.vx *= f;
      p.vz *= f;
    }
  }

  // Subtle swirl assist on the Astrolabe Turntable
  const adx = p.x - ASTROLABE_CENTER.x;
  const adz = p.z - ASTROLABE_CENTER.z;
  const aDist = Math.hypot(adx, adz);
  if (aDist < ASTROLABE_CENTER.radius && aDist > 0.25) {
    p.vx += (-adz / aDist) * 2.2 * dt;
    p.vz += (adx / aDist) * 2.2 * dt;
  }

  // Active Magnetic Vortex tug (or shatter if dashing!)
  for (const v of world.vortices) {
    if (!v.active) continue;
    const vDef = VORTICES[v.id];
    const dx = vDef.x - p.x;
    const dz = vDef.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (p.dashTimer > 0 && dist < vDef.coreRadius + PLAYER_RADIUS + 0.9) {
      v.active = false;
      v.cooldown = 16;
      cb.onVortexShatter(v.id, vDef.x, vDef.z);
    } else if (dist < vDef.pullRadius && dist > 0.2) {
      const pull = (1 - dist / vDef.pullRadius) * 14.5;
      p.vx += (dx / dist) * pull * dt;
      p.vz += (dz / dist) * pull * dt;
    }
  }

  p.x += p.vx * dt;
  p.z += p.vz * dt;

  // Smooth yaw rotation toward travel direction
  const spd = Math.hypot(p.vx, p.vz);
  if (spd > 0.35 || inLen > 0.15) {
    const aimX = inLen > 0.15 ? normX : p.vx;
    const aimZ = inLen > 0.15 ? normZ : p.vz;
    const targetYaw = Math.atan2(-aimX, -aimZ);
    const diff = wrapAngle(targetYaw - p.yaw);
    const step = diff * (1 - Math.exp(-13.5 * dt));
    p.yaw = wrapAngle(p.yaw + step);
    p.turnRate = step / Math.max(dt, 1e-5);
  } else {
    p.turnRate *= Math.exp(-10 * dt);
  }

  // Keep player safely inside playfield walls & out of bottom drain trough
  constrainCircleToPlayfield(p, PLAYER_RADIUS, 0.3, true);

  // Collide player smoothly against Bumpers (bumping a pop bumper triggers it too!)
  for (const b of BUMPERS) {
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const minDist = PLAYER_RADIUS + b.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      p.x = b.x + nx * minDist;
      p.z = b.z + nz * minDist;
      const kick = p.dashTimer > 0 ? 15.5 : 8.5;
      p.vx = nx * kick;
      p.vz = nz * kick;
      p.groundBump = 0.65;
      cb.onBumperHit(b.id, b.x + nx * b.radius, b.z + nz * b.radius, kick, true);
    }
  }

  // Collide player against Drop Targets (you can ram targets directly!)
  for (let i = 0; i < DROP_TARGETS.length; i++) {
    if (world.dropTargetsDown[i]) continue;
    const t = DROP_TARGETS[i];
    const tx = -t.nz;
    const tz = t.nx;
    const ax = t.x - tx * t.halfWidth;
    const az = t.z - tz * t.halfWidth;
    const bx = t.x + tx * t.halfWidth;
    const bz = t.z + tz * t.halfWidth;
    const hit = closestPointOnSegment(p.x, p.z, ax, az, bx, bz);
    const minDist = PLAYER_RADIUS + 0.16;
    if (hit.distSq < minDist * minDist) {
      const dist = Math.sqrt(Math.max(hit.distSq, 1e-6));
      const nx = (p.x - hit.cx) / dist;
      const nz = (p.z - hit.cz) / dist;
      p.x = hit.cx + nx * minDist;
      p.z = hit.cz + nz * minDist;
      p.vx += nx * 6.5;
      p.vz += nz * 6.5;
      p.groundBump = 0.55;
      world.dropTargetsDown[i] = true;
      cb.onDropTargetHit(t.id, hit.cx, hit.cz, true);
    }
  }

  // Collide player against Slingshots, Apron walls, and Zodiac Lane Dividers
  for (const s of SLINGSHOTS) {
    collideCircleSegment(p, PLAYER_RADIUS, s.ax, s.az, s.bx, s.bz, 0.16, 0.55);
    collideCircleSegment(p, PLAYER_RADIUS, s.bx, s.bz, s.cx, s.cz, 0.16, 0.4);
    collideCircleSegment(p, PLAYER_RADIUS, s.cx, s.cz, s.ax, s.az, 0.16, 0.4);
  }
  for (const w of APRON_WALLS) {
    collideCircleSegment(p, PLAYER_RADIUS, w.ax, w.az, w.bx, w.bz, w.thickness, 0.35);
  }
  for (const d of LANE_DIVIDERS) {
    collideCircleSegment(p, PLAYER_RADIUS, d.x, d.zStart, d.x, d.zEnd, d.radius, 0.35);
  }

  // Player rolling through Zodiac Lanes lights them up!
  for (let i = 0; i < ZODIAC_LANES.length; i++) {
    if (p.laneCooldowns[i] > 0) continue;
    const lane = ZODIAC_LANES[i];
    if (Math.abs(p.x - lane.x) < lane.halfWidth && Math.abs(p.z - lane.z) < lane.halfDepth) {
      p.laneCooldowns[i] = 1.0;
      if (!world.zodiacLanesLit[i]) {
        world.zodiacLanesLit[i] = true;
        cb.onZodiacLaneLit(lane.id, lane.x, lane.z, true);
      }
    }
  }
}

function stepBalls(
  world: PhysicsWorld,
  dt: number,
  frenzyActive: boolean,
  cb: PhysicsCallbacks,
): void {
  const player = world.player;

  for (let bi = world.balls.length - 1; bi >= 0; bi--) {
    const ball = world.balls[bi];

    // Pinball playfield slope gravity (+Z downward toward flippers)
    ball.vz += GRAVITY_Z * dt;

    // Gentle air drag
    const drag = Math.exp(-0.08 * dt);
    ball.vx *= drag;
    ball.vz *= drag;

    // Spinning Astrolabe Turntable tangential orbital swirl
    const adx = ball.x - ASTROLABE_CENTER.x;
    const adz = ball.z - ASTROLABE_CENTER.z;
    const aDist = Math.hypot(adx, adz);
    if (aDist < ASTROLABE_CENTER.radius && aDist > 0.2) {
      const swirl = frenzyActive ? 14.5 : 8.2;
      ball.vx += (-adz / aDist) * swirl * dt;
      ball.vz += (adx / aDist) * swirl * dt;
    }

    // Active Magnetic Nebula Vortex gravitational pull
    for (const v of world.vortices) {
      if (!v.active) continue;
      const vDef = VORTICES[v.id];
      const dx = vDef.x - ball.x;
      const dz = vDef.z - ball.z;
      const dist = Math.hypot(dx, dz);
      if (dist < vDef.pullRadius && dist > 0.3) {
        const pull = (1 - dist / vDef.pullRadius) * 20.5;
        ball.vx += (dx / dist) * pull * dt;
        ball.vz += (dz / dist) * pull * dt;
        // Gentle orbital swirl around vortex core
        ball.vx += (-dz / dist) * 6.5 * dt;
        ball.vz += (dx / dist) * 6.5 * dt;
      }
    }

    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;

    // 1. Playfield perimeter & upper semicircular arch collision
    constrainCircleToPlayfield(ball, ball.radius, 0.84, false);

    // 2. Apron lower funnel rails
    for (const w of APRON_WALLS) {
      collideCircleSegment(ball, ball.radius, w.ax, w.az, w.bx, w.bz, w.thickness, 0.72);
    }

    // 3. Zodiac lane dividers
    for (const d of LANE_DIVIDERS) {
      collideCircleSegment(ball, ball.radius, d.x, d.zStart, d.x, d.zEnd, d.radius, 0.78);
    }

    // 4. 5 Brass & Amber-Glass Pop Bumpers
    for (const b of BUMPERS) {
      const dx = ball.x - b.x;
      const dz = ball.z - b.z;
      const minDist = ball.radius + b.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        ball.x = b.x + nx * (minDist + 0.01);
        ball.z = b.z + nz * (minDist + 0.01);

        const kick = frenzyActive ? 25.5 : 21.8;
        const vn = ball.vx * nx + ball.vz * nz;
        const outSpeed = Math.max(kick, -vn * 1.12 + 8);
        ball.vx += (outSpeed - vn) * nx;
        ball.vz += (outSpeed - vn) * nz;
        clampBallSpeed(ball);

        cb.onBumperHit(b.id, b.x + nx * b.radius, b.z + nz * b.radius, outSpeed, false);
      }
    }

    // 5. 2 Slingshot Kickers
    for (const s of SLINGSHOTS) {
      // Active face A->B kicks strongly!
      const hit = closestPointOnSegment(ball.x, ball.z, s.ax, s.az, s.bx, s.bz);
      const minDist = ball.radius + 0.16;
      if (hit.distSq < minDist * minDist && hit.distSq > 1e-7) {
        const dist = Math.sqrt(hit.distSq);
        const nx = (ball.x - hit.cx) / dist;
        const nz = (ball.z - hit.cz) / dist;
        ball.x = hit.cx + nx * (minDist + 0.01);
        ball.z = hit.cz + nz * (minDist + 0.01);

        // Kick upward-inward along normal if hitting the playfield-facing side
        const vn = ball.vx * nx + ball.vz * nz;
        if (vn < 6) {
          ball.vx = nx * s.kickSpeed + (ball.vx - vn * nx) * 0.55;
          ball.vz = nz * s.kickSpeed - 3.0;
          clampBallSpeed(ball);
          cb.onSlingshotHit(s.id, hit.cx, hit.cz);
        }
      }
      collideCircleSegment(ball, ball.radius, s.bx, s.bz, s.cx, s.cz, 0.16, 0.72);
      collideCircleSegment(ball, ball.radius, s.cx, s.cz, s.ax, s.az, 0.16, 0.72);
    }

    // 6. 3 Celestial Drop-Targets
    for (let i = 0; i < DROP_TARGETS.length; i++) {
      if (world.dropTargetsDown[i]) continue;
      const t = DROP_TARGETS[i];
      const tx = -t.nz;
      const tz = t.nx;
      const ax = t.x - tx * t.halfWidth;
      const az = t.z - tz * t.halfWidth;
      const bx = t.x + tx * t.halfWidth;
      const bz = t.z + tz * t.halfWidth;
      const hit = closestPointOnSegment(ball.x, ball.z, ax, az, bx, bz);
      const minDist = ball.radius + 0.15;
      if (hit.distSq < minDist * minDist) {
        const dist = Math.sqrt(Math.max(hit.distSq, 1e-6));
        const nx = (ball.x - hit.cx) / dist;
        const nz = (ball.z - hit.cz) / dist;
        ball.x = hit.cx + nx * (minDist + 0.01);
        ball.z = hit.cz + nz * (minDist + 0.01);
        const vn = ball.vx * nx + ball.vz * nz;
        if (vn < 0) {
          ball.vx -= 1.88 * vn * nx;
          ball.vz -= 1.88 * vn * nz;
        }
        ball.vx += t.nx * 5.2;
        ball.vz += t.nz * 5.2;
        clampBallSpeed(ball);
        world.dropTargetsDown[i] = true;
        cb.onDropTargetHit(t.id, hit.cx, hit.cz, false);
      }
    }

    // 7. 2 Mechanical Brass Flippers (Swept Angular Impulse Physics!)
    for (let fi = 0; fi < 2; fi++) {
      const def = FLIPPERS[fi];
      const st = world.flippers[fi];
      const tipX = def.pivotX + Math.cos(st.angle) * def.length;
      const tipZ = def.pivotZ + Math.sin(st.angle) * def.length;
      const hit = closestPointOnSegment(ball.x, ball.z, def.pivotX, def.pivotZ, tipX, tipZ);
      const localR = def.baseRadius + (def.tipRadius - def.baseRadius) * hit.t;
      const minDist = ball.radius + localR;

      if (hit.distSq < minDist * minDist) {
        const dist = Math.sqrt(Math.max(hit.distSq, 1e-6));
        const nx = (ball.x - hit.cx) / dist;
        const nz = (ball.z - hit.cz) / dist;
        ball.x = hit.cx + nx * (minDist + 0.015);
        ball.z = hit.cz + nz * (minDist + 0.015);

        // Exact flipper surface velocity at contact radius d = hit.t * def.length
        const d = hit.t * def.length;
        const fvx = -d * Math.sin(st.angle) * st.omega;
        const fvz = d * Math.cos(st.angle) * st.omega;

        const rvx = ball.vx - fvx;
        const rvz = ball.vz - fvz;
        const relVn = rvx * nx + rvz * nz;

        if (relVn < 0) {
          const rest = Math.abs(st.omega) > 4 ? 0.92 : 0.62;
          ball.vx -= (1 + rest) * relVn * nx;
          ball.vz -= (1 + rest) * relVn * nz;

          // Extra snappy arcade flipper pop when actively flipping upward!
          const swingingUp = (fi === 0 && st.omega < -4) || (fi === 1 && st.omega > 4);
          if (swingingUp) {
            const leverBoost = 0.65 + hit.t * 0.65;
            ball.vx += nx * 10.5 * leverBoost;
            ball.vz += Math.min(-14.5 * leverBoost, nz * 14.5 * leverBoost);
            clampBallSpeed(ball);
            cb.onFlipperHit(def.side, hit.cx, hit.cz, Math.hypot(ball.vx, ball.vz));
          }
        }
      }
    }

    // 8. Wheelchair Figurine <-> Pinball Ramming Collision!
    {
      const dx = ball.x - player.x;
      const dz = ball.z - player.z;
      const minDist = ball.radius + PLAYER_RADIUS;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        ball.x = player.x + nx * (minDist + 0.02);
        ball.z = player.z + nz * (minDist + 0.02);

        const isDashing = player.dashTimer > 0;
        const rvx = ball.vx - player.vx;
        const rvz = ball.vz - player.vz;
        const relVn = rvx * nx + rvz * nz;
        if (relVn < 0) {
          ball.vx -= 1.82 * relVn * nx;
          ball.vz -= 1.82 * relVn * nz;
        }
        // Juicy wheelchair ramming bonus impulse!
        const ramKick = isDashing ? 18.5 : 8.2;
        ball.vx += nx * ramKick + player.vx * 0.45;
        ball.vz += nz * ramKick + player.vz * 0.45 - (isDashing ? 5.0 : 2.2);
        clampBallSpeed(ball);

        // Subtle tactile recoil on the wheelchair suspension
        player.groundBump = isDashing ? 0.85 : 0.42;
        cb.onPlayerBallHit(ball.x, ball.z, isDashing, Math.hypot(ball.vx, ball.vz));
      }
    }

    // 9. Zodiac Rollover Lanes detection
    for (let i = 0; i < ZODIAC_LANES.length; i++) {
      if (ball.laneCooldowns[i] > 0) continue;
      const lane = ZODIAC_LANES[i];
      if (Math.abs(ball.x - lane.x) < lane.halfWidth && Math.abs(ball.z - lane.z) < lane.halfDepth) {
        ball.laneCooldowns[i] = 0.85;
        if (!world.zodiacLanesLit[i]) {
          world.zodiacLanesLit[i] = true;
          cb.onZodiacLaneLit(lane.id, lane.x, lane.z, false);
        }
      }
    }

    // 10. Anti-stuck watchdog so a ball never stalls in an upper alcove
    const spd = Math.hypot(ball.vx, ball.vz);
    if (spd < BALL_MIN_SPEED && ball.z < 7.5) {
      ball.stuckTimer += dt;
      if (ball.stuckTimer > 1.25) {
        ball.vx += (Math.random() - 0.5) * 10;
        ball.vz += 9.5;
        ball.stuckTimer = 0;
      }
    } else {
      ball.stuckTimer = 0;
    }

    // 11. Lower Drain Apron -> Brass Auto-Plunger Save / Return
    if (ball.z > PLAYFIELD_DRAIN_Z) {
      if (world.balls.length > 2 && !frenzyActive) {
        // Extra multiball drains away cleanly after Frenzy ends
        world.balls.splice(bi, 1);
      } else {
        // Auto-plunge cleanly back up an orbit lane so arcade flow never stops!
        const side = Math.random() > 0.5 ? 1 : -1;
        ball.x = side * (PLAYFIELD_HALF_W - 0.95);
        ball.z = 5.6;
        ball.vx = -side * (2.5 + Math.random() * 2.5);
        ball.vz = -(24.5 + Math.random() * 4.5);
        world.plungerPull = 1.0;
        cb.onBallDrainReturn(ball, !frenzyActive);
      }
    }
  }

  // 12. Ball-to-Ball Elastic Collisions
  for (let i = 0; i < world.balls.length; i++) {
    for (let j = i + 1; j < world.balls.length; j++) {
      const a = world.balls[i];
      const b = world.balls[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const minDist = a.radius + b.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = (minDist - dist) * 0.5 + 0.005;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        b.x += nx * overlap;
        b.z += nz * overlap;

        const rvx = b.vx - a.vx;
        const rvz = b.vz - a.vz;
        const relVn = rvx * nx + rvz * nz;
        if (relVn < 0) {
          const jImp = -0.94 * relVn;
          a.vx -= jImp * nx;
          a.vz -= jImp * nz;
          b.vx += jImp * nx;
          b.vz += jImp * nz;
          if (Math.abs(relVn) > 4.0) {
            cb.onBallBallHit((a.x + b.x) * 0.5, (a.z + b.z) * 0.5, Math.abs(relVn));
          }
        }
      }
    }
  }
}

function clampBallSpeed(ball: PinballState): void {
  const spd = Math.hypot(ball.vx, ball.vz);
  if (spd > BALL_MAX_SPEED) {
    const s = BALL_MAX_SPEED / spd;
    ball.vx *= s;
    ball.vz *= s;
  }
}

function constrainCircleToPlayfield(
  body: { x: number; z: number; vx: number; vz: number },
  radius: number,
  restitution: number,
  isPlayer: boolean,
): void {
  const maxX = PLAYFIELD_HALF_W - radius;

  // Upper semicircular arch boundary (z < PLAYFIELD_ARCH_CENTER_Z)
  if (body.z < PLAYFIELD_ARCH_CENTER_Z) {
    const dx = body.x;
    const dz = body.z - PLAYFIELD_ARCH_CENTER_Z;
    const maxR = PLAYFIELD_ARCH_RADIUS - radius;
    const distSq = dx * dx + dz * dz;
    if (distSq > maxR * maxR && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const nx = -dx / dist; // inward normal
      const nz = -dz / dist;
      body.x = (dx / dist) * maxR;
      body.z = PLAYFIELD_ARCH_CENTER_Z + (dz / dist) * maxR;
      const vn = body.vx * nx + body.vz * nz;
      if (vn < 0) {
        body.vx -= (1 + restitution) * vn * nx;
        body.vz -= (1 + restitution) * vn * nz;
      }
    }
  } else {
    // Straight mahogany side walls
    if (body.x < -maxX) {
      body.x = -maxX;
      if (body.vx < 0) body.vx = -body.vx * restitution;
    } else if (body.x > maxX) {
      body.x = maxX;
      if (body.vx > 0) body.vx = -body.vx * restitution;
    }
  }

  // Keep player safely above the lower flipper drain gap
  if (isPlayer) {
    const playerMaxZ = 8.45;
    if (body.z > playerMaxZ) {
      body.z = playerMaxZ;
      if (body.vz > 0) body.vz = -body.vz * 0.25;
    }
  }
}

function collideCircleSegment(
  body: { x: number; z: number; vx: number; vz: number },
  radius: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  segRadius: number,
  restitution: number,
): boolean {
  const hit = closestPointOnSegment(body.x, body.z, ax, az, bx, bz);
  const minDist = radius + segRadius;
  if (hit.distSq < minDist * minDist && hit.distSq > 1e-7) {
    const dist = Math.sqrt(hit.distSq);
    const nx = (body.x - hit.cx) / dist;
    const nz = (body.z - hit.cz) / dist;
    body.x = hit.cx + nx * minDist;
    body.z = hit.cz + nz * minDist;
    const vn = body.vx * nx + body.vz * nz;
    if (vn < 0) {
      body.vx -= (1 + restitution) * vn * nx;
      body.vz -= (1 + restitution) * vn * nz;
    }
    return true;
  }
  return false;
}
