export type EngineName = "lexical" | "syntax" | "semantic" | "icg";

export interface Diagnostic {
  stage: string;
  line: number;
  column: number;
  message: string;
  formatted: string;
}

export interface SyntaxTree {
  label: string;
  children?: SyntaxTree[];
}

export interface TokenRecord {
  index: number;
  type: string;
  lexeme: string;
  line: number;
  column: number;
  category: string;
}

export interface SymbolRecord {
  name: string;
  type: string;
  line: number;
}

export interface Quadruple {
  index: number;
  op: string;
  arg1: string | null;
  arg2: string | null;
  result: string | null;
}

export interface EngineOutput {
  tokens?: TokenRecord[];
  token_count?: number;
  counts?: Record<string, number>;
  tree?: SyntaxTree | null;
  tree_text?: string;
  symbols?: SymbolRecord[];
  tac?: string[];
  quads?: Quadruple[];
}

export interface EngineResponse {
  engine: EngineName;
  success: boolean;
  summary: string;
  output: EngineOutput;
  errors: Diagnostic[];
  blocked_by: EngineName | null;
  run_id: number | null;
}

export interface CompileResponse {
  lexical: EngineResponse;
  syntax: EngineResponse;
  semantic: EngineResponse;
  icg: EngineResponse;
}

export interface LanguageReference {
  name: string;
  description: string;
  keywords: { keyword: string; purpose: string; token: string }[];
  operators: { symbol: string; purpose: string }[];
  data_types: { keyword: string; type: string; example: string }[];
  grammar: string;
}

export interface PixelScriptExample {
  id: string;
  title: string;
  description: string;
  source: string;
}

export interface SavedProgram {
  id: number;
  name: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface RunSummary {
  id: number;
  program_id: number | null;
  engine: EngineName;
  success: boolean;
  summary: string;
  created_at: string;
}

export interface RunDetail extends RunSummary {
  source: string;
  output: EngineOutput;
  errors: Diagnostic[];
}

const API_BASE = (import.meta.env["VITE_API_URL"] ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(`Could not reach FastAPI at ${API_BASE}.`);
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the HTTP status message when the response has no JSON body.
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export const getLanguage = () => request<LanguageReference>("/api/language");
export const getExamples = () => request<PixelScriptExample[]>("/api/examples");
export const checkHealth = () => request<{ status: string; database: string }>("/api/health");

export const runEngine = (engine: EngineName, source: string, programId: number | null = null) =>
  request<EngineResponse>(`/api/engines/${engine}`, {
    method: "POST",
    body: JSON.stringify({ source, program_id: programId }),
  });

export const runAll = (source: string, programId: number | null = null) =>
  request<CompileResponse>("/api/compile", {
    method: "POST",
    body: JSON.stringify({ source, program_id: programId }),
  });

export const listPrograms = () => request<SavedProgram[]>("/api/programs");
export const getProgram = (id: number) => request<SavedProgram>(`/api/programs/${id}`);
export const saveProgram = (name: string, source: string) =>
  request<SavedProgram>("/api/programs", {
    method: "POST",
    body: JSON.stringify({ name, source }),
  });
export const updateProgram = (id: number, name: string, source: string) =>
  request<SavedProgram>(`/api/programs/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, source }),
  });
export const deleteProgram = (id: number) =>
  request<null>(`/api/programs/${id}`, { method: "DELETE" });

export const listRuns = (limit = 20) => request<RunSummary[]>(`/api/runs?limit=${limit}`);
export const getRun = (id: number) => request<RunDetail>(`/api/runs/${id}`);
export const deleteRun = (id: number) => request<null>(`/api/runs/${id}`, { method: "DELETE" });