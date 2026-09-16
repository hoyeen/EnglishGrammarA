import {
  analysisResultSchema,
  modelAnalysisSchema,
  type AnalysisResult,
} from "@/domain/analysis";

export function alignSegments(original: string, raw: unknown): AnalysisResult {
  const analysis = modelAnalysisSchema.parse(raw);

  if (analysis.parts.map((part) => part.text).join("") !== original) {
    throw new Error("model parts do not reproduce original");
  }

  let cursor = 0;
  const segments: AnalysisResult["segments"] = [];

  for (const part of analysis.parts) {
    const start = cursor;
    cursor += part.text.length;

    if (part.type !== "neutral") {
      segments.push({ start, end: cursor, type: part.type });
    }
  }

  return analysisResultSchema.parse({
    original,
    segments,
    translation: analysis.translation,
  });
}
