/** A stored file, read back. */
export type StoredFile = {
  body: ReadableStream<Uint8Array>
  contentType: string
  size: number
  /** Quoted ETag, ready for the `ETag` header. */
  etag: string
}

/**
 * Where uploaded files live. Each adapter brings one: `r2Storage` (Cloudflare), `fsStorage` (Node, Bun).
 * Keys are paths with `/` separators (`2026/01/abc-photo.png`).
 */
export interface FileStorage {
  put(key: string, data: ArrayBuffer | Uint8Array, options: { contentType: string }): Promise<void>
  /** `null` when there is no file under this key. */
  get(key: string): Promise<StoredFile | null>
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>
}
