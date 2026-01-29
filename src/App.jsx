import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './components/Landing/Landing';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import Dashboard from './components/Dashboard/Dashboard';
import Whiteboard from './components/Whiteboard/Whiteboard';

function App() {
  // Provjeri je li user ulogiran:
  const isAuthenticated = () => {
    return localStorage.getItem('user') !== null;
  }

  // Protected Route wrapper:
  const ProtectedRoute = ({ children }) => {
    return isAuthenticated() ? children : <Navigate to="/login" />;
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
            path="/board/:id"
            element={
              <ProtectedRoute>
                <Whiteboard />
              </ProtectedRoute>
            }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App
