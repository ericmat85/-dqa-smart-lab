import pytest
from pydantic import ValidationError
from app.core.config import Settings


def test_default_offline_ignores_ambient_credentials(monkeypatch):
    monkeypatch.setenv('DATABASE_URL','synthetic-not-a-connection')
    monkeypatch.setenv('OPENAI_API_KEY','synthetic-not-a-key')
    assert Settings().mode=='offline'


@pytest.mark.parametrize('value',[{'mode':'production'},{'database_url':'anything'},{'api_key':'anything'}])
def test_no_real_integration_configuration(value):
    with pytest.raises(ValidationError):Settings(**value)
