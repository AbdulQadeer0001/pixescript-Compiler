from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class SourceIn(BaseModel):
    source: str = Field(max_length=100_000)
    program_id: Optional[int] = None  # optionally link the run to a saved program


class DiagnosticOut(BaseModel):
    stage: str
    line: int
    column: int
    message: str
    formatted: str


class EngineOut(BaseModel):
    engine: str
    success: bool
    summary: str
    output: dict[str, Any]
    errors: list[DiagnosticOut]
    blocked_by: Optional[str] = None  # earlier stage that failed, if any
    run_id: Optional[int] = None  # null if the database was unavailable


class CompileOut(BaseModel):
    lexical: EngineOut
    syntax: EngineOut
    semantic: EngineOut
    icg: EngineOut


class ProgramIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    source: str = Field(max_length=100_000)


class ProgramOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    source: str
    created_at: datetime
    updated_at: datetime


class RunSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    program_id: Optional[int]
    engine: str
    success: bool
    summary: str
    created_at: datetime


class RunOut(RunSummaryOut):
    source: str
    output: dict[str, Any]
    errors: list[dict[str, Any]]
