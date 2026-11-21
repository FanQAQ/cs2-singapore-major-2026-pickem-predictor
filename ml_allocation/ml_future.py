"""Train the frozen map model for the sixteen teams in a Stage 3 prospective archive."""
import argparse
import ctypes
import errno
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

import ml_prepare as prepare
import ml_train as train

ROOT = prepare.ROOT
HERE = prepare.HERE
INPUTS = ('ml-queries.json', 'ml-queries.npz', 'ml-training.json', 'ml-training.npz')


def utc(s):
    if not isinstance(s, str) or not s.endswith('Z'):
        raise ValueError('Use a UTC timestamp ending in Z')
    return datetime.fromisoformat(s[:-1]+'+00:00')


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def source(item, parent, now):
    """Recheck a local copy of an explicitly versioned public source."""
    file = (parent / item['file']).resolve()
    u = urlsplit(item['url'])
    if u.scheme != 'https' or not u.hostname or u.username or u.password:
        raise ValueError('Public HTTPS source required')
    if utc(item['publishedAt']) > now or sha(file) != item['sha256']:
        raise ValueError('Source publication or SHA-256 mismatch for '+str(file))
    return {**item, 'file': str(file)}


def relative_to(path, directory):
    try:
        return os.path.relpath(path, directory)
    except ValueError:  # Different Windows drive.
        return str(path)


def publish_directory(prepared, destination):
    """Atomically install a complete bundle. Concurrent producers cannot displace one another."""
    if os.name == 'nt':
        os.rename(prepared, destination)  # Windows rename refuses any existing target.
        return
    libc = ctypes.CDLL(None, use_errno=True)
    a, b = os.fsencode(prepared), os.fsencode(destination)
    if sys.platform.startswith('linux') and hasattr(libc, 'renameat2'):
        status = libc.renameat2(-100, a, -100, b, 1)  # AT_FDCWD, RENAME_NOREPLACE
    elif sys.platform == 'darwin' and hasattr(libc, 'renamex_np'):
        status = libc.renamex_np(a, b, 4)  # RENAME_EXCL
    else:
        raise OSError(errno.ENOTSUP, 'An exclusive atomic directory rename is required')
    if status:
        err = ctypes.get_errno()
        raise OSError(err, os.strerror(err), str(destination))


def original_input(file):
    code = "process.stdout.write(JSON.stringify(require(process.argv[1]).inspect(process.argv[2])))"
    output = subprocess.check_output(['node','-e',code,str(ROOT/'stage_goals/prospective.cjs'),str(file)])
    record = json.loads(output)
    field = record['payload']['input']
    if field['stage'] != 3:
        raise ValueError('A confirmed Stage 3 original is required')
    return record['sha256'], field


def input_sources(cfg, parent, now, cutoff):
    hltvy, ektarr, pool = (source(cfg[k], parent, now) for k in ('hltvy','ektarr','poolEvidence'))
    if hltvy['sha256'] != prepare.base.sources.hltvy.SHA256:
        raise ValueError('The HLTvy region and Rating version require the original pinned archive')
    if not re.fullmatch(r'https://www\.kaggle\.com/datasets/ektarr/counter-strike-pro-matches/versions/\d+',
                        ektarr['url']):
        raise ValueError('Pin a version of the Ektarr dataset')
    if set(cfg['pool']) - set(prepare.base.MAPS) or len(set(cfg['pool'])) != 7 or len(cfg['pool']) != 7:
        raise ValueError('Supply seven distinct maps with supported source identifiers')
    ranks = (parent / cfg['ranksDir']).resolve()
    known = prepare.read(ROOT/'tail_calibration/training-releases.json')
    releases = prepare.read((parent/cfg['rankReleases']).resolve()) if 'rankReleases' in cfg else known
    if releases[:len(known)] != known:
        raise ValueError('Extend the pinned release registry without modifying older records')
    moments = [utc(r['published']) for r in releases]
    if moments != sorted(set(moments)):
        raise ValueError('Valve release times must increase strictly')
    eligible = [r for r in releases if r['published'][:10] < cutoff]
    if not eligible:
        raise ValueError('No official rankings available before cutoff')
    evidence = [{**s, 'kind': 'training'} for s in (hltvy,ektarr)]
    evidence.append({**pool, 'kind': 'features'})
    for r in eligible:
        if (not re.fullmatch('[a-f0-9]{40}', r['sha']) or
                not r['files'] or r['rankDay'] > r['published'][:10]):
            raise ValueError('Invalid Valve release: '+str(r.get('sha')))
        for f in r['files']:
            # These are the actual files used to construct historical opponent strengths.
            row = dict(file=str(ranks/r['sha']/Path(f['path']).name),
                       url='https://github.com/ValveSoftware/counter-strike_regional_standings/blob/'
                       +r['sha']+'/'+f['path'], publishedAt=r['published'], sha256=f['sha256'])
            evidence.append({**source(row, parent, now), 'kind': 'features'})
    args = SimpleNamespace(hltvy=Path(hltvy['file']), ektarr=Path(ektarr['file']), ranks=ranks)
    return args, eligible, evidence, ektarr['sha256']


