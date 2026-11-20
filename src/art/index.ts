export {
  getPBRTextures,
  createPBRMaterial,
  getLeafCardTexture,
  type PBRTextureType,
  type LeafCardStyle,
  type PBRTextureSet,
  type LeafCardTextureSet,
  type TextureOptions,
} from './textures';

export {
  updateFoliageWind,
  createDetailedTree,
  createForest,
  createGrassField,
  createWildflowerPatch,
  createFernCluster,
  createMossyBoulder,
  createBambooCluster,
  createLantern,
  type TreeStyle,
  type TreeOptions,
  type DetailedTree,
  type ForestPlacement,
  type ForestOptions,
  type ForestBatch,
  type GrassFieldOptions,
  type GrassField,
  type WildflowerPatchOptions,
  type WildflowerPatch,
  type FernClusterOptions,
  type MossyBoulderOptions,
  type BambooClusterOptions,
  type BambooCluster,
  type LanternStyle,
  type LanternOptions,
} from './foliage';

export {
  applyAtmosphere,
  type AtmospherePreset,
  type AtmosphereOptions,
  type AtmosphereRig,
} from './atmosphere';

export {
  createWaterSurface,
  type WaterOptions,
  type WaterSurface,
} from './water';

export {
  createParticleSystem,
  type ParticleType,
  type ParticleSystemOptions,
  type ParticleBurstOptions,
  type ParticleSystem,
} from './particles';
