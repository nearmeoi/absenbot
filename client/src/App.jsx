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
import SystemTest from './pages/SystemTest.jsx';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center mt-12 font-bold text-xl uppercase animate-pulse">Loading System...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/dashboard">
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'border-2 border-black shadow-[4px_4px_0_#000] font-bold rounded-none font-sans',
            style: {
              background: '#fff',
              color: '#000',
              borderRadius: '0px'
            },
            success: {
              style: { background: '#0df259' }, // Primary green
              iconTheme: { primary: '#000', secondary: '#fff' }
            },
            error: {
              style: { background: '#ff6b6b' }, // Red
              iconTheme: { primary: '#000', secondary: '#fff' }
            }
          }}
        />
        <Routes>
          <Route path="/auth/:token" element={<PairingAuth />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

          {/* DIRECT ACCESS (Auth Disabled for now based on previous code comment? No, PublicRoute used for Login, Protected for Layout?) */}
          {/* Previous code had "DIRECT ACCESS (Auth Disabled)" comment but no ProtectedRoute wrapper on Layout routes. 
              The user might want auth. I will stick to previous logic which seemed to NOT wrap Layout in ProtectedRoute 
              although the comment said "Auth Disabled" but `Layout` components used `useAuth`...
              Wait, looking at previous App.jsx:
              <Route path="/" element={<Layout />}>
              It was NOT wrapped in ProtectedRoute.
              I will mimic that.
          */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="users" element={<Users />} />
            <Route path="groups" element={<Groups />} />
            <Route path="scheduler" element={<Scheduler />} />
            <Route path="development" element={<Development />} />
            <Route path="terminal" element={<Terminal />} />
            <Route path="settings" element={<Settings />} />
            <Route path="test-system" element={<SystemTest />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
