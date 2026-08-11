import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { checkAndRequestPermissions } from './utils/permissions';
import { OfflineSyncProvider } from './utils/OfflineSyncProvider';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';
import Splash from './pages/splash/splash';
import Selection from './pages/selection/selection';
import AdminLogin from './pages/admin-login/admin-login';
import Login from './pages/login/login';
import Register from './pages/register/register';
import Dashboard from './pages/dashboard/dashboard';
import AdminDashboard from './pages/admin-dashboard/admin-dashboard';
import Scan from './pages/scan/scan';
import History from './pages/history/history';
import EmployeeDashboard from './pages/employee-dashboard/employee-dashboard';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Check and request necessary mobile permissions natively on app startup
    checkAndRequestPermissions();
  }, []);

  if (showSplash) {
    return <Splash onFinished={() => setShowSplash(false)} />;
  }

  return (
    <OfflineSyncProvider>
      <Router>
      {/* Main Container */}
      <main className="app-main">
        <OfflineBanner />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Selection />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/history" element={<History />} />
            <Route path="/employee-dashboard" element={<EmployeeDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </Router>
    </OfflineSyncProvider>
  );
}

export default App;
