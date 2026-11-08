from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# JSONB on PostgreSQL, plain JSON elsewhere (lets the tests run on SQLite)
JSONType = JSON().with_variant(JSONB(), "postgresql")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Program(Base):
    """A saved PixelScript source file."""

    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    runs: Mapped[list["Run"]] = relationship(back_populates="program", passive_deletes=True)


class Run(Base):
    """History: one row per engine execution."""

    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("programs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    engine: Mapped[str] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(Text)
    success: Mapped[bool] = mapped_column(Boolean)
    summary: Mapped[str] = mapped_column(String(255))
    output: Mapped[dict] = mapped_column(JSONType)
    errors: Mapped[list] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    program: Mapped[Optional[Program]] = relationship(back_populates="runs")
