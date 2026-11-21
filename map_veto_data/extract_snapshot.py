"""Convert a pinned smallmeji team export to facts accepted by prepare.py."""
import argparse
import json
from pathlib import Path


def normalize(match, cutoff):
    if (match['format'] not in ('bo1','bo3') or match['status'] != 'over'
            or match['veto_completeness'] != 'complete_seven_map'
            or match['retrieval_lineage_status'] != 'observed_by_cutoff'):
        return None
    sequence = match['ordered_steps']
    if [s['step_number'] for s in sequence] != list(range(1,8)):
        return None
    verb = {'removed':'ban','picked':'pick','left_over':'left'}
    sides = {match['team']['hltv_id']:'a',match['opponent']['hltv_id']:'b'}
    steps = []
    for step in sequence:
        stamp = step['source_info'].get('retrieved_at')
        if not stamp or stamp > cutoff or step['retrieval_lineage_status'] != 'observed_by_cutoff':
            return None
        action = verb.get(step['action'])
        actor = sides.get(step['actor_team_hltv_id'])
        if not action or (action != 'left' and actor is None):
            return None
        steps.append([actor,action,step['map_name']])
    return dict(url=match['hltv_url'],day=match['scheduled_at'][:10],
                a=match['team']['name'],b=match['opponent']['name'],
                bo=int(match['format'][2:]),steps=steps)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('team_json',type=Path,nargs='+')
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    out=[]
    for path in args.team_json:
        src=json.loads(path.read_text())
        cutoff=src['metadata']['data_cutoff']
        if cutoff[:10]!='2026-10-16':
            raise ValueError('Expected pinned October 16 asset')
        for match in src['matches']:
            item=normalize(match,cutoff)
            if item:out.append(item)
    # Keep team-side copies here so prepare.py can detect disagreement on the same fixture.
    args.output.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
    print('normalized team exports:',len(out))
