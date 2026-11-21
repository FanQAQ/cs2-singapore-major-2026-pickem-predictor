'use strict';
const assert=require('node:assert/strict');
const sigmoid=x=>1/(1+Math.exp(-x)), logit=p=>Math.log(p/(1-p));
function choose(n,k){
  k=Math.min(k,n-k);
  let value=1;
  for(let j=1;j<=k;j++)value=value*(n-j+1)/j;
  return value;
}
const coeff={13:Array.from({length:12},(_,i)=>choose(12+i,i)),4:[1,4,10]};

// A phase ends either in cap:k (k <= cap-2), k:cap, or a tie (cap-1):(cap-1).
function phase(cap,r){
  const k=coeff[cap], s=1-r;
  return {wins:k.map((c,i)=>c*r**cap*s**i),losses:k.map((c,i)=>c*s**cap*r**i),
    tie:choose(2*(cap-1),cap-1)*(r*s)**(cap-1)};
}
const sum=arr=>arr.reduce((a,b)=>a+b,0);
function mapProbability(r){
  const regular=phase(13,r),ot=phase(4,r);
  return sum(regular.wins)+regular.tie*sum(ot.wins)/(1-ot.tie);
}
function inverse(target,fn){
  let lo=0,hi=1;
  for(let i=0;i<49;i++){
    const m=(lo+hi)/2;
    if(fn(m)<target)lo=m;else hi=m;
  }
  return (lo+hi)/2;
}
function mapMeans(m){
  const r=inverse(m,mapProbability),reg=phase(13,r),ot=phase(4,r);
  let winMass=0,lossMass=0,winShare=0,lossShare=0;
  function add(level,cap,base,mass){
    for(let k=0;k<level.wins.length;k++){
      const n=2*base+cap+k;
      const a=mass*level.wins[k],b=mass*level.losses[k];
      winMass+=a;lossMass+=b;
      winShare+=a*(base+cap)/n;lossShare+=b*(base+k)/n;
    }
  }
  add(reg,13,0,1);
  for(let mass=reg.tie,base=12;mass>1e-16;mass*=ot.tie,base+=3)add(ot,4,base,mass);
  assert(Math.abs(winMass-m)<1e-11 && Math.abs(winMass+lossMass-1)<1e-12);
  return {roundWin:r,win:winShare/winMass,loss:lossShare/lossMass};
}
function residual(p,bo,y,score,maps){
  assert(p>0 && p<1 && (bo===1||bo===3) && (y===0||y===1));
  const m=bo===1?p:inverse(p,x=>x*x*(3-2*x));
  const means=mapMeans(m);
  const twoWin=Math.max(0,(m*m)/p);
  const twoLoss=Math.max(0,((1-m)**2)/(1-p));
  const shareOfMapsWon=bo===1?y:y?twoWin+(1-twoWin)*2/3:(1-twoLoss)/3;
  const expSeries=shareOfMapsWon*means.win+(1-shareOfMapsWon)*means.loss;
  if(!maps?.length)return {mapWin:m,roundWin:means.roundWin,expSeries,u:null,expMaps:null,mapResidual:0,roundResidual:0};
  assert(Array.isArray(score) && score.length===2 && score[0]!==score[1]);
  assert.equal(sum(score),maps.length);
  assert.equal(score[0]>score[1]?1:0,y);
  assert.equal(Math.max(...score),(bo+1)/2);
  const won=maps.filter(([,a,b])=>a>b).length;
  assert.equal(won,score[0]);
  for(const [name,a,b] of maps){
    assert(typeof name==='string'&&name.length);
    assert([a,b].every(x=>Number.isInteger(x)&&x>=0)&&a!==b);
    const w=Math.max(a,b),l=Math.min(a,b);
    assert((w===13&&l<=11)||(w>=16&&(w-16)%3===0&&l>=w-4&&l<=w-2),'MR12/MR3 score '+w+':'+l);
  }
  const frac=won/maps.length;
  const expMaps=frac*means.win+(1-frac)*means.loss;
  const u=sum(maps.map(([,a,b])=>a/(a+b)))/maps.length;
  return {mapWin:m,roundWin:means.roundWin,expSeries,u,expMaps,
    mapResidual:expMaps-expSeries,roundResidual:u-expSeries};
}
function shift(obs,key){
  if(!obs.length)return 0;
  let lo=-3,hi=3;
  for(let i=0;i<48;i++){
    const d=(lo+hi)/2;
    const score=obs.reduce((a,o)=>a+o.y+(key?o[key]:0)-sigmoid(logit(o.p)+d),-4*d);
    if(score>0)lo=d;else hi=d;
  }
  return Number(((lo+hi)/2).toFixed(9));
}
function adjustBO3(matrix,offset){
  const bo3=matrix.bo3.map(r=>r.slice());
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    if(offset[i]===offset[j])continue;
    const p=sigmoid(logit(bo3[i][j])+offset[i]-offset[j]);
    bo3[i][j]=p;bo3[j][i]=1-p;
  }
  return {...matrix,bo3};
}
module.exports={residual,shift,adjustBO3,mapProbability,mapMeans};
