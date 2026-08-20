/**
 * Fetch que reintenta automáticamente cuando el backend Supabase (PostgREST
 * detrás de Cloudflare) devuelve 502/503/504 — típicamente durante los
 * ~5-10 segundos en que PostgREST recarga su schema cache.
 *
 * Sin esto, cualquier request que caiga justo en esa ventana muere y el
 * usuario ve error. Con esto, la app espera 1.5s y reintenta hasta 2 veces
 * más; en la práctica la segunda o tercera pasada ya toma el schema listo.
 */
export function makeRetryFetch(maxRetries = 2, baseDelayMs = 1500): typeof fetch {
  return async (input, init) => {
    let lastRes: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(input, init);
        // Solo reintentar si es 5xx transitorio del gateway / origen.
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          lastRes = res;
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
            continue;
          }
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
          continue;
        }
      }
    }
    if (lastRes) return lastRes;
    throw lastErr ?? new Error("fetch failed after retries");
  };
}
