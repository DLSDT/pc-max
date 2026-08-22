import { z } from 'zod';
import { UserRole, UserStatus } from './enums';

/**
 * Account identifier. Phone authentication is disabled, so this is an email
 * address; the server still normalizes it (trim + lowercase) rather than
 * trusting the client's casing.
 *
 * The field is still called `identifier` because existing accounts, sessions
 * and the reset flow all key on it — only the accepted format narrowed.
 */
export const IdentifierString = z
  .string()
  .trim()
  .toLowerCase()
  .min(6, 'Enter a valid email address')
  .max(254, 'Enter a valid email address')
  .email('Enter a valid email address');
export type IdentifierString = z.infer<typeof IdentifierString>;

export const OtpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'The verification code is 6 digits');
export type OtpCode = z.infer<typeof OtpCode>;

/** Send an OTP for registration or password reset. */
export const OtpSendInput = z.object({
  identifier: IdentifierString,
  purpose: z.enum(['register', 'reset']),
});
export type OtpSendInput = z.infer<typeof OtpSendInput>;

/** `devCode` is only included in non-production environments (OTP_EXPOSE). */
export const OtpSendResponse = z.object({
  ok: z.boolean(),
  devCode: z.string().optional(),
});
export type OtpSendResponse = z.infer<typeof OtpSendResponse>;

/** Register a new end-user account (email + verified OTP + password). */
export const RegisterInput = z.object({
  identifier: IdentifierString,
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may contain letters, numbers, dots, dashes and underscores')
    .optional(),
  password: z.string().min(8).max(200),
  otp: OtpCode,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

/** End-user login (email + password). */
export const UserLoginInput = z.object({
  identifier: IdentifierString,
  password: z.string().min(1).max(200),
});
export type UserLoginInput = z.infer<typeof UserLoginInput>;

/** Public end-user profile (never exposes password hash or sessions). */
export const UserPublic = z.object({
  id: z.string().uuid(),
  /** Legacy: phone auth is disabled, but existing rows may still carry one. */
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  /** Normalized email — set on email-registered accounts. */
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  username: z.string().nullable(),
  role: UserRole,
  status: UserStatus,
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublic>;

export const UserAuthResponse = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: UserPublic,
});
export type UserAuthResponse = z.infer<typeof UserAuthResponse>;

/** Password reset request — always succeeds to avoid account enumeration. */
export const PasswordForgotInput = z.object({
  identifier: IdentifierString,
});
export type PasswordForgotInput = z.infer<typeof PasswordForgotInput>;

export const PasswordResetInput = z.object({
  identifier: IdentifierString,
  otp: OtpCode,
  newPassword: z.string().min(8).max(200),
});
export type PasswordResetInput = z.infer<typeof PasswordResetInput>;

export const PasswordResetResponse = z.object({
  ok: z.boolean(),
});
export type PasswordResetResponse = z.infer<typeof PasswordResetResponse>;

/** Update own profile (currently: username). */
export const UserUpdateInput = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may contain letters, numbers, dots, dashes and underscores')
    .optional(),
});
export type UserUpdateInput = z.infer<typeof UserUpdateInput>;

/** Admin: update a user account (suspend/activate). */
export const AdminUserUpdateInput = z.object({
  status: UserStatus.optional(),
  username: z.string().trim().min(3).max(32).optional(),
});
export type AdminUserUpdateInput = z.infer<typeof AdminUserUpdateInput>;

/** Favorite a game. Game id is a UUID path param. */
export const FavoriteParams = z.object({ gameId: z.string().uuid() });
export type FavoriteParams = z.infer<typeof FavoriteParams>;

export const FavoriteMutationResponse = z.object({ ok: z.boolean(), favorited: z.boolean() });
export type FavoriteMutationResponse = z.infer<typeof FavoriteMutationResponse>;
