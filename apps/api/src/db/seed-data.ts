/**
 * Seed content for the demo database.
 *
 * All data lives in the database — this file is only used by the seed script
 * to populate a fresh install. It is NOT consumed by any client application.
 */
import type { Technologies } from '@goh/validation';

export const PROFILE_SLUGS = ['maximum-fps', 'balanced', 'high-quality', 'ultra-quality'] as const;
export type ProfileSlug = (typeof PROFILE_SLUGS)[number];

export const OPTIMIZATION_CATEGORIES = [
  { slug: 'graphics', name: 'Graphics' },
  { slug: 'performance', name: 'Performance' },
  { slug: 'advanced-graphics', name: 'Advanced Graphics' },
  { slug: 'display', name: 'Display' },
  { slug: 'ray-tracing', name: 'Ray Tracing' },
  { slug: 'upscaling', name: 'Upscaling' },
  { slug: 'post-processing', name: 'Post Processing' },
] as const;

export const BROWSE_CATEGORIES = [
  { slug: 'action', name: 'Action', description: 'Fast-paced gameplay focused on combat and reflexes' },
  { slug: 'adventure', name: 'Adventure', description: 'Story-driven exploration and puzzle solving' },
  { slug: 'open-world', name: 'Open World', description: 'Large explorable worlds with non-linear progression' },
  { slug: 'rpg', name: 'RPG', description: 'Character progression, stats and narrative choice' },
  { slug: 'fps', name: 'FPS', description: 'First-person shooters' },
  { slug: 'shooter', name: 'Shooter', description: 'Gunplay-focused games' },
  { slug: 'horror', name: 'Horror', description: 'Atmospheric and survival-focused experiences' },
  { slug: 'platformer', name: 'Platformer', description: 'Jump-and-run gameplay' },
  { slug: 'comedy', name: 'Comedy', description: 'Humorous tone and writing' },
] as const;

export const TAGS = ['singleplayer', 'multiplayer', 'classic', 'story-rich', 'difficult', 'co-op', 'esports'] as const;

export interface SettingDef {
  key: string;
  name: string;
  category: string;
  /** Select options. Empty array means the setting is a slider/text value. */
  options: string[];
  /** Value per profile slug. */
  values: Record<ProfileSlug, string>;
}

export interface ReqSpec {
  os: string;
  cpu: string;
  gpu: string;
  ramGb: number;
  storageGb: number;
  directx: string;
  notes?: string;
}

export interface SeedGame {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  engine: string;
  api: string;
  genres: string[];
  tags: string[];
  technologies: Partial<Technologies>;
  rating: number;
  featured?: boolean;
  requirements: { minimum: ReqSpec; recommended: ReqSpec };
  /** Per-game extra settings (e.g. GTA V population controls). */
  extras?: SettingDef[];
  /** Cover gradient hue. */
  hue: number;
}

