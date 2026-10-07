import { z } from 'zod';
import {
  categorySchema,
  citySchema,
  organizerStatusSchema,
  payoutMethodSchema,
  roleSchema,
} from '../enums';
import { dateTimeSchema, handleSchema, idSchema } from './common';

/** Email addresses are compared in lower case, so Amina@x.com and amina@x.com are one account. */
export const normalizeEmail = (input: string) => input.trim().toLowerCase();
const emailSchema = z.email();
/** What the sign-in form sends: tidied before it is checked. */
const emailInputSchema = z.string().transform(normalizeEmail).pipe(z.email());

/** A person who can sign in. One email address, one account. */
export const accountSchema = z.object({
  id: idSchema,
  /** Empty until they tell us (the organizer application asks). */
  name: z.string(),
  email: emailSchema,
  role: roleSchema,
  organizerId: idSchema.nullable(),
  agentId: idSchema.nullable(),
});
export type Account = z.infer<typeof accountSchema>;

/** GET /api/auth/me: who is signed in and what they are allowed to do. */
export const sessionUserSchema = accountSchema
  .pick({ id: true, name: true, email: true, role: true })
  .extend({
    /** Set for organizers, including ones still waiting for approval. */
    organizer: z
      .object({
        id: idSchema,
        handle: handleSchema,
        name: z.string().min(1),
        status: organizerStatusSchema,
      })
      .nullable(),
  });
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** POST /api/auth/start: email a one-time code. Always "sent", so nobody can probe for accounts. */
export const signInStartSchema = z.object({ email: emailInputSchema });
export const signInStartResultSchema = z.object({ sent: z.boolean() });

/** POST /api/auth/verify: exchange the code for a session. A new email gets an attendee account. */
export const signInVerifySchema = z.object({
  email: emailInputSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export const sessionSchema = z.object({ token: z.string().min(16), user: sessionUserSchema });
export type Session = z.infer<typeof sessionSchema>;

export const ORGANIZER_TYPES = [
  'Independent artist',
  'Student society',
  'Company',
  'Community group',
  'Venue',
  'Workshop host',
  'Other',
] as const;

export const ABOUT_MIN_LENGTH = 20;
export const ABOUT_MAX_LENGTH = 500;

/** POST /api/organizer/apply: ask to host. The organizer stays "pending" until a Super Admin approves. */
export const organizerApplicationRequestSchema = z.object({
  contactName: z.string().trim().min(2, 'Enter your name.').max(80),
  organizerName: z
    .string()
    .trim()
    .min(2, 'Enter the name buyers will see.')
    .max(60, 'Keep it under 60 characters.'),
  type: z.enum(ORGANIZER_TYPES),
  city: citySchema,
  category: categorySchema,
  payoutMethod: payoutMethodSchema,
  about: z
    .string()
    .trim()
    .min(ABOUT_MIN_LENGTH, 'Tell us a little more about the events you run.')
    .max(ABOUT_MAX_LENGTH, `Keep it under ${ABOUT_MAX_LENGTH} characters.`),
});
export type OrganizerApplicationRequest = z.infer<typeof organizerApplicationRequestSchema>;

/** What an applicant told us, kept with the organizer for the admin who reviews it. */
export const organizerApplicationSchema = z.object({
  organizerId: idSchema,
  contactName: z.string().min(1),
  email: emailSchema,
  about: z.string(),
  appliedAt: dateTimeSchema,
});
export type OrganizerApplication = z.infer<typeof organizerApplicationSchema>;
