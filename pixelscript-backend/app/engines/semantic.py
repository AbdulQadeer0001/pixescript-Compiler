"""Engine 3 - Semantic analyser.

Input : AST (from the parser)
Output: symbol table + semantic errors (all errors are collected).

Rules checked:
  1. duplicate declaration
  2. use of an undeclared variable (in expressions and assignments)
  3. assignment / initialiser type must match the variable's type
  4. arithmetic and <, >, <=, >= need integer operands
  5. == and != need operands of the same type
  6. if / while conditions must be boolean
  extra: division by a literal zero
Scope: one global scope (blocks do not open a new scope), same as the lab reference.
"""
from .common import Diagnostic

TYPEMAP = {"spawn_int": "integer", "spawn_bool": "boolean", "spawn_text": "string"}
_ARITH = ("+", "-", "*", "/")
_ORDER = ("<", ">", "<=", ">=")


class SemanticAnalyzer:
    def __init__(self):
        self.symbols: dict[str, dict] = {}
        self.errors: list[Diagnostic] = []

    def err(self, node: dict, message: str):
        self.errors.append(Diagnostic("semantic", node["line"], node["column"], message))

    def visit_block(self, stmts: list[dict]):
        for s in stmts:
            self.visit(s)

    def visit(self, s: dict):
        kind = s["kind"]
        if kind == "decl":
            name, declared = s["name"], TYPEMAP[s["type_kw"]]
            duplicate = name in self.symbols
            if duplicate:
                self.err(s, f"variable '{name}' is already declared at line {self.symbols[name]['line']}")
            # evaluate the initialiser BEFORE the new name exists (so `spawn_int x [=] x;` is caught)
            got = self.type_of(s["init"]) if s["init"] else None
            if not duplicate:
                self.symbols[name] = {"type": declared, "line": s["line"]}
            if got and got != declared:
                self.err(s, f"cannot store {got} value in {declared} variable '{name}'")
        elif kind == "assign":
            got = self.type_of(s["value"])
            name = s["name"]
            if name not in self.symbols:
                self.err(s, f"variable '{name}' is not declared")
            else:
                want = self.symbols[name]["type"]
                if got and got != want:
                    self.err(s, f"cannot store {got} value in {want} variable '{name}'")
        elif kind in ("if", "while"):
            got = self.type_of(s["condition"])
            if got and got != "boolean":
                self.err(s, f"condition must be boolean but it is {got}")
            if kind == "if":
                self.visit_block(s["then"])
                if s["otherwise"] is not None:
                    self.visit_block(s["otherwise"])
            else:
                self.visit_block(s["body"])
        elif kind == "print":
            self.type_of(s["value"])

    def type_of(self, e: dict) -> str | None:
        kind = e["kind"]
        if kind == "num":
            return "integer"
        if kind == "str":
            return "string"
        if kind == "bool":
            return "boolean"
        if kind == "id":
            if e["value"] not in self.symbols:
                self.err(e, f"variable '{e['value']}' is not declared")
                return None
            return self.symbols[e["value"]]["type"]

        # binary operation
        op = e["op"]
        lt, rt = self.type_of(e["left"]), self.type_of(e["right"])
        if lt is None or rt is None:
            return None
        if op in _ARITH or op in _ORDER:
            if lt != "integer" or rt != "integer":
                self.err(e, f"operator '{op}' needs integer operands but got {lt} and {rt}")
                return None
            if op == "/" and e["right"]["kind"] == "num" and int(e["right"]["value"]) == 0:
                self.err(e, "division by zero")
                return None
            return "boolean" if op in _ORDER else "integer"
        if lt != rt:  # == and !=
            self.err(e, f"operator '{op}' cannot compare {lt} with {rt}")
            return None
        return "boolean"


def analyze(program: dict) -> dict:
    a = SemanticAnalyzer()
    a.visit_block(program["body"])
    errors = sorted(a.errors, key=lambda d: d.line)  # stable: keeps emission order within a line
    symbols = [{"name": n, "type": i["type"], "line": i["line"]} for n, i in a.symbols.items()]
    return {"symbols": symbols, "errors": errors}
