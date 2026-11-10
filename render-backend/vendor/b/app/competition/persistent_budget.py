"""Local append-only budget journal. Single host, controlled private directory only.

Explicit provisioning is separate from opening; missing files never reinitialize.
Checksums detect accidental damage, not malicious owner edits or backup rollback.
"""
import contextlib
import fcntl
import hashlib
import json
import os
import stat
from uuid import UUID, uuid4
from .budget import BudgetDenied, Reservation, money

LIMIT = 16 * 1024 * 1024


def _encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


class LocalBudgetJournal:
    mode = 'LOCAL_HOST_PERSISTENT_OFFLINE_VALIDATED'

    def __init__(self, directory, ledger_id):
        if type(ledger_id) is not UUID:
            raise BudgetDenied('LEDGER_ID_INVALID')
        self.ledger_id = str(ledger_id)
        self._dir = self._open_directory(directory)
        try:
            self._safe(os.fstat(self._dir), directory=True)
            with self._transaction() as (_, state):
                self._validate(state)
        except Exception:
            self.close()
            raise BudgetDenied('LEDGER_UNAVAILABLE') from None

    @staticmethod
    def _open_directory(directory):
        path = os.fspath(directory)
        if not os.path.isabs(path) or any(part in ('.', '..', '') for part in path.split('/')[1:]):
            raise BudgetDenied('LEDGER_PATH_INVALID')
        fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            walked = ''
            for part in path.split('/')[1:]:
                next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd); fd = next_fd
                walked += '/' + part
                meta = os.fstat(fd)
                sticky_tmp = walked == '/tmp' and meta.st_uid == 0 and bool(meta.st_mode & stat.S_ISVTX)
                if meta.st_uid not in (0, os.getuid()) or (meta.st_mode & 0o022 and not sticky_tmp):
                    raise BudgetDenied('LEDGER_ANCESTOR_UNSAFE')
            return fd
        except Exception:
            os.close(fd)
            raise BudgetDenied('LEDGER_PATH_UNAVAILABLE') from None

    @staticmethod
    def _safe(meta, *, directory=False):
        expected = 0o700 if directory else 0o600
        if (meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) != expected
                or not (stat.S_ISDIR(meta.st_mode) if directory else stat.S_ISREG(meta.st_mode))
                or (not directory and meta.st_nlink != 1)):
            raise BudgetDenied('LEDGER_SECURITY_INVALID')

    @classmethod
    def provision(cls, directory, ledger_id, *, cap_micro_usd=10000000):
        """Operator-only one-time action in an already private directory. Never startup."""
        money(cap_micro_usd)
        if type(ledger_id) is not UUID or not 0 < cap_micro_usd <= 10000000:
            raise BudgetDenied('INVALID_PROVISIONING')
        d = cls._open_directory(directory)
        try:
            cls._safe(os.fstat(d), directory=True)
            # Exclusive journal creation: no reset, overwrite, or recovery fallback.
            fd = os.open('budget.journal', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=d)
            try:
                cls._safe(os.fstat(fd))
                state = {'ledger_id':str(ledger_id), 'cap':cap_micro_usd, 'spent':0, 'entries':{}, 'sequence':0}
                digest = cls._append(fd, state, '0'*64)
                checkpoint = os.open('budget.checkpoint', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=d)
                try:
                    cls._safe(os.fstat(checkpoint))
                    cls._write_digest(checkpoint, digest)
                finally:
                    os.close(checkpoint)
                os.fsync(d)
            finally:
                os.close(fd)
        except Exception:
            raise BudgetDenied('PROVISIONING_FAILED') from None
        finally:
            os.close(d)
        return cls(directory, ledger_id)

    def close(self):
        if getattr(self, '_dir', None) is not None:
            os.close(self._dir)
            self._dir = None

    def __enter__(self): return self
    def __exit__(self, *args): self.close()

    @staticmethod
    def _append(fd, state, previous):
        record = {'state':state, 'previous':previous}
        record['digest'] = hashlib.sha256(_encode(record)).hexdigest()
        raw = _encode(record) + b'\n'
        if os.fstat(fd).st_size + len(raw) > LIMIT:
            raise BudgetDenied('LEDGER_CAPACITY_EXCEEDED')
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:])
            if written <= 0: raise OSError('journal write failed')
            offset += written
        os.fsync(fd)
        return record['digest']

    @staticmethod
    def _write_digest(fd, digest):
        raw = (digest + '\n').encode('ascii')
        while raw:
            n = os.write(fd, raw)
            if n <= 0: raise OSError('checkpoint write failed')
            raw = raw[n:]
        os.fsync(fd)

    def _check_digests(self, expected):
        fd = os.open('budget.checkpoint', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self._dir)
        try:
            before = os.fstat(fd); self._safe(before)
            if before.st_size != len(expected) * 65: raise BudgetDenied('CHECKPOINT_MISMATCH')
            raw = bytearray()
            while len(raw) < before.st_size:
                part = os.read(fd, min(65536, before.st_size - len(raw)))
                if not part: raise BudgetDenied('CHECKPOINT_MISMATCH')
                raw.extend(part)
            after = os.fstat(fd)
            if (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise BudgetDenied('CHECKPOINT_CHANGED')
            if bytes(raw) != ''.join(d+'\n' for d in expected).encode('ascii'):
                raise BudgetDenied('CHECKPOINT_MISMATCH')
        finally:
            os.close(fd)

    def _validate(self, state):
        if type(state) is not dict or set(state) != {'ledger_id','cap','spent','entries','sequence'}:
            raise BudgetDenied('LEDGER_CORRUPT')
        if state['ledger_id'] != self.ledger_id or type(state['cap']) is not int or not 0 < state['cap'] <= 10000000:
            raise BudgetDenied('LEDGER_ID_OR_CAP_INVALID')
        money(state['spent'])
        if type(state['entries']) is not dict or type(state['sequence']) is not int or state['sequence'] < 0:
            raise BudgetDenied('LEDGER_CORRUPT')
        requests = set(); spent = held = 0
        for rid, entry in state['entries'].items():
            UUID(rid)
            if set(entry) != {'request_id','feature','model','maximum','state','actual'}:
                raise BudgetDenied('LEDGER_CORRUPT')
            UUID(entry['request_id'])
            if entry['request_id'] in requests: raise BudgetDenied('LEDGER_CORRUPT')
            requests.add(entry['request_id'])
            if entry['feature'] not in ('AI-01','AI-02','AI-03','AI-04','AI-05') or type(entry['model']) is not str or not entry['model']:
                raise BudgetDenied('LEDGER_CORRUPT')
            maximum = money(entry['maximum'])
            if maximum <= 0: raise BudgetDenied('LEDGER_CORRUPT')
            if entry['state'] == 'SETTLED':
                actual = money(entry['actual'])
                if actual > maximum: raise BudgetDenied('LEDGER_CORRUPT')
                spent += actual
            elif entry['state'] in ('RESERVED','UNKNOWN') and entry['actual'] is None:
                held += maximum
            else: raise BudgetDenied('LEDGER_CORRUPT')
        if spent != state['spent'] or spent + held > state['cap']:
            raise BudgetDenied('LEDGER_CORRUPT')

    @contextlib.contextmanager
    def _transaction(self):
        fd = None
        try:
            if self._dir is None: raise BudgetDenied('LEDGER_CLOSED')
            self._safe(os.fstat(self._dir), directory=True)
            fd = os.open('budget.journal', os.O_RDWR | os.O_APPEND | os.O_NOFOLLOW, dir_fd=self._dir)
            self._safe(os.fstat(fd))
            fcntl.flock(fd, fcntl.LOCK_EX)
            before = os.fstat(fd)
            self._safe(before)
            if not 0 < before.st_size <= LIMIT: raise BudgetDenied('LEDGER_CORRUPT')
            named = os.stat('budget.journal', dir_fd=self._dir, follow_symlinks=False)
            if (named.st_dev, named.st_ino) != (before.st_dev, before.st_ino): raise BudgetDenied('LEDGER_REPLACED')
            chunks=[]; total=0
            while True:
                chunk=os.read(fd, min(65536, LIMIT+1-total))
                if not chunk: break
                total+=len(chunk)
                if total>LIMIT: raise BudgetDenied('LEDGER_CORRUPT')
                chunks.append(chunk)
            raw=b''.join(chunks)
            if not raw.endswith(b'\n'): raise BudgetDenied('LEDGER_CORRUPT')
            previous='0'*64; state=None; digests=[]
            for sequence,line in enumerate(raw.splitlines()):
                record=json.loads(line)
                if set(record) != {'state','previous','digest'} or record['previous'] != previous:
                    raise BudgetDenied('LEDGER_CORRUPT')
                digest=hashlib.sha256(_encode({'state':record['state'],'previous':previous})).hexdigest()
                if record['digest'] != digest: raise BudgetDenied('LEDGER_CORRUPT')
                state=record['state']; self._validate(state)
                if state['sequence'] != sequence: raise BudgetDenied('LEDGER_CORRUPT')
                previous=digest; digests.append(digest)
            self._check_digests(digests)
            after=os.fstat(fd)
            if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns) != (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
                raise BudgetDenied('LEDGER_CHANGED')
            yield (fd, state)
        except BudgetDenied: raise
        except Exception: raise BudgetDenied('LEDGER_UNAVAILABLE') from None
        finally:
            if fd is not None: os.close(fd)

    def _commit(self, fd, state):
        os.lseek(fd, 0, os.SEEK_SET)
        raw=os.read(fd, LIMIT+1)
        previous=json.loads(raw.splitlines()[-1])['digest']
        state['sequence']+=1
        self._validate(state)
        digest = self._append(fd,state,previous)
        checkpoint = os.open('budget.checkpoint', os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW, dir_fd=self._dir)
        try:
            self._safe(os.fstat(checkpoint))
            self._write_digest(checkpoint, digest)
        finally:
            os.close(checkpoint)

    def reserve(self, request_id, feature, model, maximum_micro_usd):
        maximum=money(maximum_micro_usd)
        if type(request_id) is not UUID or maximum <= 0 or feature not in ('AI-01','AI-02','AI-03','AI-04','AI-05') or type(model) is not str or not 0<len(model)<=100:
            raise BudgetDenied('INVALID_RESERVATION')
        with self._transaction() as (fd,state):
            if any(e['request_id']==str(request_id) for e in state['entries'].values()): raise BudgetDenied('DUPLICATE_REQUEST')
            held=sum(e['maximum'] for e in state['entries'].values() if e['state']!='SETTLED')
            if state['spent']+held+maximum>state['cap']: raise BudgetDenied('INSUFFICIENT_BUDGET')
            r=Reservation(uuid4(),request_id,feature,model,maximum)
            state['entries'][str(r.id)]={'request_id':str(request_id),'feature':feature,'model':model,'maximum':maximum,'state':'RESERVED','actual':None}
            self._commit(fd,state)
            return r

    def _entry(self,state,r):
        if type(r) is not Reservation: raise BudgetDenied('INVALID_RESERVATION')
        e=state['entries'].get(str(r.id))
        if e is None or (e['request_id'],e['feature'],e['model'],e['maximum']) != (str(r.request_id),r.feature,r.model,r.maximum_micro_usd): raise BudgetDenied('INVALID_RESERVATION')
        return e

    def settle(self,reservation,actual_micro_usd):
        actual=money(actual_micro_usd)
        over=False
        with self._transaction() as (fd,state):
            e=self._entry(state,reservation)
            if e['state']!='RESERVED': raise BudgetDenied('INVALID_SETTLEMENT')
            if actual>e['maximum']:
                e['state']='UNKNOWN';over=True
            else:
                e['state']='SETTLED';e['actual']=actual;state['spent']+=actual
            self._commit(fd,state)
        if over: raise BudgetDenied('COST_EXCEEDS_RESERVATION')
        return actual

    def mark_unknown(self,reservation):
        with self._transaction() as (fd,state):
            e=self._entry(state,reservation)
            if e['state'] not in ('RESERVED','UNKNOWN'): raise BudgetDenied('INVALID_RESERVATION')
            e['state']='UNKNOWN';self._commit(fd,state)

    def snapshot(self):
        with self._transaction() as (_,state):
            held=sum(e['maximum'] for e in state['entries'].values() if e['state']!='SETTLED')
            return {'mode':self.mode,'ledger_id':self.ledger_id,'cap_micro_usd':state['cap'],'accounted_micro_usd':state['spent'],
                'held_micro_usd':held,'available_micro_usd':state['cap']-state['spent']-held,
                'unknown_reservations':sum(e['state']=='UNKNOWN' for e in state['entries'].values())}
