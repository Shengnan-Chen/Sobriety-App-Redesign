// Retries a flaky async operation (network/storage/Firestore calls) with backoff,
// so a transient failure doesn't silently drop data (e.g. an uploaded video URL
// never making it into the session document).
export async function retryAsync<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}
