import * as THREE from 'three';
import { applyAtmosphere } from '../../art';
import { createFigurineRig } from '../../engine/character';
import { InputController } from '../../engine/input';
import { createSceneHost } from '../../engine/sceneHost';
import type { GameContext, GameInstance, GameMeta, GameModule, HudMeter } from '../../engine/types';
import { createNoirEnvironment } from './environment';
import { NoirGameplaySystem } from './gameplay';
import type { BoxCollider, SafeLamppost, WalkableZone } from './types';

const DAWN_TIME_LIMIT = 180; // 3 minutes before dawn breaks
const PLAYER_RADIUS = 0.52;

const NOIR_META: GameMeta = {
  id: 'noir-quay',
  number: 3,
  title: 'Noir Quay',
  subtitle: 'Rain-Slicked Harbor Mystery',
  genre: 'Detective Exploration',
  style: 'Film Noir',
  accentColor: '#C79A4B',
  controls: [
    { keys: 'WASD / Arrows', action: 'Patrol the Quay' },
    { keys: 'Mouse / Q·E', action: 'Aim Spotlight' },
    { keys: 'Space / R-Click', action: 'High / Stealth Beam' },
    { keys: 'E / Hold Beam', action: 'Inspect Clue' },
  ],
  objective:
    'Sweep your halogen spotlight through the rainy wharf, uncover 5 syndicate clues while evading searchlights, and trigger the East Pier Beacon before dawn.',
};

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function getWalkableElevation(x: number, z: number, zones: WalkableZone[]): number | null {
  for (let i = 0; i < zones.length; i++) {
    const zZone = zones[i];
    if (x >= zZone.minX && x <= zZone.maxX && z >= zZone.minZ && z <= zZone.maxZ) {
      return zZone.elevation;
    }
  }
  return null;
}

