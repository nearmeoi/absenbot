import { useState, useEffect } from 'react';
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
  const host = window.location.hostname;
  
  // Logic Inverted: Define what is explicitly DASHBOARD
  const isDashboard = host === 'monev-absenbot.my.id' || host.includes('localhost') || !host.startsWith('app.');
  
  // If it's NOT dashboard (i.e. it IS app.monev-absenbot...), then it is the App
  const isApp = !isDashboard;
  
  const basename = isApp ? '/' : '/dashboard';

  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        {/* DEBUG BANNER - REMOVE LATER */}
        {/* 
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-xs p-1 z-[9999] text-center font-mono">
           DEBUG: Host={host} | IsApp={isApp.toString()} | Base={basename}
        </div>
        */}
        
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
          {/* Universal Route for the App */}
          <Route path="/app" element={<AttendanceApp />} />

          <Route path="/auth/:token" element={<PairingAuth />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

          {/* Root Route Logic */}
          <Route path="/" element={
              isApp 
                ? <AttendanceApp /> 
                : <Layout />
          }>
             {/* Dashboard Nested Routes - only render if we are in Dashboard mode */}
             {!isApp && (
               <>
                 <Route index element={<Overview />} />
                 <Route path="users" element={<Users />} />
                 <Route path="groups" element={<Groups />} />
                 <Route path="scheduler" element={<Scheduler />} />
                 <Route path="development" element={<Development />} />
                 <Route path="settings" element={<Settings />} />
                 <Route path="test-system" element={<SystemTest />} />
               </>
             )}
          </Route>

          <Route path="/terminal" element={<ProtectedRoute><Terminal /></ProtectedRoute>} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