/** Base settings applied to every game. Values per profile: max-fps / balanced / high-quality / ultra-quality. */
export const BASE_SETTINGS: SettingDef[] = [
  { key: 'texture-quality', name: 'Texture Quality', category: 'graphics', options: ['Low', 'Medium', 'High', 'Very High', 'Ultra'], values: { 'maximum-fps': 'Medium', balanced: 'High', 'high-quality': 'Ultra', 'ultra-quality': 'Ultra' } },
  { key: 'shadow-quality', name: 'Shadow Quality', category: 'graphics', options: ['Low', 'Medium', 'High', 'Ultra'], values: { 'maximum-fps': 'Low', balanced: 'Medium', 'high-quality': 'High', 'ultra-quality': 'Ultra' } },
  { key: 'character-quality', name: 'Character Quality', category: 'graphics', options: ['Low', 'Medium', 'High', 'Ultra'], values: { 'maximum-fps': 'Medium', balanced: 'High', 'high-quality': 'Ultra', 'ultra-quality': 'Ultra' } },
  { key: 'view-distance', name: 'View Distance', category: 'graphics', options: ['Low', 'Medium', 'High', 'Ultra'], values: { 'maximum-fps': 'Medium', balanced: 'High', 'high-quality': 'Ultra', 'ultra-quality': 'Ultra' } },
  { key: 'water-quality', name: 'Water Quality', category: 'graphics', options: ['Low', 'Medium', 'High', 'Ultra'], values: { 'maximum-fps': 'Low', balanced: 'Medium', 'high-quality': 'High', 'ultra-quality': 'Ultra' } },
  { key: 'grass-quality', name: 'Grass Quality', category: 'graphics', options: ['Off', 'Low', 'Medium', 'High', 'Ultra'], values: { 'maximum-fps': 'Low', balanced: 'Medium', 'high-quality': 'High', 'ultra-quality': 'Ultra' } },
  { key: 'anti-aliasing', name: 'Anti-Aliasing', category: 'graphics', options: ['Off', 'FXAA', 'TAA', 'DLAA'], values: { 'maximum-fps': 'FXAA', balanced: 'TAA', 'high-quality': 'TAA', 'ultra-quality': 'DLAA' } },
  { key: 'ambient-occlusion', name: 'Ambient Occlusion', category: 'advanced-graphics', options: ['Off', 'Low', 'Medium', 'High'], values: { 'maximum-fps': 'Off', balanced: 'Low', 'high-quality': 'Medium', 'ultra-quality': 'High' } },
  { key: 'volumetric-quality', name: 'Volumetric Quality', category: 'advanced-graphics', options: ['Low', 'Medium', 'High', 'Ultra'], values: { 'maximum-fps': 'Low', balanced: 'Medium', 'high-quality': 'High', 'ultra-quality': 'Ultra' } },
  { key: 'motion-blur', name: 'Motion Blur', category: 'display', options: ['Off', 'Low', 'Medium', 'High'], values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'Low', 'ultra-quality': 'Medium' } },
  { key: 'resolution-scale', name: 'Resolution Scale', category: 'display', options: ['50', '60', '75', '85', '100'], values: { 'maximum-fps': '75', balanced: '100', 'high-quality': '100', 'ultra-quality': '100' } },
  { key: 'depth-of-field', name: 'Depth of Field', category: 'post-processing', options: ['Off', 'On'], values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'On', 'ultra-quality': 'On' } },
  { key: 'film-grain', name: 'Film Grain', category: 'post-processing', options: ['Off', 'On'], values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'Off', 'ultra-quality': 'Off' } },
  { key: 'chromatic-aberration', name: 'Chromatic Aberration', category: 'post-processing', options: ['Off', 'On'], values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'Off', 'ultra-quality': 'On' } },
  { key: 'sharpening', name: 'Sharpening', category: 'post-processing', options: ['Off', 'Low', 'Medium', 'High'], values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'Medium', 'ultra-quality': 'High' } },
  { key: 'vsync', name: 'VSync', category: 'performance', options: ['Off', 'On'], values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'Off', 'ultra-quality': 'On' } },
  { key: 'frame-rate-limit', name: 'Frame Rate Limit', category: 'performance', options: ['30', '60', '90', '120', '144', '240'], values: { 'maximum-fps': '144', balanced: '60', 'high-quality': '60', 'ultra-quality': '30' } },
];

