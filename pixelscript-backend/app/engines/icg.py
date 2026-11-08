"""Engine 4 - Intermediate code generator.

Input : AST (assumed already semantically valid - the pipeline enforces that)
Output: three-address code lines + quadruple table.
"""


class CodeGenerator:
    def __init__(self):
        self.quads: list[dict] = []
        self.temps = 0
        self.labels = 0

    def new_temp(self) -> str:
        self.temps += 1
        return f"t{self.temps}"

    def new_label(self) -> str:
        self.labels += 1
        return f"L{self.labels}"

    def emit(self, op: str, arg1: str = "", arg2: str = "", result: str = ""):
        self.quads.append({"op": op, "arg1": arg1, "arg2": arg2, "result": result})

    def expr(self, e: dict) -> str:
        kind = e["kind"]
        if kind == "bool":
            return "true" if e["value"] == "win" else "false"
        if kind in ("num", "str", "id"):
            return e["value"]
        a = self.expr(e["left"])
        b = self.expr(e["right"])
        t = self.new_temp()
        self.emit(e["op"], a, b, t)
        return t

    def block(self, stmts: list[dict]):
        for s in stmts:
            self.stmt(s)

    def stmt(self, s: dict):
        kind = s["kind"]
        if kind == "decl":
            if s["init"] is not None:
                self.emit("=", self.expr(s["init"]), "", s["name"])
        elif kind == "assign":
            self.emit("=", self.expr(s["value"]), "", s["name"])
        elif kind == "print":
            self.emit("print", self.expr(s["value"]))
        elif kind == "if":
            cond = self.expr(s["condition"])
            l_else = self.new_label()
            l_end = self.new_label() if s["otherwise"] is not None else None
            self.emit("ifFalse", cond, "", l_else)
            self.block(s["then"])
            if l_end:
                self.emit("goto", "", "", l_end)
                self.emit("label", "", "", l_else)
                self.block(s["otherwise"])
                self.emit("label", "", "", l_end)
            else:
                self.emit("label", "", "", l_else)
        elif kind == "while":
            l_start, l_end = self.new_label(), self.new_label()
            self.emit("label", "", "", l_start)
            cond = self.expr(s["condition"])
            self.emit("ifFalse", cond, "", l_end)
            self.block(s["body"])
            self.emit("goto", "", "", l_start)
            self.emit("label", "", "", l_end)

    def tac_lines(self) -> list[str]:
        lines = []
        for q in self.quads:
            op, a1, a2, r = q["op"], q["arg1"], q["arg2"], q["result"]
            if op == "label":
                lines.append(f"{r}:")
            elif op == "=":
                lines.append(f"    {r} = {a1}")
            elif op == "goto":
                lines.append(f"    goto {r}")
            elif op == "ifFalse":
                lines.append(f"    ifFalse {a1} goto {r}")
            elif op == "print":
                lines.append(f"    print {a1}")
            else:
                lines.append(f"    {r} = {a1} {op} {a2}")
        return lines


def generate(program: dict) -> dict:
    g = CodeGenerator()
    g.block(program["body"])
    quads = [{"index": i, **q} for i, q in enumerate(g.quads)]
    return {"tac": g.tac_lines(), "quads": quads}
