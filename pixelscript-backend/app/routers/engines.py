from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Run
from ..schemas import CompileOut, EngineOut, RunOut, RunSummaryOut, SourceIn
from ..services.pipeline import RUNNERS, run_all

router = APIRouter(prefix="/api", tags=["engines"])

EngineName = Literal["lexical", "syntax", "semantic", "icg"]


def _log(db: Session, source: str, result: dict, program_id: Optional[int]) -> Optional[int]:
    """Save a run to PostgreSQL. Never lets a database problem break the compiler."""
    try:
        run = Run(
            program_id=program_id,
            engine=result["engine"],
            source=source,
            success=result["success"],
            summary=result["summary"],
            output=result["output"],
            errors=result["errors"],
        )
        db.add(run)
        db.commit()
        return run.id
    except Exception:
        db.rollback()
        return None


@router.post("/engines/{engine}", response_model=EngineOut)
def run_engine(engine: EngineName, body: SourceIn, db: Session = Depends(get_db)):
    """Run ONE engine on its own. Needs only the source text."""
    result = RUNNERS[engine](body.source)
    result["run_id"] = _log(db, body.source, result, body.program_id)
    return result


@router.post("/compile", response_model=CompileOut)
def compile_all(body: SourceIn, db: Session = Depends(get_db)):
    """Convenience: run all four engines and return each engine's own result."""
    results = run_all(body.source)
    for result in results.values():
        result["run_id"] = _log(db, body.source, result, body.program_id)
    return results


@router.get("/runs", response_model=list[RunSummaryOut])
def list_runs(
    engine: Optional[EngineName] = None,
    program_id: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Run).order_by(Run.created_at.desc(), Run.id.desc()).limit(limit)
    if engine:
        stmt = stmt.where(Run.engine == engine)
    if program_id:
        stmt = stmt.where(Run.program_id == program_id)
    return db.scalars(stmt).all()


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    db.delete(run)
    db.commit()
