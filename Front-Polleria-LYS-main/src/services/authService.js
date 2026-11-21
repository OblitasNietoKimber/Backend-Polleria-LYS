import { insforge, requireInsforge } from '../lib/insforge';
import { validateForgotPasswordForm, validateLoginForm, validatePersonalDataForm, validateRegisterForm, validateResetPasswordForm } from './validators';
import { assertValidForm, asForm, normalizePersonName } from '../utils/identityValidation';

let snapshot = { user: null, loading: true, error: '' };
let initialization;
let revision = 0;
const listeners = new Set();
const PENDING_PROFILE = 'lys_pending_profile';
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const personalData = form => ({ nombre: normalizePersonName(form.nombre), apellido: normalizePersonName(form.apellido), telefono: form.telefono.trim() });

export function getAuthSnapshot() { return snapshot; }
export function subscribeAuth(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function publish(values) {
  snapshot = { ...snapshot, ...values };
  listeners.forEach(listener => listener());
}
function unwrap({ data, error }) {
  if (error) {
    const messages = {
      INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
      EMAIL_NOT_VERIFIED: 'Verifica tu correo antes de iniciar sesión.',
      USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
    };
    throw Object.assign(new Error(messages[error.error] || error.message || 'No se pudo completar la operación.'), {
      code: error.error || error.code,
    });
  }
  return data;
}
function pendingProfile(email) {
  try {
    const data = JSON.parse(sessionStorage.getItem(PENDING_PROFILE) || 'null');
    if (data?.email !== email) return null;
    if (Object.keys(validatePersonalDataForm(data)).length) {
      sessionStorage.removeItem(PENDING_PROFILE);
      return null;
    }
    return data;
  } catch { return null; }
}
async function loadProfile(authUser) {
  const client = requireInsforge();
  const pending = pendingProfile(authUser.email);
  if (pending) {
    unwrap(await client.database.from('perfiles').update(personalData(pending)).eq('id', authUser.id).select().single());
    sessionStorage.removeItem(PENDING_PROFILE);
  }
  const profile = unwrap(await client.database.from('perfiles').select('*').eq('id', authUser.id).single());
  return { ...profile, email: authUser.email, creadoEn: profile.creado_en };
}
async function syncSession() {
  const version = ++revision;
  const { data, error } = await requireInsforge().auth.getCurrentUser();
  // A missing or mismatched CSRF cookie prevents session restoration. Let the
  // visitor sign in again; other forbidden responses must still surface.
  const sessionUnavailable = error?.statusCode === 401 ||
    (error?.statusCode === 403 && error.message === 'Invalid CSRF token');
  if (error && !sessionUnavailable) unwrap({ data, error });
  const user = !error && data?.user ? await loadProfile(data.user) : null;
  if (version === revision) publish({ user, loading: false, error: '' });
  return user;
}
export function initializeAuth() {
  if (!initialization) {
    // Remove the former mock database, plaintext passwords and forged sessions.
    ['lys_users','lys_session','lys_reset_requests'].forEach(key => localStorage.removeItem(key));
    initialization = syncSession().catch(error => {
      publish({ user: null, loading: false, error: error.message });
    });
  }
  return initialization;
}
export function retryAuth() {
  initialization = null;
  publish({ loading: true, error: '' });
  return initializeAuth();
}
if (insforge) insforge.auth.onAuthStateChange(event => {
  if (event === 'signedOut') {
    revision++;
    publish({ user: null, loading: false, error: '' });
  } else if (event === 'tokenRefreshed') {
    // Run after the SDK finishes saving the refreshed session.
    queueMicrotask(() => syncSession().catch(error => publish({ user: null, error: error.message, loading: false })));
  }
});
export function getCurrentUser() { return snapshot.user; }
export function isAuthenticated() { return Boolean(snapshot.user); }

export async function register(form) {
  assertValidForm(validateRegisterForm(form));
  const email = normalizeEmail(form.email);
  const profile = personalData(form);
  const data = unwrap(await requireInsforge().auth.signUp({
    email, password: form.password, name: `${profile.nombre} ${profile.apellido}`,
    redirectTo: `${window.location.origin}/login`,
  }));
  sessionStorage.setItem(PENDING_PROFILE, JSON.stringify({
    email, ...profile,
  }));
  if (data?.requireEmailVerification) return { requireEmailVerification: true, email };
  return { user: await syncSession(), requireEmailVerification: false };
}
export async function login(form) {
  const { email, password } = asForm(form);
  assertValidForm(validateLoginForm({ email, password }));
  unwrap(await requireInsforge().auth.signInWithPassword({ email: normalizeEmail(email), password }));
  return syncSession();
}
export async function logout() {
  unwrap(await requireInsforge().auth.signOut());
  revision++;
  publish({ user: null, loading: false, error: '' });
}
export async function verifyEmail(form) {
  const { email, code } = asForm(form);
  assertValidForm(validateForgotPasswordForm({ email }));
  assertValidForm(typeof code === 'string' && /^[0-9]{6}$/.test(code.trim()) ? {} : { code: 'Ingresa el código de verificación de 6 dígitos.' });
  unwrap(await requireInsforge().auth.verifyEmail({ email: normalizeEmail(email), otp: code.trim() }));
  return syncSession();
}
export async function resendVerification(email) {
  assertValidForm(validateForgotPasswordForm({ email }));
  return unwrap(await requireInsforge().auth.resendVerificationEmail({ email: normalizeEmail(email), redirectTo: `${window.location.origin}/login` }));
}
export async function updateProfile(form) {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  assertValidForm(validatePersonalDataForm(form));
  const data = unwrap(await requireInsforge().database.from('perfiles').update(personalData(form)).eq('id', user.id).select().single());
  const updated = { ...user, ...data };
  publish({ user: updated });
  return updated;
}
export async function updatePreferences(preferencias) {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  const fields = asForm(preferencias);
  assertValidForm(typeof fields.notificacionesEmail === 'boolean' && typeof fields.notificacionesPromos === 'boolean' &&
    Object.keys(fields).every(key => ['notificacionesEmail', 'notificacionesPromos'].includes(key)) ? {} : { preferencias: 'Las preferencias deben contener valores booleanos válidos.' });
  const safePreferences = { notificacionesEmail: fields.notificacionesEmail, notificacionesPromos: fields.notificacionesPromos };
  const data = unwrap(await requireInsforge().database.from('perfiles').update({ preferencias: safePreferences }).eq('id',user.id).select().single());
  const updated = { ...user, ...data };
  publish({ user: updated });
  return updated;
}
export async function requestPasswordReset(email) {
  assertValidForm(validateForgotPasswordForm({ email }));
  return unwrap(await requireInsforge().auth.sendResetPasswordEmail({ email: normalizeEmail(email), redirectTo: `${window.location.origin}/reset-password` }));
}
export async function resetPassword(form) {
  const { email, code, password, confirmPassword, token } = asForm(form);
  assertValidForm(validateResetPasswordForm({ email, code, password, confirmPassword, token }));
  if (!token) assertValidForm(validateForgotPasswordForm({ email }));
  const client = requireInsforge();
  const otp = token || unwrap(await client.auth.exchangeResetPasswordToken({ email: normalizeEmail(email), code: code.trim() })).token;
  unwrap(await client.auth.resetPassword({ newPassword: password, otp }));
  // Password reset revokes sessions server-side; clear the UI as well.
  revision++;
  publish({ user: null, loading: false, error: '' });
}
// The supported SDK requires email proof for password changes, too.
export async function changePassword() {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  return requestPasswordReset(user.email);
}

export async function signInWithGoogle() {
  const client = requireInsforge();
  const config = unwrap(await client.auth.getPublicAuthConfig());
  if (!config?.oAuthProviders?.includes('google')) throw new Error('Google no está habilitado en InsForge.');
  return unwrap(await client.auth.signInWithOAuth('google', {
    redirectTo: `${window.location.origin}/auth/callback`,
    additionalParams: { prompt: 'select_account' },
  }));
}
export async function completeOAuth() {
  const user = await syncSession();
  if (!user) throw new Error('No se pudo completar el inicio de sesión con Google.');
  return user;
}
