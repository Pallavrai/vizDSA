import { z } from 'zod';

export const LANGUAGES = ['python', 'java', 'cpp'] as const;
export type Language = (typeof LANGUAGES)[number];

// `text` holds values JSON has no form for: inf, huge ints, raw C++ addresses.
export const ValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.object({ ref: z.string() }).strict(),
  z.object({ text: z.string() }).strict(),
]);
export type Value = z.infer<typeof ValueSchema>;

export const HeapKindSchema = z.enum(['list', 'map', 'set', 'stack', 'queue', 'object']);
export type HeapKind = z.infer<typeof HeapKindSchema>;

export const HeapObjectSchema = z.object({
  id: z.string(),
  kind: HeapKindSchema,
  typeName: z.string().optional(),
  // list/set/stack/queue: Value[]; map: [key, value][]; object: { field: Value }
  contents: z.union([
    z.array(ValueSchema),
    z.array(z.tuple([ValueSchema, ValueSchema])),
    z.record(ValueSchema),
  ]),
  truncated: z.boolean().optional(),
});
export type HeapObject = z.infer<typeof HeapObjectSchema>;

export const StepSchema = z.object({
  event: z.enum(['call', 'line', 'return', 'exception']),
  line: z.number().int(),
  frameId: z.number().int(),
  functionName: z.string(),
  // A change with no `value` means the variable went out of scope.
  frameChanges: z.array(z.object({ name: z.string(), value: ValueSchema.optional() })),
  heapChanges: z.array(HeapObjectSchema),
  returnValue: ValueSchema.optional(),
  message: z.string().optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const TraceStatusSchema = z.enum([
  'ok',
  'compile_error',
  'runtime_error',
  'step_limit',
  'time_limit',
]);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;

export const TraceSchema = z.object({
  version: z.literal(1),
  language: z.enum(LANGUAGES),
  status: TraceStatusSchema,
  result: z.unknown().optional(),
  error: z.object({ message: z.string(), line: z.number().int().optional() }).nullable(),
  stdout: z.string(),
  steps: z.array(StepSchema),
});
export type Trace = z.infer<typeof TraceSchema>;

export const RunRequestSchema = z.object({
  language: z.enum(LANGUAGES),
  code: z.string(),
  testCaseInput: z.string(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

// Returned with HTTP 422 when the code or test case cannot be turned into a driver.
export type RunInputError = { error: string; where: 'code' | 'testCase' };
