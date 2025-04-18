import { z } from 'zod';

export const apiResponseSchema = z.object({
  result: z.string(),
});
