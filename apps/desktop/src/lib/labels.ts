import type { HardwareTier, TechFlag } from '@goh/types';

/**
 * Presentation labels for API enums.
 *
 * Brand acronyms (DLSS / FSR / XeSS / RT / FG) are language-neutral and kept
 * as-is; hardware-tier names are short enough to stay in English in v1 (the
 * i18n layer is ready if they ever need translating).
 */
export const HARDWARE_TIER_LABEL: Record<HardwareTier, string> = {
  low_end: 'Low-end',
  mid_range: 'Mid-range',
  high_end: 'High-end',
  ultra: 'Ultra',
};

export const TECH_LABELS: Record<TechFlag, string> = {
  dlss: 'DLSS',
  fsr: 'FSR',
  xess: 'XeSS',
  ray_tracing: 'RT',
  frame_generation: 'FG',
  nvidia: 'NVIDIA',
  amd: 'AMD',
  intel: 'Intel',
};

/** Ordered list of the tech badges shown on cards (brand acronyms first). */
export const CARD_TECHS: TechFlag[] = ['dlss', 'fsr', 'xess', 'ray_tracing', 'frame_generation'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The game description to show, for the language being read.
 *
 * Falls back to the other language rather than to nothing: a player who reads
 * Persian is better served by an English paragraph than by a blank space, and
 * the catalogue is filled in one language at a time. `description` is the
 * pre-split column, still populated on older rows.
 */
export function gameDescription(
  game: { descriptionFa?: string | null; descriptionEn?: string | null; description?: string | null },
  locale: string,
): string | null {
  const fa = game.descriptionFa?.trim() || null;
  const en = game.descriptionEn?.trim() || game.description?.trim() || null;
  return locale.startsWith('fa') ? fa ?? en : en ?? fa;
}
