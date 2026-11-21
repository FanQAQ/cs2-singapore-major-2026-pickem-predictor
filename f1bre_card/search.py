"""Enumerate empirical threshold probabilities with exact bit-parallel counts."""
import argparse
import itertools
import json
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
from numba import njit, prange, types, set_num_threads
from numba.extending import intrinsic

HERE=Path(__file__).resolve().parent
SETS=list(itertools.combinations(range(16),6))
PAIRS=list(itertools.combinations(range(16),2))
def masks(groups):
    return np.array([sum(1<<i for i in group) for group in groups],np.int32)
M6,M2=masks(SETS),masks(PAIRS)
TWOS=np.array(PAIRS)
SIX=np.array(SETS)

@intrinsic
def popcount(typingctx,x):
    sig=types.uint64(types.uint64)
    def codegen(context,builder,signature,args):
        return builder.ctpop(args[0])
    return sig,codegen

@njit
def make_six(bits,six):
    words=bits.shape[2]
    matrix=np.zeros((len(six),words,4),np.uint64)
    fixed=np.zeros(len(six),np.int64)
    for i in range(len(six)):
        for k in range(words):
            lo,mid,hi=np.uint64(0),np.uint64(0),np.uint64(0)
            for j in six[i]:
                b=bits[1,j,k]
                hi ^= mid & lo & b
                mid ^= lo & b
                lo ^= b
            fixed[i]+=np.int64(popcount(hi & (lo|mid)))
            matrix[i,k,0]=hi & ~mid & ~lo
            matrix[i,k,1]=~hi & mid & lo
            matrix[i,k,2]=~hi & mid & ~lo
            matrix[i,k,3]=~hi & ~mid & lo
    return matrix,fixed

@njit(parallel=True)
def top_three(bits,six,fixed,m6,m2,twos,expected6,expected2,legal30,legal03,advOrder,limited,n):
    winners=np.full((len(m2),3,4),-1,np.int64)
    totals=np.zeros(len(m2),np.int64)
    for a in prange(len(m2)):
        if limited and (m2[a] & legal30)!=m2[a]:
            continue
        words=bits.shape[2]
        ge=np.zeros((words,4),np.uint64)
        for b in range(len(m2)):
            if (m2[a]&m2[b]) or (limited and (m2[b]&legal03)!=m2[b]):
                continue
            banned=m2[a]|m2[b]
            if limited:
                count=0
                for team in advOrder:
                    if (banned&(1<<team))==0:
                        count+=1
                        if count>10:banned |= 1<<team
            for k in range(words):
                a0,a1=bits[0,twos[a,0],k],bits[0,twos[a,1],k]
                b0,b1=bits[2,twos[b,0],k],bits[2,twos[b,1],k]
                x1,x2,y1,y2=a0|a1,a0&a1,b0|b1,b0&b1
                ge[k,0]=x1|y1
                ge[k,1]=x2|y2|(x1&y1)
                ge[k,2]=(x1&y2)|(x2&y1)
                ge[k,3]=x2&y2
            for s in range(len(m6)):
                if m6[s]&banned: continue
                total=fixed[s]
                for k in range(words):
                    hit=(ge[k,0]&six[s,k,0]) | (ge[k,1]&six[s,k,1]) | (ge[k,2]&six[s,k,2]) | (ge[k,3]&six[s,k,3])
                    total+=np.int64(popcount(hit))
                totals[a]+=1
                rank=total*(n*10+1)+expected6[s]+expected2[0,a]+expected2[2,b]
                for j in range(3):
                    if rank>winners[a,j,0]:
                        for t in range(2,j,-1):
                            winners[a,t]=winners[a,t-1]
                        winners[a,j,0]=rank
                        winners[a,j,1]=a
                        winners[a,j,2]=b
                        winners[a,j,3]=s
                        break
    return winners,totals.sum()

def labels(observed):
    teams=np.arange(16)
    return ((observed[:,:,None]>>teams)&1).astype(np.uint8)

