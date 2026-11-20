import * as THREE from 'three';
import {
  ASTROLABE_CENTER,
  BUMPERS,
  PLAYFIELD_HALF_W,
  PLAYFIELD_MAX_Z,
  PLAYFIELD_MIN_Z,
  ZODIAC_LANES,
} from './constants';

export interface StarlightTextures {
  playfieldMap: THREE.CanvasTexture;
  playfieldRoughness: THREE.CanvasTexture;
  bumperCapMap: THREE.CanvasTexture;
  backglassMap: THREE.CanvasTexture;
  runeMaps: THREE.CanvasTexture[];
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Maps playfield world (x, z) into normalized UV [0..1] for the star-chart canvas.
 * Matches the exact UV projection used on the custom playfield ShapeGeometry.
 */
export function worldToPlayfieldUV(x: number, z: number): [number, number] {
  const u = (x + PLAYFIELD_HALF_W) / (PLAYFIELD_HALF_W * 2);
  const v = (z - PLAYFIELD_MIN_Z) / (PLAYFIELD_MAX_Z - PLAYFIELD_MIN_Z);
  return [u, v];
}

function createStarChartPlayfieldTextures(): {
  map: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const w = 1024;
  const h = 1536;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const rCanvas = document.createElement('canvas');
  rCanvas.width = 512;
  rCanvas.height = 768;
  const rCtx = rCanvas.getContext('2d')!;

  const toPx = (wx: number, wz: number): [number, number] => {
    const [u, v] = worldToPlayfieldUV(wx, wz);
    return [u * w, v * h];
  };

  // 1. Rich celestial midnight-navy / indigo lacquered enamel gradient
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 60, w * 0.5, h * 0.5, h * 0.62);
  bg.addColorStop(0, '#18244a');
  bg.addColorStop(0.45, '#101835');
  bg.addColorStop(0.82, '#0b1026');
  bg.addColorStop(1, '#070a19');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle nebula dust washes in royal blue, deep teal, and antique amber
  const washes: [number, number, number, string][] = [
    [w * 0.25, h * 0.34, 340, 'rgba(72, 114, 198, 0.16)'],
    [w * 0.76, h * 0.36, 320, 'rgba(180, 122, 64, 0.13)'],
    [w * 0.5, h * 0.56, 380, 'rgba(66, 134, 178, 0.14)'],
    [w * 0.5, h * 0.22, 300, 'rgba(220, 168, 86, 0.14)'],
    [w * 0.5, h * 0.80, 320, 'rgba(148, 88, 52, 0.12)'],
  ];
  for (const [cx, cy, rad, col] of washes) {
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  // Roughness base: polished lacquered wood/enamel (darker = smoother/glossier)
  rCtx.fillStyle = '#3c3c3c';
  rCtx.fillRect(0, 0, rCanvas.width, rCanvas.height);

  // 2. Fine brass-leaf astronomical meridian grid & celestial degree circles around astrolabe
  const [acx, acy] = toPx(ASTROLABE_CENTER.x, ASTROLABE_CENTER.z);
  const scaleX = w / (PLAYFIELD_HALF_W * 2);
  const scaleY = h / (PLAYFIELD_MAX_Z - PLAYFIELD_MIN_Z);

  ctx.save();
  ctx.strokeStyle = 'rgba(218, 176, 98, 0.24)';
  ctx.lineWidth = 1.5;

  // Concentric orbital rings (aspect-corrected ellipses so they project as perfect circles on playfield)
  const ringRadii = [3.05, 4.35, 5.85, 7.45, 9.15, 11.2];
  for (const rr of ringRadii) {
    ctx.beginPath();
    ctx.ellipse(acx, acy, rr * scaleX, rr * scaleY, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial astrolabe compass rays (24 divisions)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const inner = i % 2 === 0 ? 2.85 : 3.45;
    const outer = 11.5;
    ctx.strokeStyle = i % 6 === 0 ? 'rgba(235, 194, 112, 0.34)' : 'rgba(212, 168, 88, 0.15)';
    ctx.lineWidth = i % 6 === 0 ? 2.2 : 1.1;
    ctx.beginPath();
    ctx.moveTo(acx + Math.cos(a) * inner * scaleX, acy + Math.sin(a) * inner * scaleY);
    ctx.lineTo(acx + Math.cos(a) * outer * scaleX, acy + Math.sin(a) * outer * scaleY);
    ctx.stroke();
  }

  // Fine degree tick marks around the astrolabe outer collar
  const tickInner = 2.82;
  const tickOuterMaj = 3.12;
  const tickOuterMin = 2.97;
  for (let deg = 0; deg < 180; deg++) {
    const a = (deg / 180) * Math.PI * 2;
    const major = deg % 15 === 0;
    const mid = deg % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(248, 212, 134, 0.78)' : 'rgba(218, 176, 98, 0.36)';
    ctx.lineWidth = major ? 2.5 : mid ? 1.5 : 0.9;
    const outR = major ? tickOuterMaj : mid ? tickOuterMin + 0.07 : tickOuterMin;
    ctx.beginPath();
    ctx.moveTo(acx + Math.cos(a) * tickInner * scaleX, acy + Math.sin(a) * tickInner * scaleY);
    ctx.lineTo(acx + Math.cos(a) * outR * scaleX, acy + Math.sin(a) * outR * scaleY);
    ctx.stroke();
  }

  // Gold filigree ring highlights onto roughness map (shiny gold inlay!)
  rCtx.strokeStyle = '#1e1e1e';
  rCtx.lineWidth = 3;
  for (const rr of [3.05, 4.35, 5.85, 7.45]) {
    rCtx.beginPath();
    rCtx.ellipse(acx * 0.5, acy * 0.5, rr * scaleX * 0.5, rr * scaleY * 0.5, 0, 0, Math.PI * 2);
    rCtx.stroke();
  }

  // 3. Ornate gold-leaf star-burst halos beneath each of the 5 Pop Bumpers
  for (const b of BUMPERS) {
    const [bx, by] = toPx(b.x, b.z);
    const brx = b.radius * scaleX;
    const bry = b.radius * scaleY;
    const halo = ctx.createRadialGradient(bx, by, brx * 0.7, bx, by, brx * 1.9);
    halo.addColorStop(0, 'rgba(255, 200, 96, 0.36)');
    halo.addColorStop(0.55, 'rgba(214, 152, 68, 0.14)');
    halo.addColorStop(1, 'rgba(214, 152, 68, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(bx, by, brx * 1.9, bry * 1.9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(244, 202, 118, 0.62)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(bx, by, brx * 1.28, bry * 1.28, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 12-point compass star rays around bumper
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const mult = k % 2 === 0 ? 1.52 : 1.36;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a) * brx * 1.15, by + Math.sin(a) * bry * 1.15);
      ctx.lineTo(bx + Math.cos(a) * brx * mult, by + Math.sin(a) * bry * mult);
      ctx.stroke();
    }
  }

