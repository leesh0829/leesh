import { z } from 'zod'

const postStatusSchema = z.enum(['TODO', 'DOING', 'DONE'])
const dateInputSchema = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z.union([z.string(), z.null()]).optional().default(null)
  )
  .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), {
    message: 'invalid date',
  })

export const boardSchedulePatchSchema = z
  .object({
    singleSchedule: z.boolean().optional().default(false),
    scheduleStatus: postStatusSchema.optional().default('TODO'),
    scheduleStartAt: dateInputSchema,
    scheduleEndAt: dateInputSchema,
    scheduleAllDay: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.singleSchedule && !value.scheduleStartAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduleStartAt'],
        message: 'scheduleStartAt required',
      })
    }
  })

export type BoardSchedulePatchInput = z.infer<typeof boardSchedulePatchSchema>

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

export function buildBoardScheduleUpdateData(input: BoardSchedulePatchInput) {
  return {
    singleSchedule: input.singleSchedule,
    scheduleStatus: input.scheduleStatus,
    scheduleStartAt: input.singleSchedule
      ? toDateOrNull(input.scheduleStartAt)
      : null,
    scheduleEndAt: input.singleSchedule ? toDateOrNull(input.scheduleEndAt) : null,
    scheduleAllDay: input.singleSchedule ? input.scheduleAllDay : false,
  }
}
