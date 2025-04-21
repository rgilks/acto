import { z } from 'zod';

export const nonNullObjectOrArraySchema = z
  .record(z.unknown())
  .refine((val) => !Array.isArray(val), {
    message: 'Expected a non-array object',
  })
  .or(z.array(z.unknown()));

export const TableNamesSchema = z.array(z.string());

const TableRowSchema = z.record(z.unknown());

export const PaginatedTableDataSchema = z.object({
  data: z.array(TableRowSchema),
  totalRows: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export type TableNames = z.infer<typeof TableNamesSchema>;
export type PaginatedTableData = z.infer<typeof PaginatedTableDataSchema>;
export type TableRow = z.infer<typeof TableRowSchema>;
