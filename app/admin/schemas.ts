import { z } from 'zod';

export const nonNullObjectOrArraySchema = z
  .record(z.unknown())
  .refine((val) => !Array.isArray(val), {
    message: 'Expected a non-array object',
  })
  .or(z.array(z.unknown()));
