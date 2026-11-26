import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { StoreProvider } from './state/store';
import ArrivedPage from './pages/ArrivedPage';
import ContactsPage from './pages/ContactsPage';
import MapPage from './pages/MapPage';
import ModePage from './pages/ModePage';
import OnboardingPage from './pages/OnboardingPage';
import PlanPage from './pages/PlanPage';
import ProfilePage from './pages/ProfilePage';
import ReportDetailPage from './pages/ReportDetailPage';
import ReportNewPage from './pages/ReportNewPage';
import RouteDetailPage from './pages/RouteDetailPage';
import RoutesPage from './pages/RoutesPage';
import SharedTripPage from './pages/SharedTripPage';
import SosPage from './pages/SosPage';
import SplashPage from './pages/SplashPage';
import VerifyPage from './pages/VerifyPage';
import WalkPage from './pages/WalkPage';

export default function App() {
  return (
    <I18nProvider>
      <StoreProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<SplashPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/mode" element={<ModePage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/routes/:kind" element={<RouteDetailPage />} />
            <Route path="/walk/:tripId" element={<WalkPage />} />
            <Route path="/sos" element={<SosPage />} />
            <Route path="/t/:token" element={<SharedTripPage />} />
            <Route path="/arrived/:tripId" element={<ArrivedPage />} />
            <Route path="/report/new" element={<ReportNewPage />} />
            <Route path="/report/:id" element={<ReportDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </I18nProvider>
  );
}