  // 4. Engraved Zodiac Lane chevrons & ornate gold cartouches
  for (const lane of ZODIAC_LANES) {
    const [lx, ly] = toPx(lane.x, lane.z);
    ctx.strokeStyle = 'rgba(245, 206, 126, 0.55)';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(lx - 42, ly - 58, 84, 116);
    ctx.strokeStyle = 'rgba(245, 206, 126, 0.25)';
    ctx.strokeRect(lx - 35, ly - 51, 70, 102);

    ctx.fillStyle = 'rgba(248, 219, 152, 0.72)';
    ctx.font = 'bold 17px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(lane.name, lx, ly + 44);
  }

  // 5. Hand-drawn Constellation Linework across the star chart
  const constellations: [number, number][][] = [
    // Cygnus (left mid)
    [[-7.2, -1.8], [-6.2, -0.4], [-5.2, 0.8], [-6.4, 1.8], [-7.5, 0.4]],
    // Lyra (right mid)
    [[7.2, -1.8], [6.1, -0.3], [5.3, 0.9], [6.5, 1.7], [7.6, 0.2]],
    // Cassiopeia W-shape (upper north)
    [[-5.8, -8.5], [-3.8, -7.8], [-2.0, -8.9], [2.0, -8.9], [3.8, -7.8], [5.8, -8.5]],
    // Orion belt & shoulders (lower playfield)
    [[-3.6, 4.4], [-1.3, 5.2], [0, 5.35], [1.3, 5.2], [3.6, 4.4], [2.6, 7.2], [-2.6, 7.2]],
  ];

