import * as THREE from 'three';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameMeta, GameModule, HudMeter } from '../../engine/types';
import { buildLivingLibraryArena, type ArenaObstacle } from './arena';
import { createEnemyManager, type EnemyEntity, type EnemyKind } from './enemies';
import {
  createInitialBuild,
  createTomeChoiceOverlay,
  pickThreeUpgrades,
  type PlayerBuild,
  type UpgradeDefinition,
} from './upgrades';
import { createArcaneArsenal } from './weapons';

const GAME_META: GameMeta = {
  id: 'living-library',
  number: 8,
  title: 'Living Library',
  subtitle: 'Arcane Conservatory Survivor',
  genre: 'Arcane Survivor',
  style: 'Botanical Archive',
  accentColor: '#4F8A7B',
  controls: [
    { keys: 'WASD / Arrows', action: 'Glide Through Hall' },
    { keys: 'Space / Shift', action: 'Arcane Shockwave Dash' },
    { keys: '1 / 2 / 3', action: 'Choose Arcane Tome' },
    { keys: 'R', action: 'Restart Run' },
  ],
  objective:
    'Weave through the candlelit glasshouse library, level up your arcane arsenal, and vanquish the Archivist Gargoyle Tome.',
};

interface WaveConfig {
  number: number;
  title: string;
  startSec: number;
  spawnInterval: number;
  maxEnemies: number;
  scale: number;
  weights: { bat: number; grimoire: number; golem: number };
}

const WAVES: readonly WaveConfig[] = [
  {
    number: 1,
    title: 'Awakening Stacks',
    startSec: 0,
    spawnInterval: 1.55,
    maxEnemies: 14,
    scale: 1.0,
    weights: { bat: 0.58, grimoire: 0.42, golem: 0 },
  },
  {
    number: 2,
    title: 'Flocking Folios',
    startSec: 26,
    spawnInterval: 1.22,
    maxEnemies: 20,
    scale: 1.22,
    weights: { bat: 0.42, grimoire: 0.44, golem: 0.14 },
  },
  {
    number: 3,
    title: 'Clockwork Surge',
    startSec: 54,
    spawnInterval: 1.0,
    maxEnemies: 26,
    scale: 1.5,
    weights: { bat: 0.34, grimoire: 0.42, golem: 0.24 },
  },
  {
    number: 4,
    title: 'Unbound Archive',
    startSec: 84,
    spawnInterval: 0.82,
    maxEnemies: 32,
    scale: 1.82,
    weights: { bat: 0.32, grimoire: 0.4, golem: 0.28 },
  },
  {
    number: 5,
    title: "Archivist's Reckoning",
    startSec: 112,
    spawnInterval: 2.35,
    maxEnemies: 16,
    scale: 1.95,
    weights: { bat: 0.5, grimoire: 0.35, golem: 0.15 },
  },
];

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function resolveCircleObstacles(
  x: number,
  z: number,
  entityRadius: number,
  arenaRadius: number,
  obstacles: readonly ArenaObstacle[]
): { x: number; z: number } {
  let rx = x;
  let rz = z;

  // Push smoothly out of circular conservatory garden beds
  for (const obs of obstacles) {
    const dx = rx - obs.x;
    const dz = rz - obs.z;
    const dist = Math.hypot(dx, dz);
    const minDist = obs.radius + entityRadius;
    if (dist < minDist) {
      if (dist > 0.0001) {
        const push = minDist - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        rx += minDist;
      }
    }
  }

  // Clamp cleanly inside grand marble hall perimeter
  const maxR = arenaRadius - entityRadius;
  const distCenter = Math.hypot(rx, rz);
  if (distCenter > maxR && distCenter > 0.0001) {
    rx = (rx / distCenter) * maxR;
    rz = (rz / distCenter) * maxR;
  }

  return { x: rx, z: rz };
}

function pickWaveForTime(sec: number): WaveConfig {
  for (let i = WAVES.length - 1; i >= 0; i--) {
    if (sec >= WAVES[i].startSec) return WAVES[i];
  }
  return WAVES[0];
}

function xpThresholdForLevel(level: number): number {
  return Math.round(45 + (level - 1) * 32 + Math.pow(level - 1, 1.35) * 14);
}

