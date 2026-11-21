/* Join dated post-opening fields to the fitted coefficients available in their edition. */
(() => {
  'use strict';
  const names = roster => roster.map(p => p.normalize('NFKC').trim().toLowerCase()).sort().join('|');
  const teamMap = (teams, field) => Object.fromEntries(teams.filter(t=>t[field]).map(t=>[t.name,t[field]]));

  function stageEvent(opening, field) {
    if (!opening || field.asOf !== opening.asOf || field.date <= field.asOf)
      throw Error('后续阶段与赛前快照日期不符');
    const teams = field.teams;
    const sameOpening = teams.map(t => opening.teams.findIndex(old=>
      old.name === t.name && names(old.roster) === names(t.roster)));
    const selectRows = rows => Object.fromEntries(teams.flatMap((t,i)=>
      sameOpening[i] >= 0 && rows?.[t.name] ? [[t.name,rows[t.name]]] : []));
    const subset = model => model && ({...model, teams:selectRows(model.teams)});
    const matchups = opening.matchups && {...opening.matchups, pairs:{}};
    for (let i=0;i<16;i++) for (let j=i+1;j<16;j++) {
      const a = sameOpening[i], b = sameOpening[j];
      if (a < 0 || b < 0 || !matchups) continue;
      const old = opening.matchups.pairs[Math.min(a,b)+':'+Math.max(a,b)];
      if (old) matchups.pairs[i+':'+j] = a<b ? old : {...old,wins:old.n-old.wins,expected:1-old.expected};
    }
    const lan = opening.lanSignal && {...opening.lanSignal,teams:teamMap(teams,'lan')};
    if (lan) {
      lan.stageStart = field.date;
      lan.covered = Object.values(lan.teams).filter(t=>t.n>=2).length;
    }
    const pick = subset(opening.pickSignal);
    if (pick) pick.comparableTeams = Object.values(pick.teams).filter(t=>t.comparableMaps>0).length;
    const matched = sameOpening.filter(i=>i>=0).length;
    const editionLabel = opening.label;
    const {model, boostModel, rollingModel, formatWeight, methodSelection, vrsRegionStats} = opening;
    return {...field, editionLabel, label:editionLabel+' · Stage '+field.stage,
      hasResults:true, model, boostModel, rollingModel, formatWeight, methodSelection, vrsRegionStats,
      v4Model:{...opening.v4Model,teams:teamMap(teams,'profile')},
      formatModel:{...opening.formatModel,teams:teamMap(teams,'format')},
      regionVrsModel:{...opening.regionVrsModel,teams:teamMap(teams,'regionVrs')},
      matchups, lanSignal:lan, pickSignal:pick, mapVeto:subset(opening.mapVeto),
      mapStrength:subset(opening.mapStrength), recentRating:subset(opening.recentRating),
      majorForm:{...opening.majorForm,teams:teamMap(teams,'majorForm')}, regionRisk:subset(opening.regionRisk),
      experience:field.experience ? {...field.experience,model:opening.experience?.model} : subset(opening.experience),
      profileEvidence:selectRows(opening.profileEvidence),
      stageSources:[...field.stageSources,...(field.stageSources.some(s=>s.title.includes('Valve')) ? [] : vrsRegionStats.sources)],
      carriedCount:matched, historyNotes:{always:
        '本阶段按 '+field.date+' 开赛时的种子和首轮对阵回放。16 队的基础实力和近期表现冻结于 '+field.asOf+
        '。'+(field.allBo3?'全程 33 场 BO3。':'共 20 场 BO1、13 场 BO3。')}};
  }

  function localFlags(event, selection) {
    const flags = {...selection}, notes = [];
    if (event.stage < 2 || !event.parent) return {flags,notes};
    if (flags.closeForm) {
      flags.closeForm = false;
      notes.push('后续阶段缺少覆盖 16 队的临赛近况更新，使用各队冻结的近期表现。');
    }
    const partial = [
      ['h2h','历史交手'], ['mapVeto','地图禁选'], ['regionRisk','跨区线下表现'],
      ['pickSignal','BO3 自选图'], ['fresh','临赛 VRS']
    ].filter(([key])=>flags[key]).map(([,name])=>name);
    if (partial.length) notes.push(partial.join('、')+'沿用首阶段前可核验的快照，覆盖相同首发的 '+
      event.carriedCount+'/16 队。其余队伍使用对应特征的缺样本回退规则。');
    if (flags.format && ['copenhagen','shanghai'].includes(event.parent))
      notes.push('8 支直邀队的分赛制表现用 85 天可核验样本估计，8 支晋级队沿用当届 90 天快照。');
    return {flags,notes};
  }

  function events(openings, fields) {
    return fields.map(f=>stageEvent(openings.find(e=>e.id===f.parent),f));
  }
  function matrix(event, flags) {
    const m = PickLab.seriesMatrices(event,localFlags(event,flags).flags);
    return event.allBo3 ? {...m,bo1:m.bo3} : m;
  }
  globalThis.PickStageInputs = {events,localFlags,matrix};
})();
