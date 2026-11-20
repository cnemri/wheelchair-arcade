import * as THREE from 'three';
import {
  createDetailedTree,
  createFernCluster,
  createGrassField,
  createLantern,
  createMossyBoulder,
  createParticleSystem,
  createPBRMaterial,
  createWaterSurface,
  updateFoliageWind,
  type AtmosphereRig,
  type DetailedTree,
  type GrassField,
  type ParticleSystem,
  type WaterSurface,
} from '../../art';
import type {
  AwningZone,
  BeaconRig,
  BoxCollider,
  MooredBoat,
  NoirEnvironment,
  PuddleRipple,
  SafeLamppost,
  WalkableZone,
} from './types';

// ---------------------------------------------------------------------------
// Procedural Canvas Textures (Windows with Curtains, Striped Awnings, Signs)
// ---------------------------------------------------------------------------

function createLitWindowTexture(warmHue: string, curtainColor: string, litRatio: number, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  // Warm interior glow gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 384);
  if (litRatio > 0.35) {
    grad.addColorStop(0, '#4d2b16');
    grad.addColorStop(0.32, warmHue);
    grad.addColorStop(0.75, '#ffd480');
    grad.addColorStop(1, '#c97932');
  } else {
    grad.addColorStop(0, '#121d2d');
    grad.addColorStop(0.5, '#1d2d42');
    grad.addColorStop(1, '#26394e');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 384);

  // Subtle interior silhouette (lamp shade / bookshelf / venetian blinds)
  if (litRatio > 0.35) {
    ctx.fillStyle = 'rgba(42, 22, 12, 0.35)';
    if (seed % 2 === 0) {
      // Venetian blind slats
      for (let y = 18; y < 145; y += 14) {
        ctx.fillRect(0, y, 256, 5);
      }
    } else {
      // Warm hanging table lamp silhouette
      ctx.beginPath();
      ctx.moveTo(96, 210);
      ctx.lineTo(160, 210);
      ctx.lineTo(175, 255);
      ctx.lineTo(81, 255);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(123, 255, 10, 75);
    }
  }

  // Draped fabric curtains left & right
  ctx.fillStyle = curtainColor;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(76, 0);
  ctx.quadraticCurveTo(56, 170, 22, 384);
  ctx.lineTo(0, 384);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(180, 0);
  ctx.quadraticCurveTo(200, 170, 234, 384);
  ctx.lineTo(256, 384);
  ctx.closePath();
  ctx.fill();

  // Mullion window bars
  ctx.fillStyle = '#1b1e24';
  ctx.fillRect(123, 0, 10, 384);
  ctx.fillRect(0, 185, 256, 10);
  ctx.fillRect(0, 92, 256, 6);
  ctx.fillRect(0, 285, 256, 6);

  // Rain streaks on glass
  ctx.strokeStyle = 'rgba(205, 226, 250, 0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const rx = ((i * 53 + seed * 31) % 236) + 10;
    const ry = ((i * 89 + seed * 17) % 300) + 12;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 4, ry + 38);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createAwningStripeTexture(colorA: string, colorB: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const stripes = 8;
  const w = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fillRect(i * w, 0, w + 1, canvas.height);
  }
  // Subtle rain-darkened bottom hem & fabric weave
  const shade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  shade.addColorStop(0, 'rgba(0,0,0,0.08)');
  shade.addColorStop(0.8, 'rgba(0,0,0,0.16)');
  shade.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createNoirSignTexture(label: string, sublabel: string, bg: string, border: string, ink: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 144);

  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 124);
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 476, 108);

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px Georgia, serif';
  ctx.fillText(label, 256, 62);

  ctx.font = '600 20px Georgia, serif';
  ctx.fillStyle = border;
  ctx.fillText(sublabel, 256, 106);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRadialGlowTexture(innerRgba: string, midRgba: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.35, midRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createVolumetricConeMaterial(colorHex: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // vUv.y = 1 at apex, 0 at bottom rim
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.35);
        float verticalFade = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
        float shimmer = 0.92 + 0.08 * sin(uTime * 2.2 + vUv.x * 18.0 - vUv.y * 8.0);
        float alpha = edge * verticalFade * uOpacity * shimmer;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Architectural Builders
// ---------------------------------------------------------------------------

interface BuildingSpec {
  x: number;
  width: number;
  height: number;
  depth: number;
  wallTint: string;
  wallType: 'sandstone' | 'cobblestone' | 'woodPlanks';
  roofTint: string;
  stories: number;
  windowsPerRow: number;
  awning?: { colorA: string; colorB: string; width: number };
  sign?: { label: string; sublabel: string; bg: string; border: string; ink: string };
  hasBalcony?: boolean;
  seed: number;
}

function buildWaterfrontFacade(
  spec: BuildingSpec,
  roofMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
  stoneTrimMat: THREE.MeshStandardMaterial,
  woodDarkMat: THREE.MeshStandardMaterial,
  awningZones: AwningZone[],
): THREE.Group {
  const g = new THREE.Group();
  const zFront = -11.4;
  g.position.set(spec.x, 0, zFront - spec.depth * 0.5);

  const wallMat = createPBRMaterial(spec.wallType, {
    repeatX: Math.max(2, Math.round(spec.width * 0.45)),
    repeatY: Math.max(2, Math.round(spec.height * 0.4)),
    wet: true,
    tint: spec.wallTint,
    seed: spec.seed,
  });

  // Main building body
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.depth), wallMat);
  body.position.y = spec.height * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Molded stone plinth base
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.16, 0.82, spec.depth + 0.16),
    stoneTrimMat,
  );
  plinth.position.y = 0.41;
  plinth.receiveShadow = true;
  g.add(plinth);

  // Horizontal stringcourse ledges & top cornice
  const cornice = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.34, 0.32, spec.depth + 0.34),
    stoneTrimMat,
  );
  cornice.position.y = spec.height;
  cornice.castShadow = true;
  g.add(cornice);

  const midLedge = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.18, 0.16, spec.depth + 0.18),
    stoneTrimMat,
  );
  midLedge.position.y = 3.25;
  g.add(midLedge);

  // Corner stone quoins on front corners
  const quoinGeo = new THREE.BoxGeometry(0.32, 0.42, 0.18);
  for (const sx of [-1, 1]) {
    for (let qy = 1.1; qy < spec.height - 0.5; qy += 0.78) {
      const q = new THREE.Mesh(quoinGeo, stoneTrimMat);
      q.position.set(sx * (spec.width * 0.5 - 0.08), qy, spec.depth * 0.5 + 0.03);
      g.add(q);
    }
  }

  // Pitched mansard / gabled slate roof + chimney + dormers
  const roofH = 2.6 + (spec.seed % 3) * 0.35;
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(
      spec.width * 0.38,
      spec.width * 0.62,
      roofH,
      4,
    ),
    roofMat,
  );
  roof.rotation.y = Math.PI * 0.25;
  roof.scale.set(1.12, 1, (spec.depth + 0.4) / (spec.width * 0.92));
  roof.position.y = spec.height + roofH * 0.5 + 0.06;
  roof.castShadow = true;
  g.add(roof);

  // Brick chimney stack
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.2, 0.85), stoneTrimMat);
  chim.position.set(spec.width * 0.28 * (spec.seed % 2 === 0 ? 1 : -1), spec.height + roofH * 0.72, 0.4);
  chim.castShadow = true;
  g.add(chim);
  const chimCap = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 1.02), ironMat);
  chimCap.position.set(chim.position.x, chim.position.y + 1.15, chim.position.z);
  g.add(chimCap);

  // Warm illuminated attic dormer window projecting from the slate roof
  const dormer = new THREE.Group();
  dormer.position.set(spec.width * 0.18 * (spec.seed % 2 === 0 ? -1 : 1), spec.height + 1.12, spec.depth * 0.38);
  const dBox = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.25, 1.15), stoneTrimMat);
  dormer.add(dBox);
  const dRoof = new THREE.Mesh(new THREE.ConeGeometry(1.02, 0.72, 4), roofMat);
  dRoof.rotation.y = Math.PI * 0.25;
  dRoof.position.y = 0.94;
  dormer.add(dRoof);
  const dGlassMat = new THREE.MeshStandardMaterial({
    color: '#ffe8b2',
    emissive: '#ffa640',
    emissiveIntensity: spec.seed % 3 === 0 ? 0.35 : 1.35,
    roughness: 0.2,
  });
  const dPane = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.86), dGlassMat);
  dPane.position.set(0, -0.02, 0.59);
  dormer.add(dPane);
  g.add(dormer);

  // Vertical rain downspout pipe on right front corner
  const pipeX = spec.width * 0.5 - 0.22;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, spec.height, 8), ironMat);
  pipe.position.set(pipeX, spec.height * 0.5, spec.depth * 0.5 + 0.1);
  g.add(pipe);
  for (let by = 1.4; by < spec.height - 0.5; by += 2.2) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.18), ironMat);
    strap.position.set(pipeX, by, spec.depth * 0.5 + 0.08);
    g.add(strap);
  }

  // Front facade face coordinate
  const frontZ = spec.depth * 0.5;

  // Recessed wooden arched entrance door on ground floor
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.75, 0.26), stoneTrimMat);
  doorFrame.position.set(0, 1.45, frontZ + 0.04);
  g.add(doorFrame);
  const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.26, 2.42, 0.12), woodDarkMat);
  doorLeaf.position.set(0, 1.32, frontZ + 0.12);
  g.add(doorLeaf);
  const transomTex = createLitWindowTexture('#ffba62', '#3a1f18', 0.9, spec.seed + 99);
  const transomMat = new THREE.MeshStandardMaterial({
    map: transomTex,
    emissive: new THREE.Color('#ffaa48'),
    emissiveMap: transomTex,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });
  const transom = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.52), transomMat);
  transom.position.set(0, 2.48, frontZ + 0.18);
  g.add(transom);

  // Ground-floor shopfront windows flanking the door
  const shopWindowOffsets = spec.width > 9.5 ? [-spec.width * 0.32, spec.width * 0.32] : [-spec.width * 0.29, spec.width * 0.29];
  shopWindowOffsets.forEach((wx, idx) => {
    const wTex = createLitWindowTexture(
      idx % 2 === 0 ? '#ffc46b' : '#ffa752',
      spec.seed % 2 === 0 ? '#4d1f24' : '#1b3530',
      0.92,
      spec.seed * 7 + idx,
    );
    const wMat = new THREE.MeshStandardMaterial({
      map: wTex,
      emissive: new THREE.Color('#ffaf4a'),
      emissiveMap: wTex,
      emissiveIntensity: 1.25,
      roughness: 0.18,
    });
    const recess = new THREE.Mesh(new THREE.BoxGeometry(1.86, 2.05, 0.22), stoneTrimMat);
    recess.position.set(wx, 1.72, frontZ + 0.02);
    g.add(recess);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 1.75), wMat);
    pane.position.set(wx, 1.72, frontZ + 0.14);
    g.add(pane);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.14, 0.36), stoneTrimMat);
    sill.position.set(wx, 0.68, frontZ + 0.12);
    g.add(sill);
  });

  // Upper story arched/mullioned windows with sills, shutters & optional wrought-iron balconies
  const storySpacing = (spec.height - 3.6) / Math.max(1, spec.stories - 1);
  for (let row = 1; row < spec.stories; row++) {
    const wy = 3.55 + (row - 1) * storySpacing + storySpacing * 0.48;
    if (wy > spec.height - 1.1) continue;

    for (let col = 0; col < spec.windowsPerRow; col++) {
      const t = spec.windowsPerRow === 1 ? 0.5 : col / (spec.windowsPerRow - 1);
      const wx = THREE.MathUtils.lerp(-spec.width * 0.34, spec.width * 0.34, t);
      const isLit = ((spec.seed + row * 3 + col * 5) % 3) !== 0;
      const winTex = createLitWindowTexture(
        (col + row) % 2 === 0 ? '#ffc770' : '#ff9d4c',
        (spec.seed + col) % 2 === 0 ? '#3d1c24' : '#1e2c3b',
        isLit ? 0.85 : 0.15,
        spec.seed * 13 + row * 5 + col,
      );
      const winMat = new THREE.MeshStandardMaterial({
        map: winTex,
        emissive: isLit ? new THREE.Color('#ffad4c') : new THREE.Color('#1c2d42'),
        emissiveMap: winTex,
        emissiveIntensity: isLit ? 1.15 : 0.28,
        roughness: 0.22,
      });

      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 1.82, 0.2), stoneTrimMat);
      frame.position.set(wx, wy, frontZ + 0.02);
      g.add(frame);

      // Arched top pediment cap
      const archCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.68, 0.22, 12, 1, false, 0, Math.PI),
        stoneTrimMat,
      );
      archCap.rotation.z = Math.PI * 0.5;
      archCap.rotation.y = Math.PI * 0.5;
      archCap.position.set(wx, wy + 0.88, frontZ + 0.03);
      g.add(archCap);

      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.56), winMat);
      pane.position.set(wx, wy, frontZ + 0.13);
      g.add(pane);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 0.32), stoneTrimMat);
      sill.position.set(wx, wy - 0.92, frontZ + 0.12);
      g.add(sill);

      // Wrought-iron Juliette balcony on second floor
      if (spec.hasBalcony && row === 1) {
        const balc = new THREE.Group();
        balc.position.set(wx, wy - 0.86, frontZ + 0.38);
        const floor = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 0.68), ironMat);
        balc.add(floor);
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.055, 0.055), ironMat);
        topRail.position.set(0, 0.72, 0.31);
        balc.add(topRail);
        for (let b = -3; b <= 3; b++) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 5), ironMat);
          bar.position.set(b * 0.26, 0.36, 0.31);
          balc.add(bar);
        }
        for (const side of [-1, 1]) {
          const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.66), ironMat);
          sideRail.position.set(side * 0.86, 0.72, 0);
          balc.add(sideRail);
          const sidePost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 5), ironMat);
          sidePost.position.set(side * 0.86, 0.36, 0.31);
          balc.add(sidePost);
        }
        g.add(balc);
      }
    }
  }

  // Striped scalloped fabric awning (provides overhead stealth shadow alcove!)
  if (spec.awning) {
    const awningTex = createAwningStripeTexture(spec.awning.colorA, spec.awning.colorB);
    const awningMat = new THREE.MeshStandardMaterial({
      map: awningTex,
      roughness: 0.72,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const awW = spec.awning.width;
    const awDepth = 2.65;
    const slope = new THREE.Mesh(new THREE.BoxGeometry(awW, 0.09, awDepth), awningMat);
    slope.position.set(0, 3.05, frontZ + awDepth * 0.45);
    slope.rotation.x = 0.28;
    slope.castShadow = true;
    slope.receiveShadow = true;
    g.add(slope);

    const valance = new THREE.Mesh(new THREE.BoxGeometry(awW, 0.36, 0.06), awningMat);
    valance.position.set(0, 2.55, frontZ + awDepth * 0.9);
    valance.castShadow = true;
    g.add(valance);

    // Wrought-iron awning support brackets
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.25, 6), ironMat);
      strut.position.set(sx * (awW * 0.46), 2.38, frontZ + 1.05);
      strut.rotation.x = Math.PI * 0.34;
      g.add(strut);
    }

    // Register overhead stealth shadow zone right in front of the awning
    awningZones.push({
      minX: spec.x - awW * 0.5,
      maxX: spec.x + awW * 0.5,
      minZ: zFront + 0.1,
      maxZ: zFront + 3.2,
    });
  }

  // Vintage glowing brass/noir facade marquee sign
  if (spec.sign) {
    const signTex = createNoirSignTexture(
      spec.sign.label,
      spec.sign.sublabel,
      spec.sign.bg,
      spec.sign.border,
      spec.sign.ink,
    );
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: new THREE.Color('#ffbe66'),
      emissiveMap: signTex,
      emissiveIntensity: 0.85,
      roughness: 0.35,
    });
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.15, 0.18), ironMat);
    signBoard.position.set(0, 3.82, frontZ + 0.16);
    g.add(signBoard);
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.0), signMat);
    signFace.position.set(0, 3.82, frontZ + 0.26);
    g.add(signFace);
  }

  return g;
}

