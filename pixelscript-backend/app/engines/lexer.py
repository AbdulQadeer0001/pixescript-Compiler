"""Engine 1 - Lexical analyser.

Input : source text
Output: list of tokens + list of lexical errors (all errors are collected, not just the first).
"""
import re
from dataclasses import asdict, dataclass

from .common import Diagnostic

KEYWORDS = {
    "press_start": "START",
    "spawn_int": "INT",
    "spawn_bool": "BOOL",
    "spawn_text": "STRING",
    "render": "PRINT",
    "check_point": "IF",
    "respawn": "ELSE",
    "grind": "WHILE",
    "win": "TRUE",
    "lose": "FALSE",
}

# bracketed PixelScript operator -> plain symbol used as token type
OPERATORS = {
    "[=]": "=",
    "[+]": "+",
    "[-]": "-",
    "[*]": "*",
    "[/]": "/",
    "[>]": ">",
    "[<]": "<",
    "[==]": "==",
    "[>=]": ">=",
    "[<=]": "<=",
    "[!=]": "!=",
}

_TOKEN_SPEC = [
    ("COMMENT", r"//[^\n]*"),
    ("NUM", r"\d+"),
    ("STR", r'"[^"\n]*"'),
    ("BADSTR", r'"[^"\n]*'),  # only reached when the closing quote is missing
    ("ID", r"[A-Za-z_][A-Za-z0-9_]*"),
    ("OP", r"\[(?:==|>=|<=|!=|=|\+|-|\*|/|>|<)\]"),
    ("DELIM", r"[;(){}]"),
    ("BADOP", r"\[[^\s\];]*\]?"),  # a '[' that did not form a valid operator
    ("NL", r"\n"),
    ("SKIP", r"[ \t\r]+"),
    ("BAD", r"."),
]
_MASTER = re.compile("|".join(f"(?P<{n}>{p})" for n, p in _TOKEN_SPEC))


@dataclass
class Token:
    type: str  # what the parser matches on (INT, ID, NUM, '+', ';', EOF ...)
    lexeme: str  # exact text from the source
    line: int
    column: int
    category: str  # KEYWORD | IDENTIFIER | NUMBER | STRING | OPERATOR | DELIMITER | EOF

    def to_dict(self) -> dict:
        return asdict(self)


def tokenize(source: str) -> tuple[list[Token], list[Diagnostic]]:
    tokens: list[Token] = []
    errors: list[Diagnostic] = []
    line, line_start = 1, 0

    for m in _MASTER.finditer(source):
        kind, text = m.lastgroup, m.group()
        col = m.start() - line_start + 1

        if kind == "NL":
            line += 1
            line_start = m.end()
        elif kind in ("SKIP", "COMMENT"):
            continue
        elif kind == "NUM":
            tokens.append(Token("NUM", text, line, col, "NUMBER"))
        elif kind == "STR":
            tokens.append(Token("STR", text, line, col, "STRING"))
        elif kind == "ID":
            if text in KEYWORDS:
                tokens.append(Token(KEYWORDS[text], text, line, col, "KEYWORD"))
            else:
                tokens.append(Token("ID", text, line, col, "IDENTIFIER"))
        elif kind == "OP":
            tokens.append(Token(OPERATORS[text], text, line, col, "OPERATOR"))
        elif kind == "DELIM":
            tokens.append(Token(text, text, line, col, "DELIMITER"))
        elif kind == "BADSTR":
            errors.append(Diagnostic("lexical", line, col, "unterminated string literal (missing closing '\"')"))
        elif kind == "BADOP":
            errors.append(Diagnostic(
                "lexical", line, col,
                f"malformed operator '{text}' (PixelScript operators are bracketed, e.g. [+] or [==])"))
        elif kind == "BAD":
            errors.append(Diagnostic("lexical", line, col, f"unknown character '{text}'"))

    tokens.append(Token("EOF", "end of file", line, len(source) - line_start + 1, "EOF"))
    return tokens, errors
