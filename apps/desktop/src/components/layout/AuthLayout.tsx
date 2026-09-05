import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyDirection } from '@/i18n';
import { adminSeen, authGate } from '@/lib/authGate';
import { useAuth } from '@/store/auth';
import { useAdminAuth } from '@/store/adminAuth';
import { Navigate } from 'react-router-dom';
import { Spinner } from '@/components/ui';

/**
 * Shell for the signed-out screens.
 *
 * Deliberately not AppLayout: there is no sidebar and no header here, because
 * every destination in them needs a session. A branded panel centred on the
 * app's own background keeps the identity without offering navigation that
 * would only bounce off the auth guard.
 */
export default function AuthLayout() {
  const { i18n } = useTranslation();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const admin = useAdminAuth((s) => s.admin);
  const adminReady = useAdminAuth((s) => s.ready);

  useEffect(() => {
    applyDirection(i18n.language);
  }, [i18n.language]);

  // The same rule the guard on the other side uses, so the two cannot disagree
  // about who is signed in — and so neither can wait on an answer nobody is
  // going to produce. Waiting matters here for a returning user, who would
  // otherwise see the login form flash before being sent back in.
  const gate = authGate({ ready, user, adminReady, admin, adminSeen: adminSeen() });

  if (gate === 'wait') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  // Already signed in — /login is not somewhere to sit.
  if (gate === 'allow') return <Navigate to={admin && !user ? '/admin' : '/'} replace />;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto bg-background px-4 py-10 text-foreground">
      {/* Two soft brand-coloured washes. Purely decorative, and behind the
          content so they never intercept a click. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 size-[26rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[22rem] rounded-full bg-primary/5 blur-3xl" />
      </div>
      <main className="relative w-full max-w-md">
        <Outlet />
      </main>
    </div>
  );
}
