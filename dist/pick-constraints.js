(function (root) {
  'use strict';

  function messages(card, path, teams) {
    const notes = [];
    const missed = [[], [], []];
    const teamName = i => typeof teams[i] === 'string' ? teams[i] : teams[i].name;
    const bucket = ['3–0', '普通晋级', '0–3'];
    for (const {team, wins, losses} of path.records) {
      const slot = card[team];
      if ((slot === 0 && losses > 0) ||
          (slot === 1 && (losses === 3 || (wins === 3 && losses === 0))) ||
          (slot === 2 && wins > 0)) {
        missed[slot].push(teamName(team) + '（' + wins + '–' + losses + '）');
      }
    }
    for (let slot = 0; slot < missed.length; slot++) {
      if (missed[slot].length) {
        notes.push(missed[slot].join('、') + ' 在当前推演中已无法命中「' + bucket[slot] + '」。');
      }
    }
    const current = path.rounds[path.rounds.length - 1];
    for (const {a, b, wins, losses, winner} of current.matches) {
      if (winner !== null || card[a] !== card[b]) continue;
      const slot = card[a];
      // An undecided head-to-head forces a loss for one team and a win for the other.
      if ((slot === 0 && losses === 0) || (slot === 2 && wins === 0)) {
        notes.push(teamName(a) + ' 与 ' + teamName(b) + ' 在第 ' + current.number +
          ' 轮（' + wins + '–' + losses + ' 组）相遇，你的两个 ' + bucket[slot] + ' 名额最多命中一格。');
      }
    }
    return notes;
  }

  root.PickConstraints = {messages};
})(globalThis);
