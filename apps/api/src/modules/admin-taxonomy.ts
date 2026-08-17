import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CategoryCreateInput,
  CategoryUpdateInput,
  OptimizationCategoryCreateInput,
  OptimizationCategoryUpdateInput,
  TagCreateInput,
  TagUpdateInput,
} from '@goh/validation';
import { z } from 'zod';
import { db } from '../db';
import { categories, gameCategories, optimizationCategories, tags } from '../db/schema';
import { idParams } from '../lib/params';
import { anyObjectSchema, dataListSchema, okSchema } from '../lib/schemas';
import { conflict, notFound } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { requirePermission } from '../lib/auth-middleware';

export async function adminTaxonomyModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ----------------------------------------------------------------- categories
  typed.get(
    '/admin/categories',
    { preHandler: [requirePermission('games.read')] },
    async () => {
      const rows = await db
        .select({
          id: categories.id,
          slug: categories.slug,
          name: categories.name,
          description: categories.description,
          gameCount: sql<number>`count(${gameCategories.gameId})::int`,
        })
        .from(categories)
        .leftJoin(gameCategories, eq(gameCategories.categoryId, categories.id))
        .groupBy(categories.id)
        .orderBy(asc(categories.sortOrder));
      return { data: rows.map((r) => ({ ...r, gameCount: Number(r.gameCount ?? 0) })) };
    },
  );

  typed.post(
    '/admin/categories',
    {
      preHandler: [requirePermission('taxonomy.write')],
      schema: { body: CategoryCreateInput, response: { 201: anyObjectSchema } },
    },
    async (request, reply) => {
      await assertUniqueSlug(categories, request.body.slug);
      const [row] = await db.insert(categories).values({ ...request.body, sortOrder: 0 }).returning();
      await recordAudit(request, { action: 'category.create', entityType: 'category', entityId: row!.id, after: request.body });
      void reply.code(201);
      return row;
    },
  );

  typed.patch(
    '/admin/categories/:id',
    {
      preHandler: [requirePermission('taxonomy.write')],
      schema: {
        params: idParams,
        body: CategoryUpdateInput,
        response: { 200: anyObjectSchema },
      },
    },
    async (request) => {
      const existing = await db.query.categories.findFirst({ where: eq(categories.id, request.params.id) });
      if (!existing) throw notFound('Category');
      if (request.body.slug && request.body.slug !== existing.slug) await assertUniqueSlug(categories, request.body.slug);
      const [row] = await db
        .update(categories)
        .set({ ...request.body, updatedAt: new Date() })
        .where(eq(categories.id, existing.id))
        .returning();
      await recordAudit(request, { action: 'category.update', entityType: 'category', entityId: existing.id, before: request.body, after: row });
      return row;
    },
  );

  typed.delete(
    '/admin/categories/:id',
    {
      preHandler: [requirePermission('taxonomy.delete')],
      schema: {
        params: idParams,
      },
    },
    async (request) => {
      const existing = await db.query.categories.findFirst({ where: eq(categories.id, request.params.id) });
      if (!existing) throw notFound('Category');
      const links = await db.select({ n: count() }).from(gameCategories).where(eq(gameCategories.categoryId, existing.id));
      if (Number(links[0]?.n ?? 0) > 0) throw conflict('Cannot delete a category that still has games');
      await db.delete(categories).where(eq(categories.id, existing.id));
      await recordAudit(request, { action: 'category.delete', entityType: 'category', entityId: existing.id, before: { name: existing.name } });
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------------- tags
  typed.get(
    '/admin/tags',
    { preHandler: [requirePermission('games.read')] },
    async () => ({ data: await db.select().from(tags).orderBy(asc(tags.name)) }),
  );

  typed.post(
    '/admin/tags',
    {
      preHandler: [requirePermission('taxonomy.write')],
      schema: { body: TagCreateInput, response: { 201: anyObjectSchema } },
    },
    async (request, reply) => {
      await assertUniqueSlug(tags, request.body.slug);
      const [row] = await db.insert(tags).values(request.body).returning();
      await recordAudit(request, { action: 'tag.create', entityType: 'tag', entityId: row!.id, after: request.body });
      void reply.code(201);
      return row;
    },
  );

  typed.patch(
    '/admin/tags/:id',
    {
      preHandler: [requirePermission('taxonomy.write')],
      schema: {
        params: idParams,
        body: TagUpdateInput,
        response: { 200: anyObjectSchema },
      },
    },
    async (request) => {
      const existing = await db.query.tags.findFirst({ where: eq(tags.id, request.params.id) });
      if (!existing) throw notFound('Tag');
      const [row] = await db.update(tags).set(request.body).where(eq(tags.id, existing.id)).returning();
      await recordAudit(request, { action: 'tag.update', entityType: 'tag', entityId: existing.id, after: row });
      return row;
    },
  );

  typed.delete(
    '/admin/tags/:id',
    {
      preHandler: [requirePermission('taxonomy.delete')],
      schema: {
        params: idParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const existing = await db.query.tags.findFirst({ where: eq(tags.id, request.params.id) });
      if (!existing) throw notFound('Tag');
      await db.delete(tags).where(eq(tags.id, existing.id));
      await recordAudit(request, { action: 'tag.delete', entityType: 'tag', entityId: existing.id, before: { name: existing.name } });
      return { ok: true };
    },
  );

  // -------------------------------------------------- optimization categories
  typed.get(
    '/admin/optimization-categories',
    { preHandler: [requirePermission('optimizations.read')] },
    async () => ({ data: await db.select().from(optimizationCategories).orderBy(asc(optimizationCategories.sortOrder)) }),
  );

  typed.post(
    '/admin/optimization-categories',
    {
      preHandler: [requirePermission('taxonomy.write')],
      schema: { body: OptimizationCategoryCreateInput, response: { 201: anyObjectSchema } },
    },
    async (request, reply) => {
      await assertUniqueSlug(optimizationCategories, request.body.slug);
      const [row] = await db.insert(optimizationCategories).values(request.body).returning();
      await recordAudit(request, { action: 'optimization_category.create', entityType: 'optimization_category', entityId: row!.id, after: request.body });
      void reply.code(201);
      return row;
    },
  );

  typed.patch(
    '/admin/optimization-categories/:id',
    {
      preHandler: [requirePermission('taxonomy.write')],
      schema: {
        params: idParams,
        body: OptimizationCategoryUpdateInput,
        response: { 200: anyObjectSchema },
      },
    },
    async (request) => {
      const existing = await db.query.optimizationCategories.findFirst({ where: eq(optimizationCategories.id, request.params.id) });
      if (!existing) throw notFound('Optimization category');
      const [row] = await db
        .update(optimizationCategories)
        .set({ ...request.body, updatedAt: new Date() })
        .where(eq(optimizationCategories.id, existing.id))
        .returning();
      await recordAudit(request, { action: 'optimization_category.update', entityType: 'optimization_category', entityId: existing.id, after: row });
      return row;
    },
  );

  typed.delete(
    '/admin/optimization-categories/:id',
    {
      preHandler: [requirePermission('taxonomy.delete')],
      schema: {
        params: idParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const existing = await db.query.optimizationCategories.findFirst({ where: eq(optimizationCategories.id, request.params.id) });
      if (!existing) throw notFound('Optimization category');
      await db.delete(optimizationCategories).where(eq(optimizationCategories.id, existing.id));
      await recordAudit(request, { action: 'optimization_category.delete', entityType: 'optimization_category', entityId: existing.id, before: { name: existing.name } });
      return { ok: true };
    },
  );
}

/** Slug uniqueness check against any table with a `slug` column. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertUniqueSlug(table: any, slug: string) {
  const existing = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
  if (existing.length) throw conflict(`"${slug}" already exists`);
}
