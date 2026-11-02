#!/usr/bin/env python3
"""Offline hints only. Never executes SQL or opens a database connection."""
import argparse
import hashlib
import json
from pathlib import Path
import re


def inspect(path):
    raw = path.read_bytes()
    text = raw.decode('utf-8-sig')
    counts = {
        'public_create_table_statements': len(re.findall(r'(?im)^CREATE\s+TABLE\s+(?:ONLY\s+)?public\.', text)),
        'public_create_function_statements': len(re.findall(r'(?im)^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.', text)),
        'enable_rls_statements': len(re.findall(r'(?im)^ALTER\s+TABLE\b[^;]*\bENABLE\s+ROW\s+LEVEL\s+SECURITY', text)),
        'create_policy_statements': len(re.findall(r'(?im)^CREATE\s+POLICY\b', text)),
    }
    patterns = {
        'connection_uri_or_private_key': r'postgres(?:ql)?://|-----BEGIN [A-Z ]*PRIVATE KEY-----',
        'possible_secret_assignment': r"(?i)(?:password|access_token|service_role_key)\s*(?:=|:=)\s*['\"]",
        'data_or_global_role_statement': r'(?im)^(?:COPY\s|INSERT\s+INTO\s|CREATE\s+ROLE\s|ALTER\s+ROLE\s)',
        'event_trigger_requires_explicit_review': r'(?im)^CREATE\s+EVENT\s+TRIGGER\b',
        'destructive_statement': r'(?im)^(?:DROP|TRUNCATE)\s',
    }
    flags = [name for name, pattern in patterns.items() if re.search(pattern, text)]
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
            'heuristic_counts': counts, 'review_flags': flags,
            'status': 'MANUAL_REVIEW_REQUIRED',
            'limitations': 'Counts are format-dependent, not parsed SQL; no remote or replay validation.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reviewed_sql', type=Path)
    args = parser.parse_args()
    try:
        result = inspect(args.reviewed_sql)
    except (OSError, UnicodeError):
        parser.exit(2, 'Unable to read UTF-8 SQL file; no content displayed.\n')
    print(json.dumps(result, indent=2))
    return 1 if result['review_flags'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
