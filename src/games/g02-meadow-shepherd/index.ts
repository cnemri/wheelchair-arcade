import * as THREE from 'three';
import { applyAtmosphere, createParticleSystem } from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameMeta, GameModule } from '../../engine/types';
import { createFlockSystem } from './creatures';
import { buildPastoralWorld } from './props';
import { createShepherdEffects } from './shepherdEffects';
import {
  BRIDGE_HALF_LEN,
  BRIDGE_HALF_WIDTH,
  PADDOCK_GATE_POS,
  bridgeLocalToWorld,
  createMeadowTerrain,
  isInWater,
  surfaceHeightAt,
  surfaceNormalAt,
  terrainHeightAt,
  wallRadiusAtAngle,
  worldToBridgeLocal,
  type ObstacleBox,
  type ObstacleCircle,
} from './terrain';

const META: GameMeta = {
  id: 'meadow-shepherd',
  number: 2,
  title: 'Meadow Shepherd',
  subtitle: 'Sunlit Pastoral Valley',
  genre: 'Herding Adventure',
  style: 'Sunlit Pastoral',
  accentColor: '#5B8C4E',
  controls: [
    { keys: 'WASD / Arrows', action: 'Drive Across Meadow' },
    { keys: 'Space', action: 'Brass Shepherd Bell' },
    { keys: 'Shift', action: 'Meadow Sprint' },
  ],
  objective:
    'Guide the wandering wooly flock through wind-swept wildflowers into the stone paddock before dusk.',
};

const TOTAL_SHEEP = 12;
const SPAWN_X = 0.0;
const SPAWN_Z = 19.6;
const SPAWN_YAW = 0.0;

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

function resolvePlayerCollisions(
  pos: THREE.Vector3,
  radius: number,
  circles: ObstacleCircle[],
  boxes: ObstacleBox[],
): boolean {
  let bumped = false;

  // 1. Dry-stone perimeter boundary
  const r = Math.hypot(pos.x, pos.z);
  const theta = Math.atan2(pos.z, pos.x);
  const maxR = wallRadiusAtAngle(theta) - 1.35 - radius;
  if (r > maxR && r > 0.001) {
    pos.x = (pos.x / r) * maxR;
    pos.z = (pos.z / r) * maxR;
    bumped = true;
  }

  // 2. Arched footbridge wooden handrails containment when crossing
  const br = worldToBridgeLocal(pos.x, pos.z);
  if (Math.abs(br.lx) < BRIDGE_HALF_LEN - 0.3 && Math.abs(br.lz) < BRIDGE_HALF_WIDTH + 0.65) {
    const maxLz = BRIDGE_HALF_WIDTH - 0.58;
    if (Math.abs(br.lz) > maxLz && Math.abs(br.lz) < BRIDGE_HALF_WIDTH + 0.45) {
      const clampedLz = Math.sign(br.lz) * maxLz;
      const w = bridgeLocalToWorld(br.lx, clampedLz);
      pos.x = w.x;
      pos.z = w.z;
      bumped = true;
    }
  }

  // 3. Circle obstacles (ancient oaks, boulders, windmill, hay bales, gate pillars)
  for (const c of circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const minD = c.radius + radius;
    const dSq = dx * dx + dz * dz;
    if (dSq < minD * minD && dSq > 1e-6) {
      const d = Math.sqrt(dSq);
      pos.x = c.x + (dx / d) * minD;
      pos.z = c.z + (dz / d) * minD;
      bumped = true;
    }
  }

  // 4. Axis-aligned box obstacles (barn & paddock fence runs, open through the wide East Gate)
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(b.maxX, pos.x));
    const cz = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < radius * radius) {
      bumped = true;
      if (dSq > 1e-6) {
        const d = Math.sqrt(dSq);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        const dl = Math.abs(pos.x - b.minX);
        const dr = Math.abs(b.maxX - pos.x);
        const dt = Math.abs(pos.z - b.minZ);
        const db = Math.abs(b.maxZ - pos.z);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) pos.x = b.minX - radius;
        else if (m === dr) pos.x = b.maxX + radius;
        else if (m === dt) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }

  return bumped;
}