export const GAMES: SeedGame[] = [
{
    name: 'Grand Theft Auto V',
    slug: 'gta-v',
    tagline: 'Three criminals. One impossible heist.',
    description:
      'Los Santos is a sprawling sun-soaked metropolis full of self-help gurus, starlets and fading celebrities. Experience the interwoven stories of Michael, Franklin and Trevor as they plan and execute a series of daring heists in the biggest open world Rockstar has ever built.',
    developer: 'Rockstar North',
    publisher: 'Rockstar Games',
    releaseDate: '2013-09-17',
    engine: 'RAGE',
    api: 'DirectX 11',
    genres: ['action', 'open-world'],
    tags: ['singleplayer', 'multiplayer', 'classic'],
    technologies: { fsr: true },
    rating: 92,
    featured: true,
    hue: 8,
    requirements: {
      minimum: { os: 'Windows 8.1 64-bit', cpu: 'Intel Core 2 Quad Q6600 / AMD Phenom 9850', gpu: 'NVIDIA GTX 660 2GB / AMD HD 7870 2GB', ramGb: 4, storageGb: 72, directx: 'DirectX 10' },
      recommended: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5 3470 / AMD FX-8350', gpu: 'NVIDIA GTX 970 4GB / AMD RX 480 4GB', ramGb: 8, storageGb: 72, directx: 'DirectX 11' },
    },
    extras: [
      { key: 'population-density', name: 'Population Density', category: 'graphics', options: ['Low', 'Medium', 'High', 'Very High'], values: { 'maximum-fps': 'Medium', balanced: 'High', 'high-quality': 'Very High', 'ultra-quality': 'Very High' } },
      { key: 'population-variety', name: 'Population Variety', category: 'graphics', options: ['Low', 'Medium', 'High', 'Very High'], values: { 'maximum-fps': 'Medium', balanced: 'High', 'high-quality': 'Very High', 'ultra-quality': 'Very High' } },
      { key: 'distance-scaling', name: 'Distance Scaling', category: 'graphics', options: ['Low', 'Medium', 'High', 'Very High'], values: { 'maximum-fps': 'Medium', balanced: 'High', 'high-quality': 'Very High', 'ultra-quality': 'Very High' } },
    ],
  },
{
    name: 'Red Dead Redemption',
    slug: 'red-dead-redemption',
    tagline: 'The Wild West, reborn.',
    description:
      'The classic western returns. John Marston — former outlaw — is forced by the federal government to hunt down the members of his old gang. Ride across the fading American frontier in a story of honor, redemption and survival.',
    developer: 'Rockstar San Diego',
    publisher: 'Rockstar Games',
    releaseDate: '2010-05-18',
    engine: 'RAGE',
    api: 'DirectX 11',
    genres: ['action', 'adventure'],
    tags: ['singleplayer', 'story-rich', 'classic'],
    technologies: { dlss: true, fsr: true, frame_generation: true },
    rating: 88,
    hue: 340,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-4670 / AMD FX-8350', gpu: 'NVIDIA GTX 960 / AMD RX 470', ramGb: 8, storageGb: 12, directx: 'DirectX 11' },
      recommended: { os: 'Windows 10 64-bit', cpu: 'Intel Core i7-4770K / AMD Ryzen 5 1500X', gpu: 'NVIDIA RTX 2070 / AMD RX 5700 XT', ramGb: 12, storageGb: 12, directx: 'DirectX 12' },
    },
  },
{
    name: 'Red Dead Redemption 2',
    slug: 'red-dead-redemption-2',
    tagline: 'Outlaws for life.',
    description:
      'America, 1899. The end of the Wild West era has begun. Arthur Morgan and the Van der Linde gang are forced to flee across a vast and breathtaking American landscape as they fight for survival — and a place to call home.',
    developer: 'Rockstar Games',
    publisher: 'Rockstar Games',
    releaseDate: '2019-11-05',
    engine: 'RAGE',
    api: 'Vulkan / DirectX 12',
    genres: ['action', 'open-world'],
    tags: ['singleplayer', 'story-rich'],
    technologies: { fsr: true },
    rating: 94,
    featured: true,
    hue: 348,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-2500K / AMD FX-6300', gpu: 'NVIDIA GTX 770 2GB / AMD R9 280 3GB', ramGb: 8, storageGb: 150, directx: 'DirectX 11' },
      recommended: { os: 'Windows 10 64-bit', cpu: 'Intel Core i7-4770K / AMD Ryzen 5 1500X', gpu: 'NVIDIA GTX 1060 6GB / AMD RX 480 4GB', ramGb: 12, storageGb: 150, directx: 'DirectX 12' },
    },
  },
{
    name: 'Elden Ring',
    slug: 'elden-ring',
    tagline: 'Rise, Tarnished.',
    description:
      'The Lands Between awaits. A vast dark-fantasy world created by Hidetaka Miyazaki and George R. R. Martin, where the shattered Elden Ring has plunged the realm into chaos. Explore, fight legendary bosses, and become the Elden Lord.',
    developer: 'FromSoftware',
    publisher: 'Bandai Namco Entertainment',
    releaseDate: '2022-02-25',
    engine: 'FromSoftware Proprietary Engine',
    api: 'DirectX 12',
    genres: ['action', 'rpg'],
    tags: ['singleplayer', 'difficult', 'open-world'],
    technologies: { fsr: true, ray_tracing: true },
    rating: 93,
    featured: true,
    hue: 265,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-8400 / AMD Ryzen 3 3300X', gpu: 'NVIDIA GTX 1060 3GB / AMD RX 580 4GB', ramGb: 12, storageGb: 60, directx: 'DirectX 12' },
      recommended: { os: 'Windows 11 64-bit', cpu: 'Intel Core i7-8700K / AMD Ryzen 5 3600X', gpu: 'NVIDIA GTX 1070 8GB / AMD RX Vega 56', ramGb: 16, storageGb: 60, directx: 'DirectX 12' },
    },
  },
{
    name: 'Dying Light',
    slug: 'dying-light',
    tagline: 'Stay human. Stay alive.',
    description:
      'A parkour-infused survival horror set in Harran, a quarantined city overrun by the infected. Scavenge by day, survive the night — when the truly dangerous creatures come out to hunt.',
    developer: 'Techland',
    publisher: 'Warner Bros. Interactive',
    releaseDate: '2015-01-27',
    engine: 'Chrome Engine 6',
    api: 'DirectX 11',
    genres: ['action', 'horror'],
    tags: ['co-op', 'open-world'],
    technologies: {},
    rating: 85,
    hue: 85,
    requirements: {
      minimum: { os: 'Windows 7 64-bit', cpu: 'Intel Core i5-2500 / AMD FX-8320', gpu: 'NVIDIA GTX 560 / AMD Radeon HD 6870', ramGb: 4, storageGb: 40, directx: 'DirectX 11' },
      recommended: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-4670K / AMD FX-8350', gpu: 'NVIDIA GTX 780 / AMD R9 290', ramGb: 8, storageGb: 40, directx: 'DirectX 11' },
    },
  },
{
    name: 'Call of Duty: Modern Warfare II',
    slug: 'call-of-duty-modern-warfare-ii',
    tagline: 'The task force is back.',
    description:
      'Task Force 141 returns for a globe-trotting campaign, alongside a new generation of operators. Modern Warfare II delivers cutting-edge visuals, a deep multiplayer suite and cooperative gameplay built on a new engine.',
    developer: 'Infinity Ward',
    publisher: 'Activision',
    releaseDate: '2022-10-28',
    engine: 'IW 9.0',
    api: 'DirectX 12',
    genres: ['fps', 'shooter'],
    tags: ['multiplayer', 'esports'],
    technologies: { dlss: true, fsr: true, xess: true, ray_tracing: true, frame_generation: true },
    rating: 84,
    hue: 220,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i3-6100 / AMD Ryzen 3 1200', gpu: 'NVIDIA GTX 960 / AMD RX 470', ramGb: 8, storageGb: 125, directx: 'DirectX 12' },
      recommended: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-6600K / AMD Ryzen 5 1600X', gpu: 'NVIDIA RTX 3060 / AMD RX 6600 XT', ramGb: 16, storageGb: 125, directx: 'DirectX 12' },
    },
  },
{
    name: 'Stellar Blade',
    slug: 'stellar-blade',
    tagline: 'Humanity\'s last hope.',
    description:
      'A stylish action-adventure from Shift Up. As EVE, a warrior sent to reclaim Earth from the Naytiba, fight through a post-apocalyptic world with fluid, combo-driven combat and breathtaking sci-fi visuals.',
    developer: 'Shift Up',
    publisher: 'Sony Interactive Entertainment',
    releaseDate: '2024-04-26',
    engine: 'Unreal Engine 4',
    api: 'DirectX 12',
    genres: ['action', 'adventure'],
    tags: ['singleplayer'],
    technologies: { dlss: true, fsr: true, ray_tracing: true, frame_generation: true },
    rating: 87,
    hue: 300,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-8400 / AMD Ryzen 5 2600', gpu: 'NVIDIA GTX 1060 6GB / AMD RX 580', ramGb: 8, storageGb: 35, directx: 'DirectX 12' },
      recommended: { os: 'Windows 11 64-bit', cpu: 'Intel Core i7-9700K / AMD Ryzen 7 3700X', gpu: 'NVIDIA RTX 2070 Super / AMD RX 6700 XT', ramGb: 16, storageGb: 35, directx: 'DirectX 12' },
    },
  },
{
    name: 'Star Wars Outlaws',
    slug: 'star-wars-outlaws',
    tagline: 'Outlaw it. Live it.',
    description:
      'The first open-world Star Wars game. Play as scoundrel Kay Vess as she attempts one of the greatest heists the galaxy has ever seen, exploring iconic planets and carving her own path through the criminal underworld.',
    developer: 'Massive Entertainment',
    publisher: 'Ubisoft',
    releaseDate: '2024-08-30',
    engine: 'Snowdrop',
    api: 'DirectX 12',
    genres: ['action', 'open-world', 'adventure'],
    tags: ['singleplayer', 'story-rich'],
    technologies: { dlss: true, fsr: true, xess: true, ray_tracing: true, frame_generation: true },
    rating: 83,
    featured: true,
    hue: 205,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i7-8700K / AMD Ryzen 5 3600', gpu: 'NVIDIA GTX 1660 / AMD RX 5600 XT', ramGb: 16, storageGb: 65, directx: 'DirectX 12' },
      recommended: { os: 'Windows 11 64-bit', cpu: 'Intel Core i5-10400 / AMD Ryzen 5 5600X', gpu: 'NVIDIA RTX 3080 / AMD RX 6800 XT', ramGb: 16, storageGb: 65, directx: 'DirectX 12' },
    },
  },
{
    name: 'Deathloop',
    slug: 'deathloop',
    tagline: 'Kill the loop. Break the cycle.',
    description:
      'A stylish first-person shooter from Arkane. Trapped in a time loop on the island of Blackreef, assassin Colt must eliminate eight targets in a single day — before the loop resets and his memory is wiped.',
    developer: 'Arkane Studios',
    publisher: 'Bethesda Softworks',
    releaseDate: '2021-09-14',
    engine: 'Void Engine',
    api: 'DirectX 12',
    genres: ['fps', 'shooter'],
    tags: ['singleplayer'],
    technologies: { dlss: true, fsr: true, ray_tracing: true },
    rating: 89,
    hue: 160,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-8400 / AMD Ryzen 5 1600', gpu: 'NVIDIA GTX 1060 6GB / AMD RX 580', ramGb: 12, storageGb: 30, directx: 'DirectX 12' },
      recommended: { os: 'Windows 10 64-bit', cpu: 'Intel Core i7-9700K / AMD Ryzen 7 3700X', gpu: 'NVIDIA RTX 2060 / AMD RX 5700 XT', ramGb: 16, storageGb: 30, directx: 'DirectX 12' },
    },
  },
{
    name: 'Lords of the Fallen',
    slug: 'lords-of-the-fallen',
    tagline: 'Two realms. One fate.',
    description:
      'A soulslike action RPG set in a dark fantasy world spanning two parallel realms — Axiom and Umbral. Wage war against epic bosses, cross between worlds, and decide the fate of a fallen god.',
    developer: 'Hexworks',
    publisher: 'CI Games',
    releaseDate: '2023-10-13',
    engine: 'Unreal Engine 5',
    api: 'DirectX 12',
    genres: ['action', 'rpg'],
    tags: ['difficult'],
    technologies: { dlss: true, fsr: true, xess: true, ray_tracing: true, frame_generation: true },
    rating: 80,
    hue: 230,
    requirements: {
      minimum: { os: 'Windows 10 64-bit', cpu: 'Intel Core i5-8400 / AMD Ryzen 5 2600', gpu: 'NVIDIA GTX 1060 6GB / AMD RX 590', ramGb: 12, storageGb: 45, directx: 'DirectX 12' },
      recommended: { os: 'Windows 11 64-bit', cpu: 'Intel Core i5-11400F / AMD Ryzen 5 3600', gpu: 'NVIDIA RTX 2080 / AMD RX 6800', ramGb: 16, storageGb: 45, directx: 'DirectX 12' },
    },
  },
];

