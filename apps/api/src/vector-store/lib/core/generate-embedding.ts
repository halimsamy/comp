const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-4'; // 1024 dims by default — the Upstash index must match
const VOYAGE_MAX_BATCH = 1000;

/** 'query' for search-time text, 'document' for text being indexed. */
export type EmbeddingInputType = 'query' | 'document';

interface EmbeddingOptions {
  inputType?: EmbeddingInputType;
}

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
  { inputType = 'query' }: EmbeddingOptions = {},
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

/**
 * Generates embedding vectors for multiple texts in batched API calls
 * Much faster than calling generateEmbedding() multiple times
 *
 * @param texts - Array of texts to generate embeddings for
 * @param options.inputType - 'query' (default) for search, 'document' for indexing
 * @returns Array of embedding vectors in the same order as input texts
 */
export async function batchGenerateEmbeddings(
  texts: string[],
  { inputType = 'query' }: EmbeddingOptions = {},
): Promise<number[][]> {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is not configured');
  }

  if (texts.length === 0) {
    return [];
  }

  // Filter out empty texts and track their indices
  const validTexts: { text: string; originalIndex: number }[] = [];
  texts.forEach((text, index) => {
    if (text && text.trim().length > 0) {
      validTexts.push({ text: text.trim(), originalIndex: index });
    }
  });

  if (validTexts.length === 0) {
    return texts.map(() => []);
  }

  try {
    const embeddings = await voyageEmbed({
      input: validTexts.map((v) => v.text),
      inputType,
    });

    // Map embeddings back to original indices, filling empty arrays for skipped texts
    const result: number[][] = texts.map(() => []);
    validTexts.forEach((item, idx) => {
      result[item.originalIndex] = embeddings[idx];
    });

    return result;
  } catch (error) {
    throw new Error(
      `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