const MeadowShepherdGame: GameModule = {
  meta: META,

  async mount(ctx: GameContext): Promise<GameInstance> {
    const host = createSceneHost({
      container: ctx.container,
      fov: 47,
      near: 0.15,
      far: 420,
      exposure: 1.04,
      shadows: true,
    });
    const { scene, camera, renderer } = host;

    // 1. Lush Sunlit Pastoral Atmosphere & 3-Point Lighting Rig
    const atmosphere = applyAtmosphere(scene, renderer, 'meadow_day', {
      skyRadius: 280,
      shadowExtent: 38,
      shadowMapSize: 2048,
      fogDensityMultiplier: 0.68,
      sunDistance: 72,
    });

    // 2. Rolling Emerald Terrain + Complete Pastoral World (11,500+ interactive grass, oaks, brook, bridge, barn, windmill)
    const terrainMesh = createMeadowTerrain();
    scene.add(terrainMesh);

    const world = buildPastoralWorld(atmosphere.sunDirection);
    scene.add(world.group);

    // 3. Wheelchair Figurine Rig (with boost glow & mounted miniature Brass Shepherd Bell!)
    const rig = await createFigurineRig({
      targetHeight: 1.65,
      headlights: false,
      boostGlow: true,
      envMapIntensity: 1.05,
    });
    scene.add(rig.root);

    const effects = createShepherdEffects();
    scene.add(effects.group);
    rig.model.add(effects.bellAttachment);

    // 4. Sunlit Ambient Pollen/Dandelion Fluff, Warm Brook Fireflies, & Celebratory Particle Systems
    const pollenParticles = createParticleSystem({
      type: 'dust',
      count: 240,
      bounds: { width: 42, height: 11, depth: 42 },
      wind: new THREE.Vector3(0.55, 0.12, 0.25),
      size: 0.21,
      colors: ['#fffbe8', '#ffeaa0', '#f4fad8'],
    });
    scene.add(pollenParticles.group);

    const fireflyParticles = createParticleSystem({
      type: 'fireflies',
      count: 75,
      bounds: { width: 58, height: 5.5, depth: 58 },
      center: new THREE.Vector3(4, 2.2, 0),
      size: 0.34,
      colors: ['#fff39c', '#dcff78', '#ffe478'],
    });
    scene.add(fireflyParticles.group);

    const confettiParticles = createParticleSystem({
      type: 'confetti',
      ambient: false,
      burstCapacity: 260,
      size: 0.18,
      colors: ['#ffd43b', '#ff6b6b', '#69db7c', '#74c0fc', '#f783ac', '#fff3bf'],
    });
    scene.add(confettiParticles.group);

    const sparkParticles = createParticleSystem({
      type: 'sparks',
      ambient: false,
      burstCapacity: 180,
      size: 0.26,
      colors: ['#ffe066', '#ffd43b', '#fff9db', '#a9e34b'],
    });
    scene.add(sparkParticles.group);

    // 5. Gameplay State
    let runTime = 0;
    let score = 0;
    let combo = 0;
    let maxCombo = 1;
    let comboTimer = 0;
    let foxesShooed = 0;
    let victory = false;
    let victoryFireworkTimer = 0;
    let paused = false;

    // Player physics state
    const playerPos = new THREE.Vector3(SPAWN_X, surfaceHeightAt(SPAWN_X, SPAWN_Z), SPAWN_Z);
    const playerVel = new THREE.Vector2(0, 0);
    let playerYaw = SPAWN_YAW;
    let forwardSpeed = 0;
    let turnRate = 0;
    let boostEnergy = 1.0;
    let bellCooldown = 0;
    let wasInWater = false;
    let bumpAudioCooldown = 0;
    let usedBellOnce = false;
    let hudTimer = 0;
    let foxAlertBannerTimer = 0;

    // Camera state
    const camPos = new THREE.Vector3(SPAWN_X, playerPos.y + 5.6, SPAWN_Z + 10.8);
    const camLook = new THREE.Vector3(SPAWN_X, playerPos.y + 1.4, SPAWN_Z - 6.0);
    let camYawOffset = 0;

    // Reusable scratch vectors (zero allocations per tick)
    const tmpNormal = new THREE.Vector3();
    const tmpFwd = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpForward2D = new THREE.Vector2();
    const tmpDesiredCam = new THREE.Vector3();
    const tmpDesiredLook = new THREE.Vector3();
    const tmpGateTarget = new THREE.Vector3(
      PADDOCK_GATE_POS.x,
      surfaceHeightAt(PADDOCK_GATE_POS.x, PADDOCK_GATE_POS.y),
      PADDOCK_GATE_POS.y,
    );

    // 6. Flock & Fox Simulation
    const flock = createFlockSystem({
      onSheepPenned(sheep) {
        if (victory) return;
        combo = comboTimer > 0 ? Math.min(5, combo + 1) : 1;
        maxCombo = Math.max(maxCombo, combo);
        comboTimer = 7.5;

        const mult = 1 + (combo - 1) * 0.5;
        const basePts = sheep.golden ? 400 : 150;
        const gained = Math.round(basePts * mult);
        score += gained;

        ctx.audio.playCombo(combo, 0.72);
        const burstPos = new THREE.Vector3(
          PADDOCK_GATE_POS.x - 1.2,
          sheep.pos.y + 1.15,
          sheep.pos.z,
        );
        sparkParticles.emitBurst(burstPos, sheep.golden ? 42 : 24, {
          speed: 4.8,
          upwardBias: 0.75,
          color: sheep.golden ? '#ffe066' : '#a9e34b',
        });
        confettiParticles.emitBurst(burstPos, sheep.golden ? 38 : 20, {
          speed: 5.5,
          upwardBias: 0.9,
        });

        const penned = flock.pennedCount();
        if (sheep.golden) {
          ctx.notify(`Golden Fleece Home! +${gained} (${penned}/${TOTAL_SHEEP})`, 'accent', 2600);
        } else if (combo >= 2) {
          ctx.notify(`Herd Combo ×${mult.toFixed(1)}! +${gained} (${penned}/${TOTAL_SHEEP})`, 'success', 2000);
        } else {
          ctx.notify(`Sheep Safely Penned! +${gained} (${penned}/${TOTAL_SHEEP})`, 'success', 1700);
        }

        if (penned >= TOTAL_SHEEP) {
          triggerVictory();
        } else {
          pushHud(true);
        }
      },
      onFoxShooed(foxPos) {
        if (victory) return;
        foxesShooed++;
        score += 250;
        foxAlertBannerTimer = 0;
        ctx.audio.playChime(7, 0.65);
        sparkParticles.emitBurst(
          new THREE.Vector3(foxPos.x, foxPos.y + 0.9, foxPos.z),
          22,
          { speed: 4.2, upwardBias: 0.6, color: '#ffa94d' },
        );
        ctx.notify('Cheeky Fox Shooed! +250', 'accent', 2200);
        pushHud(true);
      },
      onFoxSpookWarning() {
        if (victory) return;
        foxAlertBannerTimer = 5.5;
        ctx.notify('A cheeky red fox is pestering the flock — ring your bell (Space)!', 'warning', 2800);
      },
    });
    scene.add(flock.group);

    // 7. HUD & Victory Flow
    const pushHud = (force = false) => {
      if (!force && hudTimer < 0.1) return;
      hudTimer = 0;
      const penned = flock.pennedCount();
      const remaining = TOTAL_SHEEP - penned;
      const mult = comboTimer > 0 && combo > 1 ? 1 + (combo - 1) * 0.5 : 1;

      let statusText = 'Guide the flock through the golden paddock gate · Press Space to ring your bell';
      if (victory) {
        statusText = 'All 12 sheep are safely home in the sunlit paddock!';
      } else if (foxAlertBannerTimer > 0 && flock.fox.scaredTimer <= 0) {
        statusText = 'Cheeky red fox near the flock! Ring your bell (Space) to shoo it away';
      } else if (remaining <= 3) {
        statusText =
          remaining === 1
            ? 'Almost home! 1 stray sheep left in the sunlit meadow'
            : `Almost home! ${remaining} sheep left in the sunlit meadow`;
      } else if (penned > 0) {
        statusText = `${penned} safely penned · Look for gleaming Golden-Fleece sheep across the brook!`;
      }

      let promptText = '';
      if (!victory) {
        const nearSheep = flock.nearestUnpennedSheep(playerPos);
        const nearFoxDist = Math.hypot(
          flock.fox.pos.x - playerPos.x,
          flock.fox.pos.z - playerPos.z,
        );
        if (nearFoxDist < 15 && flock.fox.scaredTimer <= 0) {
          promptText = 'Press Space — Ring Bell to Shoo Fox!';
        } else if (
          !usedBellOnce &&
          nearSheep &&
          Math.hypot(nearSheep.pos.x - playerPos.x, nearSheep.pos.z - playerPos.z) < 13
        ) {
          promptText = 'Press Space — Ring Brass Shepherd Bell to Herd Flock';
        }
      }

      ctx.setHud({
        stats: [
          { label: 'Flock', value: `${penned} / ${TOTAL_SHEEP}`, accent: true },
          { label: 'Score', value: score },
          { label: 'Combo', value: `×${mult.toFixed(1)}`, accent: mult > 1 },
          { label: 'Time', value: formatClock(runTime) },
        ],
        meters: [
          { label: 'Sprint', value: boostEnergy, color: '#6cb34f' },
          { label: 'Bell', value: Math.max(0, 1 - bellCooldown / 0.72), color: '#e6b84c' },
        ],
        statusText,
        promptText,
      });
    };

    const triggerVictory = () => {
      if (victory) return;
      victory = true;
      victoryFireworkTimer = 0.05;

      const timeBonus = Math.max(200, Math.round(1800 - runTime * 8));
      score += timeBonus;
      const isNewBest = ctx.saveBestScore(score);

      ctx.audio.stopMotor();
      ctx.audio.playVictory();

      // Grand pastoral confetti celebration burst over the paddock!
      const partyCenter = new THREE.Vector3(-12.5, 2.8, 2.0);
      confettiParticles.emitBurst(partyCenter, 95, { speed: 7.4, upwardBias: 1.15 });
      confettiParticles.emitBurst(
        new THREE.Vector3(playerPos.x, playerPos.y + 2.0, playerPos.z),
        55,
        { speed: 6.2, upwardBias: 1.05 },
      );

      ctx.setHud({
        stats: [
          { label: 'Flock', value: `${TOTAL_SHEEP} / ${TOTAL_SHEEP}`, accent: true },
          { label: 'Score', value: score },
          { label: 'Time', value: formatClock(runTime) },
        ],
        statusText: 'All 12 sheep safely home!',
        promptText: '',
        result: {
          title: 'Flock Safely Home!',
          subtitle: 'Every woolly friend is cozy in the sunlit stone paddock.',
          score,
          scoreLabel: 'Shepherd Score',
          isNewBest,
          victory: true,
          stats: [
            { label: 'Flock Penned', value: `${TOTAL_SHEEP} / ${TOTAL_SHEEP}` },
            { label: 'Golden Sheep', value: `${flock.goldenPennedCount()} / 2` },
            { label: 'Time', value: formatClock(runTime) },
            { label: 'Time Bonus', value: `+${timeBonus}` },
            { label: 'Best Combo', value: `×${(1 + (maxCombo - 1) * 0.5).toFixed(1)}` },
            { label: 'Foxes Shooed', value: foxesShooed },
          ],
          onRestart: resetGame,
        },
      });
    };

    const resetGame = () => {
      runTime = 0;
      score = 0;
      combo = 0;
      maxCombo = 1;
      comboTimer = 0;
      foxesShooed = 0;
      victory = false;
      victoryFireworkTimer = 0;
      boostEnergy = 1.0;
      bellCooldown = 0;
      wasInWater = false;
      foxAlertBannerTimer = 0;

      playerPos.set(SPAWN_X, surfaceHeightAt(SPAWN_X, SPAWN_Z), SPAWN_Z);
      playerVel.set(0, 0);
      playerYaw = SPAWN_YAW;
      forwardSpeed = 0;
      turnRate = 0;
      camYawOffset = 0;

      rig.root.position.copy(playerPos);
      rig.root.rotation.set(0, playerYaw, 0);
      camPos.set(SPAWN_X, playerPos.y + 5.6, SPAWN_Z + 10.8);
      camLook.set(SPAWN_X, playerPos.y + 1.4, SPAWN_Z - 6.0);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      flock.reset();
      effects.reset();
      confettiParticles.clear();
      sparkParticles.clear();
      ctx.audio.stopMotor();
      ctx.setHud({ result: null, paused: false });
      pushHud(true);
    };

    ctx.setRestartHandler?.(resetGame);

    // Initialize starting transforms & ambient gentle meadow wind
    rig.root.position.copy(playerPos);
    rig.root.rotation.set(0, playerYaw, 0);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    ctx.audio.setAmbient('wind', 0.24);
    pushHud(true);

    // 8. Input Controller
    const input = new InputController({ target: host.canvas, axisSmoothing: 13 });

    // 9. Main Frame Loop
    host.start((dt, elapsed) => {
      input.update(dt);
      hudTimer += dt;
      if (bumpAudioCooldown > 0) bumpAudioCooldown -= dt;
      if (bellCooldown > 0) bellCooldown = Math.max(0, bellCooldown - dt);
      if (foxAlertBannerTimer > 0) foxAlertBannerTimer = Math.max(0, foxAlertBannerTimer - dt);
      if (comboTimer > 0) {
        comboTimer = Math.max(0, comboTimer - dt);
        if (comboTimer === 0) combo = 0;
      }

      if (!victory) {
        runTime += dt;
      } else {
        // Gentle celebratory confetti pulses while viewing victory screen
        victoryFireworkTimer -= dt;
        if (victoryFireworkTimer <= 0) {
          victoryFireworkTimer = 1.9;
          confettiParticles.emitBurst(
            new THREE.Vector3(-12.5 + (Math.random() - 0.5) * 6, 3.0, 2.0 + (Math.random() - 0.5) * 6),
            24,
            { speed: 5.5, upwardBias: 1.0 },
          );
        }
      }

      // --- Wheelchair Driving & Controls ---
      const rawFwd = victory ? 0 : input.forward;
      const rawTurn = victory ? 0 : input.turn;
      const wantsBoost = !victory && input.boost && Math.abs(rawFwd) > 0.12 && boostEnergy > 0.08;

      if (wantsBoost) {
        boostEnergy = Math.max(0, boostEnergy - dt * 0.36);
      } else {
        boostEnergy = Math.min(1, boostEnergy + dt * 0.26);
      }

      if (!victory && input.wasPressed('shift') && boostEnergy > 0.15) {
        ctx.audio.playBoost(0.45);
      }

      // Brass Shepherd Bell (`Space`)!
      if (!victory && input.wasPressed('space') && bellCooldown <= 0) {
        bellCooldown = 0.72;
        usedBellOnce = true;
        ctx.audio.playBell(0.88);
        effects.triggerBellWave(playerPos);

        tmpForward2D.set(-Math.sin(playerYaw), -Math.cos(playerYaw));
        const res = flock.ringBell(playerPos, tmpForward2D);
        sparkParticles.emitBurst(
          new THREE.Vector3(playerPos.x, playerPos.y + 1.15, playerPos.z),
          18,
          { speed: 4.5, upwardBias: 0.45, color: '#ffe066' },
        );
        if (res.herdedCount >= 3) {
          ctx.notify(`Chime! Rallied ${res.herdedCount} sheep!`, 'info', 1400);
        }
        pushHud(true);
      }

      // Optional subtle camera glance with Q / E or mouse drag, gently recentering while driving
      if (input.pointer.down) {
        const { dx } = input.consumePointerDelta();
        camYawOffset = THREE.MathUtils.clamp(camYawOffset - dx * 0.0045, -1.25, 1.25);
      } else {
        input.consumePointerDelta();
        const qe = (input.isDown('q') ? 1 : 0) - (input.isDown('e') ? 1 : 0);
        if (qe !== 0) {
          camYawOffset = THREE.MathUtils.clamp(camYawOffset + qe * dt * 1.4, -1.25, 1.25);
        } else if (Math.abs(rawFwd) > 0.2 || Math.abs(rawTurn) > 0.2) {
          camYawOffset *= Math.exp(-dt * 2.2);
        }
      }

      const inWaterNow = isInWater(playerPos.x, playerPos.z);
      if (inWaterNow && !wasInWater) {
        ctx.audio.playSplash(0.55);
        sparkParticles.emitBurst(
          new THREE.Vector3(playerPos.x, playerPos.y + 0.3, playerPos.z),
          14,
          { speed: 3.0, upwardBias: 0.85, color: '#d0f4ff' },
        );
      }
      wasInWater = inWaterNow;

      const waterDrag = inWaterNow ? 0.78 : 1.0;
      const maxForward = (wantsBoost ? 14.2 : 9.8) * waterDrag;
      const maxReverse = 5.2 * waterDrag;
      const targetSpeed = rawFwd >= 0 ? rawFwd * maxForward : rawFwd * maxReverse;
      const accelRate = Math.abs(targetSpeed) > Math.abs(forwardSpeed) ? 6.8 : 9.2;
      forwardSpeed += (targetSpeed - forwardSpeed) * (1 - Math.exp(-accelRate * dt));
      if (Math.abs(forwardSpeed) < 0.02 && Math.abs(rawFwd) < 0.02) forwardSpeed = 0;

      // Crisp differential power-chair steering (works seamlessly both rolling and pivoting!)
      const turnDir = forwardSpeed < -0.6 ? -1 : 1;
      const targetTurn = rawTurn * turnDir * (wantsBoost ? 2.15 : 2.55);
      turnRate += (targetTurn - turnRate) * (1 - Math.exp(-12 * dt));
      playerYaw += turnRate * dt;

      const fwdX = -Math.sin(playerYaw);
      const fwdZ = -Math.cos(playerYaw);
      playerVel.set(fwdX * forwardSpeed, fwdZ * forwardSpeed);

      const prevY = playerPos.y;
      playerPos.x += playerVel.x * dt;
      playerPos.z += playerVel.y * dt;

      const bumped = resolvePlayerCollisions(
        playerPos,
        0.72,
        world.obstaclesCircles,
        world.obstaclesBoxes,
      );
      if (bumped && Math.abs(forwardSpeed) > 3.2 && bumpAudioCooldown <= 0) {
        bumpAudioCooldown = 0.45;
        ctx.audio.playBump(Math.min(0.65, Math.abs(forwardSpeed) / 14));
        forwardSpeed *= 0.65;
      }

      const nextY = surfaceHeightAt(playerPos.x, playerPos.z);
      const groundBump = THREE.MathUtils.clamp((nextY - prevY) * 1.4, -0.3, 0.3);
      playerPos.y = nextY;

      // Align wheelchair chassis subtly to terrain & footbridge arch slope!
      surfaceNormalAt(playerPos.x, playerPos.z, tmpNormal);
      tmpFwd.set(fwdX, 0, fwdZ);
      tmpRight.set(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
      const slopePitch = THREE.MathUtils.clamp(
        -Math.asin(THREE.MathUtils.clamp(tmpNormal.dot(tmpFwd), -0.55, 0.55)),
        -0.34,
        0.34,
      );
      const slopeRoll = THREE.MathUtils.clamp(
        -Math.asin(THREE.MathUtils.clamp(tmpNormal.dot(tmpRight), -0.55, 0.55)),
        -0.28,
        0.28,
      );

      rig.root.position.copy(playerPos);
      rig.root.rotation.y = playerYaw;
      rig.update(dt, {
        speed: forwardSpeed,
        turnRate,
        groundBump,
        boost: wantsBoost,
        tiltX: slopePitch,
        tiltZ: slopeRoll,
      });

      // Continuous tactile electric drive motor sound
      if (!victory) {
        ctx.audio.setMotor(Math.min(1, Math.abs(forwardSpeed) / 10.5), {
          boost: wantsBoost,
          surface: inWaterNow ? 'water' : 'gravel',
        });
      }

      // --- Update Flock, Fox, World Flora & Effects ---
      flock.update(dt, elapsed, playerPos, playerVel, world.obstaclesCircles, world.obstaclesBoxes);
      world.update(dt, elapsed, playerPos, scene);
      effects.update(dt, elapsed);

      // Update tasteful ground guide chevron (points to nearest stray sheep, or to Paddock Gate when herding!)
      if (!victory) {
        const nearest = flock.nearestUnpennedSheep(playerPos);
        if (nearest) {
          const distToNearest = Math.hypot(
            nearest.pos.x - playerPos.x,
            nearest.pos.z - playerPos.z,
          );
          if (distToNearest < 10.5) {
            effects.updateGuideArrow(playerPos, tmpGateTarget, true, elapsed);
          } else {
            effects.updateGuideArrow(playerPos, nearest.pos, false, elapsed);
          }
        } else {
          effects.updateGuideArrow(playerPos, null, false, elapsed);
        }
      } else {
        effects.updateGuideArrow(playerPos, null, false, elapsed);
      }

      // --- Smooth Elevated Pastoral Follow Camera ---
      const camYaw = playerYaw + camYawOffset;
      const backX = Math.sin(camYaw);
      const backZ = Math.cos(camYaw);
      const followDist = wantsBoost ? 11.4 : 10.5;
      const followHeight = wantsBoost ? 5.9 : 5.5;

      tmpDesiredCam.set(
        playerPos.x + backX * followDist,
        playerPos.y + followHeight,
        playerPos.z + backZ * followDist,
      );
      const camGroundY = terrainHeightAt(tmpDesiredCam.x, tmpDesiredCam.z);
      if (tmpDesiredCam.y < camGroundY + 1.85) {
        tmpDesiredCam.y = camGroundY + 1.85;
      }

      tmpDesiredLook.set(
        playerPos.x - backX * 2.8,
        playerPos.y + 1.45,
        playerPos.z - backZ * 2.8,
      );

      const camAlpha = 1 - Math.exp(-5.8 * dt);
      camPos.lerp(tmpDesiredCam, camAlpha);
      camLook.lerp(tmpDesiredLook, 1 - Math.exp(-7.5 * dt));
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      const targetFov = wantsBoost ? 50.5 : 47.0;
      if (Math.abs(camera.fov - targetFov) > 0.04) {
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * dt));
        camera.updateProjectionMatrix();
      }

      // --- Update Atmosphere Sky Dome, Dynamic Shadow Frustum & Ambient Particles ---
      atmosphere.update(elapsed, camera.position);

      // Quantized shadow target tracking around wheelchair so shadows stay crisp across entire valley
      const sx = Math.round(playerPos.x * 1.5) / 1.5;
      const sz = Math.round(playerPos.z * 1.5) / 1.5;
      atmosphere.sunLight.target.position.set(sx, playerPos.y, sz);
      atmosphere.sunLight.position
        .copy(atmosphere.sunDirection)
        .multiplyScalar(72)
        .add(atmosphere.sunLight.target.position);
      atmosphere.sunLight.target.updateMatrixWorld();

      pollenParticles.update(dt, playerPos);
      fireflyParticles.update(dt);
      confettiParticles.update(dt);
      sparkParticles.update(dt);

      pushHud(false);
      input.endFrame();
    });

    return {
      setPaused(nextPaused: boolean) {
        paused = nextPaused;
        host.setPaused(paused);
        if (paused) {
          ctx.audio.stopMotor();
        }
      },
      dispose() {
        ctx.audio.stopMotor();
        ctx.audio.setAmbient('none');
        ctx.setRestartHandler?.(null);
        input.dispose();
        effects.dispose();
        rig.dispose();
        world.dispose();
        pollenParticles.dispose();
        fireflyParticles.dispose();
        confettiParticles.dispose();
        sparkParticles.dispose();
        atmosphere.dispose();
        host.dispose();
      },
    };
  },
};

export default MeadowShepherdGame;
