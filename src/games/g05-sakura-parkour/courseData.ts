import type {
  CheckpointDef,
  CourseData,
  CraneDef,
  IslandDecorDef,
  SpringPadDef,
  WalkableSurface,
} from './types';

/**
 * Evaluates exact world surface elevation & normal for any oriented WalkableSurface
 * at a local coordinate (lx, lz), where local -Z is the forward direction of the surface.
 */
export function evaluateSurfaceLocal(
  surface: WalkableSurface,
  lx: number,
  lz: number,
): { y: number; slopeX: number; slopeZ: number } {
  if (surface.kind === 'ramp' && surface.rampRise) {
    // Entry is at local +halfL (t = 0), high launch lip is at local -halfL (t = 1)
    const len = surface.halfL * 2;
    const t = Math.max(0, Math.min(1, (surface.halfL - lz) / len));
    // Smooth concave ski-jump curve: y = baseY + rampRise * (0.35*t + 0.65*t^2)
    const y = surface.baseY + surface.rampRise * (0.35 * t + 0.65 * t * t);
    // dy/d(-lz) = (rampRise / len) * (0.35 + 1.3 * t)
    const dyForward = (surface.rampRise / len) * (0.35 + 1.3 * t);
    return { y, slopeX: 0, slopeZ: -dyForward };
  }

  if (surface.kind === 'bridge') {
    const startY = surface.bridgeStartY ?? surface.baseY;
    const endY = surface.bridgeEndY ?? surface.baseY;
    const arch = surface.bridgeArchLift ?? 1.2;
    const len = surface.halfL * 2;
    const t = Math.max(0, Math.min(1, (surface.halfL - lz) / len));
    const linearY = startY + (endY - startY) * t;
    const archY = 4 * arch * t * (1 - t);
    const dyDt = endY - startY + 4 * arch * (1 - 2 * t);
    const dyForward = dyDt / len;
    return { y: linearY + archY, slopeX: 0, slopeZ: -dyForward };
  }

  return { y: surface.baseY, slopeX: 0, slopeZ: 0 };
}