// ---------------------------------------------------------------------------
// Harbor Gantry Crane & Stone Watchtower (Physical Anchors for Searchlights)
// ---------------------------------------------------------------------------

function buildHarborCrane(ironMat: THREE.MeshStandardMaterial, brassMat: THREE.MeshStandardMaterial): {
  group: THREE.Group;
  lampOrigin: THREE.Vector3;
} {
  const group = new THREE.Group();
  const baseX = -30.5;
  const baseZ = 5.2;
  group.position.set(baseX, 0, baseZ);

  // Heavy concrete & riveted steel legs (A-frame gantry)
  const legGeo = new THREE.BoxGeometry(0.42, 7.6, 0.42);
  const legCoords: [number, number][] = [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ];
  for (const [lx, lz] of legCoords) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.85), ironMat);
    foot.position.set(lx, 0.275, lz);
    group.add(foot);

    const leg = new THREE.Mesh(legGeo, ironMat);
    leg.position.set(lx * 0.72, 3.8, lz * 0.72);
    leg.rotation.z = lx > 0 ? 0.12 : -0.12;
    leg.rotation.x = lz > 0 ? -0.12 : 0.12;
    leg.castShadow = true;
    group.add(leg);
  }

  // Cross-bracing rings
  for (const cy of [2.4, 4.8, 7.2]) {
    const s = THREE.MathUtils.lerp(2.7, 1.9, cy / 7.5);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(s, 0.22, s), ironMat);
    ring.position.y = cy;
    group.add(ring);
  }

  // Operator cab with warm amber interior glass
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 2.3), ironMat);
  cab.position.set(0, 8.4, 0);
  cab.castShadow = true;
  group.add(cab);

  const cabGlassMat = new THREE.MeshStandardMaterial({
    color: '#ffe8b5',
    emissive: '#ffad45',
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const cabWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.95), cabGlassMat);
  cabWindow.position.set(1.16, 8.6, 0);
  cabWindow.rotation.y = Math.PI * 0.5;
  group.add(cabWindow);

  // Angled steel lattice crane boom reaching east over the quay
  const boom = new THREE.Group();
  boom.position.set(0.8, 8.8, 0);
  boom.rotation.z = -0.34;
  const chordGeo = new THREE.CylinderGeometry(0.09, 0.11, 11.5, 6);
  chordGeo.rotateZ(Math.PI * 0.5);
  for (const [oy, oz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
    const chord = new THREE.Mesh(chordGeo, ironMat);
    chord.position.set(5.2, oy, oz);
    chord.castShadow = true;
    boom.add(chord);
  }
  // Searchlight housing mount under mid-boom
  const mountHub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.45, 10), brassMat);
  mountHub.position.set(4.5, -0.6, 0);
  boom.add(mountHub);
  group.add(boom);

  // World position of the crane searchlight head
  const lampOrigin = new THREE.Vector3(baseX + 5.0, 9.6, baseZ);
  return { group, lampOrigin };
}