function resolveCircleBoxCollisions(
  pos: THREE.Vector3,
  radius: number,
  colliders: BoxCollider[],
): boolean {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const closestX = THREE.MathUtils.clamp(pos.x, c.minX, c.maxX);
    const closestZ = THREE.MathUtils.clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      hit = true;
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        // Inside AABB fallback: push out along nearest face
        const penLeft = Math.abs(pos.x - c.minX);
        const penRight = Math.abs(c.maxX - pos.x);
        const penTop = Math.abs(pos.z - c.minZ);
        const penBottom = Math.abs(c.maxZ - pos.z);
        const minPen = Math.min(penLeft, penRight, penTop, penBottom);
        if (minPen === penLeft) pos.x = c.minX - radius;
        else if (minPen === penRight) pos.x = c.maxX + radius;
        else if (minPen === penTop) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

const NoirQuayGame: GameModule = {
  meta: NOIR_META,

  async mount(ctx: GameContext): Promise<GameInstance> {
    const host = createSceneHost({
      container: ctx.container,
      fov: 44,
      near: 0.2,
      far: 340,
      exposure: 1.14,
      shadows: true,
    });

    const { scene, camera, renderer, canvas } = host;

    // Midnight rain-slicked European harbor atmosphere
    const atmosphere = applyAtmosphere(scene, renderer, 'noir_rain', {
      skyRadius: 220,
      shadowExtent: 44,
      shadowMapSize: 2048,
      fogDensityMultiplier: 0.68,
      enableShadows: true,
      sunDistance: 62,
    });

    // Build rich 3D rainy European waterfront diorama
    const env = createNoirEnvironment(scene, atmosphere);

    // Load animated 3D wheelchair figurine (custom steerable brass spotlight mounted on headlightMount)
    const rig = await createFigurineRig({
      targetHeight: 1.65,
      headlights: false,
      boostGlow: false,
      envMapIntensity: 1.18,
      castShadow: true,
      receiveShadow: true,
    });
    scene.add(rig.root);

    // Build clues, steerable spotlight, sweeping crane/tower searchlights & patrolling watchmen
    const gameplay = new NoirGameplaySystem(scene, env, rig.headlightMount);

    const input = new InputController({
      target: canvas,
      preventScrollKeys: true,
      axisSmoothing: 14,
    });

    // Right-click edge tracking for High-Beam / Stealth Low-Beam toggle
    let prevRightDown = false;
    let pointerActive = false;
    let lastPointerNdcX = 0;
    let lastPointerNdcY = 0;
    let manualAimAngle: number | null = null;

    // Raycaster for ground-plane spotlight aiming
    const raycaster = new THREE.Raycaster();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
    const rayHit = new THREE.Vector3();
    const pointerVec = new THREE.Vector2();
    const desiredAimPos = new THREE.Vector3();
    const smoothedAimPos = new THREE.Vector3();

    // Game & player state
    const startLamppost: SafeLamppost = env.lampposts[1] ?? env.lampposts[0];
    let lastSafeLamppost: SafeLamppost = startLamppost;

    const playerPos = new THREE.Vector3();
    let playerYaw = -Math.PI * 0.42;
    let currentSpeed = 0;
    let currentTurnRate = 0;

    let dawnRemaining = DAWN_TIME_LIMIT;
    let coverIntegrity = 100;
    let score = 0;
    let alarmsTriggered = 0;
    let cleanStreak = true;
    let graceTimer = 0;
    let alarmBeepCooldown = 0;
    let bumpSoundCooldown = 0;
    let hudTimer = 0;
    let gameEnded = false;
    let audioStarted = false;

    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const desiredCamPos = new THREE.Vector3();
    const desiredCamLook = new THREE.Vector3();

    const computeIdealCamera = (pos: THREE.Vector3, aimPos: THREE.Vector3, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
      const pierFactor = THREE.MathUtils.clamp((pos.z - 5) / 14, 0, 1);
      const lookShiftX = THREE.MathUtils.clamp((aimPos.x - pos.x) * 0.16, -2.2, 2.2);
      const lookShiftZ = THREE.MathUtils.clamp((aimPos.z - pos.z) * 0.14, -2.0, 2.0);

      outPos.set(
        THREE.MathUtils.clamp(pos.x - 1.4 + lookShiftX * 0.45, -28.5, 28.5),
        9.0 + pierFactor * 2.2,
        pos.z + 12.2 + pierFactor * 1.4,
      );
      outLook.set(
        THREE.MathUtils.clamp(pos.x + 0.6 + lookShiftX, -29.5, 29.5),
        1.15,
        pos.z - 2.2 + lookShiftZ,
      );
    };

    const startAudioIfNeeded = () => {
      if (audioStarted) return;
      audioStarted = true;
      ctx.audio.resume();
      ctx.audio.setAmbient('rain', 0.45);
    };

    const resetGame = () => {
      gameEnded = false;
      dawnRemaining = DAWN_TIME_LIMIT;
      coverIntegrity = 100;
      score = 0;
      alarmsTriggered = 0;
      cleanStreak = true;
      graceTimer = 2.0;
      alarmBeepCooldown = 0;
      bumpSoundCooldown = 0;
      hudTimer = 0;
      pointerActive = false;
      manualAimAngle = null;
      prevRightDown = false;

      lastSafeLamppost = startLamppost;
      playerPos.copy(startLamppost.spawnPos);
      playerPos.y = 0;
      playerYaw = startLamppost.spawnYaw;
      currentSpeed = 0;
      currentTurnRate = 0;

      rig.root.position.copy(playerPos);
      rig.root.rotation.set(0, playerYaw, 0);

      gameplay.reset();

      // Aim spotlight forward along the wet promenade on frame 1
      desiredAimPos.set(
        playerPos.x - Math.sin(playerYaw) * 9.5,
        0.25,
        playerPos.z - Math.cos(playerYaw) * 9.5,
      );
      smoothedAimPos.copy(desiredAimPos);

      computeIdealCamera(playerPos, smoothedAimPos, camPos, camLook);
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      ctx.audio.stopMotor();
      ctx.audio.setAmbient('rain', 0.45);
      ctx.setHud({ paused: false, result: null });
      ctx.notify('Midnight at Quai No. 3 — Sweep your High-Beam to uncover 5 syndicate clues.', 'info', 4600);
    };

    ctx.setRestartHandler?.(resetGame);
    resetGame();

    const finishGame = (victory: boolean) => {
      if (gameEnded) return;
      gameEnded = true;
      ctx.audio.stopMotor();

      let finalScore = score;
      let timeBonus = 0;
      if (victory) {
        timeBonus = Math.round(dawnRemaining) * 10;
        finalScore += 500 + timeBonus;
        score = finalScore;
        ctx.audio.playVictory();
      } else {
        ctx.audio.playGameOver();
      }

      const isNewBest = ctx.saveBestScore(finalScore);
      ctx.setHud({
        stats: [
          { label: 'Clues', value: `${gameplay.clues.filter((c) => c.collected).length} / 5`, accent: true },
          { label: 'Dawn', value: formatClock(dawnRemaining) },
          { label: 'Score', value: finalScore, accent: true },
        ],
        meters: [],
        statusText: victory ? 'Syndicate Exposed — Harbor Fleet Signaled!' : 'Dawn Broke Over Quai No. 3',
        promptText: '',
        result: {
          title: victory ? 'Case Closed' : 'The Trail Went Cold',
          subtitle: victory
            ? 'Your brass beacon exposed the midnight clockwork smugglers before sunrise.'
            : 'Dawn lifted the harbor mist and the contraband launch slipped past the breakwater.',
          score: finalScore,
          scoreLabel: 'Detective Score',
          isNewBest,
          victory,
          stats: [
            { label: 'Evidence Logged', value: `${gameplay.clues.filter((c) => c.collected).length} / 5`, accent: true },
            { label: 'Time Remaining', value: formatClock(dawnRemaining) },
            { label: 'Patrol Alarms', value: alarmsTriggered },
            { label: 'Time Bonus', value: victory ? `+${timeBonus}` : '0' },
          ],
          onRestart: resetGame,
        },
      });
    };

    const tick = (dt: number, elapsed: number) => {
      input.update(dt);

      // Unlock WebAudio on any player action
      if (
        !audioStarted &&
        (input.rawForward() !== 0 ||
          input.rawTurn() !== 0 ||
          input.wasPressed('space') ||
          input.wasPressed('e') ||
          input.pointer.down ||
          input.pointer.rightDown)
      ) {
        startAudioIfNeeded();
      }

      if (gameEnded) {
        env.update(dt, elapsed, playerPos, camera.position);
        atmosphere.update(elapsed, camera.position);
        input.endFrame();
        return;
      }

      // ---------------------------------------------------------------------
      // 1. Dawn Clock & Cooldowns
      // ---------------------------------------------------------------------
      dawnRemaining -= dt;
      if (dawnRemaining <= 0) {
        dawnRemaining = 0;
        finishGame(false);
        input.endFrame();
        return;
      }

      if (graceTimer > 0) graceTimer = Math.max(0, graceTimer - dt);
      if (alarmBeepCooldown > 0) alarmBeepCooldown = Math.max(0, alarmBeepCooldown - dt);
      if (bumpSoundCooldown > 0) bumpSoundCooldown = Math.max(0, bumpSoundCooldown - dt);

      // ---------------------------------------------------------------------
      // 2. Beam Toggle (Space or Right-Click) & Inspect Edge Trigger (E)
      // ---------------------------------------------------------------------
      const rightJustPressed = input.pointer.rightDown && !prevRightDown;
      prevRightDown = input.pointer.rightDown;

      if (input.wasPressed('space') || rightJustPressed) {
        const high = gameplay.toggleHighBeam();
        ctx.audio.playClick();
        ctx.notify(
          high
            ? 'Halogen High-Beam ON — reveals clues from afar (higher visibility).'
            : 'Stealth Low-Beam ON — harder for searchlights & watchmen to spot.',
          high ? 'accent' : 'info',
          2200,
        );
      }

      const inspectPressed = input.wasPressed('e');

      // ---------------------------------------------------------------------
      // 3. Smooth Screen-Relative Wheelchair Movement & Collision
      // ---------------------------------------------------------------------
      // W = North (-Z), S = South (+Z), A = West (-X), D = East (+X)
      const moveX = input.strafe;
      const moveZ = -input.forward;
      const moveMag = Math.min(1, Math.hypot(moveX, moveZ));
      const isBoosting = input.boost && moveMag > 0.15;

      const highBeam = gameplay.spotlight.highBeam;
      const maxSpeed = isBoosting ? 7.5 : highBeam ? 5.6 : 4.9;
      let groundBump = 0;

      if (moveMag > 0.04) {
        const targetYaw = Math.atan2(-moveX, -moveZ);
        let yawDiff = targetYaw - playerYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        const maxTurnStep = 8.4 * dt;
        const clampedTurn = THREE.MathUtils.clamp(yawDiff, -maxTurnStep, maxTurnStep);
        playerYaw += clampedTurn;
        currentTurnRate = clampedTurn / Math.max(dt, 0.001);

        // Smooth forward drive aligned with steering direction
        const alignFactor = 0.45 + 0.55 * Math.max(0, Math.cos(yawDiff));
        const targetSpeed = maxSpeed * moveMag * alignFactor;
        currentSpeed += (targetSpeed - currentSpeed) * (1 - Math.exp(-11 * dt));

        // Subtle cobblestone rumble impulse
        if (Math.sin(elapsed * 22) > 0.94) {
          groundBump = 0.008 * moveMag;
        }
      } else {
        currentTurnRate *= Math.exp(-12 * dt);
        currentSpeed *= Math.exp(-10 * dt);
        if (Math.abs(currentSpeed) < 0.02) currentSpeed = 0;
      }

      if (Math.abs(currentSpeed) > 0.005) {
        // Blend chair heading slightly with input vector for nimble tight corners around crates
        const dirX = -Math.sin(playerYaw);
        const dirZ = -Math.cos(playerYaw);
        const stepX = dirX * currentSpeed * dt;
        const stepZ = dirZ * currentSpeed * dt;

        const prevX = playerPos.x;
        const prevZ = playerPos.z;
        const nextX = prevX + stepX;
        const nextZ = prevZ + stepZ;

        const elevBoth = getWalkableElevation(nextX, nextZ, env.walkableZones);
        if (elevBoth !== null) {
          playerPos.x = nextX;
          playerPos.z = nextZ;
          playerPos.y = elevBoth;
        } else {
          // Graceful axis sliding along seawall/pier edges
          const elevX = getWalkableElevation(nextX, prevZ, env.walkableZones);
          const elevZ = getWalkableElevation(prevX, nextZ, env.walkableZones);
          if (elevX !== null) {
            playerPos.x = nextX;
            playerPos.y = elevX;
          } else if (elevZ !== null) {
            playerPos.z = nextZ;
            playerPos.y = elevZ;
          }
        }

        const bumped = resolveCircleBoxCollisions(playerPos, PLAYER_RADIUS, env.colliders);
        // Clamp back inside walkable zone after collision push
        if (getWalkableElevation(playerPos.x, playerPos.z, env.walkableZones) === null) {
          playerPos.x = prevX;
          playerPos.z = prevZ;
        }

        if (bumped && Math.abs(currentSpeed) > 2.2 && bumpSoundCooldown <= 0) {
          ctx.audio.playBump(0.28);
          bumpSoundCooldown = 0.4;
          groundBump = -0.025;
        }
      }

      rig.root.position.copy(playerPos);
      rig.root.rotation.y = playerYaw;
      rig.update(dt, {
        speed: currentSpeed,
        turnRate: currentTurnRate,
        groundBump,
        boost: isBoosting,
      });

      // Continuous power-chair electric motor + wet cobble / pier wood tire hum
      ctx.audio.setMotor(Math.min(1, Math.abs(currentSpeed) / 7.5), {
        boost: isBoosting,
        surface: playerPos.z > 7.5 ? 'smooth' : 'gravel',
      });

      // ---------------------------------------------------------------------
      // 4. Steerable Halogen Spotlight Aiming (Mouse / Q·E / Heading)
      // ---------------------------------------------------------------------
      const ptr = input.pointer;
      if (
        Math.abs(ptr.ndcX - lastPointerNdcX) > 0.004 ||
        Math.abs(ptr.ndcY - lastPointerNdcY) > 0.004
      ) {
        pointerActive = true;
        manualAimAngle = null;
        lastPointerNdcX = ptr.ndcX;
        lastPointerNdcY = ptr.ndcY;
      }

      // Keyboard Q / E spotlight sweep (only use E to yaw if not actively holding over a clue)
      const qDown = input.isDown('q');
      const eDown = input.isDown('e');
      if (qDown || (eDown && !gameplay.clues.some((c) => !c.collected && c.illuminated))) {
        pointerActive = false;
        if (manualAimAngle === null) {
          manualAimAngle = Math.atan2(
            -(smoothedAimPos.x - playerPos.x),
            -(smoothedAimPos.z - playerPos.z),
          );
        }
        const aimDir = (qDown ? 1 : 0) - (eDown ? 1 : 0);
        manualAimAngle += aimDir * 2.4 * dt;
      }

      if (pointerActive) {
        pointerVec.set(ptr.ndcX, ptr.ndcY);
        raycaster.setFromCamera(pointerVec, camera);
        if (raycaster.ray.intersectPlane(aimPlane, rayHit)) {
          desiredAimPos.copy(rayHit);
        }
      } else if (manualAimAngle !== null) {
        desiredAimPos.set(
          playerPos.x - Math.sin(manualAimAngle) * 10.0,
          0.25,
          playerPos.z - Math.cos(manualAimAngle) * 10.0,
        );
      } else {
        desiredAimPos.set(
          playerPos.x - Math.sin(playerYaw) * 9.5,
          0.25,
          playerPos.z - Math.cos(playerYaw) * 9.5,
        );
      }

      smoothedAimPos.lerp(desiredAimPos, 1 - Math.exp(-15 * dt));

      // ---------------------------------------------------------------------
      // 5. Update World, Clues, Searchlights & Watchmen
      // ---------------------------------------------------------------------
      env.update(dt, elapsed, playerPos, camera.position);
      atmosphere.update(elapsed, camera.position);

      const frame = gameplay.update(
        dt,
        elapsed,
        playerPos,
        playerYaw,
        smoothedAimPos,
        inspectPressed,
        camera.position,
        graceTimer,
      );

      // Update last visited safe lamppost checkpoint when undetected
      if (!frame.isSpotted) {
        for (const lp of env.lampposts) {
          if (lp.position.distanceToSquared(playerPos) <= 22) {
            lastSafeLamppost = lp;
            break;
          }
        }
      }

      // Newly decoded clue reward & atmospheric noir narration
      if (frame.newlyCollectedClue) {
        const clueBonus = cleanStreak ? 400 : 300;
        score += clueBonus;
        ctx.audio.playCombo(frame.cluesCollected, 0.85);
        ctx.notify(frame.newlyCollectedClue.narration, 'accent', 5200);
        if (frame.cluesCollected >= frame.totalClues) {
          ctx.audio.playBell(0.8);
        }
      }

      // Stealth Cover Integrity & Alarm Handling
      if (frame.isSpotted) {
        const drainRate = gameplay.spotlight.highBeam ? 36 : 19;
        coverIntegrity = Math.max(0, coverIntegrity - drainRate * dt);
        if (alarmBeepCooldown <= 0) {
          ctx.audio.playLaser(-4, 0.35);
          alarmBeepCooldown = 0.55;
        }
        if (coverIntegrity <= 0) {
          alarmsTriggered++;
          cleanStreak = false;
          score = Math.max(0, score - 250);
          coverIntegrity = 100;
          graceTimer = 2.6;
          gameplay.spotlight.highBeam = false; // Auto-dim to stealth beam on fallback
          ctx.audio.playBump(0.8);
          ctx.notify(
            'Spotted by Syndicate Patrol! (-250 pts) Slipping back to the last safe lamppost…',
            'warning',
            3800,
          );
          playerPos.copy(lastSafeLamppost.spawnPos);
          playerPos.y = 0;
          playerYaw = lastSafeLamppost.spawnYaw;
          currentSpeed = 0;
          rig.root.position.copy(playerPos);
          rig.root.rotation.y = playerYaw;
        }
      } else {
        const regenRate = frame.nearSafeLamppost ? 28 : frame.isShadowed ? 22 : 15;
        coverIntegrity = Math.min(100, coverIntegrity + regenRate * dt);
      }

      // Check victory at Harbor Master's Pier Beacon
      if (frame.reachedBeacon) {
        finishGame(true);
        input.endFrame();
        return;
      }

      // ---------------------------------------------------------------------
      // 6. Smooth Cinematic Angled Noir Camera
      // ---------------------------------------------------------------------
      computeIdealCamera(playerPos, smoothedAimPos, desiredCamPos, desiredCamLook);
      const camAlpha = 1 - Math.exp(-4.6 * dt);
      camPos.lerp(desiredCamPos, camAlpha);
      camLook.lerp(desiredCamLook, 1 - Math.exp(-6.2 * dt));
      camera.position.copy(camPos);
      camera.lookAt(camLook);

      // ---------------------------------------------------------------------
      // 7. Throttled HUD State Updates
      // ---------------------------------------------------------------------
      hudTimer += dt;
      if (hudTimer >= 0.08) {
        hudTimer = 0;
        const coverColor = frame.isSpotted
          ? '#e05555'
          : coverIntegrity < 55
            ? '#e5a94c'
            : '#58b892';

        const meters: HudMeter[] = [
          {
            label: frame.isSpotted ? 'COVER ALERT' : frame.isShadowed ? 'SHADOW COVER' : 'COVER',
            value: Math.round(coverIntegrity),
            max: 100,
            color: coverColor,
          },
        ];

        if (frame.activeIlluminatedClue) {
          meters.push({
            label: `SCAN: ${frame.activeIlluminatedClue.def.title.toUpperCase()}`,
            value: frame.activeIlluminatedClue.progress,
            color: '#f4c465',
          });
        }

        let statusText = gameplay.getRemainingHint();
        if (frame.isSpotted) {
          statusText = 'SPOTTED! Dim beam [SPACE] & duck behind crates or awnings!';
        } else if (graceTimer > 0.2 && alarmsTriggered > 0) {
          statusText = 'Safe under lamppost — stealth grace active';
        } else if (frame.isShadowed) {
          statusText = 'SHADOWED — Hidden from harbor patrols';
        } else if (frame.cluesCollected >= frame.totalClues) {
          statusText = 'All 5 Clues Decoded — Race to the East Pier Beacon!';
        }

        let promptText = gameplay.spotlight.highBeam
          ? '[SPACE / R-Click] Stealth Low-Beam • [Mouse / Q·E] Aim Spotlight • [Shift] Glide'
          : '[SPACE / R-Click] High-Beam Search • Stealth Low-Beam Active';
        if (frame.activeIlluminatedClue) {
          promptText = `Illuminating ${frame.activeIlluminatedClue.def.title} — Hold beam or press [E] to log evidence`;
        } else if (frame.cluesCollected >= frame.totalClues) {
          promptText = 'Drive into the glowing East Pier Beacon ring to signal the harbor fleet!';
        }

        ctx.setHud({
          stats: [
            { label: 'Clues', value: `${frame.cluesCollected} / ${frame.totalClues}`, accent: true },
            { label: 'Beam', value: gameplay.spotlight.highBeam ? 'HIGH' : 'STEALTH' },
            { label: 'Dawn', value: formatClock(dawnRemaining) },
            { label: 'Score', value: score },
          ],
          meters,
          statusText,
          promptText,
        });
      }

      input.endFrame();
    };

    host.start(tick);

    return {
      setPaused(paused: boolean) {
        host.setPaused(paused);
        if (paused) {
          ctx.audio.stopMotor();
        }
      },
      dispose() {
        ctx.setRestartHandler?.(null);
        ctx.audio.stopMotor();
        ctx.audio.setAmbient('none');
        input.dispose();
        gameplay.dispose();
        env.dispose();
        rig.dispose();
        atmosphere.dispose();
        host.dispose();
      },
    };
  },
};

export default NoirQuayGame;
