/**
 * recordingStore — IndexedDB-backed chunk storage for live broadcast recordings.
 *
 * Why this exists
 * ---------------
 * The trainer's browser captures the live broadcast via MediaRecorder; chunks
 * arrive every 10 s. Previously they piled up inside a React ref as in-memory
 * Blob objects. A 1-hour broadcast at 1.5 Mbps is ~675 MB of Blob data — well
 * past the point where iOS Safari OOMs, and uncomfortably close to Chrome
 * mobile's tab budget. When the page OOMs, the entire recording vanishes
 * because nothing was persisted.
 *
 * IndexedDB lets us keep chunks on disk instead of in RAM. Browsers reliably
 * allow several gigabytes of IDB storage per origin (subject to user quota).
 * The Blob references the underlying file on disk; iterating the cursor
 * doesn't load all blobs into memory at once.
 *
 * Lifecycle
 * ---------
 * - openDB()        — idempotent
 * - appendChunk()   — called from MediaRecorder.ondataavailable
 * - listChunks()    — read all chunks for a stream id (during upload)
 * - assembleBlob()  — convenience: merge chunks into a single Blob
 * - clearChunks()   — called after successful upload
 * - clearStale()    — called on app boot to GC abandoned recordings
 *
 * Failure modes
 * -------------
 * IDB can be unavailable (private browsing on Safari, quota exhausted, user
 * disabled). In those cases each function fails soft and returns a sensible
 * default; the caller should fall back to its previous in-memory path.
 */

const DB_NAME    = 'crm-recordings'
const DB_VERSION = 1
const STORE      = 'chunks'

// Single live connection promise so concurrent openDB() calls share a handle.
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB not available'))
    return dbPromise
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath: composite (streamId + auto-incrementing seq).
        // We use an out-of-line key (passed at .put()) shaped as [streamId, seq]
        // so a cursor can range-scan a single broadcast cheaply.
        const store = db.createObjectStore(STORE)
        store.createIndex('byStream', 'streamId', { unique: false })
        store.createIndex('byTs',     'ts',       { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
    req.onblocked = () => reject(new Error('IDB open blocked'))
  })
  return dbPromise
}

// Per-stream monotonic counter so chunks come back in insertion order.
const seqCounters = new Map()
const nextSeq = (streamId) => {
  const v = (seqCounters.get(streamId) || 0) + 1
  seqCounters.set(streamId, v)
  return v
}

/**
 * appendChunk(streamId, blob)
 * Returns the auto-assigned sequence number (1-based) for diagnostics.
 * Throws if IDB is unavailable — caller should catch and fall back.
 */
export async function appendChunk(streamId, blob) {
  if (!blob || blob.size === 0) return -1
  const db = await openDB()
  const seq = nextSeq(streamId)
  const key = `${streamId}::${String(seq).padStart(8, '0')}`
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = resolve
    tx.onerror    = () => reject(tx.error)
    tx.objectStore(STORE).put({
      streamId,
      seq,
      ts:   Date.now(),
      size: blob.size,
      type: blob.type,
      blob,
    }, key)
  })
  return seq
}

/**
 * listChunks(streamId) → Array<{ seq, ts, blob }> in insertion order.
 * Streams the IDB cursor — no all-at-once allocation, but Blob objects keep
 * pointing at on-disk storage so memory pressure stays low.
 */
export async function listChunks(streamId) {
  let db
  try { db = await openDB() } catch { return [] }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const range = IDBKeyRange.bound(`${streamId}::`, `${streamId}::￿`)
    const out = []
    const req = store.openCursor(range)
    req.onsuccess = (e) => {
      const cur = e.target.result
      if (!cur) return
      out.push(cur.value)
      cur.continue()
    }
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => resolve(out.sort((a, b) => a.seq - b.seq))
  })
}

/**
 * countBytes(streamId) — current total size on disk for this broadcast.
 * Useful for warning the trainer when disk usage approaches a threshold.
 */
export async function countBytes(streamId) {
  const list = await listChunks(streamId)
  return list.reduce((s, c) => s + (c.size || 0), 0)
}

/**
 * assembleBlob(streamId, mime) → a single Blob containing all chunks in order.
 * Blob construction is zero-copy: the Blob holds references to the underlying
 * disk-backed sub-blobs. Calling .arrayBuffer() WOULD then load it all into
 * memory; uploaders should stream by reading the Blob via fetch/XHR which
 * does not require the full byte array in JS.
 */
export async function assembleBlob(streamId, mime = 'video/webm') {
  const chunks = await listChunks(streamId)
  if (chunks.length === 0) return null
  return new Blob(chunks.map(c => c.blob), { type: mime })
}

/**
 * clearChunks(streamId) — call after successful upload. Frees the disk slot.
 */
export async function clearChunks(streamId) {
  seqCounters.delete(streamId)
  let db
  try { db = await openDB() } catch { return }
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = resolve
    tx.onerror    = resolve  // never block caller — best effort
    const store = tx.objectStore(STORE)
    const range = IDBKeyRange.bound(`${streamId}::`, `${streamId}::￿`)
    const req = store.openCursor(range)
    req.onsuccess = (e) => {
      const cur = e.target.result
      if (!cur) return
      cur.delete()
      cur.continue()
    }
  })
}

/**
 * clearStale(maxAgeMs) — drop chunks older than threshold (default 24 h).
 * Called from app boot so abandoned recordings (closed-tab, crashed-tab)
 * don't quietly fill the user's quota over time.
 */
export async function clearStale(maxAgeMs = 24 * 60 * 60 * 1000) {
  let db
  try { db = await openDB() } catch { return }
  const cutoff = Date.now() - maxAgeMs
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = resolve
    tx.onerror    = resolve
    const idx = tx.objectStore(STORE).index('byTs')
    const range = IDBKeyRange.upperBound(cutoff)
    const req = idx.openCursor(range)
    req.onsuccess = (e) => {
      const cur = e.target.result
      if (!cur) return
      cur.delete()
      cur.continue()
    }
  })
}

/**
 * listOrphans() — returns stream ids that still have chunks on disk. Used by
 * the post-end upload flow to find an interrupted recording for a stream.
 */
export async function listOrphans() {
  let db
  try { db = await openDB() } catch { return [] }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const out = new Set()
    const req = tx.objectStore(STORE).openCursor()
    req.onsuccess = (e) => {
      const cur = e.target.result
      if (!cur) return
      if (cur.value?.streamId) out.add(cur.value.streamId)
      cur.continue()
    }
    tx.oncomplete = () => resolve([...out])
    tx.onerror    = () => resolve([])
  })
}
