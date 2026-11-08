# PixelScript Compiler

A web-based compiler for **PixelScript**, a custom gaming-themed programming language. Write PixelScript in the browser and inspect what each compiler phase produces, with every phase running as its own independent engine.

Built as a Compiler Construction course project at the University of Karachi (UBIT).

---

## Features

- **Custom language:** PixelScript, with its keywords, operators, and grammar shown in the UI
- **Four independent engines**, each with its own output panel:
  1. **Lexical:** source code to tokens, with lexical errors
  2. **Syntax:** tokens to a parse tree, with syntax errors
  3. **Semantic:** symbol table and semantic errors
  4. **Intermediate Code:** three-address code (TAC) and quadruples
- **Precise diagnostics:** line and column on every error; the lexer reports all lexical errors instead of stopping at the first
- **Saved programs and run history** stored in PostgreSQL
- **REST API** with interactive docs (FastAPI)

---

## How It Works

```
source ──▶ Lexical ──▶ Syntax ──▶ Semantic ──▶ Intermediate Code
          (tokens)    (parse tree) (symbol table) (TAC + quadruples)
```

Each engine has its own endpoint that needs only the source text. If an engine depends on an earlier stage and that stage fails, the response returns `success: false` with `blocked_by` set to the failing stage and its errors, so the UI can show exactly where compilation stopped.

---

## Tech Stack

| Layer    | Technology                      |
|----------|---------------------------------|
| Frontend | React, Vite, Tailwind CSS       |
| Backend  | Python, FastAPI, SQLAlchemy     |
| Database | PostgreSQL                      |
| Tests    | pytest (temporary SQLite file)  |

---

## Repository Structure

```
pixescript-Compiler/
├── pixe-script-frontend/    # React + Vite + Tailwind UI
├── pixelscript-backend/     # FastAPI app, 4 compiler engines, DB models
│   ├── app/
│   │   ├── engines/         # lexer.py, parser.py, semantic.py, icg.py, common.py
│   │   ├── services/        # pipeline.py (source in, uniform response out)
│   │   ├── routers/         # engines.py, programs.py, language.py
│   │   ├── language.py      # keywords, operators, grammar, example programs
│   │   ├── models.py        # SQLAlchemy tables
│   │   └── main.py          # FastAPI app
│   └── tests/test_engines.py
└── README.md
```

The engines are pure Python with no web or database code; only the small `Diagnostic` error type is shared between them.

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Docker (for PostgreSQL), or your own PostgreSQL instance

### 1. Clone

```bash
git clone https://github.com/AbdulQadeer0001/pixescript-Compiler.git
cd pixescript-Compiler
```

### 2. Backend

```bash
cd pixelscript-backend

# PostgreSQL (or use your own instance)
docker compose up -d

# Python environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Config (optional, defaults match docker-compose.yml)
cp .env.example .env

# Run
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Tables (`programs`, `runs`) are created automatically on startup.

### 3. Frontend

```bash
cd pixe-script-frontend
npm install
npm run dev
```

The UI runs at http://localhost:5173 by default.

### Run the tests

```bash
cd pixelscript-backend
python -m pytest -q
```

---

## Example

```
spawn_int a [=] 2 [+] 3;
render(a);
```

Try it against the Intermediate Code engine:

```bash
curl -s localhost:8000/api/engines/icg -H 'content-type: application/json' \
  -d '{"source":"spawn_int a [=] 2 [+] 3;\nrender(a);"}'
```

The full keyword, operator, and grammar reference is served at `GET /api/language`, and sample programs (valid ones plus one per error type) at `GET /api/examples`.

---

## API Overview

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/language` | Keywords, operators, data types, grammar |
| GET | `/api/examples` | Sample programs |
| POST | `/api/engines/{engine}` | Run one engine: `lexical`, `syntax`, `semantic`, or `icg` |
| POST | `/api/compile` | Run all four engines |
| GET/POST | `/api/programs` | List / save programs |
| GET/PUT/DELETE | `/api/programs/{id}` | Read / update / delete a saved program |
| GET | `/api/runs` | Run history (filter by `engine`, `program_id`, `limit`) |
| GET/DELETE | `/api/runs/{id}` | One run / delete it |
| GET | `/api/health` | API and database status |

Detailed request and response shapes are in [`pixelscript-backend/README.md`](pixelscript-backend/README.md).

---

