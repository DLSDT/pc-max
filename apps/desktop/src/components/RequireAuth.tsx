import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { adminSeen, authGate } from '@/lib/authGate';
import { useAuth } from '@/store/auth';
import { useAdminAuth } from '@/store/adminAuth';

/**
 * Gate for everything behind sign-in.
 *
 * The app is useless signed out — the catalogue, the library and both premium
 * areas are all per-account — so authentication is the first screen on a fresh
 * install rather than a prompt the user meets later.
 *
 * `ready` is the important part: it flips only once the boot-time refresh-cookie
 * restore has resolved. Redirecting before then would bounce a returning user,
 * whose session is perfectly valid, out to /login on every launch.
 *
 * The admin session is restored by App, conditionally — see `authGate`.
 */
export default function RequireAuth() {
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const admin = useAdminAuth((s) => s.admin);
  const adminReady = useAdminAuth((s) => s.ready);

  // App asks; this only reads. Waiting on a question nobody asks is what left
  // every route behind here showing a spinner forever.
  const gate = authGate({ ready, user, adminReady, admin, adminSeen: adminSeen() });

  if (gate === 'wait') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (gate === 'login') {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
