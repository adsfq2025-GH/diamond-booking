/**
 * Password strength scoring shared by the signup and reset-password forms
 * (and re-checked server-side in the auth actions).
 *
 * 0–4: length 8+, length 12+, letters+digits, mixed case or symbol.
 * Score >= 2 is the minimum accepted.
 */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  return score;
}

export const MIN_PASSWORD_SCORE = 2;
