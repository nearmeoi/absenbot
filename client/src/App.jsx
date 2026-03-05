import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import PairingAuth from './pages/PairingAuth';
import AttendanceApp from './pages/AttendanceApp';

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
      <BrowserRouter>
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

          {/* Main Attendance Web App */}
          <Route path="/app" element={<AttendanceApp />} />
          <Route path="/" element={<AttendanceApp />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