def search(train,limited):
    outcomes=labels(train)
    n=len(train)
    counts=outcomes.sum(axis=0,dtype=np.int64)
    padded=np.pad(outcomes,((0,(-n)%64),(0,0),(0,0)))
    bits=np.ascontiguousarray(np.packbits(padded.transpose(1,2,0),axis=2,bitorder='little')).view(np.uint64)
    six,fixed=make_six(bits,SIX)
    strength=lambda row:np.argsort(-row,kind='stable')
    best30=sum(1<<int(i) for i in strength(counts[0])[:5])
    best03=sum(1<<int(i) for i in strength(counts[2])[:5])
    winners,visits=top_three(bits,six,fixed,M6,M2,TWOS,counts[1,SIX].sum(axis=1),
        counts[:,TWOS].sum(axis=2),best30,best03,strength(counts[0]+counts[1]),limited,n)
    ranked=sorted([tuple(row) for row in winners.reshape(-1,4) if row[0]>=0],key=lambda row:(-row[0],row[1],row[2],row[3]))[:3]
    candidates=[]
    for score,a,b,s in ranked:
        card=np.full(16,3);card[SIX[s]]=1;card[TWOS[a]]=0;card[TWOS[b]]=2
        hits=score_card(card,outcomes)
        assert int((hits>=5).sum())*(10*n+1)+int(hits.sum())==score
        candidates.append(card.tolist())
    assert len({tuple(card) for card in candidates})==3
    assert (limited and visits<=21000) or visits==10090080
    return int(visits),candidates

def score_card(card,observed):
    return sum(observed[:,c,i] for i,c in enumerate(card) if c<3)

def evaluate(row,folder):
    draws={k:np.fromfile(folder/f,np.uint16).reshape(-1,3) for k,f in row['files'].items()}
    samples={k:labels(v) for k,v in draws.items()}
    def metric(card):
        scores={k:score_card(card,v) for k,v in samples.items()}
        hits=None if row['actual'] is None else sum(c<3 and c==s for c,s in zip(card,row['actual']))
        return dict(card=card,hits=hits,counts={k:int((v>=5).sum()) for k,v in scores.items()},
                    totalHits={k:int(v.sum()) for k,v in scores.items()})
    byMethod={k:metric(row[k]) for k in ['released','local']}
    assert abs(byMethod['released']['counts']['audit']/12000-row['baseAudit'])<1e-10
    for mode in (['limited','all'] if row['index']==0 else ['limited']):
        visits,cards=search(draws['train'],mode=='limited')
        picks=list(map(metric,cards))
        if mode=='all':
            assert picks[0]['counts']['train']>=byMethod['local']['counts']['train']
            assert picks[0]['counts']['train']>=byMethod['released']['counts']['train']
        selected=max(range(3),key=lambda i:(picks[i]['counts']['select'],picks[i]['totalHits']['select']))
        byMethod[mode]=dict(visited=visits,top=picks,selected=selected)
    return dict(id=row['id'],seed=row['seed'],index=row['index'],teams=row['teams'],results=byMethod)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--seeds',type=int,default=30)
    p.add_argument('--events',nargs='+',default=['singapore','copenhagen','shanghai','austin','budapest','cologne'])
    p.add_argument('--out',default='report.json')
    p.add_argument('--threads',type=int,default=6)
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    set_num_threads(args.threads)
    with tempfile.TemporaryDirectory() as scratch:
        folder=Path(scratch)
        subprocess.run(['node',str(HERE/'samples.cjs'),scratch,str(args.seeds),*args.events],check=True)
        rows=[]
        for row in json.loads((folder/'manifest.json').read_text()):
            start=time.time()
            rows.append(evaluate(row,folder))
            print(row['id'],row['index'],round(time.time()-start,2),'s',flush=True)
    text=json.dumps(dict(searchN=12000,selectionN=12000,auditN=12000,singaporeConfirmN=60000,rows=rows),ensure_ascii=False,separators=(',',':'))+'\n'
    out=HERE/args.out
    if args.check: assert text==out.read_text(encoding='utf-8')
    else: out.write_bytes(text.encode('utf8'))

if __name__=='__main__':main()
