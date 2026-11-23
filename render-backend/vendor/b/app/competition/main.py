"""Independent competition factory; existing app.main remains untouched."""
from fastapi import FastAPI,Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from .config import CompetitionSettings
from .ai_adapter import DenyProvider
from .routes import router,error_response
from .signature_contracts import SIGNATURE_PATH,signature_error_response
from .signature_routes import SignatureBodyLimit


class OriginGate:
    def __init__(self,app,allowed_origins):
        self.app=app;self.allowed=frozenset(allowed_origins)

    async def __call__(self,scope,receive,send):
        if scope['type']=='http':
            origins=[v for k,v in scope.get('headers',[]) if k.lower()==b'origin']
            if origins and (len(origins)!=1 or origins[0].decode('latin1') not in self.allowed):
                error_factory=signature_error_response if scope.get('path')==SIGNATURE_PATH else error_response
                response=error_factory(403,'origin_denied','ORIGIN_NOT_ALLOWED','Origin is not allowed.')
                await response(scope,receive,send);return
        await self.app(scope,receive,send)


def create_app(settings: CompetitionSettings | None=None, *, provider=None, access_verifier=None, security_wiring=None) -> FastAPI:
    settings=settings or CompetitionSettings()
    app=FastAPI(title='DQA competition offline advisory PoC',version='1.0.0')
    app.state.competition_provider=provider if provider is not None else DenyProvider()
    from .security_wiring import SecurityWiring, DisabledAdviceService, ExplicitOfflineCompatibilityService
    if security_wiring is not None:
        if provider is not None or access_verifier is not None or type(security_wiring) is not SecurityWiring:
            raise ValueError('Conflicting security dependencies')
        app.state.competition_advice_service=security_wiring
    elif provider is not None:
        app.state.competition_advice_service=ExplicitOfflineCompatibilityService(provider)
    else:
        app.state.competition_advice_service=DisabledAdviceService()
    app.include_router(router)
    app.add_middleware(CORSMiddleware,allow_origins=list(settings.allowed_origins),
        allow_credentials=False,allow_methods=['POST'],allow_headers=['Content-Type', 'Authorization'] if access_verifier is not None or security_wiring is not None else ['Content-Type'])
    app.add_middleware(SignatureBodyLimit)
    if access_verifier is not None:
        from .access_control import AccessGate
        app.add_middleware(AccessGate, verifier=access_verifier)
    app.add_middleware(OriginGate,allowed_origins=settings.allowed_origins)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request: Request,error: RequestValidationError):
        error_factory=signature_error_response if request.url.path==SIGNATURE_PATH else error_response
        return error_factory(422,'validation_error','INVALID_INPUT','Request does not match the contract.')

    @app.exception_handler(Exception)
    async def unexpected(request: Request,error: Exception):
        error_factory=signature_error_response if request.url.path==SIGNATURE_PATH else error_response
        return error_factory(500,'internal_error','INTERNAL_ERROR','Request could not be completed.')

    return app
