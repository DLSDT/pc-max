# Migrations

`drizzle-kit generate` cannot be trusted in this project without checking its
output first.

Migrations 0006–0013 were hand-written and their drizzle snapshots were never
recorded — `drizzle/meta/` holds snapshots only up to 0005 plus the current
one. drizzle-kit diffs the schema against the newest snapshot it has, so for a
long time it re-emitted work those hand-written migrations had already applied:
a fresh `generate` produced a file containing `CREATE TABLE "client_errors"`,
`ALTER TYPE "profile_color" ADD VALUE 'multiplay'` and half a dozen indexes
that exist in every deployed database. Running it would fail at the first
statement with "relation already exists" — on the server, mid-deploy.

`0014_snapshot.json` now records the real current schema, so a `generate` from
here diffs against reality. Even so:

**Always read a generated migration before committing it.** If it re-creates
something that already exists, delete the generated file, hand-write one with
only the statements you actually want, and rename the journal's last entry to
match your filename. `src/test/migrations.test.ts` fails the build on the
obvious case (a `CREATE TABLE`/`CREATE TYPE` an earlier migration already made)
and on any journal/filename mismatch, but it cannot catch every shape.

Prefer `IF NOT EXISTS` in hand-written migrations: this database has a history
of partially-applied state, and re-running has to stay safe.