function buildHarborLighthouse(
  stoneMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
  brassMat: THREE.MeshStandardMaterial,
): { group: THREE.Group; lampOrigin: THREE.Vector3 } {
  const group = new THREE.Group();
  const baseX = 30.8;
  const baseZ = 5.4;
  group.position.set(baseX, 0, baseZ);

  // Octagonal stone base & tapered watchtower shaft
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.95, 1.4, 8), stoneMat);
  plinth.position.y = 0.7;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.45, 7.8, 8), stoneMat);
  shaft.position.y = 5.2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // Decorative dark stone gallery ring & iron balustrade
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 1.9, 0.45, 8), ironMat);
  gallery.position.y = 9.25;
  group.add(gallery);

  const railRing = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.055, 6, 16), ironMat);
  railRing.rotation.x = Math.PI * 0.5;
  railRing.position.y = 10.1;
  group.add(railRing);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), ironMat);
    post.position.set(Math.cos(a) * 2.15, 9.75, Math.sin(a) * 2.15);
    group.add(post);
  }

  // Lantern glass chamber + brass cupola roof
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#d8eeff',
    emissive: '#8cc9ff',
    emissiveIntensity: 2.2,
    roughness: 0.15,
    transparent: true,
    opacity: 0.85,
  });
  const lanternRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 1.85, 8), glassMat);
  lanternRoom.position.y = 10.4;
  group.add(lanternRoom);

  const dome = new THREE.Mesh(new THREE.ConeGeometry(1.65, 1.5, 8), brassMat);
  dome.position.y = 12.0;
  dome.castShadow = true;
  group.add(dome);

  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 6), brassMat);
  finial.position.y = 13.05;
  group.add(finial);

  const lampOrigin = new THREE.Vector3(baseX - 1.2, 10.4, baseZ);
  return { group, lampOrigin };
}

// ---------------------------------------------------------------------------
// Moored Harbor Boats (Detailed Multi-Part Wooden Launches & Trawler)
// ---------------------------------------------------------------------------

function buildMooredBoat(
  x: number,
  z: number,
  rotY: number,
  scale: number,
  hullColor: string,
  cabinColor: string,
  woodDeckMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
  brassMat: THREE.MeshStandardMaterial,
  phase: number,
): MooredBoat {
  const group = new THREE.Group();
  const baseY = -0.62;
  group.position.set(x, baseY, z);
  group.rotation.y = rotY;
  group.scale.setScalar(scale);

  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.42,
    metalness: 0.12,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#c8b89a',
    roughness: 0.55,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: cabinColor,
    roughness: 0.52,
  });
  const portholeMat = new THREE.MeshStandardMaterial({
    color: '#fff2cc',
    emissive: '#ffb248',
    emissiveIntensity: 2.6,
    roughness: 0.15,
  });

  // Extruded pointed wooden boat hull shape
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 3.6); // bow
  hullShape.quadraticCurveTo(1.25, 2.2, 1.35, -0.4);
  hullShape.lineTo(1.18, -3.1);
  hullShape.lineTo(-1.18, -3.1);
  hullShape.lineTo(-1.35, -0.4);
  hullShape.quadraticCurveTo(-1.25, 2.2, 0, 3.6);

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 1.05,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.16,
    bevelSegments: 2,
  });
  hullGeo.rotateX(Math.PI * 0.5);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.72;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Raised wooden deck + gunwale rim
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.14, 5.4), woodDeckMat);
  deck.position.set(0, 0.84, -0.15);
  deck.receiveShadow = true;
  group.add(deck);

  for (const sx of [-1, 1]) {
    const gunwale = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 5.3), trimMat);
    gunwale.position.set(sx * 1.12, 0.96, -0.2);
    group.add(gunwale);
    // Rubber harbor fenders along hull side
    for (const fz of [-1.8, 0, 1.5]) {
      const fender = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 6, 10), ironMat);
      fender.rotation.y = Math.PI * 0.5;
      fender.position.set(sx * 1.35, 0.52, fz);
      group.add(fender);
    }
  }

  // Pilothouse cabin with angled windshield & glowing brass portholes
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.35, 2.1), cabinMat);
  cabin.position.set(0, 1.52, -0.75);
  cabin.castShadow = true;
  group.add(cabin);

  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.14, 2.35), trimMat);
  cabinRoof.position.set(0, 2.24, -0.72);
  cabinRoof.castShadow = true;
  group.add(cabinRoof);

  // Warm illuminated portholes
  for (const sx of [-1, 1]) {
    for (const pz of [-1.25, -0.28]) {
      const brassRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 12), brassMat);
      brassRim.rotation.y = Math.PI * 0.5;
      brassRim.position.set(sx * 0.84, 1.62, pz);
      group.add(brassRim);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.17, 10), portholeMat);
      glass.rotation.y = sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      glass.position.set(sx * 0.85, 1.62, pz);
      group.add(glass);
    }
  }
  // Forward cabin windshield
  const windGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.48), portholeMat);
  windGlass.position.set(0, 1.72, 0.31);
  group.add(windGlass);

  // Wooden mast, cross-spar & glowing riding lantern
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 3.6, 8), trimMat);
  mast.position.set(0, 3.4, 0.42);
  mast.castShadow = true;
  group.add(mast);

  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.85, 6), trimMat);
  spar.rotation.z = Math.PI * 0.5;
  spar.position.set(0, 4.35, 0.42);
  group.add(spar);

  const lanternGlass = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), portholeMat);
  lanternGlass.position.set(0, 4.85, 0.42);
  group.add(lanternGlass);

  // Coiled cargo & crates on foredeck
  const foreCrate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 0.85), woodDeckMat);
  foreCrate.position.set(-0.22, 1.2, 1.45);
  foreCrate.rotation.y = 0.25;
  group.add(foreCrate);

  return {
    group,
    baseY,
    baseRotY: rotY,
    phase,
    rollAmp: 0.042 + (phase % 3) * 0.008,
    pitchAmp: 0.028,
    bobAmp: 0.095,
  };
}

// ---------------------------------------------------------------------------
// Street Props: Cargo Crates & Barrels, Mooring Bollards, Benches, Planters
// ---------------------------------------------------------------------------

