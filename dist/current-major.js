/* Completed opening stage and the subsequent, independently frozen forecast. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = p => (100*p).toFixed(1)+'%';
  const labels = ['3–0 全胜','3–1 / 3–2 普通晋级','0–3 全败'];
  const download = 'forecasts/singapore-stage2-2026-11-27.json';
  const data = globalThis.SingaporeLiveData;
  if (!data) return;

  function stageURL(stage, view='picks') {
    const url=new URL(location.href);
    url.searchParams.set('stage',String(stage));
    url.hash=view;
    return url.href;
  }
  function stagePicker(number,view) {
    const nav=byId('forecast-stages');
    nav.replaceChildren();
    for(const [index,label] of ['已完赛','赛前预测','待晋级队确定'].entries()){
      const stage=index+1, b=document.createElement('button');
      b.type='button';b.dataset.stage=stage;b.setAttribute('aria-pressed',String(stage===number));
      b.innerHTML='<strong>Stage '+stage+'</strong><span>'+label+'</span>';
      b.disabled=stage===3;
      if(stage!==number&&!b.disabled)b.onclick=()=>location.assign(stageURL(stage,view));
      nav.append(b);
    }
  }
  function record(i) { return String(data.stage1.records[i]).replace(/[-−–—]/g,'–'); }
  function actualSlot(i) {
    const r=record(i);
    return r==='3–0'?0:['3–1','3–2'].includes(r)?1:r==='0–3'?2:3;
  }
  function hits(card) {
    return card.reduce((sum,v,i)=>sum+Number(v<3&&v===actualSlot(i)),0);
  }
  let archiveView='A';
  function archiveCard(){return archiveView==='model'?null:data.stage1['card'+archiveView];}
  function columns(card,render) {
    return '<div class="ticket-slots">'+labels.map((label,k)=>'<section class="ticket-slot ticket-slot-'+k+'"><h3>'+label+'</h3><div class="ticket-teams">'+
      card.map((v,i)=>v===k?render(i,k):'').join('')+'</div></section>').join('')+'</div>';
  }
  function scorecard(teamMarkup, sandbox) {
    const {cardA,cardB}=data.stage1;
    const switches=[['A','A · 正式推荐',hits(cardA)],['B','B · 同阵容往届经验',hits(cardB)],['model','模型试算',null]];
    const tabs='<div class="major-score-tabs" role="group" aria-label="查看首阶段预测">'+switches.map(([id,label,n])=>
      '<button type="button" data-archive-view="'+id+'" aria-pressed="'+(archiveView===id)+'">'+label+(n===null?'':'　'+n+'/10')+'</button>').join('')+'</div>';
    if(archiveView==='model') return tabs+sandbox();
    const card=archiveView==='A'?cardA:cardB;
    const checked=columns(card,(i,k)=>{
      const ok=actualSlot(i)===k;
      return '<div class="ticket-team result-team">'+teamMarkup(i)+'<span class="pick-outcome '+(ok?'hit':'miss')+'">'+(ok?'✓ 命中':'× 落空')+' · '+record(i)+'</span></div>';
    });
    return '<section class="panel ticket archive-ticket"><div class="ticket-head"><div><h2>Stage 1 封存预测成绩</h2><p>11 月 21 日封存 · 11 月 27 日按最终战绩评分</p></div><strong class="score-verdict">'+(hits(card)>=5?'过关':'未过关')+' · '+hits(card)+'/10</strong></div>'+
      tabs+checked+'<div class="ticket-foot"><span>普通晋级只计 3–1 和 3–2。<a href="forecasts/singapore-stage1-results-2026-11-27.json" download>下载完整赛果与计分</a></span><a href="'+stageURL(2)+'">查看 Stage 2 预测</a></div></section>';
  }
  function selectArchive(v){if(['A','B','model'].includes(v))archiveView=v;}
  function urlStage() {
    const n=new URL(location.href).searchParams.get('stage');
    if(n==='1'||n==='2')return Number(n);
    return /^(#picks\/|#verify\/)/.test(location.hash)?1:2;
  }
  function mountStage2() {
    const f=data.stage2, teams=f.teams.map(t=>t.name), workspace=byId('workspace');
    const logos=new Map();
    for(const e of globalThis.PickLab.allEvents)for(const [name,file] of Object.entries(e.logos||{}))logos.set(name,file);
    for(const [name,slug] of Object.entries({'FUT ESPORTS':'fut-esports','Nemiga Gaming':'nemiga','G2 Esports':'g2-esports','The One':'the-one','Natus Vincere':'natus-vincere','Astralis':'astralis','The MongolZ':'the-mongolz'}))logos.set(name,'logos/'+slug+'.png');
    function team(i){
      const name=teams[i],src=logos.get(name);
      const badge=src?'<img class="team-logo" alt="" src="'+esc(src)+'">':'<span class="team-initial" aria-hidden="true">'+esc(name.slice(0,2).toUpperCase())+'</span>';
      return '<span class="team-ident">'+badge+'<span class="team-text">'+esc(name)+'</span></span>';
    }
    const summary=esc(f.methodSummary||'结合赛前实力与本届 Stage 1 已打完的比赛，按 Stage 2 种子与赛制模拟五轮瑞士轮。');
    let locks=[],left=0,right=8,manual=null,scenarioResult=null;
    const slots=()=>manual||scenarioResult?.card||f.card;
    const probabilities=()=>scenarioResult?.probs||f.probabilities;
    const view=()=>['bracket','duel','verify'].includes(location.hash.slice(1))?location.hash.slice(1):'picks';
    function options(exclude){return teams.map((t,i)=>i===exclude?'':'<option value="'+i+'">'+esc(t)+'</option>').join('');}
    function duel(){
      const evidence=[left,right].map(i=>{
        const t=f.teams[i],update=t.stage1Update;
        const form=update?.series?'Stage 1 实际赢 '+update.wins+' 场，赛前预期 '+update.expectedWins.toFixed(1)+' 场':'Stage 2 直邀';
        return '<li><b>'+esc(teams[i])+'</b> · Valve '+t.points+' 分 · '+form+'<br>首发：'+t.roster.map(esc).join('、')+'</li>';
      }).join('');
      return '<section class="panel"><div class="panel-head"><h2>Stage 2 两队交手胜率</h2></div><div class="panel-body"><div class="duel-teams"><label>左侧战队<select id="major-left">'+options(right)+'</select></label><span>VS</span><label>右侧战队<select id="major-right">'+options(left)+'</select></label></div>'+
      ['bo1','bo3'].map(bo=>{const p=f.matrix[bo][left][right];return '<div class="duel-format"><h3>'+bo.toUpperCase()+'</h3><div class="duel-values"><strong>'+pct(p)+'</strong><strong>'+pct(1-p)+'</strong></div><div class="duel-bar"><i style="width:'+pct(p)+'"></i></div></div>';}).join('')+
      '<h3>赛前阵容与本届表现</h3><ul>'+evidence+'</ul><p>'+summary+'</p></div></section>';
    }
    function probabilityTable(){
      const rows=probabilities().map((p,i)=>'<tr><td>'+(i+1)+'</td><td><button type="button" class="team-name team-link" data-major-duel="'+i+'">'+team(i)+'</button></td>'+p.slice(0,3).map(x=>'<td>'+pct(x)+'</td>').join('')+'<td>'+esc(f.teams[i].stage1Record||'直邀')+'</td></tr>').join('');
      return '<section class="panel prob-panel"><div class="panel-head"><div><h2>各队战绩概率</h2><p>按本阶段种子排序，点击队名查看对阵。</p></div></div><div class="table-wrap"><table class="prob-table"><thead><tr><th>种子</th><th>战队</th><th>3–0</th><th>3–1 / 3–2</th><th>0–3</th><th>Stage 1</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
    }
    function picks(){
      const html=columns(slots(),i=>'<button type="button" data-major-swap="'+i+'" class="ticket-team">'+team(i)+'</button>');
      const note=manual?'手动换位':scenarioResult?'按已指定赛果重新模拟':'赛前推荐';
      const simulated=manual?'':pct(scenarioResult?scenarioResult.pass:f.passProbability);
      return '<div class="picks-home"><section class="panel ticket"><div class="ticket-head"><div><h2>Stage 2 预测</h2><p>'+note+' · 10 格中命中 5 格即可过关'+(simulated?' · 模拟过关率 '+simulated:'')+'</p></div></div>'+html+'<div class="ticket-foot"><span>点队名换队</span>'+
        ((manual||scenarioResult)?'<button type="button" class="text-button" data-major-reset>恢复赛前预测</button>':'<a href="'+download+'" download>下载赛前预测</a>')+'</div></section>'+probabilityTable()+'</div>';
    }
    function sources(){
      return (f.sources||[]).map(src=>{const url=typeof src==='string'?src:src.url;
        return /^https?:\/\//.test(url)?'<li><a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(src.label||src.title||new URL(url).hostname)+'</a></li>':'';}).join('');
    }
    function verify(){
      const projectUrl=location.hostname.endsWith('.chatgpt.site')?'downloads/pickem-lab.zip':'https://github.com/FanQAQ/cs2-singapore-major-2026-pickem-predictor/archive/refs/heads/main.zip';
      return '<section class="panel"><div class="panel-head"><h2>Stage 2 数据来源与赛前预测下载</h2></div><div class="panel-body"><p>'+summary+'</p><p><a href="'+download+'" download>下载十格选择、16 队概率与胜率矩阵</a> · <a href="'+projectUrl+'">下载项目与回测数据</a></p><ul class="sources">'+sources()+'</ul></div></section>';
    }
    function sidebar(){
      const changes=f.card.map((v,i)=>v===f.baseCard[i]?'':'<li>'+esc(teams[i])+'：'+(labels[f.baseCard[i]]||'未入选')+' → '+(labels[v]||'未入选')+'</li>').join('');
      const hundred=teams.indexOf('100 Thieves'),fly=teams.indexOf('FlyQuest');
      const zeroNote=hundred>=0&&fly>=0&&f.card[hundred]===2?'<h3>为什么 0–3 选 100 Thieves？</h3><p>模型给 100 Thieves 的 0–3 概率为 '+pct(f.probabilities[hundred][2])+'，FlyQuest 为 '+pct(f.probabilities[fly][2])+'。沿用的填法先确定八支晋级队，再从其余队伍里取种子最低的两支填 0–3。</p>':'';
      const aside=document.querySelector('.history-sidebar');
      aside.innerHTML='<div class="history-heading"><h2 id="history-title">Stage 1 对这份预测的影响</h2></div><div class="panel-body"><p>'+summary+'</p>'+
        (changes?'<h3>加入首阶段表现后</h3><ul class="major-changes">'+changes+'</ul><p>三组种子对这一换位的支持并不一致，两队接近。</p>':'<p>同批模拟路径下，加入首阶段表现前后十格选队相同。</p>')+zeroNote+
        '<a href="'+stageURL(1)+'">查看 Stage 1 实际命中</a></div>';
    }
    function board(){
      const path=CS.scenario(locks);
      for(const r of path.rounds)for(const m of r.matches)m.probability=f.matrix[m.bo===3?'bo3':'bo1'][m.a][m.b];
      return SwissBoard.render({path,teamNames:teams,teamMarkup:team});
    }
    let swap=null;
    const dialog=byId('team-dialog');
    function render(){
      const name=view();
      workspace.dataset.view=name;
      document.querySelector('.history-sidebar').hidden=name!=='picks';
      for(const button of document.querySelectorAll('.workspace-tabs button'))button.setAttribute('aria-pressed',String(button.dataset.view===name));
      stagePicker(2,name);
      workspace.innerHTML=name==='picks'?picks():name==='duel'?duel():name==='bracket'?board():verify();
      if(name==='bracket')SwissBoard.mount(workspace);
      if(name==='duel'){byId('major-left').value=left;byId('major-right').value=right;}
      workspace.setAttribute('aria-busy','false');
    }
    for(const b of document.querySelectorAll('.workspace-tabs button'))b.onclick=()=>{location.hash=b.dataset.view;};
    byId('close-dialog').onclick=()=>dialog.close();
    byId('dialog-teams').onclick=e=>{
      const b=e.target.closest('[data-major-candidate]');if(!b)return;
      const index=Number(b.dataset.majorCandidate);
      manual=slots().slice();
      [manual[swap],manual[index]]=[manual[index],manual[swap]];
      dialog.close();render();
    };
    workspace.onclick=e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-major-duel')){
        left=Number(b.dataset.majorDuel);if(left===right)right=(left+8)%16;location.hash='duel';
      }else if(b.hasAttribute('data-major-swap')){
        swap=Number(b.dataset.majorSwap);byId('dialog-title').textContent='替换 '+teams[swap];
        byId('dialog-teams').innerHTML=teams.map((t,i)=>'<button type="button" class="dialog-team" data-major-candidate="'+i+'"'+(swap===i?' disabled':'')+'>'+team(i)+' <span class="small-tag">'+(labels[slots()[i]]||'未入卡')+'</span></button>').join('');
        dialog.showModal();
      }else if(b.dataset.action==='clear-locks'||b.hasAttribute('data-major-reset')){
        locks=[];manual=null;scenarioResult=null;render();
      }else if(b.hasAttribute('data-lock')){
        const {lock,lockRound,match}=b.dataset,r=Number(lockRound),i=Number(match),t=Number(lock);
        const current=CS.scenario(locks).rounds[r-1]?.matches[i];if(!current)return;
        locks=CS.setWinner(locks,r,i,current.winner===t?null:t);manual=null;
        scenarioResult=locks.some(row=>row.some(Number.isInteger))?CS.run(f.matrix,4000,33719,locks,{seedConditionalCard:true}):null;
        render();
      }
    };
    workspace.onchange=e=>{
      if(e.target.id==='major-left')left=Number(e.target.value);
      else if(e.target.id==='major-right')right=Number(e.target.value);
      else return;
      render();byId(e.target.id)?.focus();
    };
    document.querySelector('.strategy-board').classList.add('major-stage-two');
    document.querySelector('.method-panel').hidden=true;
    document.querySelector('.stage-tag').textContent='STAGE 2';
    byId('mode-label').textContent='赛前预测';
    byId('metadata').textContent='16 支战队 · 8 席晋级';
    const opener=document.querySelector('.event-opener'), time=opener.querySelector('time');
    const start=new Date(f.startsAt);
    if(Number.isFinite(+start)){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Shanghai'}).formatToParts(start).map(p=>[p.type,p.value]));
      time.dateTime=start.toISOString();time.textContent=parts.month+'.'+parts.day+' '+parts.hour+':'+parts.minute;
      opener.setAttribute('aria-label','Stage 2 首场北京时间 '+time.textContent+'，查看官方赛程');
    }else opener.hidden=true;
    sidebar();render();window.addEventListener('hashchange',render);
  }
  globalThis.CurrentMajor={stagePicker,scorecard,selectArchive,archiveCard,urlStage,mountStage2,hits,data};
})();
