import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AboutPage from './pages/AboutPage';
import AdminPage from './pages/AdminPage';
import FavoritesPage from './pages/FavoritesPage';
import GameDetailPage from './pages/GameDetailPage';
import GamesPage from './pages/GamesPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import MultiFrameGenerationPage from './pages/MultiFrameGenerationPage';
import OptimizedSettingPage from './pages/OptimizedSettingPage';
import WindowsOptimizerPage from './pages/WindowsOptimizerPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import { Spinner } from './components/ui';
import { useAuth } from './store/auth';
import { useAdminAuth } from './store/adminAuth';
import { api } from './lib/api';
import { applyBranding, brandingFromConfig, loadCachedBranding } from './lib/branding';

export default function App() {
  const restore = useAuth((s) => s.restore);
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const restoreAdmin = useAdminAuth((s) => s.restore);

  // Try to restore the session from the httpOnly refresh cookie on boot —
  // both the regular user session and, separately, an admin session (the
  // unified login form can put either one, or neither, in effect).
  useEffect(() => {
    void restore();
    void restoreAdmin();
  }, [restore, restoreAdmin]);

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
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="windows-optimizer" element={<WindowsOptimizerPage />} />
        <Route path="multi-frame-generation" element={<MultiFrameGenerationPage />} />
        <Route path="optimized-setting" element={<OptimizedSettingPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/:slug" element={<GameDetailPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="subscription"
          element={
            !authReady ? (
              // Session restore (httpOnly refresh cookie) hasn't resolved yet on
              // this boot/reload — deciding "logged out" before it does would
              // bounce an actually-signed-in user straight to /login.
              <div className="flex items-center justify-center py-20">
                <Spinner />
              </div>
            ) : user ? (
              <SubscriptionPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
