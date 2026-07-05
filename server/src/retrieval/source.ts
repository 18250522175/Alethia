import type { RRFResult } from './rrf';

const sourceWeights: Record<string, number> = {
  pdf: 1.0,
  docx: 0.95,
  audio: 0.9,
  video: 0.85,
  web: 0.7,
  image: 0.6,
  text: 0.8
};

export function applySourceWeights(
  results: RRFResult[],
  sourceTypes?: Map<string, string>
): RRFResult[] {
  if (!sourceTypes || sourceTypes.size === 0) {
    return results;
  }

  return results
    .map((result) => {
      const sourceType = sourceTypes.get(result.slug) || 'text';
      const weight = sourceWeights[sourceType] ?? 0.8;
      return {
        ...result,
        score: result.score * weight
      };
    })
    .sort((a, b) => b.score - a.score);
}
