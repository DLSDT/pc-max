import { sql } from 'drizzle-orm';
import { config } from '../config';
import { db, pool } from './index';
import { admins, categories, games, gameCategories, gameImages, gameRequirements, gameTags, optimizationCategories, optimizationOptions, optimizationProfiles, optimizationSettings, tags } from './schema';
import { BROWSE_CATEGORIES, GAMES, OPTIMIZATION_CATEGORIES, PROFILES, PROFILE_SLUGS, settingsForGame, TAGS } from './seed-data';
import { DEFAULT_TECHNOLOGIES } from '../services/games';
import { hashPassword } from '../lib/password';

/** SVG placeholder image (dark premium gradient + title). Used as cover/background. */
function svgImage(title: string, hue: number, width: number, height: number, fontSize: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 45% 20%)"/><stop offset="1" stop-color="hsl(${hue} 60% 6%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `<text x="50%" y="50%" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">${title}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function clearContentTables() {
  await db.execute(sql`
    TRUNCATE TABLE
      optimization_options,
      optimization_settings,
      optimization_profile_versions,
      optimization_profiles,
      game_requirements,
      game_images,
      game_categories,
      game_tags,
      tags,
      categories,
      optimization_categories,
      games
    CASCADE
  `);
}

async function seedTaxonomy() {
  await db.insert(optimizationCategories).values(
    OPTIMIZATION_CATEGORIES.map((c, i) => ({ slug: c.slug, name: c.name, sortOrder: i })),
  );
  await db.insert(categories).values(
    BROWSE_CATEGORIES.map((c, i) => ({ slug: c.slug, name: c.name, description: c.description ?? null, sortOrder: i })),
  );
  await db.insert(tags).values(TAGS.map((t) => ({ slug: t, name: t })));
}

async function seedGame(gameIndex: number) {
  const game = GAMES[gameIndex]!;
  const hue = game.hue;

  const [inserted] = await db
    .insert(games)
    .values({
      name: game.name,
      slug: game.slug,
      tagline: game.tagline,
      description: game.description,
      developer: game.developer,
      publisher: game.publisher,
      releaseDate: new Date(game.releaseDate),
      engine: game.engine,
      api: game.api,
      technologies: { ...DEFAULT_TECHNOLOGIES, ...game.technologies },
      performanceRating: game.rating,
      featured: game.featured ?? false,
      status: 'published',
      viewCount: Math.floor(Math.random() * 4000) + 800,
    })
    .returning();
  const gameRow = inserted!;

  // Images
  await db.insert(gameImages).values([
    { gameId: gameRow.id, type: 'cover', url: svgImage(game.name, hue, 600, 800, 40), altText: `${game.name} cover`, sortOrder: 0 },
    { gameId: gameRow.id, type: 'background', url: svgImage(game.name, hue, 1600, 900, 64), altText: `${game.name} artwork`, sortOrder: 0 },
  ]);

  // Categories + tags
  const catRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const catIdBySlug = new Map(catRows.map((c) => [c.slug, c.id]));
  await db.insert(gameCategories).values(
    game.genres
      .map((slug) => catIdBySlug.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((categoryId) => ({ gameId: gameRow.id, categoryId })),
  );

  const tagRows = await db.select({ id: tags.id, slug: tags.slug }).from(tags);
  const tagIdBySlug = new Map(tagRows.map((t) => [t.slug, t.id]));
  await db.insert(gameTags).values(
    game.tags
      .map((slug) => tagIdBySlug.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((tagId) => ({ gameId: gameRow.id, tagId })),
  );

  // Requirements
  await db.insert(gameRequirements).values([
    { gameId: gameRow.id, tier: 'minimum', ...game.requirements.minimum, notes: game.requirements.minimum.notes ?? null },
    { gameId: gameRow.id, tier: 'recommended', ...game.requirements.recommended, notes: game.requirements.recommended.notes ?? null },
  ]);

  // Profiles + settings + options
  const catRows2 = await db.select({ id: optimizationCategories.id, slug: optimizationCategories.slug }).from(optimizationCategories);
  const optCatIdBySlug = new Map(catRows2.map((c) => [c.slug, c.id]));

  for (const [profileIndex, slug] of PROFILE_SLUGS.entries()) {
    const meta = PROFILES[slug];
    const isDefault = slug === 'balanced';
    const [profile] = await db
      .insert(optimizationProfiles)
      .values({
        gameId: gameRow.id,
        slug,
        name: meta.name,
        description: meta.description,
        targetFps: meta.targetFps,
        hardwareTier: meta.tier,
        version: game.slug === 'gta-v' && slug === 'balanced' ? '1.4.2' : '1.0.0',
        status: 'published',
        isDefault,
        publishedAt: new Date(),
      })
      .returning();
    const profileRow = profile!;

    for (const [settingIndex, def] of settingsForGame(game).entries()) {
      const [setting] = await db
        .insert(optimizationSettings)
        .values({
          profileId: profileRow.id,
          categoryId: optCatIdBySlug.get(def.category) ?? null,
          key: def.key,
          name: def.name,
          type: 'select',
          value: def.values[slug],
          sortOrder: settingIndex,
        })
        .returning();
      const settingRow = setting!;

      const recommendedValue = def.values.balanced;
      await db.insert(optimizationOptions).values(
        def.options.map((value, i) => ({
          settingId: settingRow.id,
          value,
          label: value,
          isRecommended: value === recommendedValue && slug === 'balanced',
          sortOrder: i,
        })),
      );
    }

    // Mark default profile on the game via its slug ordering (balanced first).
    void profileIndex;
  }

  process.stdout.write(`  ✓ ${game.name} (${game.slug})\n`);
}

async function seedBootstrapAdmin() {
  const existing = await db.query.admins.findFirst({
    where: sql`${admins.email} = ${config.ADMIN_BOOTSTRAP_EMAIL}`,
  });
  if (existing) {
    process.stdout.write(`  ✓ Admin already exists: ${config.ADMIN_BOOTSTRAP_EMAIL}\n`);
    return;
  }
  await db.insert(admins).values({
    email: config.ADMIN_BOOTSTRAP_EMAIL,
    name: 'Administrator',
    passwordHash: await hashPassword(config.ADMIN_BOOTSTRAP_PASSWORD),
    role: 'super_admin',
  });
  process.stdout.write(`  ✓ Created admin: ${config.ADMIN_BOOTSTRAP_EMAIL}\n`);
  process.stdout.write(`    ⚠ Change the password from ${config.ADMIN_BOOTSTRAP_PASSWORD} after first login!\n`);
}

/** Run the full seed (idempotent-ish: clears content tables first). */
export async function runSeed(): Promise<void> {
  await clearContentTables();
  await seedTaxonomy();
  for (let i = 0; i < GAMES.length; i++) await seedGame(i);
  await seedBootstrapAdmin();
}

async function main() {
  process.stdout.write('🌱 Seeding Game Optimization Hub database…\n');
  await runSeed();
  process.stdout.write(`✅ Seeded ${GAMES.length} games, ${GAMES.length * 4} optimization profiles.\n`);
  await pool.end();
}

// Run directly when invoked via `npm run db:seed` (not when imported).
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
}