def build(original, config_path, output, as_of):
    now = datetime.now(timezone.utc)
    raw_hash, raw = original_input(original)
    deadline = min(utc(raw['startAt']), utc(raw['lockAt']))
    if not utc(raw['qualificationCompleteAt']) <= now < deadline:
        raise ValueError('The confirmed roster must be trained after qualification and before lock')
    cutoff = as_of or min(now.date(), deadline.date()).isoformat()
    if date.fromisoformat(cutoff) > min(now.date(), deadline.date()):
        raise ValueError('Training cutoff is later than the pre-stage date')
    cfg = prepare.read(config_path)
    if output.exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    args, releases, docs, ek_sha = input_sources(cfg, config_path.parent, now, cutoff)
    field_id = raw['edition']+'-stage3'
    target_label, preceding_label = cfg.get('targetLabel'), cfg.get('precedingLabel')
    if target_label == preceding_label:
        # A combined event name cannot distinguish the preceding-stage subset. The raw
        # availability bound is earlier than Stage 3 regardless of how the publisher names it.
        target_label = preceding_label = None
    field = dict(id=field_id, start=raw['startAt'][:10], cutoffExclusive=cutoff, teams=raw['teams'],
                 pool=cfg['pool'], targetLabel=target_label, precedingLabel=preceding_label)
    with tempfile.TemporaryDirectory(prefix='.map-ml-', dir=output.parent) as directory:
        tmp = Path(directory)
        opts = dict(ektarr_sha=ek_sha, cutoff_exclusive=cutoff)
        history, withheld = prepare.clean_history(args, prepare.base.ordinal(cutoff), opts, releases)
        prepare.training(history, withheld, False, tmp, cutoff)
        prepare.queries(history, False, [field], tmp)
        # Bind model provenance and map-pool evidence into the hashed training input.
        meta = prepare.read(tmp/'ml-training.json')
        meta['originalSha256'] = raw_hash
        meta['sourceEvidence'] = [{k:d[k] for k in ('kind','url','publishedAt','sha256')} for d in docs]
        (tmp/'ml-training.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':'))+'\n',
                                             encoding='utf8')
        train.run(False, 1, tmp, [field_id])
        generated = datetime.now(timezone.utc)
        if generated >= deadline:
            raise ValueError('Forecast deadline passed before model completion')
        stamp = generated.isoformat(timespec='milliseconds').replace('+00:00','Z')
        for d in docs:
            d['file'] = relative_to(d['file'], output)
        ml = dict(file='ml.json.gz', sha256=sha(tmp/'ml.json.gz'), generatedAt=stamp,
                  inputFiles={k:k for k in INPUTS}, sources=docs)
        (tmp/'manifest-ml.json').write_text(json.dumps({'originalSha256':raw_hash, 'ml':ml},
                                                       ensure_ascii=False, indent=2)+'\n', encoding='utf8')
        # Validate using the same reader as the eventual seal. Paths to evidence are relative to
        # output; its sibling tmp directory has the same path depth. Absolute paths remain valid.
        js = ("const fs=require('fs'),path=require('path');const [root,orig,dir]=process.argv.slice(1);"
              "const f=require(path.join(root,'stage_goals/prospective.cjs')).inspect(orig).payload.input;"
              "const cfg=JSON.parse(fs.readFileSync(path.join(dir,'manifest-ml.json'),'utf8'));"
              "require(path.join(root,'ml_allocation/prospective.cjs')).loadModel(cfg.ml,f,dir,Date.now(),cfg.originalSha256);")
        env = {**os.environ, 'PYTHON':sys.executable}
        subprocess.run(['node','-e',js,str(ROOT),str(original),str(tmp)], check=True, env=env)
        if datetime.now(timezone.utc) >= deadline:
            raise ValueError('Forecast deadline passed during model verification')
        publish_directory(tmp, output)
    print(str(output/'manifest-ml.json'), flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--original', type=Path, required=True)
    ap.add_argument('--config', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--cutoff', help='Exclusive UTC training date; defaults to today UTC before lock.')
    args = ap.parse_args()
    build(args.original.resolve(), args.config.resolve(), args.out.resolve(), args.cutoff)