export const PROFILES: Record<ProfileSlug, { name: string; description: string; targetFps: number; tier: 'low_end' | 'mid_range' | 'high_end' | 'ultra' }> = {
  'maximum-fps': {
    name: 'Maximum FPS',
    description: 'Prioritizes frame rate above everything. Ideal for competitive play and lower-end systems.',
    targetFps: 144,
    tier: 'low_end',
  },
  balanced: {
    name: 'Balanced',
    description: 'The sweet spot between visual quality and performance. Recommended for most systems.',
    targetFps: 60,
    tier: 'mid_range',
  },
  'high-quality': {
    name: 'High Quality',
    description: 'Higher visual fidelity with high-end textures and effects while keeping gameplay smooth.',
    targetFps: 60,
    tier: 'high_end',
  },
  'ultra-quality': {
    name: 'Ultra Quality',
    description: 'Maximum graphical quality for high-end hardware. Expect a heavy GPU load.',
    targetFps: 30,
    tier: 'ultra',
  },
};

/** Build the settings list for a game, filtering tech-dependent settings. */
export function settingsForGame(game: SeedGame): SettingDef[] {
  const techs = game.technologies;
  const settings: SettingDef[] = [];

  for (const def of BASE_SETTINGS) {
    if (def.key === 'anti-aliasing') {
      const options = techs.dlss ? ['Off', 'FXAA', 'TAA', 'DLAA'] : ['Off', 'FXAA', 'TAA'];
      const values = techs.dlss ? def.values : { ...def.values, 'ultra-quality': 'TAA' };
      settings.push({ ...def, options, values });
      continue;
    }
    settings.push(def);
  }

  if (techs.ray_tracing) {
    settings.push({
      key: 'ray-tracing',
      name: 'Ray Tracing',
      category: 'ray-tracing',
      options: ['Off', 'Low', 'Medium', 'Ultra'],
      values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'Medium', 'ultra-quality': 'Ultra' },
    });
  }

  const upscalers: string[] = [];
  if (techs.dlss) upscalers.push('DLSS');
  if (techs.fsr) upscalers.push('FSR');
  if (techs.xess) upscalers.push('XeSS');

  if (upscalers.length) {
    const options = ['Off', ...upscalers.flatMap((u) => [`${u} Quality`, `${u} Balanced`, `${u} Performance`])];
    const first = upscalers[0]!;
    settings.push({
      key: 'upscaler',
      name: 'Upscaler',
      category: 'upscaling',
      options,
      values: {
        'maximum-fps': `${first} Performance`,
        balanced: `${first} Balanced`,
        'high-quality': `${first} Quality`,
        'ultra-quality': `${first} Quality`,
      },
    });
  }

  if (techs.frame_generation) {
    settings.push({
      key: 'frame-generation',
      name: 'Frame Generation',
      category: 'upscaling',
      options: ['Off', 'On'],
      values: { 'maximum-fps': 'Off', balanced: 'Off', 'high-quality': 'On', 'ultra-quality': 'On' },
    });
  }

  if (game.extras) settings.push(...game.extras);

  // Sort by category order then by template order.
  const catOrder = new Map<string, number>(OPTIMIZATION_CATEGORIES.map((c, i) => [c.slug, i]));
  return settings.sort(
    (a, b) => (catOrder.get(a.category) ?? 99) - (catOrder.get(b.category) ?? 99) || 0,
  );
}
