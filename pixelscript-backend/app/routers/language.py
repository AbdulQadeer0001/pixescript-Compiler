from fastapi import APIRouter, HTTPException

from ..language import EXAMPLES, LANGUAGE

router = APIRouter(prefix="/api", tags=["language"])


@router.get("/language")
def get_language():
    """Keywords, operators, data types and grammar - for the language panel in the UI."""
    return LANGUAGE


@router.get("/examples")
def list_examples():
    return EXAMPLES


@router.get("/examples/{example_id}")
def get_example(example_id: str):
    for ex in EXAMPLES:
        if ex["id"] == example_id:
            return ex
    raise HTTPException(404, "Example not found")
