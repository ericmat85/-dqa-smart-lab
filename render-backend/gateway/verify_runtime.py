from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1]
def verify():
 path=R/'I_P02_SOURCE_LOCK.json'
 if not path.exists():path=R/'I_P01_SOURCE_LOCK.json'
 lock=json.loads(path.read_text())
 for rel,expected in lock['runtime_files'].items():
  p=R/rel
  if not p.is_file() or p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:raise RuntimeError('SOURCE_HASH_MISMATCH')
 return len(lock['runtime_files'])
if __name__=='__main__':print('RUNTIME_HASH_PASS',verify())
