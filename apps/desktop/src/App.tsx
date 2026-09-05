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
import { api } from './lib/api';
import { applyBranding, brandingFromConfig, loadCachedBranding } from './lib/branding';

export default function App() {
  const restore = useAuth((s) => s.restore);

  // Restore the user session from the httpOnly refresh cookie on boot.
  //
  // The admin session is deliberately not restored here. AdminPage already
  // restores it when it mounts, so doing it on boot only added two requests —
  // /admin/auth/me and the refresh its 401 triggers — to every launch by every
  // ordinary user, neither of which could ever succeed for them. A deep link
  // straight to /admin still works, because that is the page that asks.
  useEffect(() => {
    void restore();
  }, [restore]);

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
