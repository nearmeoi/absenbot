import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';

import Overview from './pages/Overview';
import Development from './pages/Development';
import Terminal from './pages/Terminal';
import Users from './pages/Users';
import Groups from './pages/Groups';
import Scheduler from './pages/Scheduler';
import Settings from './pages/Settings';
import PairingAuth from './pages/PairingAuth';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '3rem' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
};

import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';

import SystemTest from './pages/SystemTest.jsx';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter basename="/dashboard">
          <Toaster position="top-right" />
          <Routes>
            <Route path="/auth/:token" element={<PairingAuth />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Overview />} />
              <Route path="users" element={<Users />} />
              <Route path="groups" element={<Groups />} />
              <Route path="scheduler" element={<Scheduler />} />
              <Route path="development" element={<Development />} />
              <Route path="terminal" element={<Terminal />} />
              <Route path="settings" element={<Settings />} />
              <Route path="test-system" element={<SystemTest />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
