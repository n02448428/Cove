// Shared phone helpers — used by Settings, Onboarding, Dashboard, api.js

/**
 * toE164
 * Normalize a user-entered phone string to E.164.
 * - Already starts with '+': strip whitespace, return as-is.
 * - 10-digit US number: prefix +1.
 * - 11-digit number starting with 1: prefix +.
 * - Otherwise: prefix + on the digits.
 */
export function toE164(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed.replace(/\s+/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

const E164_RE = /^\+[1-9]\d{1,14}$/;
const CODE_RE = /^[0-9]{3,}$/;

/** True if a string is a valid E.164 phone number. */
export function isValidE164(value) {
  return E164_RE.test(value);
}

/** True if a string is a valid access code (3+ digits). */
export function isValidCode(value) {
  return CODE_RE.test(value);
}

export const E164_ERROR = 'Enter a valid phone in E.164 format, e.g. +16195551234';
export const CODE_ERROR = 'Access code must be 3+ digits';
