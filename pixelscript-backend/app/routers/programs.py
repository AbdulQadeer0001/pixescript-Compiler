from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Program
from ..schemas import ProgramIn, ProgramOut

router = APIRouter(prefix="/api/programs", tags=["programs"])


def _get_or_404(db: Session, program_id: int) -> Program:
    program = db.get(Program, program_id)
    if not program:
        raise HTTPException(404, "Program not found")
    return program


@router.get("", response_model=list[ProgramOut])
def list_programs(db: Session = Depends(get_db)):
    return db.scalars(select(Program).order_by(Program.updated_at.desc())).all()


@router.post("", response_model=ProgramOut, status_code=201)
def create_program(body: ProgramIn, db: Session = Depends(get_db)):
    program = Program(name=body.name, source=body.source)
    db.add(program)
    db.commit()
    return program


@router.get("/{program_id}", response_model=ProgramOut)
def get_program(program_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, program_id)


@router.put("/{program_id}", response_model=ProgramOut)
def update_program(program_id: int, body: ProgramIn, db: Session = Depends(get_db)):
    program = _get_or_404(db, program_id)
    program.name, program.source = body.name, body.source
    db.commit()
    return program


@router.delete("/{program_id}", status_code=204)
def delete_program(program_id: int, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, program_id))
    db.commit()
