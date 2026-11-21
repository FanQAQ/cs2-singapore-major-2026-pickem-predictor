/* CS2 Stage 1. Teams are indexed 0–15 in official stage-seed order. */
(function (root) {
  "use strict";
  const teams = Array.from({length: 16}, (_, i) => i);
  const opening = teams.slice(0, 8).map(i => [i, i + 8]);
  // Round 4/5 pairing table from Valve's Major Supplemental Rulebook.
  const sixTeamOrder = [
    "162534","162435","152634","152436","142635",
    "142536","162345","152346","132645","132546",
    "142356","132456","123645","123546","123456"
  ].map(row => [...row].map(position => Number(position) - 1));
  const pop = new Uint8Array(65536);
  const stateTableCache = new WeakMap();
  for (let i = 1; i < pop.length; i++) pop[i] = pop[i >>> 1] + (i & 1);

  function rng(initial) {
    let state = Number(initial) >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let x = Math.imul(state ^ (state >>> 15), state | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fresh() {
    return {w: new Uint8Array(16), l: new Uint8Array(16), opponents: new Uint16Array(16)};
  }
  function result(s, winner, loser) {
    s.w[winner]++;
    s.l[loser]++;
    s.opponents[winner] |= 1 << loser;
    s.opponents[loser] |= 1 << winner;
  }
  function played(s, a, b) {
    return (s.opponents[a] & (1 << b)) !== 0;
  }
  function difficulty(s, a) {
    let mask = s.opponents[a], sum = 0;
    while (mask) {
      const b = 31 - Math.clz32(mask & -mask);
      sum += s.w[b] - s.l[b];
      mask &= mask - 1;
    }
    return sum;
  }
  function highLow(group, s, pairs) {
    if (!group.length) return true;
    const high = group[0];
    for (let i = group.length - 1; i > 0; i--) {
      const low = group[i];
      if (played(s, high, low)) continue;
      pairs.push([high, low]);
      const remaining = group.slice(1, i).concat(group.slice(i + 1));
      if (highLow(remaining, s, pairs)) return true;
      pairs.pop();
    }
    return false;
  }
  function pairings(s, round) {
    if (round === 1) return opening;
    const groups = [[], [], []], bh = new Int8Array(16);
    for (const a of teams) {
      if (s.w[a] === 3 || s.l[a] === 3) continue;
      bh[a] = difficulty(s, a);
      groups[s.w[a]].push(a);
    }
    const pairs = [];
    for (let w = 2; w >= 0; w--) {
      const g = groups[w];
      if (!g.length) continue;
      g.sort((a,b) => bh[b] - bh[a] || a - b);
      if (round < 4) {
        if (!highLow(g, s, pairs)) throw Error("无法生成无重赛配对");
      } else {
        let best, fewestRepeats = 4;
        for (const order of sixTeamOrder) {
          let repeats = 0;
          for (let i = 0; i < 6; i += 2) repeats += Number(played(s, g[order[i]], g[order[i+1]]));
          if (repeats < fewestRepeats) { best = order; fewestRepeats = repeats; }
          if (repeats === 0) break;
        }
        for (let i = 0; i < 6; i += 2) pairs.push([g[best[i]], g[best[i+1]]]);
      }
    }
    return pairs;
  }
  function category(s, i) {
    if (s.w[i] === 3) return s.l[i] === 0 ? 0 : 1;
    return s.w[i] === 0 ? 2 : 3;
  }
  function checkLocks(locks, complete = false) {
    if (!Array.isArray(locks) || locks.length > 8) throw Error("首轮应有八场对阵");
    for (let i = 0; i < 8; i++) {
      const v = locks[i];
      if (v === i || v === i + 8) continue;
      if (!complete && (v == null || v === -1)) continue;
      throw Error("首轮胜者须属于该场对阵");
    }
  }
  function nextPairs(rounds) {
    const s = fresh();
    if (rounds.length > 4) return [];
    for (const r of rounds) for (const [w,l] of r) result(s, w, l);
    return pairings(s, rounds.length + 1);
  }
  function round2(winners) {
    checkLocks(winners,true);
    return nextPairs([opening.map(([a,b], i) => winners[i] === a ? [a,b] : [b,a])]);
  }
  // The four supported Stage 1 events share this rule. See the organizer/Stage 1
  // links in fixtures.json. Stage 3 rules may differ and are outside this model.
  function bestOf(wins, losses) {
    return wins === 2 || losses === 2 ? 3 : 1;
  }
  function rowsOf(locks) {
    if (!Array.isArray(locks)) throw Error("赛果条件应按轮次排列");
    if (locks.length === 0) return [];
    if (!Array.isArray(locks[0])) {
      checkLocks(locks);
      return [locks];
    }
    if (locks.length > 5 || locks.some(row => !Array.isArray(row))) throw Error("阶段最多有五轮");
    return locks;
  }
  function describePath(rows, odds) {
    const s = fresh(), rounds = [];
    let lockedCount = 0;
    for (let number = 1; number <= 5; number++) {
      const pairs = pairings(s, number), pins = rows[number - 1] || [];
      if (pins.length > pairs.length) throw Error("该轮指定的比赛数过多");
      const matches = pairs.map(([a,b], index) => {
        const wins = s.w[a], losses = s.l[a], bo = bestOf(wins, losses);
        const winner = pins[index] == null || pins[index] === -1 ? null : pins[index];
        if (winner !== null && winner !== a && winner !== b) throw Error("指定胜者不属于本轮该场比赛");
        const match = {a,b,wins,losses,bo,winner};
        if (odds) match.probability = (bo === 3 ? odds.bo3 : odds.bo1)[a][b];
        if (winner !== null) {
          lockedCount++;
          result(s, winner, winner === a ? b : a);
        }
        return match;
      });
      const complete = matches.every(match => match.winner !== null);
      rounds.push({number,complete,matches});
      if (!complete) {
        if (rows.slice(number).some(row => row.some(winner => winner != null && winner !== -1)))
          throw Error("须先填完上一轮，才能指定下轮赛果");
        break;
      }
    }
    return {rounds,lockedCount,complete:lockedCount === 33,
      records:teams.map(team => ({team,wins:s.w[team],losses:s.l[team]}))};
  }
  function scenario(locks = []) {
    return describePath(rowsOf(locks));
  }
  function setWinner(locks, number, index, winner) {
    const rows = rowsOf(locks), round = describePath(rows).rounds[number - 1];
    const match = round?.matches[index];
    if (!Number.isInteger(number) || !Number.isInteger(index) || !match)
      throw Error("尚未确定这轮的对阵");
    if (winner !== null && winner !== match.a && winner !== match.b) throw Error("胜者须属于该场比赛");
    if (winner === match.winner) return rows.map(row => row.slice());
    // A previous result affects the next round's pairings and Buchholz ranking.
    const edited = rows.slice(0, number - 1).map(row => row.slice());
    const row = round.matches.map(match => match.winner);
    row[index] = winner;
    edited.push(row);
    return edited;
  }
  function fractionalOdds(matrix) {
    const matrices = Array.isArray(matrix) ? {bo1:matrix,bo3:matrix} : matrix;
    if (!matrices) throw Error("缺少比赛胜率矩阵");
    for (const m of [matrices.bo1,matrices.bo3]) {
      if (!m || m.length !== 16 || Array.from(m).some(row => !row || row.length !== 16)) throw Error("胜率矩阵必须为 16 × 16");
      for (const i of teams) for (let j = i+1; j < 16; j++) {
        const p = m[i][j], q = m[j][i];
        if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(q) || q < 0 || q > 1 || Math.abs(p + q - 1) > 1e-5)
          throw Error("双方胜率须互补且位于 0–1");
      }
    }
    return matrices;
  }
  // Each team's sign is shared by all its games in this simulated stage.
  // Recenter every pair so its unconditional probability is exactly the input p.
  function stateCases(p,sa,sb) {
    if (p === 0 || p === 1 || (sa === 0 && sb === 0)) return [p,p,p,p];
    const middle = Math.log(p)-Math.log1p(-p), span = sa+sb;
    const deltas = [-sa+sb,-sa-sb,sa+sb,sa-sb];
    const values = x => deltas.map(d => 1/(1+Math.exp(-(x+d))));
    let low = middle-span, high = middle+span;
    for (let iter=0; iter<50; iter++) {
      const mid = low+(high-low)/2;
      if (values(mid).reduce((a,b)=>a+b,0)/4 < p) low=mid;
      else high=mid;
    }
    return values(low+(high-low)/2);
  }
  function stateTable(matrix,scale) {
    const table = new Float64Array(16*16*4);
    for (const a of teams) for (const b of teams) {
      if (a >= b) continue;
      const values = stateCases(matrix[a][b],scale[a],scale[b]);
      for (let i=0; i<2; i++) for (let j=0; j<2; j++) {
        const p = values[i*2+j];
        table[(a*16+b)*4+i*2+j] = p;
        table[(b*16+a)*4+j*2+i] = 1-p;
      }
    }
    return table;
  }
  function stateTables(odds,scales) {
    const old = stateTableCache.get(odds);
    // Public callers can update a matrix in place. Reuse tables only when all
    // the pair probabilities and team scales still match the previous inputs.
    if (old && teams.every(a => scales[a]===old.scales[a] && teams.every(b =>
      b<=a || (odds.bo1[a][b]===old.input1[a][b] && odds.bo3[a][b]===old.input3[a][b]))))
      return old;
    const tables={scales:Array.from(scales),input1:odds.bo1.map(r=>Array.from(r)),input3:odds.bo3.map(r=>Array.from(r)),
      bo1:stateTable(odds.bo1,scales),bo3:stateTable(odds.bo3,scales)};
    stateTableCache.set(odds,tables);
    return tables;
  }
  function stateIndex(mask,a,b) {
    return (a*16+b)*4+(((mask>>>a)&1)*2)+((mask>>>b)&1);
  }
  function prepareState(odds,path) {
    if (!odds.state) return null;
    const scales = odds.state.scales;
    if (!scales || scales.length !== 16 ||
        Array.from(scales).some(s => !Number.isFinite(s) || s < 0))
      throw Error("队伍阶段状态需要十六个非负的对数胜算标准差");
    if (scales.every(s => s === 0)) return null;
    const {bo1,bo3}=stateTables(odds,scales);
    if (!path.lockedCount) return {bo1,bo3,draw:random => Math.floor(random()*65536)};

    // Pinning a result provides evidence about both teams. With just 16 signs,
    // condition exactly on all fixed winners before simulating the rest of the stage.
    const weights = new Float64Array(65536);
    weights.fill(1);
    let weightSum=0;
    for (const round of path.rounds) for (const m of round.matches) {
      if (m.winner===null) continue;
      const loser=m.winner===m.a ? m.b : m.a;
      const table=m.bo===3 ? bo3 : bo1;
      let peak=0;
      for (let mask=0; mask<weights.length; mask++) {
        weights[mask] *= table[stateIndex(mask,m.winner,loser)];
        peak=Math.max(peak,weights[mask]);
      }
      if (!peak) throw Error("指定的胜负组合在阶段状态模型中概率为零");
      // Rescale after each observation, including extremely unlikely forced outcomes.
      for (let mask=0; mask<weights.length; mask++) weights[mask]/=peak;
    }
    for (const weight of weights) weightSum+=weight;
    for (const round of path.rounds) for (const m of round.matches) {
      if (m.winner!==null) continue;
      const table=m.bo===3 ? bo3 : bo1;
      let mass=0;
      for (let mask=0; mask<weights.length; mask++) mass+=weights[mask]*table[stateIndex(mask,m.a,m.b)];
      m.probability=mass/weightSum;
    }
    let running=0;
    for (let mask=0; mask<weights.length; mask++) {
      running+=weights[mask];
      weights[mask]=running;
    }
    function draw(random) {
      const target=random()*weightSum;
      let low=0,high=weights.length-1;
      while (low<high) {
        const mid=(low+high)>>>1;
        if (weights[mid]<=target) low=mid+1;
        else high=mid;
      }
      return low;
    }
    return {bo1,bo3,draw};
  }
  function samples(odds, count, seed, rows, state, opponentCounts, elimination) {
    const outcomes = new Uint16Array(count * 3);
    const frequencies = teams.map(() => [0,0,0,0]);
    const random=rng(seed), stateRandom=state && rng((Number(seed)^0x1b873593)>>>0);
    for (let trial = 0; trial < count; trial++) {
      const s = fresh();
      const mask=state && state.draw(stateRandom);
      for (let round = 1; round <= 5; round++) {
        const pairs = pairings(s, round);
        const pins = rows[round - 1], met = opponentCounts?.[round - 1];
        for (let i = 0; i < pairs.length; i++) {
          const [a,b] = pairs[i];
          if (met) {
            met[a * 16 + b]++;
            met[b * 16 + a]++;
          }
          const bo3 = bestOf(s.w[a],s.l[a]) === 3;
          const p = state ? (bo3 ? state.bo3 : state.bo1)[stateIndex(mask,a,b)] :
            (bo3 ? odds.bo3 : odds.bo1)[a][b];
          let aWins = random() < p;
          const fixed = pins?.[i];
          if (fixed != null && fixed !== -1) aWins = fixed === a;
          const winner = aWins ? a : b, loser = aWins ? b : a;
          if (elimination && round === 3 && s.w[a] === 0) {
            elimination.met[a * 16 + b]++;
            elimination.met[b * 16 + a]++;
            elimination.lost[loser * 16 + winner]++;
          }
          result(s,winner,loser);
        }
      }
      for (const i of teams) {
        const slot = category(s,i);
        frequencies[i][slot]++;
        if (slot !== 3) outcomes[trial * 3 + slot] |= 1 << i;
      }
    }
    return {count,outcomes,frequencies};
  }
  function summarizeTail(elimination,paths) {
    return teams.map(i => {
      const opponents = [];
      let reached02 = 0, lost03 = 0;
      for (const team of teams) {
        const met = elimination.met[i * 16 + team];
        if (!met) continue;
        const lost = elimination.lost[i * 16 + team];
        reached02 += met;
        lost03 += lost;
        opponents.push({team,reached02:met,lost03:lost,pLossGivenOpponent:lost/met});
      }
      for (const row of opponents) row.pOpponentGiven02 = row.reached02 / reached02;
      opponents.sort((a,b) => b.reached02 - a.reached02 || a.team - b.team);
      return {paths,reached02,lost03,p02:reached02/paths,
        pLossGiven02:reached02 ? lost03/reached02 : null,p03:lost03/paths,opponents};
    });
  }
  function tailRanking(rows,actual) {
    if (!Array.isArray(rows) || rows.length !== 16 || rows.some(r => !Number.isFinite(r.p03)))
      throw Error("需要十六队的全败概率");
    const order = teams.slice().sort((a,b) => rows[b].p03 - rows[a].p03 || a - b);
    const ranked = order.map((team,i) => ({team,seed:team+1,rank:i+1,p03:rows[team].p03}));
    const ranksByTeam = Array(16);
    for (const {team,rank} of ranked) ranksByTeam[team] = rank;
    if (actual === undefined) return {order,ranked,ranksByTeam};
    if (actual.length !== 16 || Array.from(actual).filter(slot => slot === 2).length !== 2)
      throw Error("需要当届两支实际全败队伍");
    const actualRanks = order.map((team,i) => actual[team] === 2 ? i+1 : 0).filter(Boolean);
    const hits = n => actualRanks.filter(rank => rank <= n).length;
    return {order,ranked,ranksByTeam,actualRanks,top2:hits(2),top4:hits(4),top6:hits(6),
      seedBottom2:Number(actual[14] === 2)+Number(actual[15] === 2)};
  }
  function checkCard(card) {
    if (!card || card.length !== 16) throw Error("竞猜卡必须列出 16 队");
    const counts = [0,0,0,0];
    for (const c of card) {
      if (!Number.isInteger(c) || c < 0 || c > 3) throw Error("竞猜档位无效");
      counts[c]++;
    }
    if (counts.join() !== "2,6,2,6") throw Error("请选择 2 个全胜位、6 个普通晋级位和 2 个全败位");
  }
  function masks(card) {
    const m = [0,0,0];
    for (const a of teams) if (card[a] !== 3) m[card[a]] |= 1 << a;
    return m;
  }
  function trialHits(m, outcomes, k) {
    return pop[m[0] & outcomes[k]] + pop[m[1] & outcomes[k+1]] + pop[m[2] & outcomes[k+2]];
  }
  function pairedPassSample(matrix, n, seed, locks, expectedCard, passCard) {
    if (!Number.isInteger(n) || n < 1 || n > 200000) throw Error("成对检验的模拟次数范围为 1 至 200000");
    const odds = fractionalOdds(matrix), rows = rowsOf(locks);
    const state=prepareState(odds,describePath(rows,odds));
    checkCard(expectedCard);
    checkCard(passCard);
    const expected = masks(expectedCard), pass = masks(passCard);
    const paths = samples(odds,n,seed,rows,state).outcomes;
    let expectedOnly = 0, passOnly = 0, both = 0;
    for (let k = 0; k < paths.length; k += 3) {
      const e = trialHits(expected,paths,k) >= 5, p = trialHits(pass,paths,k) >= 5;
      if (e && p) both++;
      else if (e) expectedOnly++;
      else if (p) passOnly++;
    }
    return {n,expectedOnly,passOnly,both,neither:n-expectedOnly-passOnly-both};
  }
  function summarize(scenarios, m, detailed) {
    let pass = 0, hits = 0;
    const histogram = detailed ? new Array(11).fill(0) : null;
    const o = scenarios.outcomes;
    for (let k = 0; k < o.length; k += 3) {
      const n = trialHits(m,o,k);
      pass += Number(n >= 5);
      hits += n;
      if (histogram) histogram[n]++;
    }
    if (!detailed) return pass * (scenarios.count * 10 + 1) + hits;
    return {pass:pass/scenarios.count, expected:hits/scenarios.count, histogram, n:scenarios.count};
  }
  // Exact maximum of sum of marginal hit probabilities under the slot constraints.
  function maxExpectedCard(freq) {
    const paths = new Map([[0, {sum:0,card:[]}]]);
    let states = paths;
    for (const i of teams) {
      const next = new Map();
      for (const [key,prev] of states) {
        const counts = [key % 3, Math.floor(key / 3) % 7, Math.floor(key / 21)];
        for (const j of [0,1,2,3]) {
          if (j < 3 && counts[j] >= [2,6,2][j]) continue;
          const k = key + [1,3,21,0][j], sum = prev.sum + (j === 3 ? 0 : freq[i][j]);
          if (!next.has(k) || sum > next.get(k).sum) next.set(k,{sum,card:[...prev.card,j]});
        }
      }
      states = next;
    }
    return states.get(62).card;
  }
  function optimize(train, base) {
    const seedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
    const starts = [base,seedCard,base.map(x => x)];
    // A third deterministic, different valid start helps on nearly tied boards.
    [starts[2][1], starts[2][8]] = [starts[2][8], starts[2][1]];
    [starts[2][5], starts[2][14]] = [starts[2][14], starts[2][5]];
    let winner = null, best = -1;
    const scores = new Map();
    function value(card) {
      const key = card.join("");
      if (!scores.has(key)) scores.set(key, summarize(train,masks(card),false));
      return scores.get(key);
    }
    for (const start of starts) {
      let card = start.slice(), score = value(card);
      for (;;) {
        let choice = null, next = score;
        for (let i = 0; i < 15; i++) for (let j = i+1; j < 16; j++) {
          if (card[i] === card[j]) continue;
          const candidate = card.slice();
          [candidate[i],candidate[j]] = [candidate[j],candidate[i]];
          const rank = value(candidate);
          if (rank > next) {next = rank; choice = candidate;}
        }
        if (!choice) break;
        card = choice; score = next;
      }
      if (score > best) {best = score; winner = card;}
    }
    return winner;
  }
  function run(matrix, n = 6000, seed = 2026, locks = []) {
    const odds = fractionalOdds(matrix);
    const rows = rowsOf(locks), path = describePath(rows, odds);
    const state=prepareState(odds,path);
    if (!Number.isInteger(n) || n < 2 || n > 200000) throw Error("模拟次数范围为 2 至 200000");
    const searchN = Math.floor(n / 2), evalN = n - searchN;
    const opponentCounts = Array.from({length:5}, () => new Uint32Array(16 * 16));
    const elimination = {met:new Uint32Array(16 * 16),lost:new Uint32Array(16 * 16)};
    const train = samples(odds,searchN,seed,rows,state,opponentCounts,elimination);
    const expectedCard = maxExpectedCard(train.frequencies);
    const card = optimize(train,expectedCard);
    const test = samples(odds,evalN,(Number(seed) ^ 0xc5398da1)>>>0,rows,state,opponentCounts,elimination);
    const probs = teams.map(i => train.frequencies[i].map((v,j) => (v + test.frequencies[i][j]) / n));
    const opponents = opponentCounts.map(counts => teams.map(a => teams.map(b => counts[a * 16 + b] / n)));
    const score = other => {checkCard(other); return summarize(test,masks(other),true);};
    function compareCards(originalCard, swappedCard) {
      const original = score(originalCard), swapped = score(swappedCard);
      const a = masks(originalCard), b = masks(swappedCard);
      let both = 0;
      for (let k = 0; k < test.outcomes.length; k += 3) {
        if (trialHits(a,test.outcomes,k)>=5 && trialHits(b,test.outcomes,k)>=5) both++;
      }
      const originalOnly = Math.round(evalN*original.pass) - both;
      const swappedOnly = Math.round(evalN*swapped.pass) - both;
      return {n:evalN, original, swapped, originalOnly, swappedOnly, both,
        neither:evalN-both-originalOnly-swappedOnly};
    }
    const tailRisk = summarizeTail(elimination,n);
    return {probs,card,expectedCard,...score(card),searchN,evalN,score,compareCards,path,opponents,tailRisk};
  }
  function actualScore(card, actual) {
    checkCard(card);
    if (!actual || actual.length !== 16) throw Error("缺少阶段实际战绩");
    return teams.reduce((sum,i) => sum + Number(card[i] !== 3 && card[i] === actual[i]),0);
  }
  function replay(rounds) {
    const s = fresh(), report = {ok:false,rounds:[],actual:null,records:[],matched:0,total:0};
    try {
      if (!Array.isArray(rounds) || rounds.length !== 5) throw Error("重放需要五轮真实赛果");
      for (let r = 0; r < 5; r++) {
        const expected = pairings(s, r+1), actual = rounds[r];
        if (!Array.isArray(actual) || actual.length !== expected.length) throw Error("第 " + (r+1) + " 轮场数不符");
        const keys = new Set(expected.map(([a,b]) => Math.min(a,b)*16+Math.max(a,b)));
        let matched = 0;
        const active = new Set(expected.flat()), seen = new Set();
        for (const [a,b] of actual) {
          if (!active.has(a) || !active.has(b) || a === b || seen.has(a) || seen.has(b) || s.w[a] !== s.w[b] || s.l[a] !== s.l[b])
            throw Error("第 " + (r+1) + " 轮出现无效对阵");
          if (keys.has(Math.min(a,b)*16+Math.max(a,b))) matched++;
          seen.add(a); seen.add(b);
          result(s,a,b);
        }
        report.rounds.push({round:r+1,ok:matched===expected.length,expected,actual,matched});
        report.matched += matched;
        report.total += expected.length;
      }
      report.actual = teams.map(i => category(s,i));
      report.records = teams.map(i => s.w[i] + "–" + s.l[i]);
      report.ok = report.matched === report.total;
    } catch (e) { report.error = e.message; }
    return report;
  }
  root.CS = {run,round2,nextPairs,replay,actualScore,scenario,setWinner,bestOf,tailRanking,pairedPassSample};
})(globalThis);