function buildCargoCoverCluster(
  x: number,
  z: number,
  w: number,
  d: number,
  woodMat: THREE.MeshStandardMaterial,
  darkWoodMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
  tarpColor: string,
  seed: number,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor,
    roughness: 0.68,
    metalness: 0.05,
  });

  // Main stacked timber shipping crates (tall enough to clearly block stealth sightlines!)
  const crateA = new THREE.Mesh(new THREE.BoxGeometry(w * 0.54, 1.48, d * 0.68), woodMat);
  crateA.position.set(-w * 0.2, 0.74, 0);
  crateA.castShadow = true;
  crateA.receiveShadow = true;
  g.add(crateA);

  // Diagonal slat bracing frame on crateA
  const brace = new THREE.Mesh(new THREE.BoxGeometry(w * 0.56, 0.14, d * 0.72), darkWoodMat);
  brace.position.set(-w * 0.2, 1.36, 0);
  g.add(brace);

  // Secondary stacked crate on top
  const crateTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.72, d * 0.46), darkWoodMat);
  crateTop.position.set(-w * 0.18, 1.84, (seed % 2 === 0 ? 1 : -1) * 0.08);
  crateTop.rotation.y = 0.18 * (seed % 2 === 0 ? 1 : -1);
  crateTop.castShadow = true;
  g.add(crateTop);

  // Draped wet canvas tarpaulin crate beside it
  const crateB = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 1.24, d * 0.58), tarpMat);
  crateB.position.set(w * 0.26, 0.62, -d * 0.1);
  crateB.castShadow = true;
  crateB.receiveShadow = true;
  g.add(crateB);

  // Hooped oak harbor barrel tucked beside the crates
  const barrel = new THREE.Group();
  barrel.position.set(w * 0.28, 0, d * 0.32);
  const bBody = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 1.05, 12), darkWoodMat);
  bBody.position.y = 0.525;
  bBody.castShadow = true;
  bBody.receiveShadow = true;
  barrel.add(bBody);
  for (const hy of [0.22, 0.52, 0.84]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.022, 6, 14), ironMat);
    hoop.rotation.x = Math.PI * 0.5;
    hoop.position.y = hy;
    barrel.add(hoop);
  }
  g.add(barrel);

  return g;
}

function buildMooringBollard(
  x: number,
  z: number,
  ironMat: THREE.MeshStandardMaterial,
  ropeMat: THREE.MeshStandardMaterial,
  includeCoil = true,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.14, 10), ironMat);
  base.position.y = 0.07;
  g.add(base);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.62, 10), ironMat);
  post.position.y = 0.44;
  post.castShadow = true;
  g.add(post);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.16, 10), ironMat);
  cap.position.y = 0.78;
  cap.castShadow = true;
  g.add(cap);

  if (includeCoil) {
    // Wrapped hemp rope around bollard & tidy deck coil beside it
    for (let i = 0; i < 3; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.042, 6, 14), ropeMat);
      wrap.rotation.x = Math.PI * 0.5;
      wrap.position.y = 0.24 + i * 0.085;
      g.add(wrap);
    }
    for (let r = 0; r < 3; r++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22 + r * 0.09, 0.042, 6, 16), ropeMat);
      coil.rotation.x = Math.PI * 0.5;
      coil.position.set(0.58, 0.045, -0.22);
      g.add(coil);
    }
  }
  return g;
}

function buildWroughtIronBench(
  x: number,
  z: number,
  rotY: number,
  ironMat: THREE.MeshStandardMaterial,
  woodMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  for (const sx of [-0.95, 0.95]) {
    const legF = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.09), ironMat);
    legF.position.set(sx, 0.26, 0.26);
    g.add(legF);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.98, 0.09), ironMat);
    legB.position.set(sx, 0.49, -0.26);
    g.add(legB);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.62), ironMat);
    arm.position.set(sx, 0.68, 0);
    g.add(arm);
  }
  // Slatted wet timber seat & backrest
  for (let i = 0; i < 3; i++) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.055, 0.14), woodMat);
    seat.position.set(0, 0.48, -0.18 + i * 0.18);
    seat.castShadow = true;
    seat.receiveShadow = true;
    g.add(seat);
  }
  for (let i = 0; i < 3; i++) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.12, 0.055), woodMat);
    back.position.set(0, 0.68 + i * 0.15, -0.26);
    back.rotation.x = -0.16;
    back.castShadow = true;
    g.add(back);
  }
  return g;
}

function buildTreePlanter(
  x: number,
  z: number,
  size: number,
  stoneMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
  soilMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // Raised carved granite kerb planter box
  const h = 0.48;
  const wallT = 0.22;
  const kerbN = new THREE.Mesh(new THREE.BoxGeometry(size, h, wallT), stoneMat);
  kerbN.position.set(0, h * 0.5, -size * 0.5 + wallT * 0.5);
  kerbN.castShadow = true;
  kerbN.receiveShadow = true;
  g.add(kerbN);

  const kerbS = kerbN.clone();
  kerbS.position.z = size * 0.5 - wallT * 0.5;
  g.add(kerbS);

  const kerbW = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, size - wallT * 2), stoneMat);
  kerbW.position.set(-size * 0.5 + wallT * 0.5, h * 0.5, 0);
  kerbW.castShadow = true;
  kerbW.receiveShadow = true;
  g.add(kerbW);

  const kerbE = kerbW.clone();
  kerbE.position.x = size * 0.5 - wallT * 0.5;
  g.add(kerbE);

  // Dark damp soil pad
  const soil = new THREE.Mesh(new THREE.BoxGeometry(size - wallT * 1.8, h - 0.1, size - wallT * 1.8), soilMat);
  soil.position.y = (h - 0.1) * 0.5;
  soil.receiveShadow = true;
  g.add(soil);

  // Decorative cast-iron street-tree grate slats around base
  const grateW = size - wallT * 1.9;
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(grateW, 0.04, 0.06), ironMat);
    bar.position.set(0, h - 0.07, i * (grateW * 0.18));
    g.add(bar);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 14), ironMat);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = h - 0.05;
  g.add(ring);

  return g;
}

function buildHarborBeacon(
  x: number,
  z: number,
  stoneMat: THREE.MeshStandardMaterial,
  ironMat: THREE.MeshStandardMaterial,
  brassMat: THREE.MeshStandardMaterial,
): BeaconRig {
  const group = new THREE.Group();
  group.position.set(x, 0.02, z);

  // Stepped octagonal harbor telegraph / signal lighthouse pedestal
  const step1 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.68, 0.34, 8), stoneMat);
  step1.position.y = 0.17;
  step1.castShadow = true;
  step1.receiveShadow = true;
  group.add(step1);

  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 2.35, 8), ironMat);
  col.position.y = 1.5;
  col.castShadow = true;
  group.add(col);

  const brassBand = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 16), brassMat);
  brassBand.rotation.x = Math.PI * 0.5;
  brassBand.position.y = 2.65;
  group.add(brassBand);

  const lensMat = new THREE.MeshStandardMaterial({
    color: '#ffe9b8',
    emissive: '#94784a',
    emissiveIntensity: 0.75,
    roughness: 0.16,
    metalness: 0.1,
  });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.92, 8), lensMat);
  lens.position.y = 3.15;
  group.add(lens);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), brassMat);
    rib.position.set(Math.cos(a) * 0.56, 3.15, Math.sin(a) * 0.56);
    group.add(rib);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.65, 8), brassMat);
  roof.position.y = 3.92;
  roof.castShadow = true;
  group.add(roof);

  // Ground beacon target ring (lights up brightly once all 5 clues are found)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf4c465,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.55, 36), ringMat);
  ringMesh.rotation.x = -Math.PI * 0.5;
  ringMesh.position.y = 0.06;
  group.add(ringMesh);

  // Skyward signal beam (hidden until all 5 clues are collected!)
  const skyBeamMat = createVolumetricConeMaterial(0xffd272, 0.0);
  const skyBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.55, 22, 20, 1, true), skyBeamMat);
  skyBeam.position.y = 14.2;
  skyBeam.visible = false;
  group.add(skyBeam);

  const pointLight = new THREE.PointLight(0xffcb6b, 1.4, 15, 1.5);
  pointLight.position.set(0, 3.2, 0);
  group.add(pointLight);

  return {
    group,
    position: new THREE.Vector3(x, 0.02, z),
    radius: 3.1,
    lensMat,
    skyBeam,
    skyBeamMat,
    ringMesh,
    ringMat,
    pointLight,
    activated: false,
  };
}

// ---------------------------------------------------------------------------
// Main Environment Builder
// ---------------------------------------------------------------------------

