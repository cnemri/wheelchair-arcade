import * as THREE from 'three';
import { createPBRMaterial, createParticleSystem, type ParticleSystem } from '../../art';

export interface OrbitalBackdrop {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

// Deterministic hash noise for procedural Earth continents & clouds
function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += smoothNoise(x * freq, y * freq, seed + i * 19.3) * amp;
    freq *= 2.04;
    amp *= 0.5;
  }
  return v;
}

function createEarthTextures(): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  clouds: THREE.CanvasTexture;
} {
  const w = 1024;
  const h = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = w;
  albedoCanvas.height = h;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(w, h);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = w;
  roughCanvas.height = h;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(w, h);

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = w;
  cloudCanvas.height = h;
  const cCtx = cloudCanvas.getContext('2d')!;
  const cImg = cCtx.createImageData(w, h);

  for (let py = 0; py < h; py++) {
    const v = py / (h - 1);
    const lat = (v - 0.5) * Math.PI; // -PI/2..PI/2
    const absLat = Math.abs(lat) / (Math.PI * 0.5);

    for (let px = 0; px < w; px++) {
      const u = px / w;
      const lon = u * Math.PI * 2;
      // Seamless cylindrical projection coordinates
      const nx = Math.cos(lon) * 2.2 + 4.1;
      const nz = Math.sin(lon) * 2.2 + 4.1;
      const ny = v * 4.4;

      const cont =
        fbm(nx + ny * 0.25, nz - ny * 0.35, 11, 5) * 0.62 +
        fbm(nx * 2.1, ny * 2.1 + nz * 0.6, 47, 4) * 0.38;
      const detail = fbm(nx * 5.2, nz * 5.2 + ny * 3.8, 93, 3);

      const idx = (py * w + px) * 4;
      const polarIce = absLat > 0.78 + (detail - 0.5) * 0.09;

      let r = 0;
      let g = 0;
      let b = 0;
      let rough = 200;

      if (polarIce) {
        r = 228;
        g = 240;
        b = 248;
        rough = 175;
      } else if (cont > 0.535) {
        // Continents: coastal emerald -> warm savannah -> highland ochre/snow
        const elev = (cont - 0.535) / 0.465;
        const moisture = fbm(nx * 1.9 + 7.2, nz * 1.9 + ny * 1.6, 203, 4);
        if (elev > 0.48) {
          // Mountain ridges
          r = 162 + detail * 50;
          g = 156 + detail * 44;
          b = 142 + detail * 42;
        } else if (moisture > 0.46) {
          // Lush Solarpunk biosphere green
          r = 42 + detail * 38;
          g = 118 + detail * 48;
          b = 64 + detail * 28;
        } else {
          // Warm golden-terracotta steppe/desert
          r = 176 + detail * 42;
          g = 148 + detail * 34;
          b = 96 + detail * 24;
        }
        rough = 228;
      } else {
        // Ocean bathymetry + luminous turquoise coastal shelf
        const shelf = Math.max(0, 1 - (0.535 - cont) / 0.095);
        r = 12 + shelf * 28;
        g = 56 + shelf * 92 + detail * 14;
        b = 132 + shelf * 68 + detail * 18;
        rough = 84;
      }

      aImg.data[idx] = Math.min(255, Math.max(0, Math.round(r)));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      aImg.data[idx + 3] = 255;

      rImg.data[idx] = rough;
      rImg.data[idx + 1] = rough;
      rImg.data[idx + 2] = rough;
      rImg.data[idx + 3] = 255;

      // Swirling cloud bands
      const swirl = Math.sin(v * 14.0 + detail * 3.5) * 0.25;
      const cNoise = fbm(nx * 2.4 + swirl, nz * 2.4 + ny * 2.8, 311, 5);
      const cloudAlpha = Math.max(0, Math.min(1, (cNoise - 0.50) * 3.6));
      cImg.data[idx] = 248;
      cImg.data[idx + 1] = 252;
      cImg.data[idx + 2] = 255;
      cImg.data[idx + 3] = Math.round(cloudAlpha * 235);
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  cCtx.putImageData(cImg, 0, 0);

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.anisotropy = 8;

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;

  const clouds = new THREE.CanvasTexture(cloudCanvas);
  clouds.colorSpace = THREE.SRGBColorSpace;
  clouds.wrapS = THREE.RepeatWrapping;

  return { albedo, roughness, clouds };
}

export function createOrbitalBackdrop(): OrbitalBackdrop {
  const group = new THREE.Group();
  group.name = 'OrbitalBiodomeBackdrop';

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const ownedTex: THREE.Texture[] = [];

  // =========================================================================
  // 1. GIGANTIC ILLUMINATED CURVING BLUE-AND-CLOUD EARTH
  // =========================================================================
  const earthPivot = new THREE.Group();
  earthPivot.position.set(16, -59, -95);
  earthPivot.rotation.z = 0.22;
  earthPivot.rotation.x = 0.14;
  group.add(earthPivot);

  const earthTex = createEarthTextures();
  ownedTex.push(earthTex.albedo, earthTex.roughness, earthTex.clouds);

  const earthGeo = new THREE.SphereGeometry(68.5, 64, 48);
  const earthMat = new THREE.MeshStandardMaterial({
    map: earthTex.albedo,
    roughnessMap: earthTex.roughness,
    roughness: 0.85,
    metalness: 0.04,
    emissive: new THREE.Color('#0c2848'),
    emissiveIntensity: 0.42,
  });
  ownedGeos.push(earthGeo);
  ownedMats.push(earthMat);

  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthPivot.add(earthMesh);

  // Drifting translucent cloud blanket
  const cloudGeo = new THREE.SphereGeometry(69.4, 56, 42);
  const cloudMat = new THREE.MeshStandardMaterial({
    map: earthTex.clouds,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0.0,
    emissive: new THREE.Color('#8ecfff'),
    emissiveIntensity: 0.16,
  });
  ownedGeos.push(cloudGeo);
  ownedMats.push(cloudMat);

  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  earthPivot.add(cloudMesh);

  // Atmospheric Rayleigh Limb-Glow Fresnel Halo
  const haloGeo = new THREE.SphereGeometry(72.6, 56, 40);
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.55, 0.55, 0.62).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float rim = pow(clamp(1.0 - abs(dot(vNormalW, vViewDir)), 0.0, 1.0), 2.7);
        float sunWrap = smoothstep(-0.35, 0.75, dot(vNormalW, uSunDir));
        vec3 col = mix(vec3(0.16, 0.58, 1.0), vec3(0.55, 0.95, 1.0), rim);
        float alpha = rim * (0.28 + 0.72 * sunWrap) * 0.92;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  ownedGeos.push(haloGeo);
  ownedMats.push(haloMat);

  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  earthPivot.add(haloMesh);

  // =========================================================================
  // 2. GRAND SOLARPUNK RIBBED GLASS BIODOME ARCHES (PANORAMIC -Z VIEW)
  // =========================================================================
  const brassMat = createPBRMaterial('brushedBrass', {
    repeatX: 2,
    repeatY: 2,
    tint: '#e6c37d',
  });
  brassMat.metalness = 0.8;
  brassMat.roughness = 0.28;
  ownedMats.push(brassMat);

  const ceramicRibMat = createPBRMaterial('marbleTiles', {
    repeatX: 2,
    repeatY: 2,
    tint: '#eef3ef',
  });
  ceramicRibMat.roughness = 0.35;
  ceramicRibMat.metalness = 0.08;
  ownedMats.push(ceramicRibMat);

  const domeGroup = new THREE.Group();
  domeGroup.position.set(0, -1.2, -3.5);
  group.add(domeGroup);

  // Sweeping arched Solarpunk observatory ribs framing the back & upper sky (NEVER blocking +Z camera!)
  const ribRadius = 17.6;
  const archSpan = Math.PI * 0.92;
  const archStart = Math.PI * 0.04;
  const ribZOffsets = [-11.5, -7.8, -4.0, 0.4];

  for (let i = 0; i < ribZOffsets.length; i++) {
    const zOff = ribZOffsets[i];
    const rScale = 1 - Math.abs(zOff + 5.0) * 0.015;
    const ribGeo = new THREE.TorusGeometry(ribRadius * rScale, 0.24, 12, 48, archSpan);
    ownedGeos.push(ribGeo);
    const rib = new THREE.Mesh(ribGeo, i % 2 === 0 ? ceramicRibMat : brassMat);
    rib.position.set(0, 0, zOff);
    rib.rotation.z = archStart;
    domeGroup.add(rib);

    // Inner gleaming brass accent rib
    const innerGeo = new THREE.TorusGeometry(ribRadius * rScale - 0.32, 0.075, 8, 48, archSpan);
    ownedGeos.push(innerGeo);
    const innerRib = new THREE.Mesh(innerGeo, brassMat);
    innerRib.position.set(0, 0, zOff);
    innerRib.rotation.z = archStart;
    domeGroup.add(innerRib);
  }

  // Longitudinal brass purlin rails connecting the back arches cleanly
  const purlinAngles = [0.22, 0.42, 0.62, 0.82, 1.02, 1.22, 1.42, 1.62, 1.82, 2.02, 2.22, 2.42, 2.62, 2.82];
  const purlinGeo = new THREE.CylinderGeometry(0.065, 0.065, 13.0, 8);
  purlinGeo.rotateX(Math.PI / 2);
  ownedGeos.push(purlinGeo);

  for (const ang of purlinAngles) {
    const px = Math.cos(ang) * ribRadius * 0.95;
    const py = Math.sin(ang) * ribRadius * 0.95;
    const rail = new THREE.Mesh(purlinGeo, brassMat);
    rail.position.set(px, py, -5.8);
    domeGroup.add(rail);
  }

  // Translucent curved observatory glass canopy behind & overhead (strictly behind Z <= 0.4!)
  const glassGeo = new THREE.CylinderGeometry(
    ribRadius * 0.96,
    ribRadius * 0.96,
    12.8,
    36,
    1,
    true,
    -Math.PI * 0.46,
    Math.PI * 0.92,
  );
  glassGeo.rotateX(Math.PI / 2);
  glassGeo.rotateZ(Math.PI);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#c6f0ff'),
    transparent: true,
    opacity: 0.065,
    roughness: 0.08,
    metalness: 0.1,
    reflectivity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ownedGeos.push(glassGeo);
  ownedMats.push(glassMat);

  const glassVault = new THREE.Mesh(glassGeo, glassMat);
  glassVault.position.set(0, 0, -5.8);
  domeGroup.add(glassVault);

  // Back panoramic ring window frame right behind the Airlock
  const backWindowRingGeo = new THREE.TorusGeometry(15.2, 0.34, 14, 56, Math.PI * 0.96);
  ownedGeos.push(backWindowRingGeo);
  const backWindowRing = new THREE.Mesh(backWindowRingGeo, brassMat);
  backWindowRing.position.set(0, -0.4, -12.6);
  backWindowRing.rotation.z = Math.PI * 0.02;
  domeGroup.add(backWindowRing);

  // =========================================================================
  // 3. OUTER ROTATING ORBITAL STATION RING & SOLAR COLLECTOR WINGS
  // =========================================================================
  const stationRingGroup = new THREE.Group();
  stationRingGroup.position.set(0, 3.0, -32);
  stationRingGroup.rotation.x = 0.24;
  stationRingGroup.rotation.z = -0.14;
  group.add(stationRingGroup);

  const outerRingGeo = new THREE.TorusGeometry(30, 0.38, 10, 80);
  ownedGeos.push(outerRingGeo);
  const outerRing = new THREE.Mesh(outerRingGeo, brassMat);
  stationRingGroup.add(outerRing);

  const solarPanelGeo = new THREE.BoxGeometry(8.5, 0.1, 2.4);
  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#133a5e'),
    emissive: new THREE.Color('#1a6f9e'),
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.72,
  });
  ownedGeos.push(solarPanelGeo);
  ownedMats.push(solarPanelMat);

  const wingNodes: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.cos(a) * 30, Math.sin(a) * 30, 0);
    holder.rotation.z = a;

    const panel = new THREE.Mesh(solarPanelGeo, solarPanelMat);
    panel.position.x = 5.0;
    holder.add(panel);

    // Warm golden beacon light pip on the orbital ring
    const pipGeo = new THREE.SphereGeometry(0.32, 10, 8);
    const pipMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x6ef7d2 : 0xffdf80 });
    ownedGeos.push(pipGeo);
    ownedMats.push(pipMat);
    const pip = new THREE.Mesh(pipGeo, pipMat);
    holder.add(pip);

    stationRingGroup.add(holder);
    wingNodes.push(holder);
  }

  // =========================================================================
  // 4. EXTERIOR TWINKLING STARFIELD & EARTHSHINE / BIODOME LIGHTING
  // =========================================================================
  const stars: ParticleSystem = createParticleSystem({
    type: 'stars',
    count: 420,
    bounds: { width: 150, height: 95, depth: 110 },
    center: new THREE.Vector3(0, 14, -44),
    size: 0.42,
    colors: [0xffffff, 0xbbe8ff, 0xffe8b8, 0xa8ffea],
  });
  group.add(stars.group);

  // Subtle cyan Earthshine bounce light + warm Solarpunk chamber illumination
  const earthshine = new THREE.DirectionalLight(0x6bd4ff, 0.95);
  earthshine.position.set(14, -12, -32);
  group.add(earthshine);

  const bioFill = new THREE.PointLight(0xfff1d6, 1.5, 42, 1.15);
  bioFill.position.set(0, 11.5, 7.5);
  group.add(bioFill);

  const emeraldBounce = new THREE.PointLight(0x52e0a8, 0.85, 30, 1.4);
  emeraldBounce.position.set(0, 2.6, -4.5);
  group.add(emeraldBounce);

  const update = (dt: number, elapsed: number) => {
    earthMesh.rotation.y = elapsed * 0.014 + 0.85;
    cloudMesh.rotation.y = elapsed * 0.019 + 0.35;
    stationRingGroup.rotation.z = -0.14 + Math.sin(elapsed * 0.08) * 0.04;
    for (let i = 0; i < wingNodes.length; i++) {
      wingNodes[i].rotation.x = Math.sin(elapsed * 0.25 + i) * 0.12;
    }
    stars.update(dt);
  };

  const dispose = () => {
    stars.dispose();
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    for (const t of ownedTex) t.dispose();
  };

  return { group, update, dispose };
}
