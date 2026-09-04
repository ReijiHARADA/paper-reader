export type BenchmarkEntry = {
  id: string;
  paperId: string;
  model: string;
  modelVersion: string;
  inputChars: number;
  inputTokens: number | null;
  outputChars: number;
  translationTimeMs: number;
  charsPerSec: number;
  tokensPerSec: number | null;
  timestamp: string;
};