const LivingLibraryGame: GameModule = {
  meta: GAME_META,

  async mount(ctx: GameContext): Promise<GameInstance> {
    const host = createSceneHost({
      container: ctx.container,
      fov: 44,
      near: 0.2,
      far: 260,
      exposure: 1.04,
      shadows: true,
    });

    const input = new InputController({ target: host.canvas, axisSmoothing: 14 });
    const arena = buildLivingLibraryArena(host.scene, host.renderer);
    const enemyMgr = createEnemyManager(host.scene);
    const arsenal = createArcaneArsenal(host.scene);
    let externalPaused = false;
    const tomeOverlay = createTomeChoiceOverlay(ctx.container, () => !externalPaused);

    // Load the hero 3D Wheelchair Figurine
    const rig = await createFigurineRig({
      targetHeight: 1.72,
      headlights: true,
      boostGlow: true,
      envMapIntensity: 1.12,
      castShadow: true,
      receiveShadow: true,
    });
    rig.setHeadlightIntensity(1.15);
    host.scene.add(rig.root);

    // Subtle glowing turquoise-gold ground aura ring around the figurine for crisp combat readability
    const playerAuraGeo = new THREE.RingGeometry(0.62, 0.78, 32);
    const playerAuraMat = new THREE.MeshBasicMaterial({
      color: 0x62f2c8,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const playerAuraMesh = new THREE.Mesh(playerAuraGeo, playerAuraMat);
    playerAuraMesh.rotation.x = -Math.PI / 2;
    playerAuraMesh.position.y = 0.035;
    rig.root.add(playerAuraMesh);

    // Gate ALL WebAudio calls behind a real user gesture so deep-links emit ZERO Chrome warnings
    const navAct = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    let audioUnlocked = Boolean(navAct?.hasBeenActive);
    let disposed = false;

    const unlockAudio = () => {
      if (audioUnlocked || disposed) return;
      audioUnlocked = true;
      ctx.audio.resume();
      ctx.audio.setAmbient('wind', 0.032);
      window.removeEventListener('keydown', unlockAudio, true);
      window.removeEventListener('pointerdown', unlockAudio, true);
    };
    if (audioUnlocked) {
      ctx.audio.setAmbient('wind', 0.032);
    } else {
      window.addEventListener('keydown', unlockAudio, true);
      window.addEventListener('pointerdown', unlockAudio, true);
    }

    // Core run state
    let build: PlayerBuild = createInitialBuild();
    let playerX = 0;
    let playerZ = 1.6;
    let velX = 0;
    let velZ = 0;
    let playerYaw = 0; // Facing North (-Z) toward the grand conservatory apse
    const playerRadius = 0.64;

    let hp = build.maxHp;
    let xp = 0;
    let xpNeeded = xpThresholdForLevel(1);
    let level = 1;
    let score = 0;
    let kills = 0;
    let runTime = 0;
    let currentWaveNum = 1;
    let bossSpawned = false;

    let dashCooldownLeft = 0;
    let dashTimer = 0;
    let dashDirX = 0;
    let dashDirZ = -1;
    let invulnTimer = 0;
    let hurtFlashTimer = 0;

    let lightningTimer = 0.7;
    let novaTimer = 0.55;
    let spawnTimer = 0.85;
    let gemComboStep = 0;
    let gemComboReset = 0;

    let shakeIntensity = 0;
    let hasMoved = false;
    let hasDashed = false;
    let gameOver = false;
    let hudAccumulator = 0;

    // Reusable scratch vectors
    const playerPosVec = new THREE.Vector3();
    const camTargetPos = new THREE.Vector3();
    const camLookTarget = new THREE.Vector3();
    const camCurrentPos = new THREE.Vector3(0, 14.4, 15.2);
    const camCurrentLook = new THREE.Vector3(0, 0.7, 0.4);
    const burstPos = new THREE.Vector3();

    const triggerDamagePlayer = (amount: number, sourceX: number, sourceZ: number) => {
      if (invulnTimer > 0 || gameOver) return;
      hp = Math.max(0, hp - amount);
      invulnTimer = 0.68;
      hurtFlashTimer = 0.35;
      shakeIntensity = Math.min(0.65, shakeIntensity + 0.38);

      // Gentle pushback away from threat
      const dx = playerX - sourceX;
      const dz = playerZ - sourceZ;
      const dist = Math.hypot(dx, dz) || 1;
      velX += (dx / dist) * 5.2;
      velZ += (dz / dist) * 5.2;

      burstPos.set(playerX, 1.0, playerZ);
      arena.sparks.emitBurst(burstPos, 16, { speed: 6.5, color: '#ff6075', upwardBias: 2.2 });

      if (audioUnlocked) ctx.audio.playBump(0.85);

      if (hp <= 0) {
        finishRun(false);
      }
    };

    const handleEnemyKill = (res: {
      killed: boolean;
      x: number;
      z: number;
      xp: number;
      score: number;
      kind: EnemyKind;
    }) => {
      if (!res.killed) return;
      kills += 1;
      score += res.score;
      burstPos.set(res.x, 1.05, res.z);
      arena.sparks.emitBurst(burstPos, res.kind === 'boss' ? 65 : res.kind === 'golem' ? 28 : 14, {
        speed: res.kind === 'boss' ? 11 : 6.5,
        color: res.kind === 'boss' ? '#ffd870' : res.kind === 'golem' ? '#63ffe0' : '#f4cf7a',
        upwardBias: 3.0,
      });

      if (res.kind === 'boss') {
        arena.confetti.emitBurst(burstPos, 95, { speed: 9.5, upwardBias: 5.5, lifeRange: [1.6, 3.0] });
        arsenal.spawnShockwave(res.x, res.z, 11.5, 0x62f2c8);
        shakeIntensity = 0.75;
        finishRun(true);
        return;
      }

      if (res.kind === 'golem') {
        // Heavy elites burst into 2 shiny knowledge crystals
        arsenal.spawnGem(res.x - 0.35, res.z, Math.round(res.xp * 0.55));
        arsenal.spawnGem(res.x + 0.35, res.z + 0.25, Math.round(res.xp * 0.55));
      } else {
        arsenal.spawnGem(res.x, res.z, res.xp);
      }
    };

    const pushHud = (force = false) => {
      const waveCfg = pickWaveForTime(runTime);
      const boss = enemyMgr.boss;
      const hpRatio = hp / Math.max(1, build.maxHp);
      const xpRatio = xp / Math.max(1, xpNeeded);
      const dashReadyRatio =
        dashCooldownLeft <= 0 ? 1 : 1 - dashCooldownLeft / Math.max(0.1, build.dashCooldown);

      const meters: HudMeter[] = [
        {
          label: `HP ${Math.ceil(hp)}/${build.maxHp}`,
          value: hpRatio,
          color: hpRatio < 0.32 ? '#e05363' : '#58c492',
        },
        {
          label: `XP · LV ${level}`,
          value: xpRatio,
          color: '#57d4ff',
        },
        {
          label: dashCooldownLeft <= 0 ? 'DASH READY' : 'DASH',
          value: dashReadyRatio,
          color: dashCooldownLeft <= 0 ? '#f2ca68' : '#968052',
        },
      ];

      if (boss) {
        meters.push({
          label: 'GARGOYLE TOME',
          value: Math.max(0, boss.hp / boss.maxHp),
          color: '#d9486a',
        });
      }

      let promptText = '';
      if (tomeOverlay.isOpen) {
        promptText = 'Select an Arcane Tome — Click a card or press 1 / 2 / 3';
      } else if (!hasMoved && runTime < 12) {
        promptText = 'WASD / Arrows to glide · Auto-cast weapons fire automatically · Space to Shockwave Dash';
      } else if (!hasDashed && dashCooldownLeft <= 0 && runTime > 4 && runTime < 20) {
        promptText = 'Press Space for Arcane Shockwave Dash (invulnerable blast + knockback)';
      }

      const statusText = boss
        ? `BOSS · The Archivist's Gargoyle Tome · ${formatClock(runTime)}`
        : `Wave ${waveCfg.number}/5 · ${waveCfg.title} · ${formatClock(runTime)}`;

      ctx.setHud({
        stats: [
          { label: 'Wave', value: boss ? 'BOSS' : `${waveCfg.number}/5` },
          { label: 'Level', value: level },
          { label: 'Banished', value: kills },
          { label: 'Score', value: score.toLocaleString(), accent: true },
        ],
        meters,
        statusText,
        promptText,
        ...(force && !gameOver ? { result: null } : {}),
      });
    };

    const finishRun = (victory: boolean) => {
      if (gameOver) return;
      gameOver = true;
      tomeOverlay.close();
      if (audioUnlocked) {
        ctx.audio.stopMotor();
        if (victory) ctx.audio.playVictory();
        else ctx.audio.playGameOver();
      }

      const timeBonus = Math.round(runTime * (victory ? 12 : 4));
      const finalScore = score + timeBonus;
      score = finalScore;
      const isNewBest = ctx.saveBestScore(finalScore);

      ctx.setHud({
        result: {
          title: victory ? 'Archive Restored!' : 'Overwhelmed by the Stacks',
          subtitle: victory
            ? "You banished the Archivist's Gargoyle Tome and pacified the Grand Glasshouse Library."
            : 'The enchanted grimoires reclaimed the conservatory hall — refine your arcane build and return!',
          score: finalScore,
          scoreLabel: 'Arcane Score',
          isNewBest,
          victory,
          stats: [
            { label: 'Wave Reached', value: bossSpawned ? 'Boss (5/5)' : `${currentWaveNum}/5` },
            { label: 'Arcane Level', value: level },
            { label: 'Foes Banished', value: kills },
            { label: 'Time Survived', value: formatClock(runTime) },
          ],
          onRestart: () => resetRun(),
        },
      });
    };

    const openLevelUpChoice = () => {
      const options = pickThreeUpgrades(build, hp / Math.max(1, build.maxHp));
      if (options.length === 0) return;

      if (audioUnlocked) {
        ctx.audio.stopMotor();
        ctx.audio.playBell(0.7);
      }

      tomeOverlay.open(level, options, build, (chosen: UpgradeDefinition) => {
        chosen.apply(build, (healAmt) => {
          hp = Math.min(build.maxHp, hp + healAmt);
        });
        arsenal.syncAstrolabes(build.astrolabeCount, build.astrolabeRadius);

        // Celebratory level-up arcane pulse that pushes nearby foes back cleanly!
        arsenal.spawnShockwave(playerX, playerZ, 6.2, 0x62f2c8);
        for (let i = enemyMgr.enemies.length - 1; i >= 0; i--) {
          const e = enemyMgr.enemies[i];
          const dx = e.x - playerX;
          const dz = e.z - playerZ;
          const d = Math.hypot(dx, dz) || 1;
          if (d < 6.4) {
            const res = enemyMgr.damageEnemy(e, 18 * build.globalDamageMul, (dx / d) * 10, (dz / d) * 10);
            handleEnemyKill(res);
          }
        }

        burstPos.set(playerX, 1.3, playerZ);
        arena.sparks.emitBurst(burstPos, 28, { speed: 7.5, color: '#63ffe0', upwardBias: 3.4 });

        if (audioUnlocked) ctx.audio.playChime(7, 0.55);
        ctx.notify(`Bound ${chosen.title}!`, 'accent', 2200);
        invulnTimer = Math.max(invulnTimer, 0.55);
        pushHud();
      });
      pushHud();
    };

    const triggerShockwaveDash = (moveX: number, moveZ: number) => {
      hasDashed = true;
      dashCooldownLeft = build.dashCooldown;
      dashTimer = 0.26;
      invulnTimer = Math.max(invulnTimer, 0.42);

      // Dash along current move input, or along current facing direction (-sin(yaw), -cos(yaw))
      const mLen = Math.hypot(moveX, moveZ);
      if (mLen > 0.1) {
        dashDirX = moveX / mLen;
        dashDirZ = moveZ / mLen;
      } else {
        dashDirX = -Math.sin(playerYaw);
        dashDirZ = -Math.cos(playerYaw);
      }

      velX = dashDirX * 21.5;
      velZ = dashDirZ * 21.5;

      // Golden Rune Shockwave Ring knocking back & damaging surrounding foes!
      arsenal.spawnShockwave(playerX, playerZ, build.dashRadius, 0xffd578);
      burstPos.set(playerX, 0.85, playerZ);
      arena.sparks.emitBurst(burstPos, 30, { speed: 8.5, color: '#ffe082', upwardBias: 2.6 });
      shakeIntensity = Math.min(0.6, shakeIntensity + 0.28);

      const blastDmg = build.dashDamage * build.globalDamageMul;
      for (let i = enemyMgr.enemies.length - 1; i >= 0; i--) {
        const e = enemyMgr.enemies[i];
        const dx = e.x - playerX;
        const dz = e.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist <= build.dashRadius + e.radius) {
          const nx = dist > 0.001 ? dx / dist : dashDirX;
          const nz = dist > 0.001 ? dz / dist : dashDirZ;
          const res = enemyMgr.damageEnemy(e, blastDmg, nx * 13.5, nz * 13.5);
          handleEnemyKill(res);
        }
      }

      if (audioUnlocked) {
        ctx.audio.playBoost(0.72);
        ctx.audio.playChime(4, 0.4);
      }
    };

    const spawnPerimeterEnemy = (kind: EnemyKind, waveScale: number) => {
      // Spawn from the grand library archways around the northern, western, eastern, or subtle southern flanks
      const angle = Math.random() * Math.PI * 2;
      const dist = arena.playableRadius - 1.15;
      const sx = Math.cos(angle) * dist;
      const sz = Math.sin(angle) * dist;
      const resolved = resolveCircleObstacles(sx, sz, 1.1, arena.playableRadius, arena.obstacles);
      enemyMgr.spawn(kind, resolved.x, resolved.z, waveScale);
    };

    const resetRun = () => {
      tomeOverlay.close();
      enemyMgr.clear();
      arsenal.clear();

      build = createInitialBuild();
      arsenal.syncAstrolabes(build.astrolabeCount, build.astrolabeRadius);

      playerX = 0;
      playerZ = 1.8;
      velX = 0;
      velZ = 0;
      playerYaw = 0;
      hp = build.maxHp;
      xp = 0;
      xpNeeded = xpThresholdForLevel(1);
      level = 1;
      score = 0;
      kills = 0;
      runTime = 0;
      currentWaveNum = 1;
      bossSpawned = false;

      dashCooldownLeft = 0;
      dashTimer = 0;
      invulnTimer = 0.8;
      hurtFlashTimer = 0;
      lightningTimer = 0.9;
      novaTimer = 0.65;
      spawnTimer = 1.0;
      gemComboStep = 0;
      gemComboReset = 0;
      shakeIntensity = 0;
      gameOver = false;
      hudAccumulator = 0;

      rig.root.position.set(playerX, 0, playerZ);
      rig.root.rotation.y = playerYaw;
      camCurrentPos.set(playerX, 14.2, playerZ + 13.6);
      camCurrentLook.set(playerX, 0.75, playerZ - 1.0);
      host.camera.position.copy(camCurrentPos);
      host.camera.lookAt(camCurrentLook);

      // Seed immediate scenic opening pack so the grand conservatory bursts with motion right away!
      const openerSpots: Array<{ kind: EnemyKind; x: number; z: number }> = [
        { kind: 'bat', x: -7.6, z: -6.4 },
        { kind: 'bat', x: 7.8, z: -6.2 },
        { kind: 'grimoire', x: -5.4, z: -10.8 },
        { kind: 'grimoire', x: 5.4, z: -10.8 },
      ];
      for (const s of openerSpots) {
        enemyMgr.spawn(s.kind, s.x, s.z, 1.0);
      }

      pushHud(true);
      ctx.notify('Wave 1 · The Living Library Awakens!', 'info', 2400);
    };

    ctx.setRestartHandler?.(resetRun);
    resetRun();

    // Main 60 FPS Simulation & Render Tick
    host.start((dt, elapsed) => {
      input.update(dt);

      // Quick restart on R (when not in pause overlay)
      if (!externalPaused && !tomeOverlay.isOpen && input.wasPressed('r')) {
        resetRun();
        input.endFrame();
        return;
      }

      const simActive = !externalPaused && !tomeOverlay.isOpen && !gameOver;

      if (simActive) {
        runTime += dt;
        if (dashCooldownLeft > 0) dashCooldownLeft = Math.max(0, dashCooldownLeft - dt);
        if (dashTimer > 0) dashTimer = Math.max(0, dashTimer - dt);
        if (invulnTimer > 0) invulnTimer = Math.max(0, invulnTimer - dt);
        if (hurtFlashTimer > 0) hurtFlashTimer = Math.max(0, hurtFlashTimer - dt);
        if (gemComboReset > 0) {
          gemComboReset -= dt;
          if (gemComboReset <= 0) gemComboStep = 0;
        }

        // 1. Silky 360° Camera-Space Wheelchair Movement
        let moveX = input.rawStrafe(); // +1 right (+X), -1 left (-X)
        let moveZ = -input.rawForward(); // W -> -Z (North), S -> +Z (South)
        const moveMag = Math.hypot(moveX, moveZ);
        if (moveMag > 1e-4) {
          moveX /= moveMag;
          moveZ /= moveMag;
          hasMoved = true;
        }

        // Trigger Arcane Shockwave Dash on Space or Shift
        if (dashCooldownLeft <= 0 && (input.wasPressed('space') || input.wasPressed('shift'))) {
          triggerShockwaveDash(moveX, moveZ);
        }

        const prevYaw = playerYaw;
        if (dashTimer > 0) {
          // Maintain crisp high-speed dash impulse
          velX = THREE.MathUtils.lerp(velX, dashDirX * 19.5, 1 - Math.exp(-10 * dt));
          velZ = THREE.MathUtils.lerp(velZ, dashDirZ * 19.5, 1 - Math.exp(-10 * dt));
          const targetYaw = Math.atan2(-dashDirX, -dashDirZ);
          playerYaw = wrapAngle(playerYaw + wrapAngle(targetYaw - playerYaw) * (1 - Math.exp(-18 * dt)));
        } else {
          const targetVx = moveX * build.moveSpeed;
          const targetVz = moveZ * build.moveSpeed;
          const accelRate = moveMag > 0.05 ? 14.5 : 12.0;
          const alpha = 1 - Math.exp(-accelRate * dt);
          velX += (targetVx - velX) * alpha;
          velZ += (targetVz - velZ) * alpha;

          if (moveMag > 0.05) {
            const targetYaw = Math.atan2(-moveX, -moveZ);
            playerYaw = wrapAngle(
              playerYaw + wrapAngle(targetYaw - playerYaw) * (1 - Math.exp(-13.5 * dt))
            );
          }
        }

        playerX += velX * dt;
        playerZ += velZ * dt;

        // Smooth circular collision against grand hall perimeter & 4 botanical garden beds
        const resolved = resolveCircleObstacles(
          playerX,
          playerZ,
          playerRadius,
          arena.playableRadius,
          arena.obstacles
        );
        playerX = resolved.x;
        playerZ = resolved.z;

        const speed = Math.hypot(velX, velZ);
        const turnRate = THREE.MathUtils.clamp(wrapAngle(playerYaw - prevYaw) / Math.max(dt, 0.001), -8, 8);

        rig.root.position.set(playerX, 0, playerZ);
        rig.root.rotation.y = playerYaw;
        rig.update(dt, {
          speed,
          turnRate,
          boost: dashTimer > 0,
        });

        // Subtle wheelchair motor hum (gated cleanly behind user gesture!)
        if (audioUnlocked) {
          ctx.audio.setMotor(Math.min(1.25, speed / 9.0), {
            boost: dashTimer > 0,
            surface: 'smooth',
          });
        }

        // Visual feedback on ground aura (golden during dash, rose-red on hit, emerald-teal normal)
        if (hurtFlashTimer > 0) {
          playerAuraMat.color.setHex(0xff5e72);
          playerAuraMat.opacity = 0.65;
        } else if (dashTimer > 0) {
          playerAuraMat.color.setHex(0xffd970);
          playerAuraMat.opacity = 0.72;
        } else {
          playerAuraMat.color.setHex(0x62f2c8);
          playerAuraMat.opacity = 0.34 + Math.sin(elapsed * 3.2) * 0.06;
        }

        // 2. Wave Director & Boss Arrival
        const waveCfg = pickWaveForTime(runTime);
        if (waveCfg.number > currentWaveNum) {
          currentWaveNum = waveCfg.number;
          if (waveCfg.number < 5) {
            ctx.notify(`Wave ${waveCfg.number} · ${waveCfg.title}!`, 'warning', 2600);
            if (audioUnlocked) ctx.audio.playBell(0.55);
          }
        }

        if (waveCfg.number === 5 && !bossSpawned) {
          bossSpawned = true;
          const boss = enemyMgr.spawn('boss', 0, -12.0, 1.0);
          arsenal.spawnShockwave(boss.x, boss.z, 8.0, 0xff5a76);
          shakeIntensity = 0.55;
          arena.setRuneIntensity(0.68);
          ctx.notify("BOSS APPROACHES · The Archivist's Gargoyle Tome!", 'warning', 4200);
          if (audioUnlocked) ctx.audio.playBell(0.85);
        }

        spawnTimer -= dt;
        if (spawnTimer <= 0 && enemyMgr.enemies.length < waveCfg.maxEnemies) {
          spawnTimer = waveCfg.spawnInterval * (0.85 + Math.random() * 0.3);
          const roll = Math.random();
          let kind: EnemyKind = 'bat';
          if (roll < waveCfg.weights.bat) kind = 'bat';
          else if (roll < waveCfg.weights.bat + waveCfg.weights.grimoire) kind = 'grimoire';
          else kind = 'golem';
          spawnPerimeterEnemy(kind, waveCfg.scale);
        }

        // 3. Auto-Cast Signature Arcane Arsenal
        // 3a. Orbiting Brass Astrolabes
        const orbPositions = arsenal.updateAstrolabes(
          dt,
          elapsed,
          playerX,
          playerZ,
          build.astrolabeRadius,
          build.astrolabeSpeed
        );
        const astroDmg = build.astrolabeDamage * build.globalDamageMul;
        for (const orb of orbPositions) {
          for (let i = enemyMgr.enemies.length - 1; i >= 0; i--) {
            const e = enemyMgr.enemies[i];
            if (e.astrolabeHitCooldown > 0) continue;
            const dx = e.x - orb.x;
            const dz = e.z - orb.z;
            const dist = Math.hypot(dx, dz);
            if (dist < orb.radius + e.radius) {
              e.astrolabeHitCooldown = 0.28;
              const kdx = e.x - playerX;
              const kdz = e.z - playerZ;
              const kd = Math.hypot(kdx, kdz) || 1;
              burstPos.set(e.x, 1.0, e.z);
              arena.sparks.emitBurst(burstPos, 7, { speed: 4.5, color: '#f5d276', upwardBias: 1.4 });
              if (audioUnlocked) ctx.audio.playChime(2, 0.2);
              const res = enemyMgr.damageEnemy(e, astroDmg, (kdx / kd) * 6.2, (kdz / kd) * 6.2);
              handleEnemyKill(res);
            }
          }
        }

        // 3b. Spectacle Chain-Lightning (snaps from the figurine's glasses!)
        lightningTimer -= dt;
        if (lightningTimer <= 0 && enemyMgr.enemies.length > 0) {
          // Find closest enemy within lightningRange
          let firstTarget: EnemyEntity | null = null;
          let bestDist = build.lightningRange;
          for (const e of enemyMgr.enemies) {
            const d = Math.hypot(e.x - playerX, e.z - playerZ);
            if (d < bestDist) {
              bestDist = d;
              firstTarget = e;
            }
          }

          if (firstTarget) {
            lightningTimer = build.lightningCooldown;
            const struck: EnemyEntity[] = [firstTarget];
            const struckIds = new Set<number>([firstTarget.id]);

            // Chain to subsequent closest un-struck foes
            let anchor = firstTarget;
            for (let c = 1; c < build.lightningChains; c++) {
              let nextBest: EnemyEntity | null = null;
              let nextDist = 6.8;
              for (const cand of enemyMgr.enemies) {
                if (struckIds.has(cand.id)) continue;
                const d = Math.hypot(cand.x - anchor.x, cand.z - anchor.z);
                if (d < nextDist) {
                  nextDist = d;
                  nextBest = cand;
                }
              }
              if (!nextBest) break;
              struck.push(nextBest);
              struckIds.add(nextBest.id);
              anchor = nextBest;
            }

            // Origin right at the figurine's spectacles!
            const glassesOrigin = new THREE.Vector3(
              playerX - Math.sin(playerYaw) * 0.22,
              1.42,
              playerZ - Math.cos(playerYaw) * 0.22
            );
            const arcPoints: THREE.Vector3[] = [glassesOrigin];
            for (const target of struck) {
              arcPoints.push(new THREE.Vector3(target.x, target.kind === 'boss' ? 1.65 : 1.05, target.z));
            }
            arsenal.spawnChainLightning(arcPoints);
            if (audioUnlocked) ctx.audio.playLaser(5, 0.28);

            const baseZap = build.lightningDamage * build.globalDamageMul;
            for (let idx = 0; idx < struck.length; idx++) {
              const target = struck[idx];
              const falloff = Math.pow(0.88, idx);
              const dx = target.x - playerX;
              const dz = target.z - playerZ;
              const d = Math.hypot(dx, dz) || 1;
              burstPos.set(target.x, 1.1, target.z);
              arena.sparks.emitBurst(burstPos, 8, { speed: 5.5, color: '#63ffe0', upwardBias: 1.8 });
              const res = enemyMgr.damageEnemy(target, baseZap * falloff, (dx / d) * 4.5, (dz / d) * 4.5);
              handleEnemyKill(res);
            }
          }
        }

        // 3c. Bow-Tie Nova Bolt (crimson-gold salvo aimed at closest foe)
        novaTimer -= dt;
        if (novaTimer <= 0 && enemyMgr.enemies.length > 0) {
          let closest: EnemyEntity | null = null;
          let closestD = 15.5;
          for (const e of enemyMgr.enemies) {
            const d = Math.hypot(e.x - playerX, e.z - playerZ);
            if (d < closestD) {
              closestD = d;
              closest = e;
            }
          }

          if (closest) {
            novaTimer = build.novaCooldown;
            const aimAngle = Math.atan2(closest.z - playerZ, closest.x - playerX);
            const count = build.novaCount;
            const spread = 0.17;
            const boltDmg = build.novaDamage * build.globalDamageMul;

            for (let i = 0; i < count; i++) {
              const offset = (i - (count - 1) * 0.5) * spread;
              const a = aimAngle + offset;
              arsenal.spawnNovaBolt(
                playerX + Math.cos(a) * 0.5,
                playerZ + Math.sin(a) * 0.5,
                Math.cos(a),
                Math.sin(a),
                15.5,
                boltDmg,
                build.novaPierce
              );
            }
            if (audioUnlocked) ctx.audio.playLaser(-2, 0.22);
          }
        }

        // Update Bow-Tie Nova Bolts + VFX & check bolt hits against enemies
        arsenal.updateVfxAndBolts(dt, elapsed, arena.playableRadius);
        for (let bi = arsenal.bolts.length - 1; bi >= 0; bi--) {
          const bolt = arsenal.bolts[bi];
          let consumed = false;
          for (let ei = enemyMgr.enemies.length - 1; ei >= 0; ei--) {
            const e = enemyMgr.enemies[ei];
            if (bolt.hitIds.has(e.id)) continue;
            const dist = Math.hypot(e.x - bolt.x, e.z - bolt.z);
            if (dist < bolt.radius + e.radius) {
              bolt.hitIds.add(e.id);
              const bLen = Math.hypot(bolt.vx, bolt.vz) || 1;
              burstPos.set(e.x, 1.05, e.z);
              arena.sparks.emitBurst(burstPos, 9, { speed: 5.5, color: '#ff667e', upwardBias: 1.5 });
              const res = enemyMgr.damageEnemy(
                e,
                bolt.damage,
                (bolt.vx / bLen) * 5.2,
                (bolt.vz / bLen) * 5.2
              );
              handleEnemyKill(res);
              bolt.pierceLeft -= 1;
              if (bolt.pierceLeft <= 0) {
                consumed = true;
                break;
              }
            }
          }
          if (consumed) {
            bolt.mesh.parent?.remove(bolt.mesh);
            arsenal.bolts.splice(bi, 1);
          }
        }

        // 4. Enemy AI Steering, Separation, Boss Attacks & Player Contact
        const enemyList = enemyMgr.enemies;
        for (let i = 0; i < enemyList.length; i++) {
          const e = enemyList[i];
          const toPx = playerX - e.x;
          const toPz = playerZ - e.z;
          const distP = Math.hypot(toPx, toPz) || 1;

          // Origami bats weave sinusoidally as swift flankers
          let steerX = toPx / distP;
          let steerZ = toPz / distP;
          if (e.kind === 'bat' && distP > 2.6) {
            const weave = Math.sin(elapsed * 3.4 + e.id * 1.9) * 0.42;
            steerX += -steerZ * weave;
            steerZ += steerX * weave;
            const sm = Math.hypot(steerX, steerZ) || 1;
            steerX /= sm;
            steerZ /= sm;
          }

          // Boss periodic telegraphed Ink-Orb volley + bat summons
          if (e.kind === 'boss') {
            if (e.bossTelegraphTimer > 0) {
              e.bossTelegraphTimer -= dt;
              // Slow down dramatically during telegraph so player can read & dodge!
              steerX *= 0.25;
              steerZ *= 0.25;
              if (e.bossTelegraphTimer <= 0) {
                enemyMgr.spawnBossVolley(e, playerX, playerZ);
                arsenal.spawnShockwave(e.x, e.z, 4.2, 0xff5a76);
                if (audioUnlocked) ctx.audio.playLaser(-7, 0.42);
              }
            } else {
              e.bossAttackTimer -= dt;
              if (e.bossAttackTimer <= 0) {
                e.bossTelegraphTimer = 1.1;
                e.bossAttackTimer = 4.6;
              }
            }

            e.bossSummonTimer -= dt;
            if (e.bossSummonTimer <= 0 && enemyList.length < 12) {
              e.bossSummonTimer = 8.5;
              enemyMgr.spawn('bat', e.x - 2.2, e.z + 1.0, 1.5);
              enemyMgr.spawn('bat', e.x + 2.2, e.z + 1.0, 1.5);
            }
          }

          // Soft enemy-to-enemy separation so hordes fan out organically
          let sepX = 0;
          let sepZ = 0;
          for (let j = 0; j < enemyList.length; j++) {
            if (i === j) continue;
            const other = enemyList[j];
            const dx = e.x - other.x;
            const dz = e.z - other.z;
            const minD = e.radius + other.radius + 0.18;
            const dSq = dx * dx + dz * dz;
            if (dSq > 0.0001 && dSq < minD * minD) {
              const d = Math.sqrt(dSq);
              const push = ((minD - d) / minD) * 4.2;
              sepX += (dx / d) * push;
              sepZ += (dz / d) * push;
            }
          }

          // Exponential knockback damping
          const kbDamp = Math.exp(-9.5 * dt);
          e.knockVx *= kbDamp;
          e.knockVz *= kbDamp;

          e.vx = steerX * e.speed + sepX + e.knockVx;
          e.vz = steerZ * e.speed + sepZ + e.knockVz;
          e.x += e.vx * dt;
          e.z += e.vz * dt;

          const eRes = resolveCircleObstacles(
            e.x,
            e.z,
            e.radius,
            arena.playableRadius,
            arena.obstacles
          );
          e.x = eRes.x;
          e.z = eRes.z;

          // Face smoothly toward the player
          const targetYaw = Math.atan2(-toPx, -toPz);
          e.yaw = wrapAngle(e.yaw + wrapAngle(targetYaw - e.yaw) * (1 - Math.exp(-9 * dt)));

          // Check player contact damage
          const hitDist = Math.hypot(playerX - e.x, playerZ - e.z);
          if (hitDist < playerRadius + e.radius * 0.85 && e.contactCooldown <= 0) {
            e.contactCooldown = 0.7;
            triggerDamagePlayer(e.contactDamage, e.x, e.z);
          }
        }

        enemyMgr.updateAnimations(dt, elapsed);

        const projHit = enemyMgr.updateProjectiles(
          dt,
          arena.playableRadius,
          playerX,
          playerZ,
          playerRadius
        );
        if (projHit.hitPlayer) {
          triggerDamagePlayer(projHit.hitDamage, playerX, playerZ - 1);
        }

        // 5. Magnetic Knowledge Gems & Level-Up Progression
        const gemPickup = arsenal.updateGems(dt, elapsed, playerX, playerZ, build.magnetRadius);
        if (gemPickup.collectedCount > 0) {
          xp += gemPickup.collectedXp;
          score += gemPickup.collectedXp * 2;
          gemComboStep = Math.min(12, gemComboStep + gemPickup.collectedCount);
          gemComboReset = 1.6;
          if (audioUnlocked) ctx.audio.playCombo(gemComboStep, 0.34);

          if (xp >= xpNeeded && !gameOver) {
            xp -= xpNeeded;
            level += 1;
            xpNeeded = xpThresholdForLevel(level);
            openLevelUpChoice();
          }
        }
      } else {
        // Gentle idle breathing / ambient conservatory sway even during Tome Selection!
        rig.update(dt, { speed: 0, turnRate: 0, boost: false });
        if (audioUnlocked) ctx.audio.stopMotor();
      }

      // 6. Smooth Overhead-Angled Arena Camera (guaranteed zero ceiling/branch occlusion!)
      shakeIntensity = Math.max(0, shakeIntensity - dt * 1.9);
      const shakeX = shakeIntensity > 0 ? (Math.random() - 0.5) * shakeIntensity : 0;
      const shakeY = shakeIntensity > 0 ? (Math.random() - 0.5) * shakeIntensity * 0.65 : 0;

      // Gently clamp camera follow so the grand circular library hall always frames majestically
      const followX = THREE.MathUtils.clamp(playerX * 0.76, -11.5, 11.5);
      const followZ = THREE.MathUtils.clamp(playerZ * 0.72, -10.5, 10.5);

      camTargetPos.set(followX + shakeX, 14.2 + shakeY, followZ + 13.6);
      camLookTarget.set(followX * 0.92, 0.75, followZ - 1.2);

      const camAlpha = 1 - Math.exp(-6.5 * dt);
      camCurrentPos.lerp(camTargetPos, camAlpha);
      camCurrentLook.lerp(camLookTarget, camAlpha);

      host.camera.position.copy(camCurrentPos);
      host.camera.lookAt(camCurrentLook);

      // Update botanical conservatory flora, candlelight flicker, dust motes & fireflies
      playerPosVec.set(playerX, 0.4, playerZ);
      arena.update(dt, elapsed, playerPosVec, host.camera.position);

      // Throttled crisp HUD refresh (~12 Hz)
      hudAccumulator += dt;
      if (hudAccumulator >= 0.085) {
        hudAccumulator = 0;
        pushHud();
      }

      input.endFrame();
    });

    return {
      setPaused(paused: boolean) {
        externalPaused = paused;
        if (paused && audioUnlocked) {
          ctx.audio.stopMotor();
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        window.removeEventListener('keydown', unlockAudio, true);
        window.removeEventListener('pointerdown', unlockAudio, true);
        ctx.setRestartHandler?.(null);
        ctx.audio.stopMotor();
        if (audioUnlocked) ctx.audio.setAmbient('none');
        tomeOverlay.dispose();
        input.dispose();
        rig.dispose();
        enemyMgr.dispose();
        arsenal.dispose();
        arena.dispose();
        playerAuraGeo.dispose();
        playerAuraMat.dispose();
        host.dispose();
      },
    };
  },
};

export default LivingLibraryGame;
