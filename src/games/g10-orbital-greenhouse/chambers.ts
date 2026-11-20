import type { ChamberDef } from './types';

export const CHAMBERS: readonly ChamberDef[] = [
  // =========================================================================
  // CHAMBER 1: SPROUT — Intro Push-Cube + Teak Gravity Ramp + Optional Wall Flip
  // =========================================================================
  {
    index: 1,
    name: 'Sprout Atrium',
    subtitle: 'Chamber I · Hydroponic Entry',
    hint: 'Push the glowing Solar Energy Cube up the golden teak ramp onto the Emerald Conduit to unseal the Airlock.',
    parMoves: 1,
    parTime: 25,
    initialGravity: 'floor',
    spawnPos: [0, 0, 5.0],
    spawnYaw: 0,
    airlockPos: [0, 1.6, -6.2],
    bounds: { minX: -8.0, maxX: 8.0, minY: 0, maxY: 9.2, minZ: -6.8, maxZ: 6.8 },
    blocks: [
      // Main lower deck (South)
      { minX: -8.0, maxX: 8.0, minY: -1.1, maxY: 0.0, minZ: 0.6, maxZ: 6.8, style: 'marble', brassTrim: true },
      // Sub-floor under ramp so shadows & undersides stay solid
      { minX: -8.0, maxX: 8.0, minY: -1.1, maxY: 0.0, minZ: -1.8, maxZ: 0.6, style: 'marble' },
      // North upper terrace (Y = 1.6)
      { minX: -8.0, maxX: 8.0, minY: -1.1, maxY: 1.6, minZ: -6.8, maxZ: -1.8, style: 'teak', brassTrim: true },
      // Flanking botanical planter steps beside ramp
      { minX: -8.0, maxX: -2.8, minY: 0.0, maxY: 1.6, minZ: -1.8, maxZ: 0.6, style: 'planter_box', brassTrim: true },
      { minX: 2.8, maxX: 8.0, minY: 0.0, maxY: 1.6, minZ: -1.8, maxZ: 0.6, style: 'planter_box', brassTrim: true },
      // Optional East Gravity Preview Wall (safe containment for curious wall-flippers!)
      { minX: 8.0, maxX: 9.1, minY: -1.1, maxY: 9.2, minZ: -6.8, maxZ: 6.8, style: 'wall_panel', brassTrim: true },
      // Low sculpted West planter curb framing the hydroponic channel
      { minX: -8.9, maxX: -8.0, minY: -1.1, maxY: 2.1, minZ: -6.8, maxZ: 6.8, style: 'planter_box', brassTrim: true },
    ],
    ramps: [
      { minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 0.6, yAtMaxZ: 0.0, yAtMinZ: 1.6 },
    ],
    gravityPads: [
      {
        id: 'c1-pad-east',
        surface: 'floor',
        pos: [5.5, 0.02, 4.2],
        targetGravity: 'right',
        altGravity: 'floor',
        radius: 1.35,
      },
      {
        id: 'c1-pad-east-ret',
        surface: 'right',
        pos: [7.98, 2.2, 4.2],
        targetGravity: 'floor',
        altGravity: 'right',
        radius: 1.4,
      },
    ],
    cubes: [
      { id: 'c1-cube-1', startPos: [0, 0.65, 2.3] },
    ],
    conduits: [
      {
        id: 'c1-conduit-1',
        surface: 'floor',
        pos: [0, 1.6, -3.6],
        wirePath: [
          [0, 1.63, -3.6],
          [0, 1.63, -6.0],
        ],
      },
    ],
    emitters: [],
    mirrors: [],
    elbows: [],
    receivers: [],
    hydroBeds: [
      { minX: -7.7, maxX: -3.2, y: 1.62, minZ: -1.5, maxZ: 0.35, hasGrass: true, hasFlowers: true },
      { minX: 3.2, maxX: 7.7, y: 1.62, minZ: -1.5, maxZ: 0.35, hasGrass: true, hasFlowers: true },
      { minX: -7.7, maxX: -4.4, y: 0.04, minZ: 1.4, maxZ: 5.8, hasWater: true },
      { minX: -7.6, maxX: -4.2, y: 1.62, minZ: -6.2, maxZ: -2.4, hasGrass: true, hasFlowers: true },
      { minX: 4.2, maxX: 7.6, y: 1.62, minZ: -6.2, maxZ: -2.4, hasGrass: true, hasFlowers: true },
    ],
    botanicals: [
      { kind: 'bonsai', pos: [-5.6, 1.6, -0.6], scale: 1.15, seed: 101, bonsaiVariant: 'sakura' },
      { kind: 'bonsai', pos: [5.6, 1.6, -0.6], scale: 1.1, seed: 102, bonsaiVariant: 'emerald' },
      { kind: 'sakura', pos: [-6.0, 1.6, -4.4], scale: 0.95, seed: 103 },
      { kind: 'olive', pos: [6.0, 1.6, -4.4], scale: 0.95, seed: 104 },
      { kind: 'fern', pos: [-3.9, 1.6, -0.5], scale: 1.0, seed: 105 },
      { kind: 'fern', pos: [3.9, 1.6, -0.5], scale: 1.0, seed: 106 },
      { kind: 'fern', pos: [-6.8, 0.0, 5.4], scale: 1.1, seed: 107 },
      { kind: 'boulder', pos: [-6.2, 0.0, 2.2], scale: 0.85, seed: 108 },
      { kind: 'lantern', pos: [-3.0, 1.6, -2.2], scale: 0.95 },
      { kind: 'lantern', pos: [3.0, 1.6, -2.2], scale: 0.95 },
      { kind: 'lantern', pos: [-3.1, 0.0, 1.2], scale: 0.9 },
      { kind: 'lantern', pos: [3.1, 0.0, 1.2], scale: 0.9 },
    ],
    starSeeds: [
      { id: 'c1-seed-wall', pos: [7.2, 5.4, 3.8] },
      { id: 'c1-seed-west', pos: [-3.6, 2.45, -4.5] },
    ],
  },

  // =========================================================================
  // CHAMBER 2: HELIOTROPE — Solar Laser Mirror Routing + Conduit Activation
  // =========================================================================
  {
    index: 2,
    name: 'Heliotrope Gallery',
    subtitle: 'Chamber II · Solar Prism Optics',
    hint: 'Press [E] beside Brass Prism Mirrors to bounce the Solar Beam into the Lotus Receiver, and push the Cube onto the Conduit.',
    parMoves: 3,
    parTime: 40,
    initialGravity: 'floor',
    spawnPos: [0, 0, 5.2],
    spawnYaw: 0,
    airlockPos: [0, 0, -6.5],
    bounds: { minX: -8.5, maxX: 8.5, minY: 0, maxY: 9.0, minZ: -7.0, maxZ: 7.0 },
    blocks: [
      // Main marble & teak floor
      { minX: -8.5, maxX: 8.5, minY: -1.1, maxY: 0.0, minZ: -7.0, maxZ: 7.0, style: 'marble', brassTrim: true },
      // Central raised botanical island that blocks direct laser line-of-sight
      { minX: -1.6, maxX: 1.6, minY: 0.0, maxY: 1.75, minZ: -2.0, maxZ: 0.8, style: 'planter_box', brassTrim: true },
      // Outer decorative curbs
      { minX: -9.3, maxX: -8.5, minY: -1.1, maxY: 1.9, minZ: -7.0, maxZ: 7.0, style: 'planter_box', brassTrim: true },
      { minX: 8.5, maxX: 9.3, minY: -1.1, maxY: 1.9, minZ: -7.0, maxZ: 7.0, style: 'planter_box', brassTrim: true },
    ],
    ramps: [],
    gravityPads: [],
    cubes: [
      { id: 'c2-cube-1', startPos: [-4.5, 0.65, -0.6] },
    ],
    conduits: [
      {
        id: 'c2-conduit-1',
        surface: 'floor',
        pos: [-4.5, 0, -5.2],
        wirePath: [
          [-4.5, 0.03, -5.2],
          [-1.5, 0.03, -5.2],
          [-1.5, 0.03, -6.2],
        ],
      },
    ],
    emitters: [
      {
        id: 'c2-emit-1',
        origin: [-7.8, 1.15, -3.8],
        dir: '+x',
        mountPos: [-8.1, 0, -3.8],
      },
    ],
    mirrors: [
      {
        id: 'c2-mirror-1',
        surface: 'floor',
        basePos: [5.5, 0, -3.8],
        crystalPos: [5.5, 1.15, -3.8],
        aimCycle: ['-z', '+x', '+z', '-x'],
        initialAimIdx: 1, // +x -> tap E once for +z
      },
      {
        id: 'c2-mirror-2',
        surface: 'floor',
        basePos: [5.5, 0, 2.8],
        crystalPos: [5.5, 1.15, 2.8],
        aimCycle: ['-z', '+x', '+z', '-x'],
        initialAimIdx: 2, // +z -> tap E once for -x
      },
    ],
    elbows: [],
    receivers: [
      {
        id: 'c2-recv-1',
        surface: 'floor',
        basePos: [-5.8, 0, 2.8],
        corePos: [-5.8, 1.15, 2.8],
        wirePath: [
          [-5.8, 0.03, 2.8],
          [-7.2, 0.03, 2.8],
          [-7.2, 0.03, -6.2],
          [-1.2, 0.03, -6.2],
        ],
      },
    ],
    hydroBeds: [
      { minX: -1.4, maxX: 1.4, y: 1.77, minZ: -1.8, maxZ: 0.6, hasGrass: true, hasFlowers: true },
      { minX: 2.2, maxX: 4.1, y: 0.03, minZ: -1.9, maxZ: 0.7, hasWater: true },
      { minX: -7.9, maxX: -6.7, y: 0.03, minZ: -1.8, maxZ: 1.2, hasGrass: true, hasFlowers: true },
      { minX: 6.9, maxX: 8.2, y: 0.03, minZ: -1.6, maxZ: 1.4, hasGrass: true, hasFlowers: true },
    ],
    botanicals: [
      { kind: 'olive', pos: [0, 1.75, -0.6], scale: 0.85, seed: 201 },
      { kind: 'fern', pos: [-1.0, 1.75, 0.2], scale: 0.85, seed: 202 },
      { kind: 'fern', pos: [1.0, 1.75, -1.4], scale: 0.85, seed: 203 },
      { kind: 'bonsai', pos: [-7.4, 0, 5.4], scale: 1.15, seed: 204, bonsaiVariant: 'maple' },
      { kind: 'bonsai', pos: [7.4, 0, 5.4], scale: 1.15, seed: 205, bonsaiVariant: 'emerald' },
      { kind: 'sakura', pos: [7.4, 0, -5.8], scale: 0.85, seed: 206 },
      { kind: 'boulder', pos: [7.4, 0, -0.2], scale: 0.75, seed: 207 },
      { kind: 'lantern', pos: [-2.4, 0, -5.8], scale: 0.95 },
      { kind: 'lantern', pos: [2.4, 0, -5.8], scale: 0.95 },
    ],
    starSeeds: [
      { id: 'c2-seed-1', pos: [7.1, 0.95, -2.0] },
      { id: 'c2-seed-2', pos: [-2.8, 0.95, 4.6] },
    ],
  },

  // =========================================================================
  // CHAMBER 3: WALL-WALK — Gravity-Flip onto Right Wall to Drop Upper Cube
  // =========================================================================
  {
    index: 3,
    name: 'Wall-Walk Terrace',
    subtitle: 'Chamber III · Magnetic Verticality',
    hint: 'Roll onto the cyan Gravity Pad and press [SPACE] to drive up the East Wall, push the high Cube off its ledge, then flip back to drop it!',
    parMoves: 3,
    parTime: 50,
    initialGravity: 'floor',
    spawnPos: [-2.6, 0, 4.4],
    spawnYaw: 0,
    airlockPos: [0, 0, -6.5],
    bounds: { minX: -8.5, maxX: 8.5, minY: 0, maxY: 9.8, minZ: -7.0, maxZ: 7.0 },
    blocks: [
      // Main Floor
      { minX: -8.5, maxX: 8.5, minY: -1.1, maxY: 0.0, minZ: -7.0, maxZ: 7.0, style: 'marble', brassTrim: true },
      // East Gravity Wall (walkable when gravity = 'right')
      { minX: 8.5, maxX: 9.7, minY: -1.1, maxY: 9.8, minZ: -7.0, maxZ: 7.0, style: 'wall_panel', brassTrim: true },
      // High East Alcove Ledge holding Cube 1 (headroom underneath = 4.6!)
      { minX: 4.2, maxX: 8.5, minY: 4.6, maxY: 5.2, minZ: -6.6, maxZ: 1.4, style: 'teak', brassTrim: true },
      // Sculpted West garden border
      { minX: -9.4, maxX: -8.5, minY: -1.1, maxY: 2.3, minZ: -7.0, maxZ: 7.0, style: 'planter_box', brassTrim: true },
      // West meditative sunken planter island (out of all push paths)
      { minX: -7.6, maxX: -4.2, minY: 0.0, maxY: 0.55, minZ: -2.4, maxZ: 1.8, style: 'planter_box', brassTrim: true },
    ],
    ramps: [],
    gravityPads: [
      {
        id: 'c3-pad-floor',
        surface: 'floor',
        pos: [5.4, 0.02, 4.4],
        targetGravity: 'right',
        altGravity: 'floor',
        radius: 1.45,
      },
      {
        id: 'c3-pad-wall-low',
        surface: 'right',
        pos: [8.48, 2.0, 4.4],
        targetGravity: 'floor',
        altGravity: 'right',
        radius: 1.4,
      },
      {
        id: 'c3-pad-wall-high',
        surface: 'right',
        pos: [8.48, 7.2, 5.5],
        targetGravity: 'floor',
        altGravity: 'right',
        radius: 1.45,
      },
    ],
    cubes: [
      { id: 'c3-cube-1', startPos: [6.4, 5.85, -2.6] },
    ],
    conduits: [
      {
        id: 'c3-conduit-1',
        surface: 'floor',
        pos: [7.6, 0, -4.2],
        wirePath: [
          [7.6, 0.03, -4.2],
          [7.6, 0.03, -6.2],
          [1.4, 0.03, -6.2],
        ],
      },
    ],
    emitters: [],
    mirrors: [],
    elbows: [],
    receivers: [],
    hydroBeds: [
      { minX: -7.4, maxX: -4.4, y: 0.57, minZ: -2.2, maxZ: 1.6, hasGrass: true, hasFlowers: true },
      { minX: -7.8, maxX: -4.5, y: 0.03, minZ: -6.2, maxZ: -3.2, hasWater: true },
      { minX: -7.8, maxX: -4.8, y: 0.03, minZ: 2.8, maxZ: 6.0, hasGrass: true, hasFlowers: true },
    ],
    botanicals: [
      { kind: 'sakura', pos: [-5.8, 0.55, -0.4], scale: 1.05, seed: 301 },
      { kind: 'bonsai', pos: [-6.4, 0.0, 4.6], scale: 1.2, seed: 302, bonsaiVariant: 'emerald' },
      { kind: 'fern', pos: [-4.9, 0.55, 1.1], scale: 1.0, seed: 303 },
      { kind: 'fern', pos: [-6.8, 0.55, -1.6], scale: 1.0, seed: 304 },
      { kind: 'boulder', pos: [-6.2, 0.0, -4.6], scale: 0.9, seed: 305 },
      { kind: 'lantern', pos: [4.5, 5.2, 1.0], scale: 0.85 },
      { kind: 'lantern', pos: [-2.4, 0, -5.8], scale: 0.95 },
      { kind: 'lantern', pos: [2.4, 0, -5.8], scale: 0.95 },
    ],
    starSeeds: [
      { id: 'c3-seed-wall', pos: [7.6, 8.1, -4.2] },
      { id: 'c3-seed-garden', pos: [-3.2, 0.95, -3.5] },
    ],
  },

  // =========================================================================
  // CHAMBER 4: CANOPY MIRROR — Left Wall Flip + Dual-Axis 3D Solar Beam + Cube
  // =========================================================================
  {
    index: 4,
    name: 'Canopy Mirror',
    subtitle: 'Chamber IV · Vertical Prism Relay',
    hint: 'Bounce light from the Floor Mirror onto the Left Wall Mirror, flip to the Left Wall to aim it skyward to the Canopy Lotus, and seat the Cube in the Wall Conduit!',
    parMoves: 5,
    parTime: 65,
    initialGravity: 'floor',
    spawnPos: [0, 0, 5.0],
    spawnYaw: 0,
    airlockPos: [0, 0, -6.5],
    bounds: { minX: -8.5, maxX: 8.5, minY: 0, maxY: 10.0, minZ: -7.0, maxZ: 7.0 },
    blocks: [
      // Main Floor
      { minX: -8.5, maxX: 8.5, minY: -1.1, maxY: 0.0, minZ: -7.0, maxZ: 7.0, style: 'marble', brassTrim: true },
      // Left Gravity Wall (walkable when gravity = 'left')
      { minX: -9.7, maxX: -8.5, minY: -1.1, maxY: 10.0, minZ: -7.0, maxZ: 7.0, style: 'wall_panel', brassTrim: true },
      // Suspended Hydroponic Canopy Terrace (upper back-right, never blocks camera!)
      { minX: 2.2, maxX: 8.5, minY: 5.5, maxY: 6.0, minZ: -5.8, maxZ: -0.4, style: 'teak', brassTrim: true },
      // Subtle East decorative planter curb
      { minX: 8.5, maxX: 9.4, minY: -1.1, maxY: 2.1, minZ: -7.0, maxZ: 7.0, style: 'planter_box', brassTrim: true },
    ],
    ramps: [],
    gravityPads: [
      {
        id: 'c4-pad-floor',
        surface: 'floor',
        pos: [-5.4, 0.02, 4.2],
        targetGravity: 'left',
        altGravity: 'floor',
        radius: 1.45,
      },
      {
        id: 'c4-pad-wall-low',
        surface: 'left',
        pos: [-8.48, 2.2, 4.2],
        targetGravity: 'floor',
        altGravity: 'left',
        radius: 1.4,
      },
      {
        id: 'c4-pad-wall-mid',
        surface: 'left',
        pos: [-8.48, 5.8, 1.4],
        targetGravity: 'floor',
        altGravity: 'left',
        radius: 1.45,
      },
    ],
    cubes: [
      { id: 'c4-cube-1', startPos: [-3.4, 0.65, 2.2] },
    ],
    conduits: [
      {
        id: 'c4-conduit-1',
        surface: 'left',
        pos: [-8.5, 0.72, -0.4],
        wirePath: [
          [-8.47, 0.72, -0.4],
          [-8.47, 0.72, -6.2],
          [-1.5, 0.03, -6.2],
        ],
      },
    ],
    emitters: [
      {
        id: 'c4-emit-1',
        origin: [6.5, 1.15, 3.4],
        dir: '-z',
        mountPos: [6.5, 0, 3.4],
      },
    ],
    mirrors: [
      {
        id: 'c4-mirror-floor',
        surface: 'floor',
        basePos: [6.5, 0, -2.8],
        crystalPos: [6.5, 1.15, -2.8],
        aimCycle: ['-z', '+x', '+z', '-x'],
        initialAimIdx: 1, // +x -> rotate to -x
      },
      {
        id: 'c4-mirror-wall',
        surface: 'left',
        basePos: [-8.5, 1.15, -2.8],
        crystalPos: [-7.35, 1.15, -2.8],
        aimCycle: ['+y', '-z', '-y', '+z'],
        initialAimIdx: 3, // +z -> tap E once for +y (straight UP!)
      },
    ],
    elbows: [
      {
        id: 'c4-elbow-sky',
        pos: [-7.35, 7.15, -2.8],
        inDir: '+y',
        outDir: '+x',
        wallAttachDir: '-x',
      },
    ],
    receivers: [
      {
        id: 'c4-recv-canopy',
        surface: 'floor',
        basePos: [3.2, 6.0, -2.8],
        corePos: [3.2, 7.15, -2.8],
        wirePath: [
          [3.2, 6.03, -2.8],
          [3.2, 6.03, -5.6],
          [3.2, 0.03, -5.6],
          [1.5, 0.03, -6.2],
        ],
      },
    ],
    hydroBeds: [
      { minX: 4.5, maxX: 8.2, y: 6.03, minZ: -5.4, maxZ: -0.8, hasGrass: true, hasFlowers: true },
      { minX: 1.4, maxX: 4.4, y: 0.03, minZ: 1.4, maxZ: 4.8, hasWater: true },
      { minX: 4.8, maxX: 8.1, y: 0.03, minZ: 4.6, maxZ: 6.5, hasGrass: true, hasFlowers: true },
    ],
    botanicals: [
      { kind: 'sakura', pos: [6.6, 6.0, -3.2], scale: 0.9, seed: 401 },
      { kind: 'bonsai', pos: [5.2, 6.0, -1.6], scale: 1.0, seed: 402, bonsaiVariant: 'sakura' },
      { kind: 'fern', pos: [4.8, 6.0, -4.6], scale: 0.95, seed: 403 },
      { kind: 'olive', pos: [7.2, 0, 5.5], scale: 0.85, seed: 404 },
      { kind: 'boulder', pos: [2.8, 0, 3.0], scale: 0.78, seed: 405 },
      { kind: 'lantern', pos: [2.6, 6.0, -1.0], scale: 0.85 },
      { kind: 'lantern', pos: [-2.4, 0, -5.8], scale: 0.95 },
      { kind: 'lantern', pos: [2.4, 0, -5.8], scale: 0.95 },
    ],
    starSeeds: [
      { id: 'c4-seed-wall', pos: [-7.6, 8.2, 1.0] },
      { id: 'c4-seed-floor', pos: [4.2, 0.95, -5.0] },
    ],
  },

  // =========================================================================
  // CHAMBER 5: APOGEE BIODOME — Grand Finale World-Tree Bloom!
  // Dual Wall Gravity Flips, 2 Power Cubes, 3 Mirrors + Crown Lotus
  // =========================================================================
  {
    index: 5,
    name: 'Apogee Biodome',
    subtitle: 'Chamber V · The Orbital World-Tree',
    hint: 'Drop both High-Terrace Cubes onto their Conduits and guide the 3-Mirror Solar Beam up the East Wall into the World-Tree Crown Lotus!',
    parMoves: 9,
    parTime: 105,
    initialGravity: 'floor',
    spawnPos: [0, 0, 5.4],
    spawnYaw: 0,
    airlockPos: [0, 0, -6.7],
    bounds: { minX: -8.8, maxX: 8.8, minY: 0, maxY: 10.2, minZ: -7.2, maxZ: 7.2 },
    hasWorldTree: true,
    blocks: [
      // Grand Main Floor
      { minX: -8.8, maxX: 8.8, minY: -1.1, maxY: 0.0, minZ: -7.2, maxZ: 7.2, style: 'marble', brassTrim: true },
      // Left Gravity Wall
      { minX: -10.0, maxX: -8.8, minY: -1.1, maxY: 10.2, minZ: -7.2, maxZ: 7.2, style: 'wall_panel', brassTrim: true },
      // Right Gravity Wall
      { minX: 8.8, maxX: 10.0, minY: -1.1, maxY: 10.2, minZ: -7.2, maxZ: 7.2, style: 'wall_panel', brassTrim: true },

      // Central World-Tree Sanctuary Trunk Pedestal & Upper Crown Platform
      { minX: -1.35, maxX: 1.35, minY: 0.0, maxY: 5.5, minZ: -1.95, maxZ: 0.75, style: 'planter_box', brassTrim: true },
      { minX: -2.1, maxX: 2.1, minY: 5.5, maxY: 6.0, minZ: -2.4, maxZ: 1.2, style: 'teak', brassTrim: true },

      // West High Alcove Shelf + retaining brass lip (keeps Cube A safe during Right-Wall flips!)
      { minX: -8.8, maxX: -5.0, minY: 4.5, maxY: 5.1, minZ: -6.2, maxZ: 0.8, style: 'teak', brassTrim: true },
      { minX: -5.15, maxX: -4.85, minY: 5.1, maxY: 6.25, minZ: -6.2, maxZ: 0.8, style: 'glass_curb', blocksLaser: false },

      // East High Alcove Shelf + retaining brass lip (keeps Cube B safe during Left-Wall flips!)
      { minX: 5.0, maxX: 8.8, minY: 4.5, maxY: 5.1, minZ: -6.2, maxZ: 0.8, style: 'teak', brassTrim: true },
      { minX: 4.85, maxX: 5.15, minY: 5.1, maxY: 6.25, minZ: -6.2, maxZ: 0.8, style: 'glass_curb', blocksLaser: false },
    ],
    ramps: [],
    gravityPads: [
      {
        id: 'c5-pad-west-floor',
        surface: 'floor',
        pos: [-6.0, 0.02, 5.8],
        targetGravity: 'left',
        altGravity: 'floor',
        radius: 1.35,
      },
      {
        id: 'c5-pad-west-wall-low',
        surface: 'left',
        pos: [-8.78, 2.0, 5.8],
        targetGravity: 'floor',
        altGravity: 'left',
        radius: 1.3,
      },
      {
        id: 'c5-pad-west-wall-high',
        surface: 'left',
        pos: [-8.78, 7.2, 5.8],
        targetGravity: 'floor',
        altGravity: 'left',
        radius: 1.35,
      },
      {
        id: 'c5-pad-east-floor',
        surface: 'floor',
        pos: [5.8, 0.02, 5.8],
        targetGravity: 'right',
        altGravity: 'floor',
        radius: 1.35,
      },
      {
        id: 'c5-pad-east-wall-low',
        surface: 'right',
        pos: [8.78, 2.0, 6.45],
        targetGravity: 'floor',
        altGravity: 'right',
        radius: 1.25,
      },
      {
        id: 'c5-pad-east-wall-high',
        surface: 'right',
        pos: [8.78, 7.2, 6.45],
        targetGravity: 'floor',
        altGravity: 'right',
        radius: 1.25,
      },
    ],
    cubes: [
      { id: 'c5-cube-west', startPos: [-6.8, 5.75, -2.4] },
      { id: 'c5-cube-east', startPos: [6.8, 5.75, -2.4] },
    ],
    conduits: [
      {
        id: 'c5-conduit-west',
        surface: 'floor',
        pos: [-7.8, 0, -4.2],
        wirePath: [
          [-7.8, 0.03, -4.2],
          [-7.8, 0.03, -6.3],
          [-1.6, 0.03, -6.3],
        ],
      },
      {
        id: 'c5-conduit-east',
        surface: 'floor',
        pos: [7.8, 0, -4.2],
        wirePath: [
          [7.8, 0.03, -4.2],
          [7.8, 0.03, -6.3],
          [1.6, 0.03, -6.3],
        ],
      },
    ],
    emitters: [
      {
        id: 'c5-emit-1',
        origin: [-3.2, 1.15, -5.6],
        dir: '+z',
        mountPos: [-3.2, 0, -5.6],
      },
    ],
    mirrors: [
      {
        id: 'c5-mirror-floor',
        surface: 'floor',
        basePos: [-3.2, 0, 5.4],
        crystalPos: [-3.2, 1.15, 5.4],
        aimCycle: ['-z', '+x', '+z', '-x'],
        initialAimIdx: 3, // -x -> rotate to +x
      },
      {
        id: 'c5-mirror-wall-low',
        surface: 'right',
        basePos: [8.8, 1.15, 5.4],
        crystalPos: [7.65, 1.15, 5.4],
        aimCycle: ['+y', '-z', '-y', '+z'],
        initialAimIdx: 1, // -z -> rotate to +y
      },
      {
        id: 'c5-mirror-wall-high',
        surface: 'right',
        basePos: [8.8, 7.15, 5.4],
        crystalPos: [7.65, 7.15, 5.4],
        aimCycle: ['+y', '-z', '-y', '+z'],
        initialAimIdx: 3, // +z -> rotate to -z
      },
    ],
    elbows: [
      {
        id: 'c5-elbow-crown',
        pos: [7.65, 7.15, -0.6],
        inDir: '-z',
        outDir: '-x',
        wallAttachDir: '+x',
      },
    ],
    receivers: [
      {
        id: 'c5-recv-crown',
        surface: 'floor',
        basePos: [0, 6.0, -0.6],
        corePos: [0, 7.15, -0.6],
        wirePath: [
          [0, 6.03, -0.6],
          [0, 6.03, -2.35],
          [0, 0.03, -2.35],
          [0, 0.03, -6.3],
        ],
      },
    ],
    hydroBeds: [
      { minX: -1.8, maxX: 1.8, y: 6.03, minZ: -2.1, maxZ: 0.9, hasGrass: true, hasFlowers: true },
      { minX: -4.2, maxX: -2.2, y: 0.03, minZ: -2.0, maxZ: 0.8, hasWater: true },
      { minX: 2.2, maxX: 4.2, y: 0.03, minZ: -2.0, maxZ: 0.8, hasWater: true },
    ],
    botanicals: [
      { kind: 'bonsai', pos: [-5.8, 5.1, -5.2], scale: 0.85, seed: 501, bonsaiVariant: 'sakura' },
      { kind: 'bonsai', pos: [5.8, 5.1, -5.2], scale: 0.85, seed: 502, bonsaiVariant: 'emerald' },
      { kind: 'fern', pos: [-1.7, 0, -2.0], scale: 0.95, seed: 503 },
      { kind: 'fern', pos: [1.7, 0, -2.0], scale: 0.95, seed: 504 },
      { kind: 'fern', pos: [-1.7, 0, 0.8], scale: 0.95, seed: 505 },
      { kind: 'fern', pos: [1.7, 0, 0.8], scale: 0.95, seed: 506 },
      { kind: 'lantern', pos: [-2.4, 0, -6.0], scale: 0.95 },
      { kind: 'lantern', pos: [2.4, 0, -6.0], scale: 0.95 },
      { kind: 'lantern', pos: [-2.2, 0, 1.4], scale: 0.85 },
      { kind: 'lantern', pos: [2.2, 0, 1.4], scale: 0.85 },
    ],
    starSeeds: [
      { id: 'c5-seed-west-high', pos: [-7.9, 8.2, -4.4] },
      { id: 'c5-seed-east-high', pos: [7.9, 8.2, -4.4] },
    ],
  },
];
