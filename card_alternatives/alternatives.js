/* Compare one prescreened swap on fresh, paired Swiss paths. */
(function (root) {
  'use strict';
  const maxDifference = 0.01;
  const firstLook = 100000;
  const confirmationPaths = 400000;
  const batchPaths = 2000;
  const confirmationSalt = 0x52ef710b;
  const workerURL = typeof document !== 'undefined' && document.currentScript?.src
    ? new URL('alternatives-worker.js', document.currentScript.src).href : null;
  const cache = new WeakMap();
  let active = null;

  async function fingerprint(matrix, card, seed) {
    if (!root.crypto?.subtle || typeof TextEncoder === 'undefined') return null;
    const encoded = new TextEncoder().encode(JSON.stringify([
      'stage1-swap-v1', seed, Array.from(card), matrix.bo1, matrix.bo3, matrix.state || null
    ]));
    const bytes = new Uint8Array(await root.crypto.subtle.digest('SHA-256', encoded));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function candidate(result, card) {
    let best = null;
    for (let a = 0; a < card.length; a++) {
      if (card[a] !== 0 || !result.probabilities[a][0] || !result.probabilities[a][1]) continue;
      for (let b = 0; b < card.length; b++) {
        if (card[b] !== 1 || !result.probabilities[b][0] || !result.probabilities[b][1]) continue;
        const swapped = card.slice();
        swapped[a] = 1;
        swapped[b] = 0;
        const paired = result.compareCards(card, swapped);
        const distance = Math.abs(paired.swappedOnly - paired.originalOnly) / paired.n;
        // If no simulated outcome can distinguish the cards, there is no practical hint.
        if (paired.swappedOnly + paired.originalOnly === 0 || distance > 0.015) continue;
        if (!best || distance < best.distance) {
          best = {perfectTeam:a, ordinaryTeam:b, card:swapped, distance};
        }
      }
    }
    return best;
  }

  function batchSeed(seed, index) {
    // Separate from the card's search, evaluation and robust-selection streams.
    let h = ((seed ^ confirmationSalt) + Math.imul(index, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
    return (h ^ (h >>> 15)) >>> 0;
  }

  function confidenceInterval({n, passOnly, expectedOnly}) {
    const delta = (passOnly - expectedOnly) / n;
    const variance = (passOnly + expectedOnly - n * delta ** 2) / (n - 1);
    // Two fixed looks, each at 97.5%, give simultaneous 95% coverage by a union bound.
    // Empirical Bernstein for bounded paired differences D in [-1, 1].
    const radius = Math.sqrt(2 * Math.max(0, variance) * Math.log(160) / n) +
      14 * Math.log(160) / (3 * (n - 1));
    return [delta - radius, delta + radius];
  }
  // Batched identically on the worker and on file://, where a worker may be unavailable.
  async function sample(job, yieldBetween, isCurrent = () => true) {
    const sum = {n:0, expectedOnly:0, passOnly:0, both:0, neither:0};
    for (let i = 0; sum.n < confirmationPaths; i++) {
      if (yieldBetween) await new Promise(resolve => setTimeout(resolve, 0));
      if (!isCurrent()) return null;
      const counts = root.CS.pairedPassSample(job.matrix, Math.min(batchPaths, confirmationPaths - sum.n),
        batchSeed(job.seed, i), job.locks, job.card, job.swapped);
      for (const key of Object.keys(sum)) sum[key] += counts[key];
      if (sum.n === firstLook) {
        const [low, high] = confidenceInterval(sum);
        if (low > maxDifference || high < -maxDifference ||
            (low >= -maxDifference && high <= maxDifference)) break;
      }
    }
    return sum;
  }

  function verify(job, token) {
    const local = () => sample(job, true, () => active === token);
    if (!workerURL || typeof root.Worker !== 'function') return local();
    let worker;
    try { worker = new root.Worker(workerURL); }
    catch { return local(); }
    return new Promise((resolve, reject) => {
      const finish = () => { worker.terminate(); token.cancel = null; };
      token.cancel = () => { finish(); resolve(null); };
      worker.onmessage = ({data}) => {
        finish();
        if (data.error) reject(new Error(data.error));
        else resolve(data.counts);
      };
      worker.onerror = event => {
        event.preventDefault();
        finish();
        local().then(resolve, reject);
      };
      try { worker.postMessage(job); }
      catch { finish(); local().then(resolve, reject); }
    });
  }

  function find(result, card, {seed = 33719, frozen = null} = {}) {
    if (!result?.matchups || !card || card.length !== 16 || result.path?.complete ||
        !result.card.every((slot, i) => slot === card[i])) return Promise.resolve(null);
    const existing = cache.get(result);
    if (existing?.seed === seed) return existing.promise;
    if (active) {
      cache.delete(active.result);
      active.cancel?.();
    }
    const token = {result, seed, cancel:null};
    const original = Array.from(card);
    active = token;
    token.promise = Promise.resolve().then(async () => {
      if (frozen && result.path.lockedCount === 0) {
        const signature = await fingerprint(result.matchups, original, seed);
        const row = signature && frozen.byFingerprint?.[signature];
        if (row && Object.prototype.hasOwnProperty.call(row, 'hint')) return row.hint;
      }
      if (active !== token) return null;
      const choice = candidate(result, original);
      if (!choice) return null;
      const locks = result.path.rounds.map(r => r.matches.map(m => m.winner));
      const counts = await verify({matrix:result.matchups, locks, seed, card:original,
        swapped:choice.card}, token);
      if (!counts || active !== token) return null;
      const {n, passOnly, expectedOnly, both} = counts;
      const delta = (passOnly - expectedOnly) / n;
      const interval = confidenceInterval(counts);
      // Only the one prescreened candidate reaches confirmation. No replacement after failure.
      if (passOnly + expectedOnly === 0 || interval[0] < -maxDifference ||
          interval[1] > maxDifference) return null;
      return {perfectTeam:choice.perfectTeam, ordinaryTeam:choice.ordinaryTeam, card:choice.card,
        originalPass:(expectedOnly + both) / n, swappedPass:(passOnly + both) / n, delta, interval, n};
    }).finally(() => { if (active === token) active = null; });
    cache.set(result, token);
    return token.promise;
  }
  root.PickAlternatives = {find, sample, fingerprint};
})(globalThis);
