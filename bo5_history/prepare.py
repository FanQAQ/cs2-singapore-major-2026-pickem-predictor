"""Rebuild strict historical features on unchanged supervised labels and save two-arm inputs."""
import argparse
import itertools
from collections import Counter
from pathlib import Path
import numpy as np
from inputs import HERE, ROOT, base, read, sha, store

HOLDOUT={'Elisa Invitational Spring 2024','Elisa Invitational Fall 2024'}
GROUPS={'major':('f1bre_models/ml-data.json','f1bre_models/ml-data.npz'),
        'external':('ml_allocation/ml-training.json','ml_allocation/ml-training.npz')}
PAIRS=list(itertools.combinations(range(16),2))


def variants():
    assert sha(HERE/'masters-field.json')=='d43132cb8702c5d1203e21c331bba1a2acca6eb328fa245a3d242f16ecb973c1'
    major=read(ROOT/'f1bre_models/major-fields.json')['fields']
    cluj=read(ROOT/'f1bre_models/cluj-field.json');major[cluj['id']]=cluj
    other={}
    for f in [read(ROOT/'tail_calibration/epl21-field.json'),read(ROOT/'round_form/epl22-inputs.json')['target'],
              {**read(ROOT/'epl_transfer/field.json'),'teams':read(ROOT/'epl_transfer/rosters.json')['teams']},
              read(ROOT/'veto_ml/astana-field.json'),read(ROOT/'latent_form/bucharest-field.json'),
              read(HERE/'masters-field.json')]:
        other[f['id']]=f
    packs=['f1bre_models/ml.json.gz','ml_allocation/ml.json.gz','veto_ml/astana-ml/ml.json.gz','latent_form/bucharest-ml/ml.json.gz']
    old={k:v for file in packs for k,v in read(ROOT/file)['fields'].items() if k in (set(major)|set(other))}
    assert set(major)|set(other)==set(old)|{'masters-bucharest-2025'}
    return {'major':major,'external':other},old


def added_games(rows):
    for mid,g in rows.items():
        for (mp,x,y),box in zip(g['maps'],g['stats']):
            # Missing stats stay missing, and no Rating is added for BO5.
            stats=[{n:[*(np.nan if v is None else v for v in score),np.nan] for n,score in side.items()} for side in box]
            yield (g['day'],g['uncertainty'],mid,g['event'],mp,x,y,stats)


def npsave(path,arrays,check):
    if check:
        with np.load(path,allow_pickle=False) as old:
            assert set(old.files)==set(arrays)
            for key,a in arrays.items():np.testing.assert_array_equal(old[key],a)
    else: np.savez_compressed(path,**arrays)


