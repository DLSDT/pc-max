import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../drizzle');

interface Journal {
  entries: { idx: number; tag: string }[];
}

const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf-8')) as Journal;
const sqlFiles = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

describe('drizzle migrations', () => {
  it('has one journal entry per migration file, names matching', () => {
    // drizzle-kit runs whatever the journal lists; a file it does not name is
    // silently never applied, and an entry with no file crashes the migrator
    // on boot.
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(sqlFiles);
  });

  it('numbers migrations consecutively from zero', () => {
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
  });

  it('never re-creates an object an earlier migration already created', () => {
    // Most migrations here were hand-written without recording a drizzle
    // snapshot, so `drizzle-kit generate` diffs against a stale baseline and
    // happily re-emits work that is already applied. Such a migration fails on
    // any real database ("relation already exists") — which is every database
    // that ran the earlier migration. Guard the shape that bites: a bare
    // CREATE TABLE / CREATE TYPE for a name an earlier file already created.
    const createdTables = new Map<string, string>();
    const createdTypes = new Map<string, string>();
    const problems: string[] = [];

    for (const file of sqlFiles) {
      const sql = readFileSync(join(DIR, file), 'utf-8');

      for (const m of sql.matchAll(/CREATE TABLE (IF NOT EXISTS )?"?([a-z_]+)"?/gi)) {
        const [, guard, name] = m;
        const prior = createdTables.get(name!);
        if (prior && !guard) problems.push(`${file}: CREATE TABLE ${name} — already created by ${prior}`);
        if (!prior) createdTables.set(name!, file);
      }

      // The schema qualifier is written as "public"."name", so the quotes sit
      // around each part — match the last quoted identifier, not the first.
      for (const m of sql.matchAll(/CREATE TYPE (IF NOT EXISTS )?(?:"?public"?\.)?"?([a-z_0-9]+)"?\s+AS/gi)) {
        const [, guard, name] = m;
        const prior = createdTypes.get(name!);
        if (prior && !guard) problems.push(`${file}: CREATE TYPE ${name} — already created by ${prior}`);
        if (!prior) createdTypes.set(name!, file);
      }
    }

    expect(problems).toEqual([]);
  });
});
