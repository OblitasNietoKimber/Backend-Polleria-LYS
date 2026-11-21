import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import * as authService from '../services/authService';
import { validateLoginForm } from '../services/validators';
import Logo from '../components/common/Logo';
import '../styles/login.css';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: null,
      }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (loading) return;

    setFormError('');

    const fieldErrors = validateLoginForm(form);
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) return;

    setLoading(true);

    try {
      await authService.login(form);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        navigate('/verify-email', { state: { email: form.email.trim().toLowerCase() }, replace: true });
        return;
      }
      setFormError(
        err.message || 'No se pudo iniciar sesión. Inténtalo nuevamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading) return;
    setLoading(true); setFormError('');
    try { await authService.signInWithGoogle(); }
    catch (err) { setFormError(err.message); setLoading(false); }
  }

  return (
    <div className="lys-root login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <Logo size="md" />
        </div>

        <h1 className="font-display login-page__title">
          Bienvenido de vuelta
        </h1>

        <p className="login-page__subtitle">
          Inicia sesión para continuar en Leñas y Sabores.
        </p>

        {location.search.includes('insforge_status=success') && <p role="status">Correo verificado. Ya puedes iniciar sesión.</p>}
        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="login-email"
            className="login-page__label"
          >
            Correo electrónico
          </label>

          <input
            id="login-email"
            className={`lys-input login-page__input ${
              errors.email ? 'err' : ''
            }`}
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="tucorreo@ejemplo.com"
            autoComplete="email"
          />

          {errors.email && (
            <p className="login-page__field-error">
              {errors.email}
            </p>
          )}

          <label
            htmlFor="login-password"
            className="login-page__label"
          >
            Contraseña
          </label>

          <input
            id="login-password"
            className={`lys-input login-page__input ${
              errors.password ? 'err' : ''
            }`}
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          {errors.password && (
            <p className="login-page__field-error">
              {errors.password}
            </p>
          )}

          <div className="login-page__forgot">
            <Link
              to="/forgot-password"
              className="login-page__link login-page__forgot-link"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {formError && (
            <p className="login-page__form-error" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="btn-ember login-page__submit"
            disabled={loading}
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="login-page__divider" aria-hidden="true">
          <span>o</span>
        </div>

        <button
          type="button"
          className="login-page__google"
          disabled={loading}
          onClick={handleGoogle}
        >
          <svg className="login-page__google-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          <span>Continuar con Google</span>
        </button>

        <p className="login-page__register">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/register" className="login-page__link">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
