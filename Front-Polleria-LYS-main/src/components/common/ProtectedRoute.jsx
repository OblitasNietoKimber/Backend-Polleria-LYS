import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, error } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Verificando sesión...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (allowedRoles && !allowedRoles.includes(user.rol)) return <Navigate to="/profile" replace />;
  return children;
}