  ctx.strokeStyle = 'rgba(174, 214, 255, 0.44)';
  ctx.lineWidth = 2.0;
  for (const poly of constellations) {
    ctx.beginPath();
    poly.forEach(([wx, wz], i) => {
      const [px, py] = toPx(wx, wz);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    for (const [wx, wz] of poly) {
      const [px, py] = toPx(wx, wz);
      drawFourPointStar(ctx, px, py, 9, '#fff2cb');
    }
  }

  // 6. Lower Playfield Aiming Chevrons & Brass Medallion Crest (leading up from flippers)
  const [fCx, fCy] = toPx(0, 7.6);
  ctx.strokeStyle = 'rgba(232, 186, 102, 0.52)';
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 3; i++) {
    const cy = fCy - i * 44;
    ctx.beginPath();
    ctx.moveTo(fCx - 72 + i * 10, cy + 20);
    ctx.lineTo(fCx, cy - 12);
    ctx.lineTo(fCx + 72 - i * 10, cy + 20);
    ctx.stroke();
  }

  // Lower Starlight Odyssey plaque inscription
  const [titleX, titleY] = toPx(0, 6.2);
  ctx.fillStyle = 'rgba(238, 198, 120, 0.55)';
  ctx.font = '600 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('✦  STARLIGHT  ODYSSEY  ✦', titleX, titleY);

  // 7. Double-lined gold ornamental border along the cabinet edges
  ctx.strokeStyle = 'rgba(228, 184, 102, 0.58)';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.strokeStyle = 'rgba(228, 184, 102, 0.28)';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(34, 34, w - 68, h - 68);

  // 8. Rich starfield speckles (500 twinkling golden & ice-blue stars)
  const rand = seededRand(40419);
  for (let i = 0; i < 520; i++) {
    const sx = rand() * w;
    const sy = rand() * h;
    const sr = 0.7 + rand() * 2.2;
    const warm = rand() > 0.38;
    ctx.fillStyle = warm
      ? `rgba(255, 232, 178, ${0.28 + rand() * 0.62})`
      : `rgba(176, 218, 255, ${0.25 + rand() * 0.58})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    if (sr > 2.35 && rand() > 0.55) {
      drawFourPointStar(ctx, sx, sy, sr * 3.4, warm ? '#ffe9b2' : '#d2ecff');
    }
  }
  ctx.restore();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const roughness = new THREE.CanvasTexture(rCanvas);
  roughness.anisotropy = 4;
  roughness.needsUpdate = true;

  return { map, roughness };
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * 0.26;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function createBumperCapTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  // Radial brushed antique brass & deep crimson enamel center
  const grad = ctx.createRadialGradient(c, c, 20, c, c, c);
  grad.addColorStop(0, '#ffe39a');
  grad.addColorStop(0.28, '#c98e36');
  grad.addColorStop(0.55, '#192244');
  grad.addColorStop(0.8, '#0f1630');
  grad.addColorStop(0.84, '#e5b864');
  grad.addColorStop(1, '#8c5f20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Engraved sunburst rays
  ctx.strokeStyle = 'rgba(255, 224, 146, 0.85)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 65, c + Math.sin(a) * 65);
    ctx.lineTo(c + Math.cos(a) * (i % 2 === 0 ? 202 : 165), c + Math.sin(a) * (i % 2 === 0 ? 202 : 165));
    ctx.stroke();
  }

  // Concentric brass rings
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#f6cc76';
  ctx.beginPath();
  ctx.arc(c, c, 212, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, 134, 0, Math.PI * 2);
  ctx.stroke();

  // Central gilded compass star
  drawFourPointStar(ctx, c, c, 94, '#fff2c2');
  drawFourPointStar(ctx, c, c, 44, '#c77c26');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createBackglassTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Rich celestial dusk indigo & warm bronze arch backdrop
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.65, 30, w * 0.5, h * 0.5, w * 0.58);
  bg.addColorStop(0, '#3a2b56');
  bg.addColorStop(0.45, '#1d1c42');
  bg.addColorStop(0.85, '#10122c');
  bg.addColorStop(1, '#090b1d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Radiant golden celestial sun & astrolabe arcs
  const cx = w * 0.5;
  const cy = h * 0.56;
  const sunGlow = ctx.createRadialGradient(cx, cy, 12, cx, cy, 190);
  sunGlow.addColorStop(0, 'rgba(255, 224, 146, 0.92)');
  sunGlow.addColorStop(0.35, 'rgba(232, 162, 74, 0.45)');
  sunGlow.addColorStop(1, 'rgba(232, 162, 74, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 190, 0, Math.PI * 2);
  ctx.fill();

  // Sunburst rays
  ctx.strokeStyle = 'rgba(255, 218, 134, 0.55)';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ctx.lineWidth = i % 2 === 0 ? 3 : 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48);
    ctx.lineTo(cx + Math.cos(a) * (i % 2 === 0 ? 225 : 145), cy + Math.sin(a) * (i % 2 === 0 ? 225 : 145));
    ctx.stroke();
  }

  // Concentric brass astrolabe circles
  ctx.strokeStyle = '#e5b864';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 162, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 206, 0, Math.PI * 2);
  ctx.stroke();

  // Crescent moons on flanks
  for (const side of [-1, 1]) {
    const mx = cx + side * 310;
    const my = cy - 28;
    ctx.fillStyle = '#f2cc7c';
    ctx.beginPath();
    ctx.arc(mx, my, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#191a3c';
    ctx.beginPath();
    ctx.arc(mx - side * 18, my - 8, 38, 0, Math.PI * 2);
    ctx.fill();
  }

  // Engraved Title Banner (positioned cleanly in the middle band below top HUD pill)
  ctx.save();
  ctx.fillStyle = 'rgba(11, 14, 34, 0.72)';
  ctx.strokeStyle = 'rgba(229, 184, 100, 0.72)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(cx - 332, 200, 664, 106, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff0c4';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(255, 192, 82, 0.75)';
  ctx.shadowBlur = 16;
  ctx.fillText('STARLIGHT ODYSSEY', cx, 254);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e2be76';
  ctx.font = '600 21px Georgia, serif';
  ctx.fillText('✦  CELESTIAL OBSERVATORY PINBALL  ✦', cx, 289);
  ctx.restore();

  // Stars
  const rand = seededRand(8821);
  for (let i = 0; i < 160; i++) {
    drawFourPointStar(
      ctx,
      rand() * w,
      rand() * h,
      2 + rand() * 5,
      rand() > 0.35 ? 'rgba(255, 238, 190, 0.85)' : 'rgba(170, 218, 255, 0.8)',
    );
  }

  // Ornate gold border frame
  ctx.strokeStyle = '#d8a64e';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createRunePlateTexture(name: string, accent: string, pattern: [number, number][]): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a2e5c');
  g.addColorStop(1, '#0c1530');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Gold bezel border
  ctx.strokeStyle = '#e5b762';
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  // Constellation linework
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  pattern.forEach(([x, y], i) => {
    const px = x * w;
    const py = y * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  for (const [x, y] of pattern) {
    drawFourPointStar(ctx, x * w, y * h, 14, '#fff8de');
  }

  ctx.fillStyle = '#ffefc8';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(name, w * 0.5, h - 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createStarlightTextures(): StarlightTextures {
  const { map: playfieldMap, roughness: playfieldRoughness } = createStarChartPlayfieldTextures();
  const bumperCapMap = createBumperCapTexture();
  const backglassMap = createBackglassTexture();
  const runeMaps = [
    createRunePlateTexture('CYGNUS', '#66d0ff', [
      [0.24, 0.34],
      [0.5, 0.44],
      [0.76, 0.34],
      [0.5, 0.44],
      [0.5, 0.22],
      [0.5, 0.7],
    ]),
    createRunePlateTexture('LYRA', '#6ce8c9', [
      [0.5, 0.22],
      [0.36, 0.42],
      [0.34, 0.66],
      [0.64, 0.66],
      [0.66, 0.42],
      [0.5, 0.22],
    ]),
    createRunePlateTexture('CASSIOPEIA', '#ffd269', [
      [0.18, 0.34],
      [0.34, 0.62],
      [0.5, 0.38],
      [0.66, 0.64],
      [0.82, 0.32],
    ]),
  ];

  return {
    playfieldMap,
    playfieldRoughness,
    bumperCapMap,
    backglassMap,
    runeMaps,
    dispose() {
      playfieldMap.dispose();
      playfieldRoughness.dispose();
      bumperCapMap.dispose();
      backglassMap.dispose();
      for (const r of runeMaps) r.dispose();
    },
  };
}
