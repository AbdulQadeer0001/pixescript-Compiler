"""Small shared types. Engines only share this error shape, nothing else."""
from dataclasses import dataclass


@dataclass
class Diagnostic:
    stage: str  # "lexical" | "syntax" | "semantic"
    line: int
    column: int
    message: str

    @property
    def formatted(self) -> str:
        return f"{self.stage.capitalize()} Error at line {self.line}: {self.message}"

    def to_dict(self) -> dict:
        return {
            "stage": self.stage,
            "line": self.line,
            "column": self.column,
            "message": self.message,
            "formatted": self.formatted,
        }
