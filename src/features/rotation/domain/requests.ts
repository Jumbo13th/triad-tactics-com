import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const updateRotationConfigRequestSchema = z.object({
	action: z.literal('updateConfig'),
	sideAName: z.string().trim().min(1).max(100),
	sideBName: z.string().trim().min(1).max(100),
	sideAColor: hexColorSchema,
	sideBColor: hexColorSchema,
});

export const updateRotationSidesRequestSchema = z.object({
	action: z.literal('updateSides'),
	sideA: z.array(z.number().int().positive()).max(50),
	sideB: z.array(z.number().int().positive()).max(50),
});

const commanderPairSchema = z.object({
	sideAUnitId: z.number().int().positive(),
	sideBUnitId: z.number().int().positive(),
	scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const updateCommanderScheduleRequestSchema = z.object({
	action: z.literal('updateCommanderSchedule'),
	pairs: z.array(commanderPairSchema).max(50),
});

export const updateRotationRequestSchema = z.discriminatedUnion('action', [
	updateRotationConfigRequestSchema,
	updateRotationSidesRequestSchema,
	updateCommanderScheduleRequestSchema,
]);

export type UpdateRotationConfigRequest = z.infer<typeof updateRotationConfigRequestSchema>;
export type UpdateRotationSidesRequest = z.infer<typeof updateRotationSidesRequestSchema>;
export type UpdateCommanderScheduleRequest = z.infer<typeof updateCommanderScheduleRequestSchema>;