export function createNoirEnvironment(scene: THREE.Scene, atmosphere: AtmosphereRig): NoirEnvironment {
  const root = new THREE.Group();
  root.name = 'NoirQuayEnvironment';
  scene.add(root);

  const walkableZones: WalkableZone[] = [];
  const colliders: BoxCollider[] = [];
  const awningZones: AwningZone[] = [];
  const lampposts: SafeLamppost[] = [];
  const boats: MooredBoat[] = [];
  const trees: DetailedTree[] = [];

  // Shared PBR Materials
  const cobbleMat = createPBRMaterial('cobblestone', {
    repeatX: 16,
    repeatY: 5,
    wet: true,
    tint: '#7c848f',
    seed: 103,
  });
  cobbleMat.roughness = 0.42;
  cobbleMat.envMapIntensity = 1.4;

  const sidewalkMat = createPBRMaterial('sandstone', {
    repeatX: 18,
    repeatY: 1,
    wet: true,
    tint: '#7d828a',
    seed: 204,
  });

  const graniteMat = createPBRMaterial('rock', {
    repeatX: 6,
    repeatY: 2,
    wet: true,
    tint: '#555d68',
    seed: 305,
  });

  const pierWoodMat = createPBRMaterial('woodPlanks', {
    repeatX: 3,
    repeatY: 5,
    wet: true,
    tint: '#7a5c46',
    seed: 406,
  });
  pierWoodMat.roughness = 0.46;

  const crateWoodMat = createPBRMaterial('woodPlanks', {
    repeatX: 1,
    repeatY: 1,
    wet: true,
    tint: '#8b6542',
    seed: 507,
  });

  const darkWoodMat = createPBRMaterial('woodPlanks', {
    repeatX: 1,
    repeatY: 1,
    wet: true,
    tint: '#4a3527',
    seed: 608,
  });

  const roofSlateMat = createPBRMaterial('roofTiles', {
    repeatX: 3,
    repeatY: 2,
    wet: true,
    tint: '#465261',
    seed: 709,
  });

  const brassMat = createPBRMaterial('brushedBrass', {
    repeatX: 1,
    repeatY: 1,
    tint: '#d9a95c',
    seed: 810,
  });

  const soilMat = createPBRMaterial('grassSoil', {
    repeatX: 2,
    repeatY: 2,
    wet: true,
    tint: '#3c342b',
    seed: 911,
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: '#252c36',
    roughness: 0.36,
    metalness: 0.82,
  });

  const ropeMat = new THREE.MeshStandardMaterial({
    color: '#8f7856',
    roughness: 0.92,
    metalness: 0.02,
  });

  // -------------------------------------------------------------------------
  // 1. Main Cobblestone Harbor Promenade + Seawall + Raised Sidewalk Curb
  // -------------------------------------------------------------------------
  const quayMesh = new THREE.Mesh(new THREE.BoxGeometry(74, 2.4, 22), cobbleMat);
  quayMesh.position.set(0, -1.2, -2.8);
  quayMesh.receiveShadow = true;
  root.add(quayMesh);

  // Drivable promenade zone
  walkableZones.push({ minX: -32.2, maxX: 32.2, minZ: -9.4, maxZ: 7.45, elevation: 0 });

  // Raised sidewalk curb along the European facades
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(74, 0.22, 3.2), sidewalkMat);
  sidewalk.position.set(0, 0.11, -11.35);
  sidewalk.receiveShadow = true;
  root.add(sidewalk);

  // Far east/west framing stone harbor extensions (scenic wings beyond drivable bounds)
  const wingGeo = new THREE.BoxGeometry(16, 2.4, 24);
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, graniteMat);
    wing.position.set(sx * 44, -1.15, -3.5);
    wing.receiveShadow = true;
    root.add(wing);
  }

  // Heavy granite seawall coping segments (leaving clean wide openings onto the 3 wooden piers!)
  const copingSegments: [number, number][] = [
    [-36.5, -18.6],
    [-10.4, -3.1],
    [4.3, 11.4],
    [19.6, 36.5],
  ];
  for (const [x0, x1] of copingSegments) {
    const len = x1 - x0;
    const cx = (x0 + x1) * 0.5;
    const coping = new THREE.Mesh(new THREE.BoxGeometry(len, 0.34, 0.72), graniteMat);
    coping.position.set(cx, 0.17, 7.92);
    coping.castShadow = true;
    coping.receiveShadow = true;
    root.add(coping);

    // Timber seawall rubbing fenders vertically on water face
    for (let fx = x0 + 1.5; fx < x1 - 1.0; fx += 3.6) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.1, 0.24), darkWoodMat);
      fender.position.set(fx, -0.82, 8.32);
      root.add(fender);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Three Extending Wooden Piers (West Customs, Central Ferry, East Beacon)
  // -------------------------------------------------------------------------
  const piers: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [
    { minX: -18.5, maxX: -10.5, minZ: 7.45, maxZ: 20.0 },
    { minX: -3.0, maxX: 4.2, minZ: 7.45, maxZ: 13.4 },
    { minX: 11.5, maxX: 19.5, minZ: 7.45, maxZ: 21.5 },
  ];

  for (const p of piers) {
    const pw = p.maxX - p.minX;
    const pd = p.maxZ - p.minZ;
    const cx = (p.minX + p.maxX) * 0.5;
    const cz = (p.minZ + p.maxZ) * 0.5;

    walkableZones.push({
      minX: p.minX + 0.45,
      maxX: p.maxX - 0.45,
      minZ: p.minZ - 0.3,
      maxZ: p.maxZ - 0.55,
      elevation: 0.02,
    });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.26, pd), pierWoodMat);
    deck.position.set(cx, -0.11, cz);
    deck.receiveShadow = true;
    deck.castShadow = true;
    root.add(deck);

    // Timber side stringer curbs
    for (const sx of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, pd), darkWoodMat);
      curb.position.set(cx + sx * (pw * 0.5 - 0.13), 0.1, cz);
      curb.castShadow = true;
      root.add(curb);
    }
    // End curb
    const endCurb = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.2, 0.28), darkWoodMat);
    endCurb.position.set(cx, 0.1, p.maxZ - 0.14);
    endCurb.castShadow = true;
    root.add(endCurb);

    // Sturdy timber pilings plunged deep into the harbor water + diagonal cross-braces
    const pileGeo = new THREE.CylinderGeometry(0.2, 0.24, 3.1, 8);
    const zSteps = Math.max(2, Math.round(pd / 3.4));
    for (let zi = 1; zi <= zSteps; zi++) {
      const pz = p.minZ + (pd * zi) / zSteps;
      for (const px of [p.minX + 0.35, cx, p.maxX - 0.35]) {
        const pile = new THREE.Mesh(pileGeo, darkWoodMat);
        pile.position.set(px, -1.25, pz - 0.25);
        pile.castShadow = true;
        root.add(pile);
      }
    }
  }

  // Heavy cast-iron mooring bollards & coiled ropes along quay & pier corners
  const bollardSpots: [number, number, boolean][] = [
    [-25.5, 7.8, true],
    [-19.2, 7.8, false],
    [-17.8, 19.2, true],
    [-11.2, 19.2, false],
    [-9.6, 7.8, true],
    [-2.4, 12.8, true],
    [3.6, 12.8, false],
    [5.0, 7.8, true],
    [10.8, 7.8, false],
    [12.2, 19.6, true],
    [18.8, 19.6, true],
    [20.4, 7.8, true],
    [26.5, 7.8, false],
  ];
  for (const [bx, bz, coil] of bollardSpots) {
    root.add(buildMooringBollard(bx, bz, ironMat, ropeMat, coil));
  }

  // -------------------------------------------------------------------------
  // 3. Reflective Rainwater Puddles + Expanding Raindrop Splash Ripples
  // -------------------------------------------------------------------------
  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: '#132030',
    roughness: 0.04,
    metalness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.35,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  const puddleSpecs: { x: number; z: number; rx: number; rz: number; rot: number }[] = [
    { x: -24.5, z: -3.2, rx: 2.6, rz: 1.5, rot: 0.2 },
    { x: -17.5, z: 3.4, rx: 3.1, rz: 1.7, rot: -0.15 },
    { x: -12.5, z: -4.2, rx: 2.5, rz: 1.4, rot: 0.35 },
    { x: -6.8, z: 2.8, rx: 3.4, rz: 1.8, rot: -0.1 },
    { x: -2.0, z: -2.4, rx: 2.9, rz: 1.5, rot: 0.25 },
    { x: 4.5, z: 3.8, rx: 3.2, rz: 1.6, rot: -0.22 },
    { x: 11.2, z: -4.0, rx: 2.8, rz: 1.5, rot: 0.14 },
    { x: 15.8, z: 4.2, rx: 3.0, rz: 1.7, rot: -0.08 },
    { x: 23.5, z: 0.8, rx: 2.9, rz: 1.6, rot: 0.3 },
    { x: -14.4, z: 14.5, rx: 1.9, rz: 1.2, rot: 0.08 },
    { x: 15.6, z: 15.2, rx: 1.8, rz: 1.2, rot: -0.12 },
  ];

  const puddleRipples: PuddleRipple[] = [];
  for (let i = 0; i < puddleSpecs.length; i++) {
    const p = puddleSpecs[i];
    const shape = new THREE.Shape();
    const pts = 18;
    for (let k = 0; k < pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const wobble = 0.84 + 0.16 * Math.sin(a * 3 + i * 2.1) + 0.08 * Math.cos(a * 5 - i);
      const px = Math.cos(a) * p.rx * wobble;
      const py = Math.sin(a) * p.rz * wobble;
      if (k === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape, 16);
    geo.rotateX(-Math.PI * 0.5);
    const mesh = new THREE.Mesh(geo, puddleMat);
    mesh.position.set(p.x, p.z > 8 ? 0.038 : 0.018, p.z);
    mesh.rotation.y = p.rot;
    mesh.receiveShadow = true;
    root.add(mesh);

    // Seed 3 animated raindrop ripple rings per puddle
    for (let r = 0; r < 3; r++) {
      puddleRipples.push({
        x: p.x + Math.cos(i * 3.1 + r * 2.2) * p.rx * 0.45,
        z: p.z + Math.sin(i * 2.3 + r * 2.7) * p.rz * 0.45,
        phase: (i * 0.27 + r * 0.33) % 1,
        speed: 0.72 + ((i + r) % 3) * 0.18,
        maxScale: 0.45 + ((i + r) % 4) * 0.14,
      });
    }
  }

  const rippleGeo = new THREE.RingGeometry(0.75, 1.0, 18);
  rippleGeo.rotateX(-Math.PI * 0.5);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xaad0f0,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rippleMesh = new THREE.InstancedMesh(rippleGeo, rippleMat, puddleRipples.length);
  rippleMesh.frustumCulled = false;
  root.add(rippleMesh);
  const rippleDummy = new THREE.Object3D();

  // -------------------------------------------------------------------------
  // 4. Moody Midnight Harbor Water
  // -------------------------------------------------------------------------
  const water: WaterSurface = createWaterSurface({
    width: 220,
    depth: 130,
    segments: 84,
    deepColor: '#050b18',
    shallowColor: '#0e243a',
    skyColor: '#253c56',
    foamColor: '#7ca2c4',
    sunDirection: atmosphere.sunDirection,
    sunColor: '#a8cbf0',
    waveSpeed: 0.78,
    waveScale: 0.95,
    waveHeight: 0.11,
    edgeFoamWidth: 0.03,
    opacity: 0.96,
    fogColor: atmosphere.fogColor,
    fogDensity: atmosphere.fogDensity,
  });
  water.mesh.position.set(0, -0.82, 64);
  root.add(water.mesh);

  // -------------------------------------------------------------------------
  // 5. Row of 6 Detailed European Brick & Stone Waterfront Townhouses
  // -------------------------------------------------------------------------
  const buildings: BuildingSpec[] = [
    {
      x: -29.5,
      width: 10.2,
      height: 10.6,
      depth: 8.4,
      wallTint: '#59423a',
      wallType: 'cobblestone',
      roofTint: '#364150',
      stories: 3,
      windowsPerRow: 3,
      hasBalcony: true,
      seed: 11,
    },
    {
      x: -19.2,
      width: 9.8,
      height: 11.8,
      depth: 8.6,
      wallTint: '#6c493b',
      wallType: 'sandstone',
      roofTint: '#3e4a58',
      stories: 3,
      windowsPerRow: 3,
      awning: { colorA: '#6b1d28', colorB: '#d8cbb0', width: 7.8 },
      sign: {
        label: 'LE PHARE NOIR',
        sublabel: 'JAZZ & CABARET • QUAI III',
        bg: '#191418',
        border: '#d6a451',
        ink: '#ffdf9e',
      },
      hasBalcony: true,
      seed: 22,
    },
    {
      x: -8.6,
      width: 10.6,
      height: 13.0,
      depth: 8.8,
      wallTint: '#69645a',
      wallType: 'sandstone',
      roofTint: '#384654',
      stories: 4,
      windowsPerRow: 4,
      hasBalcony: true,
      seed: 33,
    },
    {
      x: 2.4,
      width: 10.4,
      height: 11.4,
      depth: 8.5,
      wallTint: '#5b4b43',
      wallType: 'cobblestone',
      roofTint: '#35404d',
      stories: 3,
      windowsPerRow: 3,
      awning: { colorA: '#1d4538', colorB: '#d9ceb4', width: 7.4 },
      sign: {
        label: 'DOUANES DU PORT',
        sublabel: 'CUSTOMS & TELEGRAPH',
        bg: '#141e22',
        border: '#c79a4b',
        ink: '#f5e4bc',
      },
      hasBalcony: false,
      seed: 44,
    },
    {
      x: 13.2,
      width: 10.2,
      height: 12.6,
      depth: 8.8,
      wallTint: '#6a5244',
      wallType: 'sandstone',
      roofTint: '#3c4957',
      stories: 4,
      windowsPerRow: 3,
      hasBalcony: true,
      seed: 55,
    },
    {
      x: 24.4,
      width: 11.6,
      height: 10.8,
      depth: 8.8,
      wallTint: '#4f555c',
      wallType: 'cobblestone',
      roofTint: '#323c48',
      stories: 3,
      windowsPerRow: 4,
      awning: { colorA: '#1d2d4a', colorB: '#cfb98a', width: 8.4 },
      sign: {
        label: 'ENTREPÔT MARITIME',
        sublabel: 'FREIGHT & CLOCKWORK CARGO',
        bg: '#151b26',
        border: '#c99b4d',
        ink: '#f3d9a4',
      },
      hasBalcony: false,
      seed: 66,
    },
  ];

  for (const b of buildings) {
    root.add(buildWaterfrontFacade(b, roofSlateMat, ironMat, graniteMat, darkWoodMat, awningZones));
  }

  // Harbor Crane (West) & Stone Watchtower/Lighthouse (East)
  const crane = buildHarborCrane(ironMat, brassMat);
  root.add(crane.group);
  colliders.push({
    minX: -32.6,
    maxX: -28.4,
    minZ: 3.1,
    maxZ: 7.3,
    height: 9.0,
    blocksSight: true,
    label: 'Harbor Crane',
  });

  const lighthouse = buildHarborLighthouse(graniteMat, ironMat, brassMat);
  root.add(lighthouse.group);
  colliders.push({
    minX: 28.0,
    maxX: 33.6,
    minZ: 2.6,
    maxZ: 8.2,
    height: 11.0,
    blocksSight: true,
    label: 'Harbor Watchtower',
  });

  // -------------------------------------------------------------------------
  // 6. Stealth Cover: Cargo Crates & Barrels + Street-Tree Planters + Benches
  // -------------------------------------------------------------------------
  const cargoClusters: { x: number; z: number; w: number; d: number; tarp: string; seed: number }[] = [
    { x: -21.0, z: 2.5, w: 2.5, d: 1.9, tarp: '#2b4037', seed: 1 },
    { x: -16.4, z: 12.2, w: 2.1, d: 2.0, tarp: '#3c2e2b', seed: 2 },
    { x: -11.2, z: 0.2, w: 2.5, d: 1.8, tarp: '#253447', seed: 3 },
    { x: -1.2, z: 2.2, w: 2.6, d: 1.9, tarp: '#2d3f35', seed: 4 },
    { x: 9.8, z: -0.4, w: 2.5, d: 1.9, tarp: '#3f2c2c', seed: 5 },
    { x: 19.8, z: 2.6, w: 2.5, d: 1.9, tarp: '#263547', seed: 6 },
    { x: 13.2, z: 13.0, w: 2.1, d: 1.9, tarp: '#2c3d32', seed: 7 },
  ];

  for (const c of cargoClusters) {
    root.add(buildCargoCoverCluster(c.x, c.z, c.w, c.d, crateWoodMat, darkWoodMat, ironMat, c.tarp, c.seed));
    colliders.push({
      minX: c.x - c.w * 0.54,
      maxX: c.x + c.w * 0.54,
      minZ: c.z - c.d * 0.54,
      maxZ: c.z + c.d * 0.54,
      height: 1.8,
      blocksSight: true,
      label: 'Cargo Crates',
    });
  }

  // Wrought-iron benches along the seawall facing the harbor
  const benchPositions: [number, number][] = [
    [-23.2, 6.2],
    [-8.4, 6.2],
    [8.6, 6.2],
    [23.2, 6.2],
  ];
  for (const [bx, bz] of benchPositions) {
    root.add(buildWroughtIronBench(bx, bz, 0, ironMat, darkWoodMat));
    colliders.push({
      minX: bx - 1.15,
      maxX: bx + 1.15,
      minZ: bz - 0.48,
      maxZ: bz + 0.48,
      height: 0.9,
      blocksSight: false,
      label: 'Park Bench',
    });
  }

  // -------------------------------------------------------------------------
  // 7. Botanical Craft: Cypress & Oak Trees in Iron Street-Tree Grates, Grass & Ferns
  // -------------------------------------------------------------------------
  const planterSpecs: { x: number; z: number; size: number; style: 'cypress' | 'oak'; height: number; seed: number }[] = [
    { x: -26.2, z: -3.2, size: 2.15, style: 'oak', height: 6.8, seed: 41 },
    { x: -14.5, z: -6.4, size: 1.85, style: 'cypress', height: 7.4, seed: 42 },
    { x: -3.5, z: -5.9, size: 1.85, style: 'cypress', height: 7.0, seed: 43 },
    { x: 7.5, z: -6.2, size: 2.15, style: 'oak', height: 6.6, seed: 44 },
    { x: 18.0, z: -5.8, size: 1.85, style: 'cypress', height: 7.6, seed: 45 },
    { x: 27.6, z: -3.0, size: 1.85, style: 'cypress', height: 7.1, seed: 46 },
  ];

  for (const p of planterSpecs) {
    root.add(buildTreePlanter(p.x, p.z, p.size, graniteMat, ironMat, soilMat));
    const tree = createDetailedTree({
      style: p.style,
      height: p.height,
      seed: p.seed,
      canopyDensity: 0.92,
      castShadow: true,
      receiveShadow: true,
    });
    tree.group.position.set(p.x, 0.36, p.z);
    root.add(tree.group);
    trees.push(tree);

    // Lush ferns nestled inside the wet street planter soil
    for (let fi = 0; fi < 2; fi++) {
      const angle = p.seed + fi * 2.6;
      const fern = createFernCluster({
        frondCount: 8,
        radius: 0.62,
        height: 0.45,
        color: '#2c4f37',
        seed: p.seed * 10 + fi,
        castShadow: false,
      });
      fern.position.set(
        p.x + Math.cos(angle) * (p.size * 0.28),
        0.38,
        p.z + Math.sin(angle) * (p.size * 0.28),
      );
      root.add(fern);
    }

    colliders.push({
      minX: p.x - p.size * 0.54,
      maxX: p.x + p.size * 0.54,
      minZ: p.z - p.size * 0.54,
      maxZ: p.z + p.size * 0.54,
      height: 2.4,
      blocksSight: true,
      label: 'Tree Planter',
    });
  }

  // Framing background cypress & oak trees at far ends of the harbor promenade + mossy seawall boulders
  const wingTrees: { x: number; z: number; style: 'cypress' | 'oak'; height: number; seed: number }[] = [
    { x: -37.2, z: -4.5, style: 'cypress', height: 8.2, seed: 81 },
    { x: -39.5, z: 2.2, style: 'oak', height: 7.4, seed: 82 },
    { x: 37.5, z: -4.2, style: 'cypress', height: 8.4, seed: 83 },
    { x: 39.8, z: 2.8, style: 'oak', height: 7.2, seed: 84 },
  ];
  for (const wt of wingTrees) {
    const t = createDetailedTree({
      style: wt.style,
      height: wt.height,
      seed: wt.seed,
      canopyDensity: 0.85,
      castShadow: false,
      receiveShadow: true,
    });
    t.group.position.set(wt.x, 0, wt.z);
    root.add(t.group);
    trees.push(t);
  }

  // Weathered mossy boulders & rain-beaten fern pockets along seawall breakwaters & curb corners
  const boulderSpots: [number, number, number, number][] = [
    [-35.0, 8.6, 1.35, 201],
    [-33.6, 9.6, 0.95, 202],
    [34.8, 8.8, 1.4, 203],
    [33.4, 9.8, 0.92, 204],
  ];
  for (const [bx, bz, rad, seed] of boulderSpots) {
    const b = createMossyBoulder({
      radius: rad,
      mossAmount: 0.65,
      stoneTint: '#48525e',
      mossColor: '#2d4732',
      seed,
      castShadow: false,
    });
    b.position.set(bx, -0.55, bz);
    root.add(b);
  }

  // Seawall & facade crack ferns
  const crackFerns: [number, number, number][] = [
    [-29.5, -9.7, 301],
    [-12.2, -9.7, 302],
    [-4.8, -9.7, 303],
    [6.4, -9.7, 304],
    [16.2, -9.7, 305],
    [28.5, -9.7, 306],
    [-26.0, 7.5, 307],
    [-5.2, 7.5, 308],
    [8.8, 7.5, 309],
    [25.2, 7.5, 310],
  ];
  for (const [fx, fz, seed] of crackFerns) {
    const fern = createFernCluster({
      frondCount: 6,
      radius: 0.52,
      height: 0.36,
      color: '#2a4c36',
      seed,
      castShadow: false,
    });
    fern.position.set(fx, 0.02, fz);
    root.add(fern);
  }

  // Rain-beaten interactive grass tufts growing in street planters, sidewalk foundation seams & seawall cracks
  const grassField: GrassField = createGrassField({
    area: { minX: -32.5, maxX: 32.5, minZ: -10.2, maxZ: 8.0 },
    count: 2400,
    bladeHeightRange: [0.16, 0.38],
    bladeWidth: 0.048,
    baseColor: '#1a2f22',
    tipColor: '#3f6a4b',
    dryColor: '#4c573c',
    windStrength: 0.85,
    pushRadius: 1.5,
    pushStrength: 0.85,
    seed: 512,
    castShadow: false,
    heightAt: (x, z) => {
      for (const p of planterSpecs) {
        if (Math.abs(x - p.x) < p.size * 0.44 && Math.abs(z - p.z) < p.size * 0.44) {
          return 0.38;
        }
      }
      return 0.0;
    },
    mask: (x, z) => {
      // Inside street-tree planters
      for (const p of planterSpecs) {
        if (Math.abs(x - p.x) < p.size * 0.42 && Math.abs(z - p.z) < p.size * 0.42) {
          return true;
        }
      }
      // Sidewalk curb seam along building foundations
      if (z < -9.55 && z > -10.15) {
        return Math.sin(x * 0.85) > -0.25;
      }
      // Seawall stone cracks (avoid pier mouths!)
      if (z > 7.35 && z < 7.85) {
        const inPierMouth =
          (x > -18.8 && x < -10.2) ||
          (x > -3.3 && x < 4.5) ||
          (x > 11.2 && x < 19.8);
        if (!inPierMouth) {
          return Math.cos(x * 1.1) > 0.15;
        }
      }
      return false;
    },
  });
  root.add(grassField.mesh);

  // -------------------------------------------------------------------------
  // 8. Cast-Iron Noir Streetlamps with Warm Amber Volumetric Light Cones
  // -------------------------------------------------------------------------
  const haloTex = createRadialGlowTexture('rgba(255, 224, 150, 0.9)', 'rgba(255, 174, 72, 0.32)');
  const haloMat = new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const lampConfigs: {
    id: string;
    x: number;
    z: number;
    withLight: boolean;
    spawnOffset: [number, number];
    spawnYaw: number;
  }[] = [
    { id: 'lamp-west-prom', x: -24.2, z: -8.2, withLight: true, spawnOffset: [0.2, 2.2], spawnYaw: -Math.PI * 0.45 },
    { id: 'lamp-start', x: -5.2, z: 6.2, withLight: true, spawnOffset: [0.0, -1.5], spawnYaw: -Math.PI * 0.36 },
    { id: 'lamp-west-pier', x: -10.9, z: 8.5, withLight: false, spawnOffset: [-2.4, 1.4], spawnYaw: Math.PI },
    { id: 'lamp-center', x: -2.6, z: -8.3, withLight: false, spawnOffset: [1.2, 1.4], spawnYaw: -Math.PI * 0.5 },
    { id: 'lamp-east-quay', x: 6.4, z: 6.2, withLight: true, spawnOffset: [0.6, -1.8], spawnYaw: -Math.PI * 0.5 },
    { id: 'lamp-east-pier', x: 11.9, z: 8.5, withLight: false, spawnOffset: [2.8, 1.6], spawnYaw: Math.PI },
    { id: 'lamp-east-prom', x: 19.2, z: -8.3, withLight: true, spawnOffset: [1.4, 1.4], spawnYaw: Math.PI * 0.45 },
  ];

  const lampConeGeo = new THREE.ConeGeometry(2.85, 4.1, 20, 1, true);
  lampConeGeo.translate(0, -2.05, 0);
  const haloGeo = new THREE.PlaneGeometry(2.1, 2.1);

  for (const cfg of lampConfigs) {
    const lantern = createLantern('noir_street', {
      scale: 1.05,
      withLight: cfg.withLight,
      lightColor: 0xffba5c,
      lightIntensity: 7.4,
      lightDistance: 25,
      castShadow: false,
    });
    lantern.position.set(cfg.x, 0, cfg.z);
    root.add(lantern);

    // Translucent volumetric amber rain-mist cone
    const coneMat = createVolumetricConeMaterial(0xffb85c, 0.22);
    const cone = new THREE.Mesh(lampConeGeo, coneMat);
    cone.position.set(0, 4.02, 0);
    lantern.add(cone);

    // Soft billboard glow halo at the lantern glass
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.set(0, 4.0, 0);
    lantern.add(haloMesh);

    // Subtle warm amber safe-zone reflection ring on wet cobbles
    const safePool = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 24),
      new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    safePool.rotation.x = -Math.PI * 0.5;
    safePool.position.set(0, 0.03, 0);
    lantern.add(safePool);

    colliders.push({
      minX: cfg.x - 0.42,
      maxX: cfg.x + 0.42,
      minZ: cfg.z - 0.42,
      maxZ: cfg.z + 0.42,
      height: 4.2,
      blocksSight: false,
      label: 'Streetlamp',
    });

    lampposts.push({
      id: cfg.id,
      position: new THREE.Vector3(cfg.x, 0, cfg.z),
      spawnPos: new THREE.Vector3(cfg.x + cfg.spawnOffset[0], 0, cfg.z + cfg.spawnOffset[1]),
      spawnYaw: cfg.spawnYaw,
      haloMesh,
      coneMat,
      pointLight: lantern.userData.light as THREE.PointLight | undefined,
      baseIntensity: 7.4,
    });
  }

  // -------------------------------------------------------------------------
  // 9. Three Detailed Bobbing Moored Harbor Boats + Mooring Ropes
  // -------------------------------------------------------------------------
  const boatConfigs: {
    x: number;
    z: number;
    rotY: number;
    scale: number;
    hull: string;
    cabin: string;
    phase: number;
    bollard: [number, number];
  }[] = [
    // Fishing trawler moored off Central Ferry Landing
    { x: -6.2, z: 12.6, rotY: Math.PI * 0.48, scale: 1.08, hull: '#2c3d4d', cabin: '#d5cbb8', phase: 0.4, bollard: [-9.6, 7.8] },
    // Sleek customs patrol launch alongside West Customs Pier
    { x: -21.8, z: 15.6, rotY: 0.08, scale: 1.0, hull: '#263442', cabin: '#c8bc9e', phase: 2.1, bollard: [-17.8, 19.2] },
    // Smugglers' cargo skiff beside East Harbor Master Pier
    { x: 7.4, z: 15.2, rotY: -0.14, scale: 0.96, hull: '#4e2926', cabin: '#cfc1a7', phase: 4.0, bollard: [12.2, 19.6] },
  ];

  for (const bc of boatConfigs) {
    const boat = buildMooredBoat(
      bc.x,
      bc.z,
      bc.rotY,
      bc.scale,
      bc.hull,
      bc.cabin,
      pierWoodMat,
      ironMat,
      brassMat,
      bc.phase,
    );
    root.add(boat.group);
    boats.push(boat);

    // Taut hemp mooring line from bollard to boat bow/stern cleat
    const startPt = new THREE.Vector3(bc.bollard[0], 0.48, bc.bollard[1]);
    const endPt = new THREE.Vector3(bc.x, 0.35, bc.z);
    const lineVec = new THREE.Vector3().subVectors(endPt, startPt);
    const lineLen = lineVec.length();
    const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, lineLen, 6), ropeMat);
    ropeMesh.position.copy(startPt).addScaledVector(lineVec, 0.5);
    ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lineVec.normalize());
    root.add(ropeMesh);
  }

  // -------------------------------------------------------------------------
  // 10. Harbor Master's Pier Beacon (Final Objective at Tip of East Pier)
  // -------------------------------------------------------------------------
  const beacon = buildHarborBeacon(15.5, 19.6, graniteMat, ironMat, brassMat);
  root.add(beacon.group);
  colliders.push({
    minX: 14.3,
    maxX: 16.7,
    minZ: 18.4,
    maxZ: 20.8,
    height: 3.6,
    blocksSight: false,
    label: 'Harbor Beacon',
  });

  // -------------------------------------------------------------------------
  // 11. Weather: Dense Falling Rain + Drifting Low Harbor Mist
  // -------------------------------------------------------------------------
  const rainSystem: ParticleSystem = createParticleSystem({
    type: 'rain',
    count: 1500,
    bounds: { width: 46, height: 22, depth: 36 },
    wind: new THREE.Vector3(-2.6, 0, 1.3),
    size: 1.05,
    ambient: true,
    burstCapacity: 16,
  });
  root.add(rainSystem.group);

  // Soft low-lying drifting harbor mist sheets hovering over water & seawall
  const mistTex = createRadialGlowTexture('rgba(145, 178, 210, 0.22)', 'rgba(110, 146, 180, 0.08)');
  const mistMat = new THREE.MeshBasicMaterial({
    map: mistTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mistGeo = new THREE.PlaneGeometry(18, 9);
  const mistSheets: { mesh: THREE.Mesh; baseX: number; speed: number; phase: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(mistGeo, mistMat);
    const bx = -32 + i * 6.2;
    const bz = i % 2 === 0 ? 11.5 + (i % 3) * 4.5 : -2.0 + (i % 4) * 3.0;
    m.position.set(bx, 1.65 + (i % 3) * 0.5, bz);
    m.rotation.x = -0.18;
    root.add(m);
    mistSheets.push({ mesh: m, baseX: bx, speed: 0.45 + (i % 3) * 0.16, phase: i * 1.1 });
  }

  // -------------------------------------------------------------------------
  // Per-Frame Environment Update
  // -------------------------------------------------------------------------
  const update = (dt: number, elapsed: number, playerPos: THREE.Vector3, cameraPos?: THREE.Vector3): void => {
    // 1. Swaying rain-beaten foliage & player-reactive grass
    updateFoliageWind(elapsed, 1.45);
    grassField.update(elapsed, playerPos);

    // 2. Rippling harbor water
    water.update(elapsed, scene);

    // 3. Falling rain tracks player
    rainSystem.update(dt, playerPos);

    // 4. Gently bobbing moored harbor boats
    for (const b of boats) {
      const t = elapsed * 1.25 + b.phase;
      b.group.position.y = b.baseY + Math.sin(t) * b.bobAmp;
      b.group.rotation.z = Math.sin(t * 0.85) * b.rollAmp;
      b.group.rotation.x = Math.cos(t * 0.72) * b.pitchAmp;
      b.group.rotation.y = b.baseRotY + Math.sin(t * 0.35) * 0.025;
    }

    // 5. Animated raindrop ripples on puddles
    for (let i = 0; i < puddleRipples.length; i++) {
      const r = puddleRipples[i];
      r.phase = (r.phase + dt * r.speed) % 1;
      const s = 0.08 + r.phase * r.maxScale;
      const fade = Math.sin(r.phase * Math.PI);
      rippleDummy.position.set(r.x, r.z > 8 ? 0.044 : 0.024, r.z);
      rippleDummy.scale.set(s, 1, s * (0.75 + fade * 0.25));
      rippleDummy.rotation.set(0, 0, 0);
      rippleDummy.updateMatrix();
      rippleMesh.setMatrixAt(i, rippleDummy.matrix);
    }
    rippleMesh.instanceMatrix.needsUpdate = true;

    // 6. Volumetric streetlamp flicker, camera billboard halo & mist shimmer
    for (let i = 0; i < lampposts.length; i++) {
      const lp = lampposts[i];
      lp.coneMat.uniforms.uTime.value = elapsed + i * 1.7;
      if (cameraPos) {
        lp.haloMesh.lookAt(cameraPos);
      }
      if (lp.pointLight) {
        const flicker = 0.96 + 0.04 * Math.sin(elapsed * 7.5 + i * 2.3) * Math.cos(elapsed * 3.1 + i);
        lp.pointLight.intensity = lp.baseIntensity * flicker;
      }
    }

    // 7. Drifting harbor mist
    for (const ms of mistSheets) {
      ms.mesh.position.x = ms.baseX + Math.sin(elapsed * 0.16 * ms.speed + ms.phase) * 5.2;
    }

    // 8. Harbor Master's Pier Beacon pulse
    if (beacon.activated) {
      const pulse = 0.75 + 0.25 * Math.sin(elapsed * 4.5);
      beacon.skyBeam.visible = true;
      beacon.skyBeamMat.uniforms.uTime.value = elapsed;
      beacon.skyBeamMat.uniforms.uOpacity.value = 0.36 + 0.1 * pulse;
      beacon.lensMat.emissive.setHex(0xffd46b);
      beacon.lensMat.emissiveIntensity = 3.2 + pulse * 1.4;
      beacon.pointLight.intensity = 6.5 + pulse * 2.5;
      beacon.pointLight.distance = 26;
      beacon.ringMat.opacity = 0.55 + pulse * 0.35;
      beacon.ringMesh.scale.setScalar(1.0 + Math.sin(elapsed * 3.5) * 0.08);
    } else {
      beacon.skyBeam.visible = false;
      beacon.ringMat.opacity = 0.16 + 0.06 * Math.sin(elapsed * 2.0);
    }
  };

  const dispose = (): void => {
    for (const t of trees) t.dispose();
    grassField.dispose();
    water.dispose();
    rainSystem.dispose();
  };

  return {
    root,
    walkableZones,
    colliders,
    awningZones,
    lampposts,
    boats,
    craneHeadOrigin: crane.lampOrigin,
    lighthouseHeadOrigin: lighthouse.lampOrigin,
    beacon,
    update,
    dispose,
  };
}
