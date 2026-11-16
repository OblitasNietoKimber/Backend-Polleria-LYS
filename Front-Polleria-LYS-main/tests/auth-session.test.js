import { beforeEach, expect, test, vi } from 'vitest';

const fake = vi.hoisted(() => ({ getCurrentUser: vi.fn(), from: vi.fn() }));
vi.mock('../src/lib/insforge', () => ({
  insforge: null,
  requireInsforge: () => ({
    auth: { getCurrentUser: fake.getCurrentUser },
    database: { from: fake.from },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', { removeItem: vi.fn() });
});

test.each([
  { statusCode: 401, message: 'No refresh token provided' },
  { statusCode: 403, error: 'FORBIDDEN', message: 'Invalid CSRF token' },
])('permite iniciar sesion si la restauracion falla con $message', async error => {
  fake.getCurrentUser.mockResolvedValue({ data: null, error });
  const auth = await import('../src/services/authService');
  await auth.initializeAuth();
  expect(auth.getAuthSnapshot()).toEqual({ user: null, loading: false, error: '' });
  expect(fake.from).not.toHaveBeenCalled();
});

test.each([
  { statusCode: 403, message: 'Access denied' },
  { statusCode: 500, message: 'Server unavailable' },
])('conserva el error $message para poder reintentar', async error => {
  fake.getCurrentUser.mockResolvedValue({ data: null, error });
  const auth = await import('../src/services/authService');
  await auth.initializeAuth();
  expect(auth.getAuthSnapshot()).toEqual({ user: null, loading: false, error: error.message });
  expect(fake.from).not.toHaveBeenCalled();
});
