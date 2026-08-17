import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AboutPage from './pages/AboutPage';
import CategoriesPage from './pages/CategoriesPage';
import FavoritesPage from './pages/FavoritesPage';
import GameDetailPage from './pages/GameDetailPage';
import GamesPage from './pages/GamesPage';
import HistoryPage from './pages/HistoryPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import WindowsOptimizerPage from './pages/WindowsOptimizerPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import RecentlyViewedPage from './pages/RecentlyViewedPage';
import RecommendedPage from './pages/RecommendedPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import { useAuth } from './store/auth';
import { api } from './lib/api';
import { applyBranding, brandingFromConfig, loadCachedBranding } from './lib/branding';

export default function App() {
  const restore = useAuth((s) => s.restore);
  const user = useAuth((s) => s.user);

  // Try to restore the session from the httpOnly refresh cookie on boot.
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
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="windows-optimizer" element={<WindowsOptimizerPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/:slug" element={<GameDetailPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="recommended" element={<RecommendedPage />} />
        <Route path="recently-viewed" element={<RecentlyViewedPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="subscription" element={user ? <SubscriptionPage /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
