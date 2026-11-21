/**
 * validators.js
 *
 * Funciones de validación reutilizables para los formularios de
 * autenticación (login, registro, recuperar/cambiar contraseña) y perfil.
 */

import { asForm, EMAIL_MAX_LENGTH, getPersonNameError, normalizePersonName, PASSWORD_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from '../utils/identityValidation';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^9\d{8}$/;

export function isValidEmail(email) {
  return typeof email === 'string' && email.trim().length <= EMAIL_MAX_LENGTH && EMAIL_REGEX.test(email.trim());
}

export function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_REGEX.test(phone.trim());
}

export function getPasswordError(password) {
  if (typeof password !== 'string' || !password) return 'Ingresa una contraseña.';
  if (password.length > PASSWORD_MAX_LENGTH) return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

export function validateLoginForm(form) {
  form = asForm(form);
  const errors = {};

  if (!form.email) {
    errors.email = 'Ingresa tu correo electrónico.';
  } else if (!isValidEmail(form.email)) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }

  if (typeof form.password !== 'string' || !form.password) {
    errors.password = 'Ingresa tu contraseña.';
  }

  return errors;
}

export function validateRegisterForm(form) {
  form = asForm(form);
  const errors = validatePersonalDataForm(form);
  if (!errors.nombre && !errors.apellido &&
      [...`${normalizePersonName(form.nombre)} ${normalizePersonName(form.apellido)}`].length > PERSON_NAME_MAX_LENGTH) {
    errors.nombre = `El nombre y apellido juntos no pueden superar los ${PERSON_NAME_MAX_LENGTH} caracteres.`;
  }
  if (!form.email) {
    errors.email = 'Ingresa tu correo electrónico.';
  } else if (!isValidEmail(form.email)) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }
  const passwordError = getPasswordError(form.password);
  if (passwordError) errors.password = passwordError;

  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

export function validateForgotPasswordForm(form) {
  form = asForm(form);
  const errors = {};
  if (!form.email) {
    errors.email = 'Ingresa tu correo electrónico.';
  } else if (!isValidEmail(form.email)) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }
  return errors;
}

export function validateResetPasswordForm(form) {
  form = asForm(form);
  const errors = {};

  if (form.token != null && (typeof form.token !== 'string' || !form.token || form.token.length > 8192)) {
    errors.token = 'El enlace de recuperación no es válido.';
  }
  if (!form.token && (typeof form.code !== 'string' || !/^[0-9]{6}$/.test(form.code.trim()))) {
    errors.code = 'Ingresa el código de 6 dígitos enviado a tu correo.';
  }

  const passwordError = getPasswordError(form.password);
  if (passwordError) errors.password = passwordError;

  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

export function validateChangePasswordForm(form) {
  form = asForm(form);
  const errors = {};

  if (!form.currentPassword) {
    errors.currentPassword = 'Ingresa tu contraseña actual.';
  }

  const passwordError = getPasswordError(form.newPassword);
  if (passwordError) errors.newPassword = passwordError;

  if (form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  if (form.currentPassword && form.newPassword && form.currentPassword === form.newPassword) {
    errors.newPassword = 'La nueva contraseña debe ser diferente a la actual.';
  }

  return errors;
}

export function validatePersonalDataForm(form) {
  form = asForm(form);
  const errors = {};

  const nombreError = getPersonNameError(form.nombre, { requiredMessage: 'Ingresa tu nombre (mínimo 2 caracteres).' });
  const apellidoError = getPersonNameError(form.apellido, { label: 'apellido', requiredMessage: 'Ingresa tu apellido (mínimo 2 caracteres).' });
  if (nombreError) errors.nombre = nombreError;
  if (apellidoError) errors.apellido = apellidoError;
  if (!form.telefono) {
    errors.telefono = 'Ingresa tu número de teléfono.';
  } else if (!isValidPhone(form.telefono)) {
    errors.telefono = 'Ingresa un número de celular válido (9 dígitos).';
  }

  return errors;
}
