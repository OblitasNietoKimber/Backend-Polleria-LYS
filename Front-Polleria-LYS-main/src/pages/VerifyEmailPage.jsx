import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { verifyEmail, resendVerification } from '../services/authService';
import Logo from '../components/common/Logo';
import '../styles/login.css';
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
  return (
    <main className="lys-root login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <Logo size="md" />
        </div>

        <h1 className="font-display login-page__title">Verifica tu correo</h1>
        <p className="login-page__subtitle">
          Ingresa el código que enviamos a tu correo para activar tu cuenta.
        </p>

        <form onSubmit={submit}>
          <label htmlFor="verify-email" className="login-page__label">Correo electrónico</label>
          <input
            id="verify-email"
            className="lys-input login-page__input"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            disabled={loading}
          />

          <label htmlFor="verify-code" className="login-page__label">Código de verificación</label>
          <input
            id="verify-code"
            className="lys-input login-page__input login-page__code"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="123456"
            aria-describedby="verify-code-hint"
            disabled={loading}
          />
          <p id="verify-code-hint" className="login-page__hint">
            El código tiene 6 dígitos. Revisa también tu carpeta de spam.
          </p>

          {error && <p className="login-page__form-error" role="alert">{error}</p>}
          {message && <p className="login-page__success" role="status">{message}</p>}

          <div className="login-page__actions">
            <button type="submit" className="btn-ember login-page__submit" disabled={loading}>
              {loading ? 'Procesando...' : 'Verificar correo'}
            </button>
            <button type="button" className="login-page__secondary" disabled={loading || !email} onClick={resend}>
              Reenviar código
            </button>
          </div>
        </form>

        <p className="login-page__register">
          <Link to="/login" className="login-page__link">Volver al inicio de sesión</Link>
        </p>
      </div>
    </main>
  );
}
