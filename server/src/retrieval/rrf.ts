export interface RRFInput {
  slug: string;
  title: string;
  score?: number;
  snippet?: string;
}

export interface RRFResult {
  slug: string;
  title: string;
  score: number;
  snippet?: string;
}

const RRF_K = 60;

export function rrfFusion(
  lists: Array<{ results: RRFInput[]; weight: number }>,
  topK: number = 10
): RRFResult[] {
  const scoreMap = new Map<string, RRFResult>();

  for (const { results, weight } of lists) {
    for (let rank = 0; rank < results.length; rank++) {
      const item = results[rank];
      const rrfScore = weight / (RRF_K + rank + 1);

      const existing = scoreMap.get(item.slug);
      if (existing) {
        existing.score += rrfScore;
        if (!existing.snippet && item.snippet) {
          existing.snippet = item.snippet;
        }
      } else {
        scoreMap.set(item.slug, {
          slug: item.slug,
          title: item.title,
          score: rrfScore,
          snippet: item.snippet
        });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
