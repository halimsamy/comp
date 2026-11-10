import 'server-only';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
export const VOYAGE_MODEL = 'voyage-4';
/** voyage-4's default output dimension — the VectorEmbedding column must match. */
export const VOYAGE_DIMENSIONS = 1024;
const VOYAGE_MAX_BATCH = 1000;

/** 'query' for search-time text, 'document' for text being indexed. */
export type EmbeddingInputType = 'query' | 'document';

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
}

/** Calls the Voyage embeddings REST API, chunking at the 1000-input limit. */
export async function voyageEmbed({
  input,
  inputType,
}: {
  input: string[];
  inputType: EmbeddingInputType;
}): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < input.length; i += VOYAGE_MAX_BATCH) {
    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: input.slice(i, i + VOYAGE_MAX_BATCH),
        model: VOYAGE_MODEL,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
      throw new Error(
        `Voyage API error ${res.status}: ${typeof body?.detail === 'string' ? body.detail : res.statusText}`,
      );
    }
    const { data } = (await res.json()) as VoyageResponse;
    out.push(...[...data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

/**
 * Generates an embedding vector for the given text using Voyage AI
 * @param text - The text to generate an embedding for
 * @param options.inputType - 'query' (default) for search, 'document' for indexing
 * @returns An array of numbers representing the embedding vector
 */
export async function generateEmbedding(
  text: string,
  { inputType = 'query' }: { inputType?: EmbeddingInputType } = {},
): Promise<number[]> {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is not configured');
  }

  try {
    const [embedding] = await voyageEmbed({ input: [text], inputType });
    return embedding;
  } catch (error) {
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
