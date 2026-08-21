/**
 * Create or update a super-admin's login credentials.
 *
 *   DATABASE_URL=… npx tsx src/scripts/set-admin-credentials.ts <email> [--password-stdin]
 *
 * The seed's ADMIN_BOOTSTRAP_* path only ever *creates* — it returns early when
 * the email already exists, so it cannot rotate a forgotten password. This can.
 *
 * The password is read from stdin rather than argv so it does not land in the
 * shell history, `ps` output, or the audit trail of whoever runs it:
 *
 *   read -rs PW && printf '%s' "$PW" | npx tsx src/scripts/set-admin-credentials.ts admin@example.com --password-stdin
 *
 * Changing the password revokes every existing admin session, so a stolen or
 * shared login is actually cut off rather than surviving the rotation.
 */
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db';
import { admins, sessions } from '../db/schema';
import { hashPassword } from '../lib/password';

function readPassword(): string {
  if (!process.argv.includes('--password-stdin')) {
    throw new Error('Pass --password-stdin and pipe the password in; it is never taken from argv.');
  }
  const raw = readFileSync(0, 'utf-8');
  // Trailing newline from `echo`/here-strings is not part of the password.
  return raw.replace(/\r?\n$/, '');
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || email.startsWith('--')) {
    process.stderr.write('Usage: set-admin-credentials.ts <email> --password-stdin\n');
    process.exit(1);
  }

  const password = readPassword();
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const passwordHash = await hashPassword(password);
  const existing = await db.query.admins.findFirst({ where: eq(admins.email, email) });

  if (existing) {
    await db
      .update(admins)
      .set({ passwordHash, isActive: true, updatedAt: new Date() })
      .where(eq(admins.id, existing.id));
    // A password change that leaves old sessions alive does not lock anyone
    // out, which is usually the entire reason for the change.
    const revoked = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.adminId, existing.id))
      .returning({ id: sessions.id });
    process.stdout.write(`✅ Updated ${email} (role: ${existing.role}); revoked ${revoked.length} session(s).\n`);
  } else {
    const [row] = await db
      .insert(admins)
      .values({ email, name: 'Administrator', passwordHash, role: 'super_admin' })
      .returning({ id: admins.id, role: admins.role });
    process.stdout.write(`✅ Created ${email} as ${row!.role}.\n`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err instanceof Error ? err.message : err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
