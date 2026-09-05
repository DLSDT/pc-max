import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from './components/layout/AuthLayout';
import RequireAuth from './components/RequireAuth';
import AppLayout from './components/layout/AppLayout';
import AboutPage from './pages/AboutPage';
import AdminPage from './pages/AdminPage';
import CategoriesPage from './pages/CategoriesPage';
import FavoritesPage from './pages/FavoritesPage';
import GameDetailPage from './pages/GameDetailPage';
import GamesPage from './pages/GamesPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import MultiFrameGenerationPage from './pages/MultiFrameGenerationPage';
import OptiFlowPage from './pages/OptiFlowPage';
import OptiScalerPage from './pages/OptiScalerPage';
import StreamlinePcMaxPage from './pages/StreamlinePcMaxPage';
import OptimizedSettingPage from './pages/OptimizedSettingPage';
import RecentlyViewedPage from './pages/RecentlyViewedPage';
import RecommendedPage from './pages/RecommendedPage';
import WindowsOptimizerPage from './pages/WindowsOptimizerPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import { useAuth } from './store/auth';
import { useAdminAuth } from './store/adminAuth';
import { adminSeen, shouldProbeAdmin } from './lib/authGate';
import { api } from './lib/api';
import { applyBranding, brandingFromConfig, loadCachedBranding } from './lib/branding';

export default function App() {
  const restore = useAuth((s) => s.restore);
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const adminReady = useAdminAuth((s) => s.ready);
  const restoreAdmin = useAdminAuth((s) => s.restore);

  // Restore the user session from the httpOnly refresh cookie on boot.
  //
  // The admin session is restored conditionally, right below, rather than
  // unconditionally here: /admin/auth/me and the refresh its 401 triggers are
  // two requests on every launch by every ordinary user, neither of which could
  // ever succeed for them.
  useEffect(() => {
    void restore();
  }, [restore]);

  // …but SOMETHING has to answer the admin question, because two separate
  // screens wait on it — the guard in front of the signed-in routes and the
  // shell around the signed-out ones. When nothing asked, `adminReady` stayed
  // false forever and both of them rendered a spinner and nothing else, which
  // is the whole app.
  //
  // Asking from here, once, is what keeps that impossible: a new screen can
  // read the answer without having to know it is also responsible for
  // producing it. `shouldProbeAdmin` is what keeps it cheap — it is false for
  // a signed-in user and false on any machine no admin has ever used.
  useEffect(() => {
    if (shouldProbeAdmin({ ready, user, adminReady, adminSeen: adminSeen() })) void restoreAdmin();
  }, [ready, user, adminReady, restoreAdmin]);

  // Remote branding/theme (Phase 15): paint the last-known brand immediately,
  // then fetch the live config (cached server-side) and re-apply.
  useEffect(() => {
    const cached = loadCachedBranding();
    if (cached) applyBranding(cached);
    api
      .remoteConfig()
      .then((res) => applyBranding(brandingFromConfig(res.data)))
      .catch(() => undefined);
  }, []);

  return (
    <Routes>
      {/* Public: the only screens reachable without a session. */}
      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/* Everything else requires a session — enforced here rather than page
          by page, so a new page cannot forget to opt in. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="windows-optimizer" element={<WindowsOptimizerPage />} />
          <Route path="multi-frame-generation" element={<MultiFrameGenerationPage />} />
          <Route path="multi-frame-generation/optiscaler" element={<OptiScalerPage />} />
          <Route path="multi-frame-generation/optiflow" element={<OptiFlowPage />} />
          <Route path="multi-frame-generation/streamline" element={<StreamlinePcMaxPage />} />
          <Route path="optimized-setting" element={<OptimizedSettingPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="games/:slug" element={<GameDetailPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="recently-viewed" element={<RecentlyViewedPage />} />
          <Route path="recommended" element={<RecommendedPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
