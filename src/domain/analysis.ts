import { z } from "zod";

export const coloredSegmentTypeSchema = z.enum([
  "noun",
  "adjective",
  "adverb",
  "verb",
]);

export const modelPartTypeSchema = z.union([
  coloredSegmentTypeSchema,
  z.literal("neutral"),
]);

export const modelAnalysisSchema = z.object({
  parts: z
    .array(
      z.object({
        text: z.string().min(1),
        type: modelPartTypeSchema,
      }),
    )
    .min(1),
  translation: z.string().trim().min(1),
});

const segmentSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  type: coloredSegmentTypeSchema,
});

export const analysisResultSchema = z
  .object({
    original: z.string().min(1),
    segments: z.array(segmentSchema),
    translation: z.string().trim().min(1),
  })
  .superRefine((result, context) => {
    let previousEnd = 0;

    for (const segment of result.segments) {
      if (
        segment.start >= segment.end ||
        segment.start < previousEnd ||
        segment.end > result.original.length
      ) {
        context.addIssue({
          code: "custom",
          message: "segments must be ordered, non-overlapping, and in range",
          path: ["segments"],
        });
        return;
      }
      previousEnd = segment.end;
    }
  });

export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;
export type SegmentType = z.infer<typeof coloredSegmentTypeSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
