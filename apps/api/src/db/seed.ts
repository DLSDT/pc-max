import { sql } from 'drizzle-orm';
import { config } from '../config';
import { db, pool } from './index';
import { admins, categories, games, gameCategories, gameImages, gameRequirements, gameTags, optimizationCategories, optimizationOptions, optimizationProfiles, optimizationSettings, subscriptionPlans, tags, users } from './schema';
import { BROWSE_CATEGORIES, GAMES, OPTIMIZATION_CATEGORIES, PROFILES, PROFILE_SLUGS, settingsForGame, TAGS } from './seed-data';
import { DEFAULT_TECHNOLOGIES } from '../services/games';
import { hashPassword } from '../lib/password';

/** Default subscription plans (fully editable from the admin panel). */
const DEFAULT_PLANS = [
  {
    name: '1 Month',
    slug: '1-month',
    description: 'One month of premium optimization access.',
    durationDays: 30,
    price: 299_000,
    deviceLimit: 1,
    features: ['premium_optimization', 'automatic_hardware_detection', 'one_click_optimization'],
    sortOrder: 1,
  },
  {
    name: '3 Months',
    slug: '3-months',
    description: 'Three months of premium optimization access — save vs monthly.',
    durationDays: 90,
    price: 799_000,
    deviceLimit: 1,
    features: ['premium_optimization', 'automatic_hardware_detection', 'one_click_optimization'],
    sortOrder: 2,
  },
  {
    name: '6 Months',
    slug: '6-months',
    description: 'Half a year of premium optimization access.',
    durationDays: 180,
    price: 1_490_000,
    deviceLimit: 2,
    features: ['premium_optimization', 'automatic_hardware_detection', 'one_click_optimization', 'priority_support'],
    sortOrder: 3,
  },
  {
    name: '12 Months',
    slug: '12-months',
    description: 'A full year of premium optimization access — best value.',
    durationDays: 365,
    price: 2_690_000,
    deviceLimit: 3,
    features: ['premium_optimization', 'automatic_hardware_detection', 'one_click_optimization', 'priority_support'],
    sortOrder: 4,
  },
] as const;

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

/** Idempotent — safe to call on every boot (existing plans are skipped). */
export async function ensureSubscriptionPlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    const existing = await db.query.subscriptionPlans.findFirst({ where: sql`${subscriptionPlans.slug} = ${plan.slug}` });
    if (existing) continue;
    await db.insert(subscriptionPlans).values({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      durationDays: plan.durationDays,
      price: plan.price,
      currency: 'IRR',
      deviceLimit: plan.deviceLimit,
      features: [...plan.features],
      status: 'active',
      sortOrder: plan.sortOrder,
    });
  }
  process.stdout.write(`  ✓ Ensured ${DEFAULT_PLANS.length} subscription plans\n`);
}

/**
 * Idempotent — creates the demo account only if it does not exist.
 *
 * Handles the email→phone migration: if a legacy account exists for the demo
 * email but has no phone yet, it is upgraded IN PLACE (same user id, so
 * subscriptions / favorites / devices / payment history stay attached) instead
 * of inserting a duplicate row.
 */
export async function ensureDemoUser(): Promise<void> {
  const phone = '+989120000000';
  const email = 'demo@goh.local';
  const existing = await db.query.users.findFirst({ where: sql`${users.phone} = ${phone} OR ${users.email} = ${email}` });
  if (existing) {
    if (!existing.phone) {
      await db.update(users).set({ phone, phoneVerified: true }).where(sql`${users.id} = ${existing.id}`);
      process.stdout.write(`  ✓ Upgraded legacy demo account to phone: ${phone}\n`);
    } else {
      process.stdout.write(`  ✓ Demo user already exists: ${phone}\n`);
    }
    return;
  }
  await db.insert(users).values({
    phone,
    phoneVerified: true,
    email,
    username: 'gamer',
    passwordHash: await hashPassword('Demo123!'),
    role: 'user',
    status: 'active',
  });
  process.stdout.write(`  ✓ Created demo user: ${phone} / Demo123!\n`);
}

/** The dev-only defaults from config.ts — never acceptable in production. */
const DEFAULT_BOOTSTRAP_EMAIL = 'admin@gamehub.local';
const DEFAULT_BOOTSTRAP_PASSWORD = 'Admin123!';

export async function seedBootstrapAdmin() {
  // This runs on every boot (migrate.ts). Running it in production without
  // ADMIN_BOOTSTRAP_* set would silently mint a super_admin whose credentials
  // are public knowledge — refuse instead of creating a backdoor.
  if (
    config.NODE_ENV === 'production' &&
    (config.ADMIN_BOOTSTRAP_EMAIL === DEFAULT_BOOTSTRAP_EMAIL || config.ADMIN_BOOTSTRAP_PASSWORD === DEFAULT_BOOTSTRAP_PASSWORD)
  ) {
    const anyAdmin = await db.query.admins.findFirst({});
    if (anyAdmin) {
      process.stdout.write('  ✓ Admin exists — skipping bootstrap (default credentials refused in production).\n');
      return;
    }
    throw new Error(
      'Refusing to create the bootstrap admin with default credentials in production. ' +
        'Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD to real values.',
    );
  }

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
  await ensureSubscriptionPlans();
  await ensureDemoUser();
  await seedBootstrapAdmin();
}

async function main() {
  process.stdout.write('🌱 Seeding PC MAX database…\n');
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
