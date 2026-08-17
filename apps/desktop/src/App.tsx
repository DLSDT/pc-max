import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AboutPage from './pages/AboutPage';
import CategoriesPage from './pages/CategoriesPage';
import FavoritesPage from './pages/FavoritesPage';
import GameDetailPage from './pages/GameDetailPage';
import GamesPage from './pages/GamesPage';
import HomePage from './pages/HomePage';
import RecentlyViewedPage from './pages/RecentlyViewedPage';
import RecommendedPage from './pages/RecommendedPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/:slug" element={<GameDetailPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="recommended" element={<RecommendedPage />} />
        <Route path="recently-viewed" element={<RecentlyViewedPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
