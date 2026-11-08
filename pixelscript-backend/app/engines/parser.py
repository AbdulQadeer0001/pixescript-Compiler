"""Engine 2 - Syntax analyser (recursive-descent parser).

Input : token list (from the lexer)
Output: AST (dict nodes) and a parse-tree view of it. Stops at the first syntax error.

Grammar (see /api/language for the full text):
    program -> press_start? stmt_list EOF
    stmt    -> decl | assign | if_stmt | while_stmt | print_stmt
    expr    -> arith (relop arith)?
    arith   -> term (('[+]'|'[-]') term)*
    term    -> factor (('[*]'|'[/]') factor)*
    factor  -> NUM | STR | win | lose | ID | '(' expr ')'
"""
from .common import Diagnostic
from .lexer import OPERATORS, Token

_SYMBOL_TO_BRACKET = {v: k for k, v in OPERATORS.items()}
_KIND_NAMES = {
    "ID": "an identifier",
    "NUM": "a number",
    "STR": "a string",
    "EOF": "end of file",
}
_RELOPS = ("<", ">", "<=", ">=", "==", "!=")


def _name(kind: str) -> str:
    if kind in _SYMBOL_TO_BRACKET:
        return f"'{_SYMBOL_TO_BRACKET[kind]}'"
    return _KIND_NAMES.get(kind, f"'{kind}'")


class PixelSyntaxError(Exception):
    def __init__(self, diagnostic: Diagnostic):
        super().__init__(diagnostic.formatted)
        self.diagnostic = diagnostic


def _node(kind: str, tok: Token, **fields) -> dict:
    return {"kind": kind, "line": tok.line, "column": tok.column, **fields}


class Parser:
    def __init__(self, tokens: list[Token]):
        self.toks = tokens
        self.pos = 0

    # ---- helpers -------------------------------------------------------
    @property
    def cur(self) -> Token:
        return self.toks[self.pos]

    def peek(self) -> str:
        return self.cur.type

    def advance(self) -> Token:
        tok = self.cur
        if tok.type != "EOF":
            self.pos += 1
        return tok

    def fail(self, message: str, tok: Token | None = None):
        tok = tok or self.cur
        raise PixelSyntaxError(Diagnostic("syntax", tok.line, tok.column, message))

    def match(self, kind: str) -> Token:
        if self.peek() != kind:
            self.fail(f"expected {_name(kind)} but found '{self.cur.lexeme}'")
        return self.advance()

    # ---- grammar -------------------------------------------------------
    def parse(self) -> dict:
        has_start = False
        if self.peek() == "START":
            has_start = True
            self.advance()
        body = self.stmt_list()
        self.match("EOF")
        return {"kind": "program", "has_start": has_start, "body": body}

    def stmt_list(self) -> list[dict]:
        stmts = []
        while self.peek() not in ("EOF", "}"):
            stmts.append(self.stmt())
        return stmts

    def block(self) -> list[dict]:
        self.match("{")
        body = self.stmt_list()
        self.match("}")
        return body

    def stmt(self) -> dict:
        t = self.cur
        k = t.type
        if k in ("INT", "BOOL", "STRING"):
            self.advance()
            name = self.match("ID").lexeme
            init = None
            if self.peek() == "=":
                self.advance()
                init = self.expr()
            self.match(";")
            return _node("decl", t, type_kw=t.lexeme, name=name, init=init)
        if k == "ID":
            self.advance()
            self.match("=")
            value = self.expr()
            self.match(";")
            return _node("assign", t, name=t.lexeme, value=value)
        if k == "IF":
            self.advance()
            self.match("(")
            cond = self.expr()
            self.match(")")
            then = self.block()
            otherwise = None
            if self.peek() == "ELSE":
                self.advance()
                otherwise = self.block()
            return _node("if", t, condition=cond, then=then, otherwise=otherwise)
        if k == "WHILE":
            self.advance()
            self.match("(")
            cond = self.expr()
            self.match(")")
            return _node("while", t, condition=cond, body=self.block())
        if k == "PRINT":
            self.advance()
            self.match("(")
            value = self.expr()
            self.match(")")
            self.match(";")
            return _node("print", t, value=value)
        self.fail(f"a statement cannot start with '{t.lexeme}'")

    def expr(self) -> dict:
        left = self.arith()
        if self.peek() in _RELOPS:
            op = self.advance()
            return _node("binop", op, op=op.type, left=left, right=self.arith())
        return left

    def arith(self) -> dict:
        left = self.term()
        while self.peek() in ("+", "-"):
            op = self.advance()
            left = _node("binop", op, op=op.type, left=left, right=self.term())
        return left

    def term(self) -> dict:
        left = self.factor()
        while self.peek() in ("*", "/"):
            op = self.advance()
            left = _node("binop", op, op=op.type, left=left, right=self.factor())
        return left

    def factor(self) -> dict:
        t = self.cur
        k = t.type
        if k == "NUM":
            self.advance()
            return _node("num", t, value=t.lexeme)
        if k == "STR":
            self.advance()
            return _node("str", t, value=t.lexeme)
        if k in ("TRUE", "FALSE"):
            self.advance()
            return _node("bool", t, value=t.lexeme)
        if k == "ID":
            self.advance()
            return _node("id", t, value=t.lexeme)
        if k == "(":
            self.advance()
            e = self.expr()
            self.match(")")
            return e
        self.fail(f"expected an expression but found '{t.lexeme}'")


def parse(tokens: list[Token]) -> dict:
    return Parser(tokens).parse()


# ---- parse-tree view -----------------------------------------------------
def _group(label: str, children: list[dict]) -> dict:
    return {"label": label, "children": children}


def to_tree(n: dict) -> dict:
    """Convert an AST node into {label, children} for display in the UI."""
    kind = n["kind"]
    if kind == "program":
        return _group("Program", [to_tree(s) for s in n["body"]])
    if kind == "decl":
        kids = [to_tree(n["init"])] if n["init"] else []
        return _group(f"Declaration: {n['type_kw']} {n['name']}", kids)
    if kind == "assign":
        return _group(f"Assignment: {n['name']}", [to_tree(n["value"])])
    if kind == "if":
        kids = [
            _group("Condition", [to_tree(n["condition"])]),
            _group("Then", [to_tree(s) for s in n["then"]]),
        ]
        if n["otherwise"] is not None:
            kids.append(_group("Else", [to_tree(s) for s in n["otherwise"]]))
        return _group("If", kids)
    if kind == "while":
        return _group(
            "While",
            [
                _group("Condition", [to_tree(n["condition"])]),
                _group("Body", [to_tree(s) for s in n["body"]]),
            ],
        )
    if kind == "print":
        return _group("Print", [to_tree(n["value"])])
    if kind == "binop":
        return _group(f"Operator: {n['op']}", [to_tree(n["left"]), to_tree(n["right"])])
    return _group(f"{kind.capitalize()}: {n['value']}", [])


def tree_to_text(tree: dict, depth: int = 0) -> str:
    lines = ["  " * depth + tree["label"]]
    for child in tree["children"]:
        lines.append(tree_to_text(child, depth + 1))
    return "\n".join(lines)
