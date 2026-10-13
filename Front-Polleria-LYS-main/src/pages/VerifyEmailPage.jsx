import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { verifyEmail, resendVerification } from '../services/authService';
export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError('');
    try { await verifyEmail({ email, code }); navigate('/profile', { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  async function resend() {
    if (loading) return;
    setLoading(true); setError('');
    try { await resendVerification(email); setMessage('Si la cuenta existe, recibirás un nuevo código por correo.'); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return <main className="login-page"><div className="login-page__card">
    <h1>Verifica tu correo</h1><p>Ingresa el código enviado por InsForge a tu correo para activar tu cuenta.</p>
    <form onSubmit={submit}>
      <label htmlFor="verify-email">Correo electrónico</label><input id="verify-email" className="lys-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      <label htmlFor="verify-code">Código de verificación</label><input id="verify-code" className="lys-input" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode="numeric" />
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <button className="btn-ember" disabled={loading}>Verificar correo</button>
      <button type="button" disabled={loading || !email} onClick={resend}>Reenviar código</button>
    </form><Link to="/login">Volver al inicio de sesión</Link>
  </div></main>;
}
