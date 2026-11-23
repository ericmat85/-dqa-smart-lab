from uuid import uuid4
from pydantic.json_schema import models_json_schema
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from app.core.config import Settings
from app.core.errors import DomainError
from app.api.routes.health import router
from app.api.contracts import CommandEnvelope, WorkflowTransition


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    app = FastAPI(title="DQA offline core",version="0.1.0")
    app.state.settings = config
    app.include_router(router)

    @app.exception_handler(DomainError)
    async def domain_error(request: Request,error: DomainError):
        return JSONResponse(status_code=error.status_code,
                            content={"error":{"code":error.code,"request_id":str(uuid4())}})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request,error: RequestValidationError):
        return JSONResponse(status_code=422,content={"error":{"code":"INVALID_INPUT","request_id":str(uuid4())}})

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request,error: Exception):
        return JSONResponse(status_code=500,content={"error":{"code":"INTERNAL_ERROR","request_id":str(uuid4())}})

    original=app.openapi
    def contract_schema():
        schema=original()
        contracts, definitions = models_json_schema(
            [(CommandEnvelope, "validation"), (WorkflowTransition, "serialization")],
            ref_template="#/components/schemas/{model}",
        )
        schema.setdefault("components", {}).setdefault("schemas", {}).update(definitions.get("$defs", {}))
        schema["x-offline-contracts"] = {
            "CommandEnvelope": contracts[(CommandEnvelope, "validation")],
            "WorkflowTransition": contracts[(WorkflowTransition, "serialization")],
        }
        schema["x-integration-status"]="NOT_IMPLEMENTED"
        return schema
    app.openapi=contract_schema
    return app
