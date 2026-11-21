/* Compare a perfect/ordinary swap on production's independent evaluation paths. */
(() => {
  'use strict';
  function compare(result, card, perfectTeam, ordinaryTeam) {
    if (!Number.isInteger(perfectTeam) || !Number.isInteger(ordinaryTeam) ||
        card?.[perfectTeam] !== 0 || card?.[ordinaryTeam] !== 1)
      throw Error('换位需要同时选中当前卡上的一支全胜队和一支普通晋级队。');
    const swappedCard = Array.from(card);
    swappedCard[perfectTeam] = 1;
    swappedCard[ordinaryTeam] = 0;
    const {n,original,swapped,originalOnly,swappedOnly,both,neither} = result.compareCards(card,swappedCard);
    const delta = (swappedOnly-originalOnly)/n;
    // Differences are -1, 0 or +1. Only discordant paths contribute to the second moment.
    const variance = (originalOnly+swappedOnly)/n - delta*delta;
    const se = n > 1 ? Math.sqrt(Math.max(0,variance)/(n-1)) : null;
    const ci95 = se === null ? null : [Math.max(-1,delta-1.96*se),Math.min(1,delta+1.96*se)];
    const asScore = score => ({passRate:score.pass, expected:score.expected, histogram:score.histogram});
    return {card:swappedCard,n,original:asScore(original),swapped:asScore(swapped),
      originalOnly:originalOnly/n,swappedOnly:swappedOnly/n,both:both/n,neither:neither/n,
      delta,se,ci95,nearTie:Math.abs(delta)<=.02};
  }
  globalThis.PickSwap = {compare};
})();
