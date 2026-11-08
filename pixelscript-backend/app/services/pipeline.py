"""Glue between the API and the four engines.

Every run_* function takes ONLY the source text, so each engine can be called on its own.
If an engine needs an earlier stage to succeed, that stage is run internally and its failure is
reported as `blocked_by` - but the response still only carries the requested engine's own output.
"""
from collections import Counter

from ..engines import icg, semantic
from ..engines.common import Diagnostic
from ..engines.lexer import tokenize
from ..engines.parser import PixelSyntaxError, parse, to_tree, tree_to_text


def _resp(engine: str, success: bool, summary: str, output: dict,
          errors: list[Diagnostic], blocked_by: str | None = None) -> dict:
    return {
        "engine": engine,
        "success": success,
        "summary": summary,
        "output": output,
        "errors": [e.to_dict() for e in errors],
        "blocked_by": blocked_by,
    }


def _front_end(source: str):
    """Lex + parse. Returns (ast, failed_stage, errors)."""
    tokens, lex_errors = tokenize(source)
    if lex_errors:
        return None, "lexical", lex_errors
    try:
        return parse(tokens), None, []
    except PixelSyntaxError as exc:
        return None, "syntax", [exc.diagnostic]


# ---- Engine 1 ---------------------------------------------------------------
def run_lexical(source: str) -> dict:
    tokens, errors = tokenize(source)
    shown = [{"index": i, **t.to_dict()} for i, t in enumerate(tokens)]
    real = [t for t in tokens if t.category != "EOF"]
    output = {
        "tokens": shown,
        "token_count": len(real),
        "counts": dict(Counter(t.category for t in real)),
    }
    if errors:
        return _resp("lexical", False, f"{len(errors)} lexical error(s) found", output, errors)
    return _resp("lexical", True, f"No lexical errors - {len(real)} token(s) found", output, [])


# ---- Engine 2 ---------------------------------------------------------------
def run_syntax(source: str) -> dict:
    empty = {"tree": None, "tree_text": ""}
    ast, failed, errors = _front_end(source)
    if failed == "lexical":
        return _resp("syntax", False, "Syntax analysis skipped: fix the lexical errors first",
                     empty, errors, blocked_by="lexical")
    if failed == "syntax":
        return _resp("syntax", False, "Syntax is NOT correct", empty, errors)
    tree = to_tree(ast)
    return _resp("syntax", True, "Syntax is correct",
                 {"tree": tree, "tree_text": tree_to_text(tree)}, [])


# ---- Engine 3 ---------------------------------------------------------------
def run_semantic(source: str) -> dict:
    empty = {"symbols": []}
    ast, failed, errors = _front_end(source)
    if failed:
        return _resp("semantic", False, f"Semantic analysis skipped: fix the {failed} errors first",
                     empty, errors, blocked_by=failed)
    result = semantic.analyze(ast)
    output = {"symbols": result["symbols"]}
    if result["errors"]:
        return _resp("semantic", False, f"{len(result['errors'])} semantic error(s) found",
                     output, result["errors"])
    return _resp("semantic", True, "No semantic errors", output, [])


# ---- Engine 4 ---------------------------------------------------------------
def run_icg(source: str) -> dict:
    empty = {"tac": [], "quads": []}
    ast, failed, errors = _front_end(source)
    if failed:
        return _resp("icg", False, f"Code not generated because of {failed} errors",
                     empty, errors, blocked_by=failed)
    sem = semantic.analyze(ast)
    if sem["errors"]:
        return _resp("icg", False, "Code not generated because of semantic errors",
                     empty, sem["errors"], blocked_by="semantic")
    output = icg.generate(ast)
    return _resp("icg", True, f"Generated {len(output['quads'])} quadruple(s)", output, [])


RUNNERS = {
    "lexical": run_lexical,
    "syntax": run_syntax,
    "semantic": run_semantic,
    "icg": run_icg,
}


def run_all(source: str) -> dict:
    return {name: fn(source) for name, fn in RUNNERS.items()}
