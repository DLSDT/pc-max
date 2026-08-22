import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
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
 */
export default function RequireAuth() {
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const admin = useAdminAuth((s) => s.admin);
  const adminReady = useAdminAuth((s) => s.ready);

  if (!ready || !adminReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // An admin signing in through the shared form holds an admin session, not a
  // user one; that still counts as authenticated.
  if (!user && !admin) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
