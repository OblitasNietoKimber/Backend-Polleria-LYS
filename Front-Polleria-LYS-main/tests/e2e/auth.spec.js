import { test, expect } from '../../e2e/fixtures';

const user = { id: '3b8df9ba-9e09-46c1-9b53-e70a2cacaf37', email: 'cliente@example.test', emailVerified: true, profile: { name: 'Cliente Prueba' } };
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url')}.test`;
async function backend(page, { role = 'cliente', signedIn = false, verification = true } = {}) {
  let active = signedIn;
  let profile = { id: user.id, nombre: 'Cliente', apellido: 'Prueba', telefono: '987654321', rol: role, preferencias: { notificacionesEmail: true, notificacionesPromos: true } };
  const calls = [];
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    calls.push({ path, body: request.postDataJSON(), method: request.method() });
    const session = { user, accessToken: token, csrfToken: 'test-csrf' };
    let body; let status = 200;
    if (path.endsWith('/refresh')) { if (active) body = session; else { status = 401; body = { error: 'INVALID_REFRESH_TOKEN', message: 'No session', statusCode: 401 }; } }
    else if (path.endsWith('/sessions')) {
      if (request.postDataJSON().password === 'Wrong123') { status = 401; body = { error: 'INVALID_CREDENTIALS', message: 'Invalid credentials', statusCode: 401 }; }
      else { active = true; body = session; }
    }
    else if (path.endsWith('/users')) { body = verification ? { user, accessToken: null, requireEmailVerification: true } : session; active = !verification; }
    else if (path.endsWith('/email/verify')) { active = true; body = session; }
    else if (path.endsWith('/logout')) { active = false; body = { success: true }; }
    else if (path.endsWith('/records/perfiles')) { if (request.method() === 'PATCH') profile = { ...profile, ...request.postDataJSON() }; body = profile; }
    else if (path.endsWith('/records/pedidos')) body = [];
    else if (path.endsWith('/public-config')) body = { oAuthProviders: ['google'], requireEmailVerification: true };
    else if (path.endsWith('/oauth/google')) body = { authUrl: new URL('/auth/callback?insforge_code=fake', page.url()).href, provider: 'google' };
    else if (path.endsWith('/oauth/exchange')) { active = true; body = session; }
    else if (path.endsWith('/exchange-reset-password-token')) body = { token: 'email-proof-token', expiresAt: '2099-01-01T00:00:00Z' };
    else if (path.endsWith('/reset-password')) body = { message: 'Password reset' };
    else if (path.endsWith('/send-reset-password') || path.endsWith('/send-verification')) body = { success: true, message: 'Email sent' };
    else { status = 500; body = { message: `Unhandled test endpoint ${path}` }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

test('rechaza sesiones falsas y redirige rutas privadas', async ({ page }) => {
  await backend(page);
  await page.addInitScript(() => localStorage.setItem('lys_session', JSON.stringify({ rol: 'admin' })));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('lys_session'))).toBeNull();
});
test('login invalido, login correcto, restauracion y cierre de sesion', async ({ page }) => {
  await backend(page);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Wrong123');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await page.getByLabel('Contraseña', { exact: true }).fill('Correct123');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Mis pedidos', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Mis pedidos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Opciones de mi cuenta' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test('registro conserva datos personales tras verificar el correo', async ({ page }) => {
  const calls = await backend(page);
  await page.goto('/register');
  await page.getByLabel('Nombre', { exact: true }).fill('Kimber');
  await page.getByLabel('Apellido', { exact: true }).fill('Oblitas');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Teléfono', { exact: true }).fill('987654321');
  await page.getByLabel('Contraseña', { exact: true }).fill('Secure123');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('Secure123');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page).toHaveURL(/verify-email/);
  const pending = await page.evaluate(() => sessionStorage.getItem('lys_pending_profile'));
  expect(pending).not.toContain('password');
  await page.getByLabel('Código de verificación').fill('123456');
  await page.getByRole('button', { name: 'Verificar correo', exact: true }).click();
  await expect(page).toHaveURL(/profile/);
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Kimber');
  expect(calls.some(c => c.path.endsWith('/records/perfiles') && c.method === 'PATCH' && !('rol' in c.body))).toBeTruthy();
});
test('recuperacion nunca muestra codigo y usa el token de correo', async ({ page }) => {
  const calls = await backend(page);
  await page.goto('/forgot-password');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByRole('button', { name: 'Enviar código de recuperación' }).click();
  await expect(page.getByRole('status')).toContainText('Si existe una cuenta');
  await expect(page.getByText('Código de verificación (demo)')).toHaveCount(0);
  await expect(page).toHaveURL(/reset-password/);
  await page.getByLabel('Código de verificación').fill('123456');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('NewSecure123');
  await page.getByLabel('Confirmar nueva contraseña').fill('NewSecure123');
  await page.getByRole('button', { name: 'Restablecer contraseña', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('se actualizó correctamente');
  expect(calls.find(c => c.path.endsWith('/email/reset-password')).body.otp).toBe('email-proof-token');
});
test('Google usa callback y perfil del servidor', async ({ page }) => {
  const calls = await backend(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/profile/);
  expect(calls.some(c => c.path.endsWith('/oauth/exchange'))).toBeTruthy();
});
for (const [role, allowed, denied] of [['cliente','/pedidos','/dashboard'],['mesera','/mesas','/caja'],['cocina','/cocina','/dashboard'],['caja','/caja','/mesas'],['admin','/dashboard',null]]) {
  test(`permisos de rutas para ${role}`, async ({ page }) => {
    await backend(page, { signedIn: true, role });
    await page.goto(allowed);
    await expect(page).toHaveURL(new RegExp(`${allowed}$`));
    await expect(page.getByRole('button', { name: 'Opciones de mi cuenta' })).toBeVisible();
    if (denied) { await page.goto(denied); await expect(page).toHaveURL(/\/profile$/); }
  });
}
test('guarda perfil y preferencias con respuesta del servidor', async ({ page }) => {
  await backend(page, { signedIn: true });
  await page.goto('/profile');
  await page.getByLabel('Nombre', { exact: true }).fill('Actualizado');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Tus datos se actualizaron correctamente.')).toBeVisible();
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click();
  await page.getByRole('button', { name: 'Ofertas y promociones' }).click();
  await expect(page.getByRole('button', { name: 'Ofertas y promociones' })).toHaveAttribute('aria-pressed','false');
});
