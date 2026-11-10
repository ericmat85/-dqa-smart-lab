import os
from pathlib import Path
import socket
import subprocess
import sys
from unittest.mock import patch
import pytest


def test_network_fixture_blocks_external_access():
    with pytest.raises(RuntimeError):socket.create_connection(('example.invalid',443))


def test_import_factory_lifespan_and_health_under_network_denial():
    # Install guards BEFORE imports, in a fresh interpreter; no module-cache shortcut.
    script='''
import socket

def block(*args, **kwargs): raise RuntimeError('network forbidden')
socket.socket.connect=block
socket.socket.connect_ex=block
socket.create_connection=block
socket.getaddrinfo=block
import app.main
from fastapi.testclient import TestClient
app=app.main.create_app()
with TestClient(app) as client:
    if client.get('/health/live').status_code!=200:raise SystemExit(2)
'''
    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
    result=subprocess.run([sys.executable,'-c',script],cwd=Path(__file__).parents[1],env=env,capture_output=True,text=True,timeout=30)
    assert result.returncode==0,result.stderr


def test_domain_has_no_external_adapters_or_fake_auth():
    root=Path(__file__).parents[1]/'app'
    for f in root.rglob('*.py'):
        source=f.read_text()
        assert 'import supabase' not in source
        assert 'import openai' not in source
        assert 'import psycopg' not in source
        assert 'import requests' not in source
        assert 'AllowForTest' not in source


def test_repositories_and_uow_are_only_abstract_protocols():
    from app.ports.repositories import Repository,ImmutableArtifactRepository
    from app.ports.unit_of_work import UnitOfWork
    for port in (Repository,ImmutableArtifactRepository,UnitOfWork):
        assert port._is_protocol
        with pytest.raises(TypeError):port()