export function buildCourseData(): CourseData {
  const surfaces: WalkableSurface[] = [
    // =========================================================================
    // ISLAND 1 — Lantern Courtyard (Start Terrace, y = 0)
    // =========================================================================
    {
      id: 'island-1',
      kind: 'rooftop',
      x: 0,
      z: 0,
      baseY: 0,
      halfW: 7.5,
      halfL: 9.0,
      yaw: 0,
      rails: { left: true, right: true, back: true, front: false },
      fallFloorY: -12,
      islandIndex: 1,
    },
    // Arched Wooden Pergola Bridge #1: Island 1 (z = -9, y = 0) -> Island 2 (z = -23, y = 1.5)
    {
      id: 'bridge-1',
      kind: 'bridge',
      x: 0,
      z: -16,
      baseY: 0,
      halfW: 3.1,
      halfL: 7.4,
      yaw: 0,
      bridgeStartY: 0,
      bridgeEndY: 1.5,
      bridgeArchLift: 1.35,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: -12,
      islandIndex: 1,
    },

    // =========================================================================
    // ISLAND 2 — Blossom Tea Terrace (y = 1.5)
    // =========================================================================
    {
      id: 'island-2',
      kind: 'rooftop',
      x: 0,
      z: -31,
      baseY: 1.5,
      halfW: 7.5,
      halfL: 8.2,
      yaw: 0,
      rails: { left: false, right: true, back: false, front: false },
      fallFloorY: -11,
      islandIndex: 2,
    },
    // Launch Ramp #1 on Island 2 north edge -> jumps across to Island 3
    {
      id: 'ramp-1',
      kind: 'ramp',
      x: -0.6,
      z: -37.2,
      baseY: 1.52,
      halfW: 2.8,
      halfL: 3.2,
      yaw: 0.08,
      rampRise: 1.75,
      launchBoost: 1.18,
      fallFloorY: -11,
      islandIndex: 2,
    },
    // Secret Balcony 2B (left side of Island 2)
    {
      id: 'balcony-2b',
      kind: 'balcony',
      x: -12.2,
      z: -31.5,
      baseY: 2.1,
      halfW: 3.0,
      halfL: 3.2,
      yaw: 0.12,
      rails: { left: true, right: false, back: true, front: true },
      fallFloorY: -11,
      islandIndex: 2,
    },

    // =========================================================================
    // ISLAND 3 — Crimson Torii Overlook (Checkpoint 2, y = 2.8)
    // =========================================================================
    {
      id: 'island-3',
      kind: 'rooftop',
      x: -1.6,
      z: -56,
      baseY: 2.8,
      halfW: 7.8,
      halfL: 8.4,
      yaw: 0,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: -10,
      islandIndex: 3,
    },

    // =========================================================================
    // ISLAND 4 — Wind-Chime Eaves (y = 6.5) + Two Floating Gazebo Step Roofs
    // =========================================================================
    {
      id: 'island-4',
      kind: 'rooftop',
      x: 3.6,
      z: -79,
      baseY: 6.5,
      halfW: 7.0,
      halfL: 7.8,
      yaw: 0,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: -7,
      islandIndex: 4,
    },
    {
      id: 'step-4a',
      kind: 'step',
      x: 5.5,
      z: -95.0,
      baseY: 7.2,
      halfW: 4.1,
      halfL: 4.1,
      yaw: 0.1,
      rails: { left: false, right: true, back: false, front: false },
      fallFloorY: -6,
      islandIndex: 4,
    },
    {
      id: 'step-4b',
      kind: 'step',
      x: 1.0,
      z: -106.5,
      baseY: 8.2,
      halfW: 4.1,
      halfL: 4.1,
      yaw: -0.14,
      rails: { left: true, right: false, back: false, front: false },
      fallFloorY: -5,
      islandIndex: 4,
    },

    // =========================================================================
    // ISLAND 5 — Zen Bamboo Sanctuary (Checkpoint 3, y = 9.2)
    // =========================================================================
    {
      id: 'island-5',
      kind: 'rooftop',
      x: -4.0,
      z: -124.5,
      baseY: 9.2,
      halfW: 8.2,
      halfL: 9.2,
      yaw: 0,
      rails: { left: false, right: true, back: false, front: false },
      fallFloorY: -4,
      islandIndex: 5,
    },
    // Secret Balcony 5B (left of Island 5)
    {
      id: 'balcony-5b',
      kind: 'balcony',
      x: -16.8,
      z: -125.0,
      baseY: 10.0,
      halfW: 3.1,
      halfL: 3.4,
      yaw: -0.1,
      rails: { left: true, right: false, back: true, front: true },
      fallFloorY: -4,
      islandIndex: 5,
    },
    // Launch Ramp #2 on Island 5 north edge -> jumps across to Island 6
    {
      id: 'ramp-2',
      kind: 'ramp',
      x: -5.4,
      z: -131.6,
      baseY: 9.22,
      halfW: 3.0,
      halfL: 3.5,
      yaw: 0.16,
      rampRise: 2.0,
      launchBoost: 1.24,
      fallFloorY: -4,
      islandIndex: 5,
    },

    // =========================================================================
    // ISLAND 6 — Cloud-Bridge Promenade (y = 10.5)
    // =========================================================================
    {
      id: 'island-6',
      kind: 'rooftop',
      x: -8.0,
      z: -153.5,
      baseY: 10.5,
      halfW: 7.4,
      halfL: 9.0,
      yaw: 0,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: -3,
      islandIndex: 6,
    },
    // Arched Pergola Bridge #2 angled gracefully from Island 6 (-4.8, -162) -> Island 7 (+2.0, -176.5)
    {
      id: 'bridge-2',
      kind: 'bridge',
      x: -1.4,
      z: -169.25,
      baseY: 10.5,
      halfW: 3.2,
      halfL: 8.6,
      yaw: -0.438, // atan2(-6.8, 14.5) so local -Z points toward (+6.8, -14.5)
      bridgeStartY: 10.5,
      bridgeEndY: 13.0,
      bridgeArchLift: 1.45,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: -2,
      islandIndex: 6,
    },

    // =========================================================================
    // ISLAND 7 — Crimson Bell Terrace (Checkpoint 4, y = 13.0)
    // =========================================================================
    {
      id: 'island-7',
      kind: 'rooftop',
      x: 4.0,
      z: -184.5,
      baseY: 13.0,
      halfW: 8.0,
      halfL: 8.6,
      yaw: 0,
      rails: { left: false, right: true, back: false, front: false },
      fallFloorY: 0,
      islandIndex: 7,
    },
    // Optional Skill Launch Ramp #3 on Island 7 left-front -> launches to Secret Sky Balcony 7B
    {
      id: 'ramp-3',
      kind: 'ramp',
      x: -1.5,
      z: -190.2,
      baseY: 13.02,
      halfW: 2.3,
      halfL: 3.1,
      yaw: 0.54,
      rampRise: 1.95,
      launchBoost: 1.24,
      fallFloorY: 0,
      islandIndex: 7,
    },
    // Secret Balcony 7B (floating high lantern terrace with mini spring pad back to Island 8)
    {
      id: 'balcony-7b',
      kind: 'balcony',
      x: -9.0,
      z: -201.5,
      baseY: 16.0,
      halfW: 3.5,
      halfL: 3.6,
      yaw: -0.35,
      rails: { left: true, right: false, back: true, front: false },
      fallFloorY: 2,
      islandIndex: 7,
    },

    // =========================================================================
    // ISLAND 8 — Whispering Sakura Ridge (y = 18.2)
    // =========================================================================
    {
      id: 'island-8',
      kind: 'rooftop',
      x: 2.0,
      z: -210.5,
      baseY: 18.2,
      halfW: 7.5,
      halfL: 9.0,
      yaw: 0,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: 5,
      islandIndex: 8,
    },
    // Grand Launch Ramp #4 on Island 8 -> dramatic aerial stunt jump to Island 9
    {
      id: 'ramp-4',
      kind: 'ramp',
      x: 1.0,
      z: -217.5,
      baseY: 18.22,
      halfW: 3.2,
      halfL: 3.8,
      yaw: 0.08,
      rampRise: 2.3,
      launchBoost: 1.28,
      fallFloorY: 5,
      islandIndex: 8,
    },

    // =========================================================================
    // ISLAND 9 — Sky-Gate Ascent (Checkpoint 5, y = 20.2)
    // =========================================================================
    {
      id: 'island-9',
      kind: 'rooftop',
      x: 0,
      z: -239.5,
      baseY: 20.2,
      halfW: 7.8,
      halfL: 8.5,
      yaw: 0,
      rails: { left: true, right: true, back: false, front: false },
      fallFloorY: 7,
      islandIndex: 9,
    },
    // Central Hero Ramp on Island 9 between twin spring pads for style-combo launch
    {
      id: 'ramp-5',
      kind: 'ramp',
      x: 0,
      z: -245.5,
      baseY: 20.22,
      halfW: 2.2,
      halfL: 3.2,
      yaw: 0,
      rampRise: 2.1,
      launchBoost: 1.32,
      fallFloorY: 7,
      islandIndex: 9,
    },

    // =========================================================================
    // ISLAND 10 — The Golden Sky Pagoda Summit (y = 26.0)
    // =========================================================================
    {
      id: 'island-10',
      kind: 'rooftop',
      x: 0,
      z: -271.5,
      baseY: 26.0,
      halfW: 12.5,
      halfL: 14.5,
      yaw: 0,
      rails: { left: true, right: true, back: false, front: true },
      fallFloorY: 12,
      islandIndex: 10,
    },
  ];

  // ===========================================================================
  // Turquoise-and-Gold Spring Jump Pads
  // ===========================================================================
  const springPads: SpringPadDef[] = [
    // Island 3 -> Island 4 (+3.7m vertical, ~10m forward-right)
    {
      id: 'spring-1',
      x: 1.4,
      y: 2.8,
      z: -62.0,
      radius: 2.05,
      launchVy: 19.2,
      assistVx: 2.4,
      assistVz: -10.8,
      islandIndex: 3,
    },
    // Island 7 -> Island 8 (+5.2m vertical, ~11m forward)
    {
      id: 'spring-2',
      x: 3.8,
      y: 13.0,
      z: -190.8,
      radius: 2.15,
      launchVy: 20.8,
      assistVx: -1.4,
      assistVz: -11.2,
      islandIndex: 7,
    },
    // Secret Balcony 7B -> Island 8 (+2.2m vertical, right-forward)
    {
      id: 'spring-2b',
      x: -7.2,
      y: 16.0,
      z: -203.2,
      radius: 1.7,
      launchVy: 16.5,
      assistVx: 8.6,
      assistVz: -5.4,
      islandIndex: 7,
    },
    // Island 9 Twin Spring Pads -> Island 10 Golden Sky Pagoda (+5.8m vertical, ~11m forward)
    {
      id: 'spring-3l',
      x: -4.2,
      y: 20.2,
      z: -245.5,
      radius: 2.0,
      launchVy: 21.8,
      assistVx: 2.5,
      assistVz: -11.6,
      islandIndex: 9,
    },
    {
      id: 'spring-3r',
      x: 4.2,
      y: 20.2,
      z: -245.5,
      radius: 2.0,
      launchVy: 21.8,
      assistVx: -2.5,
      assistVz: -11.6,
      islandIndex: 9,
    },
  ];

  // ===========================================================================
  // Checkpoint Torii Arches (Every Second Island: 1, 3, 5, 7, 9)
  // ===========================================================================
  const checkpoints: CheckpointDef[] = [
    {
      index: 0,
      islandIndex: 1,
      name: 'Lantern Courtyard',
      x: 0,
      y: 0,
      z: -2.2,
      yaw: 0,
      spawnX: 0,
      spawnY: 0,
      spawnZ: 4.8,
      spawnYaw: 0,
      triggerRadius: 5.5,
    },
    {
      index: 1,
      islandIndex: 3,
      name: 'Crimson Torii Overlook',
      x: -1.6,
      y: 2.8,
      z: -53.2,
      yaw: 0,
      spawnX: -1.6,
      spawnY: 2.8,
      spawnZ: -51.2,
      spawnYaw: -0.14,
      triggerRadius: 5.8,
    },
    {
      index: 2,
      islandIndex: 5,
      name: 'Zen Bamboo Sanctuary',
      x: -4.0,
      y: 9.2,
      z: -120.5,
      yaw: 0,
      spawnX: -4.0,
      spawnY: 9.2,
      spawnZ: -118.5,
      spawnYaw: 0.1,
      triggerRadius: 6.0,
    },
    {
      index: 3,
      islandIndex: 7,
      name: 'Crimson Bell Terrace',
      x: 3.6,
      y: 13.0,
      z: -180.5,
      yaw: 0,
      spawnX: 3.6,
      spawnY: 13.0,
      spawnZ: -178.5,
      spawnYaw: 0,
      triggerRadius: 6.0,
    },
    {
      index: 4,
      islandIndex: 9,
      name: 'Sky-Gate Ascent',
      x: 0,
      y: 20.2,
      z: -235.5,
      yaw: 0,
      spawnX: 0,
      spawnY: 20.2,
      spawnZ: -233.5,
      spawnYaw: 0,
      triggerRadius: 6.0,
    },
  ];

  // ===========================================================================
  // 35 Collectible Golden Origami Cranes (ideal jump arcs & secret balconies)
  // ===========================================================================
  const cranes: CraneDef[] = [
    // Bridge 1 graceful crest arc (3)
    { id: 'c01', x: 0, y: 2.2, z: -12.5, islandIndex: 1 },
    { id: 'c02', x: 0, y: 3.25, z: -16.0, islandIndex: 1 },
    { id: 'c03', x: 0, y: 2.95, z: -19.5, islandIndex: 1 },

    // Island 2 Ramp #1 jump arc (3) + Secret Balcony 2B (1)
    { id: 'c04', x: -0.9, y: 4.7, z: -41.5, islandIndex: 2 },
    { id: 'c05', x: -1.2, y: 5.5, z: -44.2, islandIndex: 2 },
    { id: 'c06', x: -1.5, y: 4.8, z: -47.0, islandIndex: 2 },
    { id: 'c07', x: -12.2, y: 3.5, z: -31.5, bonus: true, islandIndex: 2 },

    // Island 3 Spring Pad #1 rising arc (3)
    { id: 'c08', x: 2.1, y: 6.4, z: -65.0, islandIndex: 3 },
    { id: 'c09', x: 2.8, y: 9.2, z: -68.2, islandIndex: 3 },
    { id: 'c10', x: 3.4, y: 8.7, z: -71.5, islandIndex: 3 },

    // Island 4 terrace & floating gazebo step roofs (3)
    { id: 'c11', x: 4.5, y: 7.9, z: -83.5, islandIndex: 4 },
    { id: 'c12', x: 5.5, y: 8.8, z: -95.0, islandIndex: 4 },
    { id: 'c13', x: 1.0, y: 9.8, z: -106.5, islandIndex: 4 },

    // Island 5 Secret Balcony 5B (2) + Ramp #2 boost arc (3)
    { id: 'c14', x: -16.8, y: 11.4, z: -123.5, bonus: true, islandIndex: 5 },
    { id: 'c15', x: -16.8, y: 11.4, z: -126.5, bonus: true, islandIndex: 5 },
    { id: 'c16', x: -6.2, y: 12.8, z: -136.5, islandIndex: 5 },
    { id: 'c17', x: -7.0, y: 13.8, z: -139.8, islandIndex: 5 },
    { id: 'c18', x: -7.6, y: 12.6, z: -143.0, islandIndex: 5 },

    // Island 6 Promenade & Pergola Bridge #2 (3)
    { id: 'c19', x: -7.5, y: 11.9, z: -155.0, islandIndex: 6 },
    { id: 'c20', x: -2.8, y: 14.0, z: -166.5, islandIndex: 6 },
    { id: 'c21', x: 0.2, y: 14.8, z: -172.2, islandIndex: 6 },

    // Island 7 Spring Pad #2 arc (3) + Secret Sky Balcony 7B (2)
    { id: 'c22', x: 3.4, y: 16.8, z: -194.0, islandIndex: 7 },
    { id: 'c23', x: 2.9, y: 20.4, z: -197.2, islandIndex: 7 },
    { id: 'c24', x: 2.4, y: 20.2, z: -200.5, islandIndex: 7 },
    { id: 'c25', x: -9.2, y: 17.6, z: -200.0, bonus: true, islandIndex: 7 },
    { id: 'c26', x: -8.5, y: 17.6, z: -202.2, bonus: true, islandIndex: 7 },

    // Island 8 Grand Ramp #4 stunt arc (4)
    { id: 'c27', x: 0.8, y: 22.2, z: -222.0, islandIndex: 8 },
    { id: 'c28', x: 0.5, y: 23.8, z: -225.0, islandIndex: 8 },
    { id: 'c29', x: 0.3, y: 23.6, z: -228.0, islandIndex: 8 },
    { id: 'c30', x: 0.1, y: 22.0, z: -230.8, islandIndex: 8 },

    // Island 9 Final Summit Spring Ascent (3)
    { id: 'c31', x: 0, y: 24.4, z: -249.5, islandIndex: 9 },
    { id: 'c32', x: 0, y: 27.6, z: -252.8, islandIndex: 9 },
    { id: 'c33', x: 0, y: 27.8, z: -256.2, islandIndex: 9 },

    // Island 10 Golden Sky Pagoda Courtyard welcoming pair (2)
    { id: 'c34', x: -2.2, y: 27.4, z: -261.0, islandIndex: 10 },
    { id: 'c35', x: 2.2, y: 27.4, z: -261.0, islandIndex: 10 },
  ];

  // ===========================================================================
  // Rich Botanical & Architectural Island Decorations
  // ===========================================================================
  const decors: IslandDecorDef[] = [
    // Island 1: Grand framed start courtyard (outer corner sakura canopies arch overhead!)
    {
      islandIndex: 1,
      surfaceId: 'island-1',
      gardenBeds: [
        { lx: -5.8, lz: 2.2, w: 2.6, l: 7.4, seed: 101 },
        { lx: 5.8, lz: 2.2, w: 2.6, l: 7.4, seed: 102 },
      ],
      sakuraTrees: [
        { lx: -6.9, lz: -0.8, height: 7.6, seed: 201 },
        { lx: 6.9, lz: -2.2, height: 8.0, seed: 202 },
        { lx: -6.8, lz: 7.2, height: 6.8, seed: 203 },
      ],
      bamboo: [{ lx: 6.3, lz: 5.8, seed: 301 }],
      boulders: [
        { lx: -5.6, lz: 3.2, radius: 0.85, seed: 401 },
        { lx: 5.6, lz: 1.8, radius: 0.78, seed: 402 },
      ],
      ferns: [
        { lx: -5.2, lz: -1.4, seed: 501 },
        { lx: 5.2, lz: 3.4, seed: 502 },
      ],
      paperLanterns: [
        { lx: -6.2, lz: -6.4, rotY: Math.PI * 0.5, withLight: true },
        { lx: 6.2, lz: -6.4, rotY: -Math.PI * 0.5, withLight: false },
      ],
      stoneLanterns: [
        { lx: -4.4, lz: 7.4, withLight: false },
        { lx: 4.4, lz: 7.4, withLight: false },
      ],
      banners: [
        { lx: -6.7, lz: -4.2, rotY: 0.3, color: '#d84562' },
        { lx: 6.7, lz: -4.2, rotY: -0.3, color: '#f2b154' },
      ],
      hasGarland: { fromX: -6.4, fromZ: 1.0, toX: 6.4, toZ: 1.0, height: 4.8, count: 7 },
    },
    // Island 2: Blossom Tea Terrace (trees pushed to far outer rim so turning & jumping stay 100% clear)
    {
      islandIndex: 2,
      surfaceId: 'island-2',
      gardenBeds: [{ lx: 5.8, lz: 0.0, w: 2.4, l: 7.8, seed: 103 }],
      sakuraTrees: [
        { lx: 7.2, lz: 4.6, height: 7.8, seed: 204 },
        { lx: 7.2, lz: -5.4, height: 7.4, seed: 205 },
      ],
      boulders: [{ lx: 5.7, lz: -1.4, radius: 0.8, seed: 403 }],
      ferns: [{ lx: 5.4, lz: 2.2, seed: 503 }],
      paperLanterns: [
        { lx: -6.2, lz: 4.8, rotY: Math.PI * 0.5, withLight: false },
        { lx: 6.0, lz: 5.8, rotY: -Math.PI * 0.5, withLight: true },
      ],
      banners: [{ lx: 6.6, lz: -6.4, rotY: -0.2, color: '#e66c88' }],
    },
    // Balcony 2B
    {
      islandIndex: 2,
      surfaceId: 'balcony-2b',
      paperLanterns: [{ lx: -1.8, lz: -2.0, rotY: 0.5, withLight: false }],
      ferns: [{ lx: -1.7, lz: 1.8, seed: 504 }],
    },
    // Island 3: Crimson Torii Overlook
    {
      islandIndex: 3,
      surfaceId: 'island-3',
      gardenBeds: [{ lx: -6.0, lz: -0.8, w: 2.6, l: 8.4, seed: 104 }],
      sakuraTrees: [{ lx: -7.4, lz: -3.2, height: 8.0, seed: 206 }],
      bamboo: [{ lx: -6.2, lz: 3.8, seed: 302 }],
      boulders: [{ lx: -5.6, lz: 1.2, radius: 0.9, seed: 404 }],
      paperLanterns: [{ lx: 6.3, lz: 2.2, rotY: -Math.PI * 0.5, withLight: false }],
      stoneLanterns: [{ lx: -4.8, lz: -6.4, withLight: false }],
      banners: [{ lx: 6.7, lz: -5.8, rotY: -0.25, color: '#39b8b2' }],
    },
    // Island 4: Wind-Chime Eaves
    {
      islandIndex: 4,
      surfaceId: 'island-4',
      gardenBeds: [{ lx: -5.4, lz: -0.5, w: 2.2, l: 6.8, seed: 105 }],
      sakuraTrees: [
        { lx: -6.6, lz: 2.4, height: 7.4, seed: 207 },
        { lx: 6.6, lz: 3.4, height: 7.2, seed: 208 },
      ],
      ferns: [{ lx: 5.4, lz: -2.5, seed: 505 }],
      paperLanterns: [{ lx: 5.8, lz: -5.2, rotY: -Math.PI * 0.5, withLight: true }],
      banners: [
        { lx: -6.1, lz: -5.6, rotY: 0.15, color: '#f2b154' },
        { lx: 6.1, lz: -5.6, rotY: -0.15, color: '#d84562' },
      ],
      hasGarland: { fromX: -5.8, fromZ: -2.0, toX: 5.8, toZ: -2.0, height: 4.8, count: 6 },
    },
    // Step 4B subtle lantern accent
    {
      islandIndex: 4,
      surfaceId: 'step-4b',
      paperLanterns: [{ lx: -2.7, lz: -2.5, rotY: 0.8, withLight: false }],
    },
    // Island 5: Zen Bamboo Sanctuary
    {
      islandIndex: 5,
      surfaceId: 'island-5',
      gardenBeds: [{ lx: 6.3, lz: -0.4, w: 2.8, l: 9.8, seed: 106 }],
      sakuraTrees: [
        { lx: 7.6, lz: -4.6, height: 8.2, seed: 209 },
        { lx: -7.2, lz: 6.6, height: 7.0, seed: 210 },
      ],
      bamboo: [
        { lx: 6.6, lz: 2.6, seed: 303 },
        { lx: 6.1, lz: 5.4, seed: 304 },
      ],
      boulders: [
        { lx: 5.9, lz: -0.4, radius: 1.0, seed: 405 },
        { lx: -6.2, lz: -5.6, radius: 0.72, seed: 406 },
      ],
      ferns: [
        { lx: 5.3, lz: 1.6, seed: 506 },
        { lx: 5.5, lz: -4.8, seed: 507 },
      ],
      stoneLanterns: [{ lx: 5.0, lz: -6.8, withLight: false }],
      paperLanterns: [{ lx: -6.6, lz: -3.5, rotY: Math.PI * 0.5, withLight: false }],
    },
    // Balcony 5B
    {
      islandIndex: 5,
      surfaceId: 'balcony-5b',
      sakuraTrees: [{ lx: -2.6, lz: -2.4, height: 6.0, seed: 211 }],
      stoneLanterns: [{ lx: -1.6, lz: 2.0, withLight: false }],
    },
    // Island 6: Cloud-Bridge Promenade
    {
      islandIndex: 6,
      surfaceId: 'island-6',
      gardenBeds: [{ lx: -5.7, lz: 0, w: 2.4, l: 10.2, seed: 107 }],
      sakuraTrees: [
        { lx: -7.0, lz: 4.2, height: 7.8, seed: 212 },
        { lx: -7.0, lz: -5.2, height: 7.6, seed: 213 },
      ],
      paperLanterns: [
        { lx: 6.0, lz: 4.2, rotY: -Math.PI * 0.5, withLight: false },
        { lx: 6.0, lz: -2.8, rotY: -Math.PI * 0.5, withLight: true },
      ],
      ferns: [{ lx: -5.0, lz: -1.2, seed: 508 }],
      banners: [
        { lx: -6.5, lz: 6.4, rotY: 0.2, color: '#e66c88' },
        { lx: 6.5, lz: -6.4, rotY: -0.2, color: '#f2b154' },
      ],
      hasGarland: { fromX: -6.0, fromZ: 0.5, toX: 6.0, toZ: 0.5, height: 4.8, count: 6 },
    },
    // Island 7: Crimson Bell Terrace
    {
      islandIndex: 7,
      surfaceId: 'island-7',
      gardenBeds: [{ lx: -6.2, lz: 1.5, w: 2.6, l: 6.8, seed: 108 }],
      sakuraTrees: [{ lx: -7.4, lz: 3.4, height: 7.8, seed: 214 }],
      boulders: [{ lx: -5.8, lz: -1.6, radius: 0.85, seed: 407 }],
      hasBellPavilion: { lx: 5.8, lz: 1.2 },
      stoneLanterns: [{ lx: 5.4, lz: -5.6, withLight: false }],
      paperLanterns: [{ lx: -6.0, lz: 6.2, rotY: Math.PI * 0.5, withLight: false }],
    },
    // Balcony 7B
    {
      islandIndex: 7,
      surfaceId: 'balcony-7b',
      paperLanterns: [{ lx: -2.2, lz: 2.0, rotY: 0.4, withLight: false }],
      boulders: [{ lx: -2.2, lz: -1.8, radius: 0.65, seed: 408 }],
    },
    // Island 8: Whispering Sakura Ridge
    {
      islandIndex: 8,
      surfaceId: 'island-8',
      gardenBeds: [
        { lx: -5.8, lz: 1.0, w: 2.4, l: 8.4, seed: 109 },
        { lx: 5.8, lz: 1.0, w: 2.4, l: 8.4, seed: 110 },
      ],
      sakuraTrees: [
        { lx: -7.1, lz: 3.6, height: 8.0, seed: 215 },
        { lx: 7.1, lz: -2.6, height: 7.8, seed: 216 },
      ],
      bamboo: [{ lx: 6.0, lz: 5.2, seed: 305 }],
      ferns: [{ lx: -5.2, lz: -2.6, seed: 509 }],
      paperLanterns: [{ lx: -6.0, lz: -6.0, rotY: Math.PI * 0.5, withLight: true }],
      banners: [
        { lx: -6.5, lz: -7.4, rotY: 0.15, color: '#d84562' },
        { lx: 6.5, lz: -7.4, rotY: -0.15, color: '#f2b154' },
      ],
    },
    // Island 9: Sky-Gate Ascent
    {
      islandIndex: 9,
      surfaceId: 'island-9',
      gardenBeds: [{ lx: -6.2, lz: 0.8, w: 2.4, l: 6.6, seed: 111 }],
      sakuraTrees: [
        { lx: -7.2, lz: 2.6, height: 7.6, seed: 217 },
        { lx: 7.2, lz: 2.6, height: 7.6, seed: 218 },
      ],
      stoneLanterns: [
        { lx: -5.2, lz: -3.2, withLight: false },
        { lx: 5.2, lz: -3.2, withLight: false },
      ],
      banners: [
        { lx: -6.9, lz: -6.2, rotY: 0.2, color: '#39b8b2' },
        { lx: 6.9, lz: -6.2, rotY: -0.2, color: '#39b8b2' },
      ],
    },
    // Island 10: The Golden Sky Pagoda Summit
    {
      islandIndex: 10,
      surfaceId: 'island-10',
      gardenBeds: [
        { lx: -9.6, lz: 4.5, w: 3.8, l: 8.6, seed: 112 },
        { lx: 9.6, lz: 4.5, w: 3.8, l: 8.6, seed: 113 },
      ],
      sakuraTrees: [
        { lx: -11.2, lz: 8.2, height: 8.6, seed: 219 },
        { lx: 11.2, lz: 8.2, height: 8.6, seed: 220 },
        { lx: -11.0, lz: -7.6, height: 8.2, seed: 221 },
        { lx: 11.0, lz: -7.6, height: 8.2, seed: 222 },
      ],
      bamboo: [
        { lx: -10.2, lz: -1.0, seed: 306 },
        { lx: 10.2, lz: -1.0, seed: 307 },
      ],
      boulders: [
        { lx: -8.6, lz: 2.2, radius: 1.1, seed: 409 },
        { lx: 8.6, lz: 2.2, radius: 1.1, seed: 410 },
      ],
      ferns: [
        { lx: -7.8, lz: 7.6, seed: 510 },
        { lx: 7.8, lz: 7.6, seed: 511 },
      ],
      stoneLanterns: [
        { lx: -4.8, lz: 9.8, withLight: true },
        { lx: 4.8, lz: 9.8, withLight: true },
        { lx: -5.6, lz: 1.2, withLight: false },
        { lx: 5.6, lz: 1.2, withLight: false },
      ],
      paperLanterns: [
        { lx: -8.2, lz: 11.2, rotY: Math.PI * 0.5, withLight: false },
        { lx: 8.2, lz: 11.2, rotY: -Math.PI * 0.5, withLight: false },
      ],
      hasPagoda: { lx: 0, lz: -5.8 },
    },
  ];

  return {
    surfaces,
    springPads,
    checkpoints,
    cranes,
    decors,
    summitGoal: {
      x: 0,
      y: 26.0,
      z: -266.0,
      radius: 3.6,
    },
    startSpawn: {
      x: 0,
      y: 0,
      z: 4.8,
      yaw: 0,
    },
  };
}
