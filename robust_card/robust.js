/* Choose between two training-set candidates on paired, separately seeded Swiss paths. */
(function (root) {
  'use strict';

  // Independent of the engine's search seed and displayed-score xor salt 0xc5398da1.
  const gateSalt = 0x6a09e667;
  const confidence = 0.95;

  function pairedInterval(n, positive, negative) {
    const diff = (positive - negative) / n;
    if (n < 2) return [-1, 1];
    // D is +1 when only the pass-focused card clears five, -1 for the reverse.
    // Two-sided empirical Bernstein, D in [-1, 1] (range = 2).
    const variance = Math.max(0, (positive + negative - n * diff * diff) / (n - 1));
    const logTerm = Math.log(4 / (1 - confidence));
    const radius = Math.sqrt(2 * variance * logTerm / n) + 14 * logTerm / (3 * (n - 1));
    return [Math.max(-1, diff - radius), Math.min(1, diff + radius)];
  }

  function decide(paired) {
    const {n, expectedOnly, passOnly, both, neither} = paired;
    const cells = [expectedOnly, passOnly, both, neither];
    if (!Number.isSafeInteger(n) || n < 1 || cells.some(x => !Number.isSafeInteger(x) || x < 0) ||
        cells.reduce((sum, x) => sum + x, 0) !== n) throw Error('稳健选卡配对计数无效');
    const delta = (passOnly - expectedOnly) / n;
    const ci = pairedInterval(n, passOnly, expectedOnly);
    const confirmed = ci[0] > 0;
    return {n,expectedOnly,passOnly,both,neither,delta,ci,confidence,
      expectedGatePass:(expectedOnly + both) / n, passGatePass:(passOnly + both) / n,
      selected:confirmed ? 'pass' : 'expected',
      reason:confirmed ? 'pass-evidence' : 'no-clear-pass-gain'};
  }

  function apply(sim, matrix, seed = 33719, locks = []) {
    const passCard = sim.passCard || sim.card;
    const expectedCard = sim.expectedCard;
    let robust;
    if (expectedCard.every((slot,i) => slot === passCard[i])) {
      // Cards coincide on all outcomes, including those outside our samples.
      robust = {selected:'expected',reason:'identical',n:0,
        expectedOnly:0,passOnly:0,both:0,neither:0,delta:0,ci:[0,0],
        confidence,expectedGatePass:null,passGatePass:null};
    } else {
      const gateSeed = (Number(seed) ^ gateSalt) >>> 0;
      const paired = root.CS.pairedPassSample(matrix,sim.evalN,gateSeed,locks,expectedCard,passCard);
      robust = decide(paired);
    }
    const card = robust.selected === 'pass' ? passCard : expectedCard;
    // sim.score reads only the original independent display/evaluation sample.
    return {...sim, ...sim.score(card), card, passCard, robust};
  }

  root.PickRobust = {apply};
})(globalThis);
