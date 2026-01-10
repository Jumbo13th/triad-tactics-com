import { z } from 'zod';

export const applicationSchema = z.object({
  name: z.string().trim().min(2, 'required').max(100, 'maxLength'),
  age: z
    .string()
    .trim()
    .min(1, 'required')
    .max(3, 'invalidAge')
    .refine(v => /^\d+$/.test(v), 'invalidAge')
    .refine(v => Number(v) >= 18, 'ageMin')
    .refine(v => Number(v) <= 99, 'invalidAge'),
  email: z.string().trim().min(1, 'required').email('invalidEmail'),
  city: z.string().trim().max(100, 'maxLength').optional().default(''),
  country: z.string().trim().max(100, 'maxLength').optional().default(''),
  availability: z.string().trim().min(5, 'minLength').max(200, 'maxLength'),
  timezone: z.string().trim().min(1, 'required').max(20, 'maxLength'),
  experience: z.string().trim().min(10, 'minLength').max(2000, 'maxLength'),
  motivation: z.string().trim().min(10, 'minLength').max(2000, 'maxLength')
});

export type ApplicationFormData = z.infer<typeof applicationSchema>;
