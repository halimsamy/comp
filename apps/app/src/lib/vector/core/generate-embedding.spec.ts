import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateEmbedding, voyageEmbed } from './generate-embedding';

const fetchMock = vi.fn();

function okResponse(data: { embedding: number[]; index: number }[]) {
  return new Response(JSON.stringify({ data, usage: { total_tokens: 1 } }), { status: 200 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.VOYAGE_API_KEY = 'voyage-test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('voyageEmbed', () => {
  it('posts the Voyage request shape and returns embeddings in input order', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([
        { embedding: [2], index: 1 },
        { embedding: [1], index: 0 },
      ]),
    );

    const result = await voyageEmbed({ input: ['a', 'b'], inputType: 'document' });

    expect(result).toEqual([[1], [2]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.voyageai.com/v1/embeddings');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer voyage-test-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      input: ['a', 'b'],
      model: 'voyage-4',
      input_type: 'document',
    });
  });

  it('splits inputs into requests of at most 1000', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const { input } = JSON.parse(init.body) as { input: string[] };
      return okResponse(input.map((_, index) => ({ embedding: [index], index })));
    });

    const result = await voyageEmbed({
      input: Array.from({ length: 1500 }, (_, i) => `t${i}`),
      inputType: 'document',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).input).toHaveLength(500);
    expect(result).toHaveLength(1500);
  });

  it('throws with the response detail on a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Invalid API key' }), { status: 401 }),
    );

    await expect(voyageEmbed({ input: ['a'], inputType: 'query' })).rejects.toThrow(
      'Voyage API error 401: Invalid API key',
    );
  });
});

describe('generateEmbedding', () => {
  it('defaults to input_type query', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([{ embedding: [0.5], index: 0 }]));

    await expect(generateEmbedding('hello')).resolves.toEqual([0.5]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input_type).toBe('query');
  });

  it('throws when VOYAGE_API_KEY is missing', async () => {
    delete process.env.VOYAGE_API_KEY;
    await expect(generateEmbedding('hello')).rejects.toThrow('VOYAGE_API_KEY is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wraps API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Rate limited' }), { status: 429 }),
    );
    await expect(generateEmbedding('hello', { inputType: 'document' })).rejects.toThrow(
      'Failed to generate embedding: Voyage API error 429: Rate limited',
    );
  });
});
