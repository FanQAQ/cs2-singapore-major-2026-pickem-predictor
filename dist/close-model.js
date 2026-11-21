/* A separate event view leaves the original forecast and fitted weights available for comparison. */
(() => {
  'use strict';
  const cache = new WeakMap();
  function view(event) {
    const snapshot = event?.closeSnapshot;
    if (!snapshot || snapshot.asOf === event.asOf || snapshot.baseAsOf !== event.asOf) return event;
    if (!(snapshot.baseAsOf < snapshot.asOf && snapshot.asOf < snapshot.stageStart)) return event;
    const fullField = event.teams.length === 16 && event.teams.every(t => snapshot.profiles[t.name]);
    if (!fullField || !event.v4Model || snapshot.mapStrength?.asOf !== snapshot.asOf ||
        snapshot.mapVeto?.asOf !== snapshot.asOf) return event;
    if (!cache.has(event)) {
      cache.set(event, {...event, asOf:snapshot.asOf, v4Model:{...event.v4Model, teams:snapshot.profiles},
        mapStrength:snapshot.mapStrength, mapVeto:snapshot.mapVeto});
    }
    return cache.get(event);
  }
  globalThis.PickClose = {view};
})();
