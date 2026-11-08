import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .config import settings
from .database import Base, SessionLocal, engine
from .routers import engines, language, programs

log = logging.getLogger("pixelscript")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:  # engines still work without the DB
        log.warning("PostgreSQL not reachable at startup (%s). Compiler engines still work; "
                    "saving programs and run history will fail until the database is up.", exc)
    yield


app = FastAPI(
    title="PixelScript Compiler API",
    version="1.0.0",
    description="Lexical, syntax, semantic and intermediate-code engines for the PixelScript language.",
    lifespan=lifespan,
)

# The hosted PixelScript UI needs an explicit origin in addition to local development.
# Keep this allow-list narrow; user-configured origins remain supported.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([
        *settings.cors_origins,
        "https://id-preview--dc93beb8-59a5-456c-9a50-c5e54db2fb50.lovable.app",
    ])),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(language.router)
app.include_router(engines.router)
app.include_router(programs.router)


@app.get("/api/health", tags=["meta"])
def health():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "up"}
    except Exception:
        return {"status": "ok", "database": "down"}