def run(args):
    added=read(HERE/'bo5-maps.json.gz')['series']
    raw=list(base.parse_games(args.hltvy,args.ektarr))
    tables=base.sources.release_tables(args.ranks)
    groups,baseline=variants() if args.part!='train' else ({}, {})
    cov={};queries={};extra=list(added_games(added))
    for group,(d,a) in GROUPS.items():
        meta=read(ROOT/d)
        with np.load(ROOT/a,allow_pickle=False) as data:
            allowed=[r for r in raw if group=='major' or r[3] not in HOLDOUT]
            add=[r for r in extra if group=='major' or r[3] not in HOLDOUT]
            ref=base.History(allowed,tables)
            new=base.History(itertools.chain(allowed,add),tables)
            label_pairs={(meta['series'][sid],int(mp)) for sid,mp in zip(data['series'],data['map'])}
            assert not {r[2] for r in add}.intersection(m for m,mp in label_pairs)
            assert len(label_pairs)==len(data['y'])
            ref_labels=[r for r in ref.games if (r[2],r[4]) in label_pairs]
            assert ref_labels==[r for r in new.games if (r[2],r[4]) in label_pairs]
            verified={r[2] for r in new.games if r[2] in added}
            assert verified=={r[2] for r in add}
            if args.part!='queries':
                x=[]
                orig=data['x']; ys=data['y']; ds=data['day']; dates=data['ready']
                events=data['event']; series=data['series']; maps=data['map']
                for i,(day,ready,mid,event,mp,y,five,points) in enumerate(ref_labels):
                    assert (day,ready,mid,event,mp,int(y))==(ds[i],dates[i],meta['series'][series[i]],meta['events'][events[i]],maps[i],ys[i])
                    old,_=ref.vectors(day,five,points)
                    assert np.array_equal(old[mp].astype(np.float32),orig[i],equal_nan=True)
                    z,_=new.vectors(day,five,points)
                    x.append(z[mp])
                updated=np.asarray(x,np.float32)
                for locked in [0,13,14,15]:
                    np.testing.assert_array_equal(updated[:,locked],orig[:,locked])
                npsave(HERE/(group+'-features.npz'),dict(x=updated),args.check)
                print(group,len(x),'supervised maps; original features identical',flush=True)
            if args.part=='train':continue
            for key,f in groups[group].items():
                pool=baseline[key]['pool'] if key in baseline else f['pool']
                end=f.get('cutoffExclusive',f['start'])[:10]
                day=base.ordinal(end); teams=f['teams']; names=[v['name'] for v in teams]
                fives=[base.sources.roster(t['roster'],t['name']) for t in teams]
                points=[t['points'] for t in teams]
                assert len(set(names))==16 and all(isinstance(n,(int,float)) and n>0 for n in points)
                fieldspec=dict(cutoffExclusive=end,start=f['start'][:10],pool=pool,teams=names,group=group,
                               rosters=fives,points=points)
                if key in baseline:
                    old=baseline[key]
                    assert names==old['teams'] and end==old['cutoffExclusive']
                pos=[base.MAPS.index(m) for m in pool]
                for family,h in [('baseline',ref),('candidate',new)]:
                    z=[];w=[]
                    for i,j in PAIRS:
                        v,weight=h.vectors(day,[fives[i],fives[j]],[points[i],points[j]])
                        z.append(v[pos]);w.append(weight[pos])
                    queries[family+'_x_'+key]=np.asarray(z,np.float32)
                    queries[family+'_w_'+key]=np.asarray(w,np.float64)
                c={};low=base.sources.shifted(end,-365)
                for t,five in zip(names,fives):
                    valid=set(five)-base.sources.AMBIGUOUS
                    old=ref.profile(five,day);candidate=new.profile(five,day)
                    matches=[];players=Counter()
                    basic={n:[0,0,0] for n in five}
                    for mid,g in added.items():
                        if mid not in verified or g['earliest']<low or g['available']>end:continue
                        for side,sourceFive in enumerate((g['fiveA'],g['fiveB'])):
                            shared=valid.intersection(sourceFive)
                            for name in shared:
                                players[name]+=len(g['maps'])
                                for stats in g['stats']:
                                    for i,val in enumerate(stats[side][name]):basic[name][i]+=val is not None
                            if len(shared)<3:continue
                            w=sum((x>y)==(side==0) for _,x,y in g['maps'])
                            matches.append(dict(id=mid,side=side,overlap=len(shared),w=w,l=len(g['maps'])-w))
                    extra_count=sum(g['w']+g['l'] for g in matches)
                    assert extra_count==candidate[-2]-old[-2] and candidate[-1]==old[-1]
                    if key in baseline:assert int(old[-2])==baseline[key]['priorCoreMaps'][names.index(t)]
                    c[t]=dict(baseCoreMaps=old[-2],extraCoreMaps=extra_count,extraWins=sum(g['w'] for g in matches),
                              extraLosses=sum(g['l'] for g in matches),added=matches,
                              players=[dict(name=n,addedMaps=players[n],adr=basic[n][0],kast=basic[n][1],kpr=basic[n][2]) for n in five])
                cov[key]={**fieldspec,'teams':c,'teamOrder':names}
                print(key,sum(r['extraCoreMaps'] for r in c.values()),'new team-maps',flush=True)
            del ref,new
    if args.part!='train':
        npsave(HERE/'queries.npz',queries,args.check)
        audit={mid:{k:v for k,v in row.items() if k!='stats'} for mid,row in added.items()}
        store(HERE/'coverage.json.gz',dict(series=audit,fields=cov),args.check)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    ap.add_argument('--part',choices=('all','train','queries'),default='all')
    for k in ('hltvy','ektarr','ranks'):ap.add_argument('--'+k,type=Path,required=True)
    run(ap.parse_args())
