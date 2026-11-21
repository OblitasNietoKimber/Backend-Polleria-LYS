import { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { initializeAuth, retryAuth } from '../../services/authService';
export default function AuthGate({ children }) {
  const { loading, error } = useAuth();
  useEffect(() => { initializeAuth(); }, []);
  if (loading) return <p role="status">Verificando sesión...</p>;
  if (error) return <main className="login-page"><div className="login-page__card"><p role="alert">{error}</p><button onClick={retryAuth}>Reintentar conexión</button></div></main>;
  return children;
}
