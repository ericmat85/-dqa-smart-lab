from fastapi.testclient import TestClient
from app.main import create_app
from app.core.errors import AuthorizationError


def test_health_is_process_only():
    with TestClient(create_app()) as client:
        response=client.get('/health/live')
        assert response.status_code==200
        assert response.json()=={'status':'alive','mode':'offline','integrations':'NOT_CONFIGURED'}


def test_mutation_routes_do_not_exist():
    with TestClient(create_app()) as client:
        response=client.post('/api/v1/tenants/synthetic/requests',headers={'Authorization':'Bearer synthetic'},json={'admin':True})
        assert response.status_code==404


def test_openapi_contains_only_health_and_explicit_offline_contracts():
    with TestClient(create_app()) as client:
        schema=client.get('/openapi.json').json()
        assert set(schema['paths'])=={'/health/live'}
        assert 'CommandEnvelope' in schema['x-offline-contracts']
        assert schema['x-integration-status']=='NOT_IMPLEMENTED'


def test_errors_do_not_echo_exception_details():
    app=create_app()
    @app.get('/synthetic-error')
    def error():raise RuntimeError('synthetic-secret-stack-SQL')
    with TestClient(app,raise_server_exceptions=False) as client:
        response=client.get('/synthetic-error')
        assert response.status_code==500
        assert 'synthetic-secret-stack-SQL' not in response.text
        assert response.json()['error']['code']=='INTERNAL_ERROR'


def test_domain_error_is_safe():
    app=create_app()
    @app.get('/synthetic-denied')
    def denied():raise AuthorizationError()
    with TestClient(app) as client:
        response=client.get('/synthetic-denied')
        assert response.status_code==403
        assert response.json()['error']['code']=='AUTHORIZATION_DENIED'


def test_embedded_contract_references_resolve_in_openapi_document():
    schema=create_app().openapi()
    def walk(value):
        if isinstance(value,dict):
            if '$ref' in value:
                ref=value['$ref']
                assert ref.startswith('#/')
                target=schema
                for part in ref[2:].split('/'):
                    target=target[part.replace('~1','/').replace('~0','~')]
            for child in value.values():walk(child)
        elif isinstance(value,list):
            for child in value:walk(child)
    walk(schema)


def test_unapproved_cors_origin_is_not_allowed():
    with TestClient(create_app()) as client:
        response=client.options('/health/live',headers={
            'Origin':'https://synthetic.invalid','Access-Control-Request-Method':'POST'})
        assert 'access-control-allow-origin' not in response.headers
