import { insforge, requireInsforge } from '../lib/insforge';

let snapshot = { user: null, loading: true, error: '' };
let initialization;
let revision = 0;
const listeners = new Set();
const PENDING_PROFILE = 'lys_pending_profile';
const normalizeEmail = value => (value || '').trim().toLowerCase();

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
    return data?.email === email ? data : null;
  } catch { return null; }
}
async function loadProfile(authUser) {
  const client = requireInsforge();
  const pending = pendingProfile(authUser.email);
  if (pending) {
    unwrap(await client.database.from('perfiles').update({
      nombre: pending.nombre, apellido: pending.apellido, telefono: pending.telefono,
    }).eq('id', authUser.id).select().single());
    sessionStorage.removeItem(PENDING_PROFILE);
  }
  const profile = unwrap(await client.database.from('perfiles').select('*').eq('id', authUser.id).single());
  return { ...profile, email: authUser.email, creadoEn: profile.creado_en };
}
async function syncSession() {
  const version = ++revision;
  const { data, error } = await requireInsforge().auth.getCurrentUser();
  if (error && error.statusCode !== 401) unwrap({ data, error });
  const user = data?.user ? await loadProfile(data.user) : null;
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
  const email = normalizeEmail(form.email);
  const data = unwrap(await requireInsforge().auth.signUp({
    email, password: form.password, name: `${form.nombre.trim()} ${form.apellido.trim()}`,
    redirectTo: `${window.location.origin}/login`,
  }));
  sessionStorage.setItem(PENDING_PROFILE, JSON.stringify({
    email, nombre: form.nombre.trim(), apellido: form.apellido.trim(), telefono: form.telefono.trim(),
  }));
  if (data?.requireEmailVerification) return { requireEmailVerification: true, email };
  return { user: await syncSession(), requireEmailVerification: false };
}
export async function login({ email, password }) {
  unwrap(await requireInsforge().auth.signInWithPassword({ email: normalizeEmail(email), password }));
  return syncSession();
}
export async function logout() {
  unwrap(await requireInsforge().auth.signOut());
  revision++;
  publish({ user: null, loading: false, error: '' });
}
export async function verifyEmail({ email, code }) {
  unwrap(await requireInsforge().auth.verifyEmail({ email: normalizeEmail(email), otp: code.trim() }));
  return syncSession();
}
export async function resendVerification(email) {
  return unwrap(await requireInsforge().auth.resendVerificationEmail({ email: normalizeEmail(email), redirectTo: `${window.location.origin}/login` }));
}
export async function updateProfile(form) {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  const data = unwrap(await requireInsforge().database.from('perfiles').update({
    nombre: form.nombre.trim(), apellido: form.apellido.trim(), telefono: form.telefono.trim(),
  }).eq('id', user.id).select().single());
  const updated = { ...user, ...data };
  publish({ user: updated });
  return updated;
}
export async function updatePreferences(preferencias) {
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  const safePreferences = { notificacionesEmail: Boolean(preferencias.notificacionesEmail), notificacionesPromos: Boolean(preferencias.notificacionesPromos) };
  const data = unwrap(await requireInsforge().database.from('perfiles').update({ preferencias: safePreferences }).eq('id',user.id).select().single());
  const updated = { ...user, ...data };
  publish({ user: updated });
  return updated;
}
export async function requestPasswordReset(email) {
  return unwrap(await requireInsforge().auth.sendResetPasswordEmail({ email: normalizeEmail(email), redirectTo: `${window.location.origin}/reset-password` }));
}
export async function resetPassword({ email, code, password, token }) {
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
