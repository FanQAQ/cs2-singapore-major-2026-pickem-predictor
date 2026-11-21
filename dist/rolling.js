/* Roster-based, time-decayed deviations from VRS. Data is frozen by Major. */
(() => {
  "use strict";
  const missing = new Set(["", "-", "—", "?", "unknown", "tba", "tbd", "n/a", "stand-in", "standin"]);

  function lineupValue(model, team) {
    if (!Array.isArray(team.roster) || team.roster.length !== 5) return 0;
    const players = team.roster.map(name => typeof name === "string" ? name.normalize("NFKC").trim().toLowerCase() : "");
    const roster = new Set(players);
    if (roster.size !== 5 || players.some(player => missing.has(player))) return 0;
    const key = players.sort().join("|");
    if (model.lineupValues && Object.hasOwn(model.lineupValues, key)) return model.lineupValues[key];

    // Additional evaluation-stage entrants can have an unseen exact five.
    let value = 0;
    for (const [prior, residual] of Object.entries(model.rosterResiduals ?? {})) {
      const shared = prior.split("|").filter(player => roster.has(player)).length;
      if (shared >= 3) value += residual * shared / 5;
    }
    return value;
  }

  function probability(event, flags, i, j) {
    const model = event.rollingModel;
    if (!model) throw Error("缺少本届阵容走势模型");
    const mask = Number(!!flags.form)+2*Number(!!flags.strong)+4*Number(!!flags.weak);
    const beta = model.masks[mask];
    const a = event.teams[i], b = event.teams[j];
    const score = beta[0]*(a.points-b.points)/100 + beta[1]*(a.form-b.form)
      + beta[2]*(a.strong-b.strong) + beta[3]*(a.weak-b.weak)
      + beta[4]*(lineupValue(model,a)-lineupValue(model,b));
    return 1/(1+Math.exp(-score));
  }

  globalThis.PickRolling = {probability, lineupValue};
})();
