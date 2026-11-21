(() => {
  'use strict';
  // [wins, losses, number of matches] before each round.
  const rounds = [
    [[0, 0, 8]],
    [[1, 0, 4], [0, 1, 4]],
    [[2, 0, 2], [1, 1, 4], [0, 2, 2]],
    [[2, 1, 3], [1, 2, 3]],
    [[2, 2, 3]]
  ];
  const finalRecords = [[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]];
  const dash = (w,l) => w + '–' + l;
  const groupId = (r,w,l) => (w===3 || l===3 ? 'sb-final-' : 'sb-r'+r+'-')+w+'-'+l;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let followed = -1, left = 0, returnFocus = null;
  let resizeObserver, currentBoard;

  function routes(number, w, l) {
    return [[w+1,l,'胜','win'],[w,l+1,'负','loss']].map(([nw,nl,word,cls]) => {
      const terminal = nw===3 || nl===3;
      const target = groupId(number+1,nw,nl);
      const label = word+'者前往'+(terminal?(nw===3?'晋级区':'淘汰区'):'第'+(number+1)+'轮')+' '+dash(nw,nl);
      return '<button type="button" class="sb-route sb-'+cls+'" data-sb-to="'+target+'" aria-label="'+label+'">'+word+'<span aria-hidden="true"> → </span>'+dash(nw,nl)+(terminal?' '+(nw===3?'晋级':'淘汰'):'')+'</button>';
    }).join('');
  }

  function render({path, teamMarkup, teamNames}) {
    const known = new Map(path.rounds.map(r=>[r.number,r]));
    // Only already pinned results supply entrants to an unpaired record group.
    const incoming = new Map();
    for (const round of path.rounds) {
      for (const match of round.matches) {
        if (match.winner==null) continue;
        const loser = match.winner===match.a?match.b:match.a;
        for (const [team,w,l] of [[match.winner,match.wins+1,match.losses],[loser,match.wins,match.losses+1]]) {
          const key = groupId(round.number+1,w,l);
          if (!incoming.has(key)) incoming.set(key,[]);
          incoming.get(key).push(team);
        }
      }
    }
    function teamRow(match, index, r, team) {
      const hasResult = match.winner!=null, won = team===match.winner;
      const probability = Number.isFinite(match.probability) ? (team===match.a?match.probability:1-match.probability) : null;
      const rate = Number.isFinite(probability)?Math.round(100*probability)+'%':'';
      const state = hasResult ? (won?'胜':'负') : '';
      const label = '第'+r+'轮 '+dash(match.wins,match.losses)+' '+teamNames[team]+(state?'，已设为'+state+'方':'，设为胜方')+(rate?'，赛前模型胜率 '+rate:'');
      return '<button type="button" class="sb-team'+(hasResult?(won?' sb-won':' sb-lost'):'')+'" data-lock="'+team+'" data-lock-round="'+r+'" data-match="'+index+'" data-sb-team="'+team+'" data-sb-state="'+state+'" aria-pressed="'+won+'" aria-label="'+escape(label)+'">'+teamMarkup(team)+'<span class="sb-odds">'+(state?'<b>'+state+'</b>':'')+rate+'</span></button>';
    }
    function chip(team,kind) {
      return '<span class="sb-chip" data-sb-team="'+team+'" data-sb-'+kind+'="'+team+'">'+teamMarkup(team)+'</span>';
    }
    function column(layout,index) {
      const n = index+1, round = known.get(n);
      const total = layout.reduce((sum,g)=>sum+g[2],0);
      const completed = round?.matches.filter(m=>m.winner!=null).length ?? 0;
      const status = round ? (completed===total?'已完成':completed+'/'+total+' 已选') : '待配对';
      const groups = layout.map(([w,l,capacity])=>{
        const id = groupId(n,w,l);
        const format = w===2||l===2?'BO3':'BO1';
        let contents;
        if (round) {
          contents = round.matches.map((m,i) => {
            if (m.wins!==w || m.losses!==l) return '';
            return '<div class="sb-match" role="group" aria-label="'+escape(teamNames[m.a]+' 对 '+teamNames[m.b])+'">'+teamRow(m,i,n,m.a)+teamRow(m,i,n,m.b)+'</div>';
          }).join('');
        } else {
          const entrants = incoming.get(id) || [];
          contents='<div class="sb-await"><div class="sb-await-title">等待配对</div><small>第'+(n-1)+'轮结束后确定对手</small>'+
            (entrants.length?'<div class="sb-entrants"><small>已进入本组 '+entrants.length+'/'+capacity*2+'</small>'+entrants.map(t=>chip(t,'pending')).join('')+'</div>':'')+'</div>';
        }
        return '<article class="sb-group" tabindex="-1" id="'+id+'" data-record="'+w+'-'+l+'"><header class="sb-group-head"><b>'+dash(w,l)+'</b><span>'+capacity+' 场 · '+format+'</span></header><div class="sb-fixtures">'+contents+'</div><div class="sb-routes">'+routes(n,w,l)+'</div></article>';
      }).join('');
      return '<section class="sb-round" data-sb-round="'+n+'" aria-label="第'+n+'轮"><h3 class="sb-round-head"><b>第 '+n+' 轮</b><small>'+status+'</small></h3>'+groups+'</section>';
    }
    const results = finalRecords.map(([w,l])=>{
      const teams = path.records.filter(record=>record.wins===w && record.losses===l).map(record=>record.team);
      return '<article id="'+groupId(0,w,l)+'" data-record="'+w+'-'+l+'" class="sb-final '+(w===3?'sb-qualified':'sb-eliminated')+'" tabindex="-1"><header><strong>'+dash(w,l)+'</strong><span>'+(w===3?'晋级':'淘汰')+'</span></header><div class="sb-final-teams">'+(teams.length?teams.map(t=>chip(t,'final')).join(''):'<small>待定</small>')+'</div></article>';
    }).join('');
    return '<section class="panel sb-board" aria-label="瑞士轮对阵"><header class="sb-heading"><div><h2>瑞士轮对阵</h2><p>从左到右查看五轮赛程。点击队名指定胜者，再点一次撤销。修改早轮赛果后，后续轮次会重新配对。</p></div><div class="sb-tools"><label>追踪战队<select data-sb-follow><option value="-1">全部战队</option>'+teamNames.map((name,i)=>'<option value="'+i+'">'+escape(name)+'</option>').join('')+'</select></label><button type="button" class="outline-button" data-action="clear-locks"'+(!path.lockedCount?' disabled':'')+'>清除赛果</button></div></header><p class="sb-trace" aria-live="polite" hidden></p><div class="sb-scroll" role="region" aria-label="五轮对阵，支持横向滚动" tabindex="0"><div class="sb-canvas"><svg class="sb-lines" aria-hidden="true" focusable="false"></svg>'+rounds.map(column).join('')+'</div></div><section class="sb-finals" aria-label="阶段最终战绩"><h3>阶段最终战绩</h3><div class="sb-final-grid">'+results+'</div></section></section>';
  }

  function draw(board) {
    const canvas=board.querySelector('.sb-canvas'), svg=board.querySelector('.sb-lines');
    const base=canvas.getBoundingClientRect(), lines=[];
    const mids=el=>{const box=el.getBoundingClientRect();return (box.top+box.bottom)/2-base.top;};
    function add(from,to,fromY,toY,cls) {
      const x1=from.getBoundingClientRect().right-base.left, x2=to.getBoundingClientRect().left-base.left;
      const mid=(x1+x2)/2;
      lines.push('<path class="'+cls+'" d="M '+x1+' '+fromY+' C '+mid+' '+fromY+', '+mid+' '+toY+', '+x2+' '+toY+'"/>');
    }
    for (const route of canvas.querySelectorAll('[data-sb-to]')) {
      const target=canvas.querySelector('#'+route.dataset.sbTo);
      if (target) add(route.closest('.sb-group'),target,mids(route),mids(target.querySelector('.sb-group-head')),route.classList.contains('sb-win')?'sb-wire-win':'sb-wire-loss');
    }
    if (followed>=0) {
      const appearances=Array.from(canvas.querySelectorAll('[data-sb-team="'+followed+'"]'));
      for(let i=1;i<appearances.length;i++){
        const a=appearances[i-1], b=appearances[i];
        add(a.closest('.sb-group'),b.closest('.sb-group'),mids(a),mids(b),'sb-wire-follow');
      }
    }
    svg.innerHTML=lines.join('');
  }

  function trace(board) {
    for (const el of board.querySelectorAll('[data-sb-team]')) el.classList.toggle('sb-followed',Number(el.dataset.sbTeam)===followed);
    const trace=board.querySelector('.sb-trace');
    trace.hidden=followed<0;
    if(followed>=0){
      const steps=Array.from(board.querySelectorAll('.sb-followed'),node=>{
        const record=node.closest('[data-record]').dataset.record.replace('-','–');
        const round=node.closest('[data-sb-round]');
        if(!round) return record+' '+(record.startsWith('3')?'晋级':'淘汰');
        return 'R'+round.dataset.sbRound+' '+record+' '+(node.hasAttribute('data-sb-pending')?'待配对':node.dataset.sbState||'待选');
      });
      const select=board.querySelector('[data-sb-follow]');
      trace.textContent=select.selectedOptions[0].text+'　'+steps.join(' → ');
    }
    draw(board);
  }

  function mount(container) {
    const board=container.querySelector('.sb-board');
    if(!board) return;
    resizeObserver?.disconnect();
    currentBoard=board;
    const scroller=board.querySelector('.sb-scroll'), select=board.querySelector('[data-sb-follow]');
    select.value=String(followed);
    scroller.scrollLeft=left;
    scroller.addEventListener('scroll',()=>{if(currentBoard===board) left=scroller.scrollLeft;},{passive:true});
    if(returnFocus){
      const same=board.querySelector(returnFocus);
      if(same && (document.activeElement===document.body || !document.activeElement)) same.focus({preventScroll:true});
      returnFocus=null;
    }
    select.addEventListener('change',()=>{followed=Number(select.value);trace(board);});
    board.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if (!button) return;
      left=scroller.scrollLeft;
      if(button.hasAttribute('data-lock')){
        returnFocus='[data-lock-round="'+button.dataset.lockRound+'"][data-match="'+button.dataset.match+'"][data-lock="'+button.dataset.lock+'"]';
      } else if(button.hasAttribute('data-sb-to')){
        const target=board.querySelector('#'+button.dataset.sbTo);
        if(!target) return;
        if(scroller.contains(target)){
          scroller.scrollLeft+=target.getBoundingClientRect().left-scroller.getBoundingClientRect().left-12;
          left=scroller.scrollLeft;
        }
        const rect=target.getBoundingClientRect();
        if(rect.top<0 || rect.top>window.innerHeight-80) target.scrollIntoView({block:'nearest',inline:'nearest'});
        target.focus({preventScroll:true});
      } else if(button.dataset.action==='clear-locks'){
        left=0;returnFocus=null;
      }
    });
    trace(board);
    if(typeof ResizeObserver!=='undefined'){
      resizeObserver=new ResizeObserver((entries,observer)=>{if(board.isConnected) draw(board);else observer.disconnect();});
      resizeObserver.observe(board.querySelector('.sb-canvas'));
    }
  }
  globalThis.SwissBoard=Object.freeze({render,mount});
})();
