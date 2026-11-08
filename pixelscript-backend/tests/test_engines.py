import os

if os.path.exists("test_pixelscript.db"):
    os.remove("test_pixelscript.db")  # every test session starts with an empty database
os.environ["DATABASE_URL"] = "sqlite:///./test_pixelscript.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.language import EXAMPLES  # noqa: E402
from app.main import app  # noqa: E402
from app.services.pipeline import run_icg, run_lexical, run_semantic, run_syntax  # noqa: E402

EX = {e["id"]: e["source"] for e in EXAMPLES}
LAB, CRICKET = EX["lab-sample"], EX["cricket-chase"]
LEX_BAD, SYN_BAD, SEM_BAD = EX["lexical-error"], EX["syntax-error"], EX["semantic-errors"]

EXPECTED_TAC = """score = 5
target = 10
winner = false
msg = "level complete"
t1 = target * 2
t2 = score + t1
total = t2
t3 = total > 20
ifFalse t3 goto L1
winner = true
goto L2
L1:
winner = false
L2:
L3:
t4 = score < target
ifFalse t4 goto L4
t5 = score + 1
score = t5
goto L3
L4:
print total
print msg""".splitlines()


def test_lexical_ok():
    r = run_lexical(LAB)
    assert r["success"] and r["output"]["counts"]["KEYWORD"] > 0


def test_lexical_errors_collected():
    r = run_lexical(LEX_BAD)
    assert not r["success"] and len(r["errors"]) == 2
    assert "malformed operator" in r["errors"][0]["message"]
    assert "unknown character '@'" in r["errors"][1]["message"]


def test_syntax_ok():
    r = run_syntax(LAB)
    assert r["success"] and "Declaration: spawn_int score" in r["output"]["tree_text"]


def test_syntax_missing_semicolon():
    r = run_syntax(SYN_BAD)
    assert not r["success"] and r["blocked_by"] is None
    assert r["errors"][0]["formatted"] == "Syntax Error at line 4: expected ';' but found 'total'"


def test_syntax_blocked_by_lexical():
    assert run_syntax(LEX_BAD)["blocked_by"] == "lexical"


def test_semantic_ok():
    r = run_semantic(LAB)
    assert r["success"]
    assert [(s["name"], s["type"], s["line"]) for s in r["output"]["symbols"]] == [
        ("score", "integer", 2), ("target", "integer", 3), ("total", "integer", 4),
        ("winner", "boolean", 5), ("msg", "string", 6)]


def test_semantic_six_errors():
    r = run_semantic(SEM_BAD)
    assert [e["formatted"] for e in r["errors"]] == [
        "Semantic Error at line 3: variable 'score' is already declared at line 2",
        "Semantic Error at line 5: cannot store integer value in boolean variable 'ready'",
        "Semantic Error at line 6: variable 'missing' is not declared",
        "Semantic Error at line 7: operator '+' needs integer operands but got integer and string",
        "Semantic Error at line 8: condition must be boolean but it is integer",
        "Semantic Error at line 11: operator '==' cannot compare integer with string",
    ]


def test_icg_matches_lab_output():
    r = run_icg(LAB)
    assert r["success"]
    assert [l.strip() for l in r["output"]["tac"]] == EXPECTED_TAC
    assert len(r["output"]["quads"]) == 23


def test_icg_blocked_by_semantic():
    r = run_icg(SEM_BAD)
    assert not r["success"] and r["blocked_by"] == "semantic"
    assert r["summary"] == "Code not generated because of semantic errors"


def test_cricket_example_compiles():
    assert run_icg(CRICKET)["success"]


def test_extra_checks():
    assert "division by zero" in run_semantic("spawn_int a [=] 4 [/] 0;")["errors"][0]["message"]
    assert not run_semantic("spawn_int x [=] x;")["success"]


def test_preview_origin_is_allowed_by_cors():
    origin = "https://id-preview--dc93beb8-59a5-456c-9a50-c5e54db2fb50.lovable.app"
    response = TestClient(app).options(
        "/api/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_api_end_to_end():
    with TestClient(app) as c:
        assert c.get("/api/language").json()["name"] == "PixelScript"
        r = c.post("/api/engines/semantic", json={"source": SEM_BAD})
        data = r.json()
        assert r.status_code == 200 and len(data["errors"]) == 6 and data["run_id"]
        assert c.post("/api/engines/bogus", json={"source": ""}).status_code == 422
        all4 = c.post("/api/compile", json={"source": LAB}).json()
        assert all(all4[k]["success"] for k in ("lexical", "syntax", "semantic", "icg"))
        pid = c.post("/api/programs", json={"name": "demo", "source": LAB}).json()["id"]
        c.post("/api/engines/icg", json={"source": LAB, "program_id": pid})
        runs = c.get("/api/runs", params={"program_id": pid}).json()
        assert len(runs) == 1 and c.get(f"/api/runs/{runs[0]['id']}").json()["output"]["tac"]
        assert c.delete(f"/api/programs/{pid}").status_code == 204
