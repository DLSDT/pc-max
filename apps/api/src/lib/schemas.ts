import { z } from 'zod';

/** `{ ok: true }` mutation responses. */
export const okSchema = z.object({ ok: z.boolean() });

/** Any JSON object (used for dynamic admin payloads). */
export const anyObjectSchema = z.record(z.string(), z.unknown());

/** `{ data: [...] }` list envelope with dynamic items. */
export const dataListSchema = z.object({ data: z.array(anyObjectSchema) });

/** `{ data: [...] }` with a single-object item (e.g. created rows). */
export const dataOneSchema = z.object({ data: anyObjectSchema });
