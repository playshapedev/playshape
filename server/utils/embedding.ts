const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIMENSIONS = 384

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipeline: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _loading: Promise<any> | null = null

/**
 * Returns a singleton feature-extraction pipeline using the
 * all-MiniLM-L6-v2 model (384 dimensions).
 *
 * The model is downloaded and cached on first use. Subsequent calls
 * return the cached pipeline immediately.
 */
async function getPipeline() {
  if (_pipeline) return _pipeline
  if (_loading) return _loading

  _loading = (async () => {
    const { pipeline } = await import('@xenova/transformers')
    _pipeline = await pipeline('feature-extraction', MODEL_NAME, {
      quantized: true,
    })
    _loading = null
    return _pipeline
  })()

  return _loading
}

/**
 * Generates an embedding vector for the given text.
 * Returns a float array of length 384.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getPipeline()
  const output = await pipe(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIMENSIONS)
}

/**
 * Generates embeddings for multiple texts in batch.
 * More efficient than calling generateEmbedding() in a loop.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const pipe = await getPipeline()
  const results: number[][] = []

  // Process in batches to manage memory
  const batchSize = 32
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    for (const text of batch) {
      const output = await pipe(text, { pooling: 'mean', normalize: true })
      results.push(Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIMENSIONS))
    }
  }

  return results
}

/**
 * Computes cosine similarity between two vectors.
 * Both vectors must be the same length. Returns a value between -1 and 1.
 * For normalized vectors (as produced by the pipeline), this is equivalent
 * to the dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}
