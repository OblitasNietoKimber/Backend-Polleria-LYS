import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeOAuth } from '../services/authService';
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    completeOAuth().then(() => { if (active) navigate('/profile', { replace: true }); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [navigate]);
  return <main className="login-page"><div className="login-page__card">
    {error ? <><p role="alert">{error}</p><Link to="/login">Volver al inicio de sesión</Link></> : <p role="status">Completando inicio de sesión...</p>}
  </div></main>;
}
