  import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode2,
  Keyboard,
  Languages,
  LoaderCircle,
  Play,
  Save,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type Diagnostic,
  type EngineName,
  type EngineResponse,
  type LanguageReference,
  type PixelScriptExample,
  type RunDetail,
  type RunSummary,
  type SavedProgram,
  type SyntaxTree,
  checkHealth,
  deleteProgram,
  deleteRun,
  getExamples,
  getLanguage,
  getProgram,
  getRun,
  listPrograms,
  listRuns,
  runAll,
  runEngine,
  saveProgram,
  updateProgram,
} from "@/lib/pixelscript-api";
import { cn } from "@/lib/utils";

const ENGINE_ORDER: EngineName[] = ["lexical", "syntax", "semantic", "icg"];
const ENGINE_LABELS: Record<EngineName, string> = {
  lexical: "Lexical",
  syntax: "Syntax",
  semantic: "Semantic",
  icg: "Intermediate Code",
};
const STARTER_SOURCE = `press_start
spawn_int score [=] 5;
spawn_int target [=] 10;
spawn_int total;
spawn_bool winner [=] lose;
spawn_text msg [=] "level complete";
total [=] score [+] target [*] 2;
check_point (total [>] 20) {
    winner [=] win;
} respawn {
    winner [=] lose;
}
grind (score [<] target) {
    score [=] score [+] 1;
}
render(total);
render(msg);
`;

interface ResultEntry {
  response: EngineResponse;
  source: string;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PixelScript Compiler — Language Workbench" },
      {
        name: "description",
        content: "Write PixelScript and inspect lexical, syntax, semantic, and intermediate-code results.",
      },
      { property: "og:title", content: "PixelScript Compiler — Language Workbench" },
      {
        property: "og:description",
        content: "A focused compiler workbench for the PixelScript language.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Press+Start+2P&display=swap",
      },
    ],
  }),
  component: PixelScriptWorkbench,
});

function PixelScriptWorkbench() {
  const [source, setSource] = useState(STARTER_SOURCE);
  const sourceTouchedRef = useRef(false);
  const [activeEngine, setActiveEngine] = useState<EngineName>("lexical");
  const [results, setResults] = useState<Partial<Record<EngineName, ResultEntry>>>({});
  const [busyEngine, setBusyEngine] = useState<EngineName | "all" | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [apiChecking, setApiChecking] = useState(false);
  const [language, setLanguage] = useState<LanguageReference | null>(null);
  const [examples, setExamples] = useState<PixelScriptExample[]>([]);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"programs" | "history">("programs");
  const [programs, setPrograms] = useState<SavedProgram[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [currentProgram, setCurrentProgram] = useState<SavedProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [programName, setProgramName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [rawTree, setRawTree] = useState(false);
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const refreshPrograms = useCallback(async () => {
    const list = await listPrograms();
    setPrograms(list);
    setApiConnected(true);
  }, []);

  const refreshRuns = useCallback(async () => {
    const list = await listRuns(40);
    setRuns(list);
    setApiConnected(true);
  }, []);

  const retryApiConnection = useCallback(async () => {
    setApiChecking(true);
    setApiError(null);
    try {
      await checkHealth();
      setApiConnected(true);

      const [languageResult, examplesResult] = await Promise.allSettled([getLanguage(), getExamples()]);
      if (languageResult.status === "fulfilled") setLanguage(languageResult.value);
      if (examplesResult.status === "fulfilled") {
        const list = examplesResult.value;
        setExamples(list);
        if (!sourceTouchedRef.current) {
          const sample = list.find((item) => item.id === "lab-sample");
          if (sample) setSource(sample.source);
        }
      }

      void refreshPrograms().catch(() => setPrograms([]));
      void refreshRuns().catch(() => setRuns([]));
    } catch (error) {
      setApiConnected(false);
      setApiError(error instanceof Error ? error.message : "Could not reach FastAPI.");
    } finally {
      setApiChecking(false);
    }
  }, [refreshPrograms, refreshRuns]);

  useEffect(() => {
    void retryApiConnection();
  }, [retryApiConnection]);

  const lineCount = useMemo(() => Math.max(source.split("\n").length, 1), [source]);
  const currentResult = results[activeEngine];
  const isStale = currentResult ? currentResult.source !== source : false;
  const editorLines = useMemo(() => source.split("\n"), [source]);
  const knownKeywords = language?.keywords.map((item) => item.keyword) ?? [
    "press_start",
    "spawn_int",
    "spawn_bool",
    "spawn_text",
    "render",
    "check_point",
    "respawn",
    "grind",
    "win",
    "lose",
  ];
  const keywordPattern = useMemo(
    () => new RegExp(`(${knownKeywords.map(escapeRegExp).join("|")}|\\[[^\\]]+\\])`, "g"),
    [knownKeywords],
  );

  const runOne = useCallback(
    async (engine: EngineName) => {
      setActiveEngine(engine);
      setBusyEngine(engine);
      setApiError(null);
      try {
        const response = await runEngine(engine, source, currentProgram?.id ?? null);
        setResults((previous) => ({ ...previous, [engine]: { response, source } }));
        setErrorLine(response.errors[0]?.line ?? null);
        void refreshRuns().catch(() => undefined);
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "The engine could not run.");
      } finally {
        setBusyEngine(null);
      }
    },
    [currentProgram, refreshRuns, source],
  );

  const runEveryEngine = useCallback(async () => {
    setBusyEngine("all");
    setApiError(null);
    try {
      const compiled = await runAll(source, currentProgram?.id ?? null);
      setResults(
        Object.fromEntries(
          ENGINE_ORDER.map((engine) => [engine, { response: compiled[engine], source }]),
        ),
      );
      const activeErrors = compiled[activeEngine].errors;
      setErrorLine(activeErrors[0]?.line ?? null);
      void refreshRuns().catch(() => undefined);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "All engines could not run.");
    } finally {
      setBusyEngine(null);
    }
  }, [activeEngine, currentProgram, refreshRuns, source]);

  const selectEngine = (engine: EngineName) => {
    setActiveEngine(engine);
    setRawTree(false);
    if (!results[engine] || results[engine]?.source !== source) void runOne(engine);
  };

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void runOne(activeEngine);
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const nextSource = `${source.slice(0, start)}    ${source.slice(end)}`;
      setSource(nextSource);
      sourceTouchedRef.current = true;
      requestAnimationFrame(() => input.setSelectionRange(start + 4, start + 4));
    }
  };

  const onEditorScroll = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = editor.scrollTop;
      highlightRef.current.scrollLeft = editor.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
  };

  const jumpToError = (diagnostic: Diagnostic) => {
    const editor = editorRef.current;
    if (!editor) return;
    const offset = editorLines.slice(0, Math.max(diagnostic.line - 1, 0)).reduce((sum, line) => sum + line.length + 1, 0);
    const lineHeight = 22.2;
    setErrorLine(diagnostic.line);
    editor.focus();
    editor.setSelectionRange(offset, offset + (editorLines[diagnostic.line - 1]?.length ?? 0));
    editor.scrollTop = Math.max(0, (diagnostic.line - 3) * lineHeight);
    onEditorScroll();
  };

  const insertKeyword = (keyword: string) => {
    const editor = editorRef.current;
    if (!editor) {
      setSource((previous) => `${previous}${previous.endsWith("\n") ? "" : "\n"}${keyword}`);
      sourceTouchedRef.current = true;
      return;
    }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = source[start - 1] ?? "";
    const after = source[end] ?? "";
    const prefix = before && !/\s/.test(before) ? (/[;}]/.test(before) ? "\n" : " ") : "";
    const suffix = after && !/\s/.test(after) ? " " : "";
    const insertion = `${prefix}${keyword}${suffix}`;
    const updated = `${source.slice(0, start)}${insertion}${source.slice(end)}`;
    setSource(updated);
    sourceTouchedRef.current = true;
    setLanguageOpen(false);
    requestAnimationFrame(() => {
      editor.focus();
      const caret = start + insertion.length - suffix.length;
      editor.setSelectionRange(caret, caret);
    });
  };

  const openSaveDialog = () => {
    setProgramName(currentProgram?.name ?? "");
    setSaveOpen(true);
  };

  const handleSaveProgram = async () => {
    const name = programName.trim();
    if (!name) return;
    setSaving(true);
    setApiError(null);
    try {
      const saved = currentProgram
        ? await updateProgram(currentProgram.id, name, source)
        : await saveProgram(name, source);
      setCurrentProgram(saved);
      await refreshPrograms();
      setSaveOpen(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The program could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const openProgram = async (program: SavedProgram) => {
    try {
      const latest = await getProgram(program.id);
      setSource(latest.source);
      sourceTouchedRef.current = true;
      setCurrentProgram(latest);
      setResults({});
      setDrawerOpen(false);
      setErrorLine(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The program could not be opened.");
    }
  };

  const removeProgram = async (program: SavedProgram) => {
    try {
      await deleteProgram(program.id);
      if (currentProgram?.id === program.id) setCurrentProgram(null);
      await refreshPrograms();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The program could not be deleted.");
    }
  };

  const openRun = async (run: RunSummary) => {
    try {
      const detail: RunDetail = await getRun(run.id);
      const response: EngineResponse = {
        engine: detail.engine,
        success: detail.success,
        summary: detail.summary,
        output: detail.output,
        errors: detail.errors,
        blocked_by: null,
        run_id: detail.id,
      };
      setSource(detail.source);
      sourceTouchedRef.current = true;
      setCurrentProgram(null);
      setResults((previous) => ({ ...previous, [detail.engine]: { response, source: detail.source } }));
      setActiveEngine(detail.engine);
      setDrawerOpen(false);
      setErrorLine(detail.errors[0]?.line ?? null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The run could not be restored.");
    }
  };

  const removeRun = async (run: RunSummary) => {
    try {
      await deleteRun(run.id);
      await refreshRuns();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The run could not be deleted.");
    }
  };

  const loadExample = (example: PixelScriptExample) => {
    setSource(example.source);
    sourceTouchedRef.current = true;
    setCurrentProgram(null);
    setResults({});
    setErrorLine(null);
  };

  return (
    <main className="pixel-app min-h-screen text-foreground">
      <header className="pixel-header sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center border-2 border-pixel-green text-pixel-green">
            <Code2 size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="pixel-title text-pixel-text">PixelScript Compiler</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-pixel-dim">
              <span className="status-dot" data-state={apiConnected ? "ok" : "error"} />
              {apiConnected ? "FASTAPI CONNECTED" : "API NOT CONNECTED"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="pixel-toolbar-button" aria-label="Open examples" title="Examples">
                <Braces size={14} /> Examples <ChevronDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 border-2 border-pixel-line bg-pixel-panel text-pixel-text">
              <DropdownMenuLabel className="font-mono text-[10px] text-pixel-dim">LOAD A PROGRAM</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-pixel-line" />
              {examples.map((example) => (
                <DropdownMenuItem
                  key={example.id}
                  onSelect={() => loadExample(example)}
                  className="cursor-pointer items-start gap-2 py-2.5 font-mono focus:bg-pixel-raised focus:text-pixel-green"
                >
                  <FileCode2 className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{example.title}</span>
                    <span className="mt-1 block whitespace-normal text-[10px] text-pixel-dim">{example.description}</span>
                  </span>
                </DropdownMenuItem>
              ))}
              {examples.length === 0 && <p className="px-2 py-3 text-xs text-pixel-dim">Examples load from FastAPI.</p>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="pixel-toolbar-button" aria-label="Save program" title="Save program" onClick={openSaveDialog}>
            <Save size={14} /> <span className="hidden sm:inline">Save</span>
          </Button>
          <Button variant="outline" className="pixel-toolbar-button" aria-label="Open language reference" title="Language reference" onClick={() => setLanguageOpen(true)}>
            <Languages size={14} /> <span className="hidden sm:inline">Language</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1700px] px-3 py-4 md:px-5 lg:px-7">
        {apiError && (
          <Alert variant="destructive" className="mb-4 border-2 border-pixel-pink bg-pixel-panel text-pixel-text">
            <AlertTriangle className="size-4" />
            <AlertTitle className="font-mono text-xs">FastAPI request failed</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-pixel-dim">
              <span className="min-w-0 flex-1">{apiError} Check that the backend is running and allows this preview address.</span>
              <Button variant="outline" size="sm" onClick={() => void retryApiConnection()} disabled={apiChecking}>
                {apiChecking ? <LoaderCircle className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
                {apiChecking ? "CHECKING..." : "RETRY CONNECTION"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.92fr)_minmax(460px,1.08fr)]">
          <section className="pixel-panel flex min-h-[610px] min-w-0 flex-col" aria-label="Source editor">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b-2 border-pixel-line px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 bg-pixel-cyan" />
                <h2 className="text-[11px] font-bold tracking-[0.08em] text-pixel-text">SOURCE EDITOR</h2>
                <span className="truncate border border-pixel-line px-1.5 py-0.5 text-[9px] text-pixel-dim">
                  {currentProgram?.name ?? "untitled.px"}
                </span>
              </div>
              <span className="shrink-0 text-[10px] text-pixel-dim">{lineCount} LINES</span>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="line-gutter soft-scrollbar w-12 shrink-0 overflow-hidden border-r border-pixel-line bg-pixel-bg/50 pt-4 text-right text-pixel-dim"
              >
                {editorLines.map((_, index) => (
                  <div key={index} className={cn("h-[22.2px] px-2", errorLine === index + 1 && "pixel-error-line text-pixel-pink")}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                ))}
              </div>
              <div className="relative min-h-[470px] flex-1 overflow-hidden bg-pixel-bg/50">
                <div ref={highlightRef} aria-hidden="true" className="highlight-layer soft-scrollbar">
                  {editorLines.map((line, index) => (
                    <div key={index} className={cn("min-h-[22.2px]", errorLine === index + 1 && "pixel-error-line")}>
                      {highlightLine(line, keywordPattern, knownKeywords)}{"\n"}
                    </div>
                  ))}
                </div>
                <textarea
                  ref={editorRef}
                  aria-label="PixelScript source code"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    sourceTouchedRef.current = true;
                    setErrorLine(null);
                  }}
                  onKeyDown={onEditorKeyDown}
                  onScroll={onEditorScroll}
                  className="editor-textarea soft-scrollbar"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-pixel-line bg-pixel-raised px-3 py-3 md:px-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-9 border-2 border-pixel-green bg-pixel-green px-3 font-mono text-[10px] font-bold text-primary-foreground shadow-none hover:bg-pixel-green/90"
                  onClick={() => void runOne(activeEngine)}
                  disabled={busyEngine !== null}
                >
                  {busyEngine === activeEngine ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
                  RUN SELECTED ENGINE
                </Button>
                <Button
                  variant="outline"
                  className="h-9 border-2 border-pixel-line bg-pixel-panel px-3 font-mono text-[10px] font-bold text-pixel-text shadow-none hover:border-pixel-cyan hover:bg-pixel-panel hover:text-pixel-cyan"
                  onClick={() => void runEveryEngine()}
                  disabled={busyEngine !== null}
                >
                  {busyEngine === "all" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
                  RUN ALL
                </Button>
              </div>
              <span className="flex items-center gap-1.5 text-[9px] text-pixel-dim">
                <Keyboard size={12} /> CTRL + ENTER
              </span>
            </div>
          </section>

          <section className="pixel-panel flex min-h-[610px] min-w-0 flex-col" aria-label="Engine output">
            <div className="flex items-center justify-between gap-2 border-b-2 border-pixel-line px-3 pt-1 md:px-4">
              <div className="soft-scrollbar flex min-w-0 flex-1 overflow-x-auto">
                {ENGINE_ORDER.map((engine, index) => {
                  const result = results[engine];
                  const stale = !!result && result.source !== source;
                  const state = !result ? "idle" : stale ? "idle" : result.response.blocked_by ? "blocked" : result.response.success ? "ok" : "error";
                  return (
                    <Button
                      variant="ghost"
                      key={engine}
                      className="engine-tab"
                      data-active={activeEngine === engine}
                      data-stale={stale}
                      aria-pressed={activeEngine === engine}
                      onClick={() => selectEngine(engine)}
                    >
                      <span className="status-dot" data-state={state} />
                      <span className="text-[9px] text-current/70">0{index + 1}</span>
                      {engine === "icg" ? <span className="hidden xl:inline">INTERMEDIATE CODE</span> : <span>{ENGINE_LABELS[engine].toUpperCase()}</span>}
                      {engine === "icg" && <span className="xl:hidden">ICG</span>}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-pixel-line bg-pixel-bg/60 px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {currentResult ? (
                  <span className="status-dot" data-state={currentResult.response.blocked_by ? "blocked" : currentResult.response.success ? "ok" : "error"} />
                ) : <span className="status-dot" data-state="idle" />}
                <p className={cn("truncate text-[11px] font-semibold", currentResult && !isStale && (currentResult.response.success ? "text-pixel-green" : currentResult.response.blocked_by ? "text-pixel-amber" : "text-pixel-pink"))}>
                  {busyEngine === activeEngine || busyEngine === "all"
                    ? "Running engine…"
                    : currentResult?.response.summary ?? "Ready to analyze your source"}
                </p>
              </div>
              {isStale && <span className="shrink-0 text-[9px] font-bold text-pixel-amber">SOURCE CHANGED · RE-RUN</span>}
              {currentResult?.response.run_id && <span className="shrink-0 text-[9px] text-pixel-dim">RUN #{currentResult.response.run_id}</span>}
            </div>

            {currentResult?.response.blocked_by && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pixel-line bg-pixel-amber/10 px-4 py-3">
                <p className="text-[11px] text-pixel-amber">Code not generated — fix the {ENGINE_LABELS[currentResult.response.blocked_by].toLowerCase()} errors first.</p>
                <Button variant="outline" className="h-8 border border-pixel-amber bg-transparent px-2 text-[10px] text-pixel-amber shadow-none hover:bg-pixel-amber/10 hover:text-pixel-amber" onClick={() => selectEngine(currentResult.response.blocked_by as EngineName)}>
                  OPEN {ENGINE_LABELS[currentResult.response.blocked_by].toUpperCase()}
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            )}

            <div className="soft-scrollbar min-h-0 flex-1 overflow-auto p-3 md:p-4">
              {!currentResult ? (
                <EmptyOutput engine={activeEngine} running={busyEngine === activeEngine || busyEngine === "all"} />
              ) : (
                <EngineView
                  engine={activeEngine}
                  response={currentResult.response}
                  rawTree={rawTree}
                  setRawTree={setRawTree}
                  expandedNodes={expandedNodes}
                  setExpandedNodes={setExpandedNodes}
                  onJump={jumpToError}
                  stale={isStale}
                  onSwitchEngine={selectEngine}
                />
              )}
            </div>
          </section>
        </div>

        <section className="pixel-drawer mt-5" aria-label="Saved programs and run history">
          <div className="flex min-h-12 items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-5">
              <Button variant="ghost" className="pixel-drawer-tab" data-active={drawerOpen && drawerTab === "programs"} onClick={() => { setDrawerTab("programs"); setDrawerOpen(!drawerOpen || drawerTab !== "programs"); }}>
                SAVED PROGRAMS <span className="ml-1 text-[9px] text-pixel-dim">{programs.length}</span>
              </Button>
              <Button variant="ghost" className="pixel-drawer-tab" data-active={drawerOpen && drawerTab === "history"} onClick={() => { setDrawerTab("history"); setDrawerOpen(!drawerOpen || drawerTab !== "history"); }}>
                RUN HISTORY <span className="ml-1 text-[9px] text-pixel-dim">{runs.length}</span>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[9px] text-pixel-dim sm:inline">{apiConnected ? "LOCAL DATABASE" : "CONNECT FASTAPI FOR PERSISTENCE"}</span>
              <Button variant="ghost" size="icon" className="size-8 text-pixel-dim hover:bg-pixel-raised hover:text-pixel-green" aria-label={drawerOpen ? "Collapse saved programs and history" : "Expand saved programs and history"} title={drawerOpen ? "Collapse" : "Expand"} onClick={() => setDrawerOpen(!drawerOpen)}>
                <ChevronDown className={cn("size-4 transition-transform", drawerOpen && "rotate-180")} />
              </Button>
            </div>
          </div>
          {drawerOpen && (
            <div className="border-t-2 border-pixel-line px-3 py-3 md:px-4">
              {drawerTab === "programs" ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {programs.map((program) => (
                    <div key={program.id} className="flex min-w-0 items-center justify-between gap-3 border border-pixel-line bg-pixel-bg/50 px-3 py-2.5">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openProgram(program)}>
                        <span className="block truncate text-[11px] font-semibold text-pixel-text">{program.name}</span>
                        <span className="mt-1 block text-[9px] text-pixel-dim">UPDATED {formatDate(program.updated_at)}</span>
                      </button>
                      <Button variant="ghost" size="icon" className="size-8 shrink-0 text-pixel-dim hover:bg-pixel-raised hover:text-pixel-pink" aria-label={`Delete ${program.name}`} title="Delete program" onClick={() => void removeProgram(program)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  {programs.length === 0 && <p className="py-4 text-[11px] text-pixel-dim">No saved programs yet. Save a program to keep it here.</p>}
                </div>
              ) : (
                <div className="max-h-72 overflow-auto">
                  <table className="pixel-table">
                    <thead><tr><th>Engine</th><th>Result</th><th>Summary</th><th>Run</th><th /></tr></thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id}>
                          <td className="font-bold">{ENGINE_LABELS[run.engine]}</td>
                          <td><span className={cn("inline-flex items-center gap-1.5", run.success ? "text-pixel-green" : "text-pixel-pink")}><span className="status-dot" data-state={run.success ? "ok" : "error"} />{run.success ? "PASS" : "ISSUES"}</span></td>
                          <td className="max-w-[420px] truncate">{run.summary}</td>
                          <td className="whitespace-nowrap">{formatDate(run.created_at)}</td>
                          <td className="whitespace-nowrap text-right">
                            <Button variant="ghost" className="h-7 px-2 text-[10px] text-pixel-cyan hover:bg-pixel-raised hover:text-pixel-cyan" onClick={() => void openRun(run)}>RESTORE</Button>
                            <Button variant="ghost" size="icon" className="size-7 text-pixel-dim hover:bg-pixel-raised hover:text-pixel-pink" aria-label={`Delete run ${run.id}`} onClick={() => void removeRun(run)}><Trash2 className="size-3" /></Button>
                          </td>
                        </tr>
                      ))}
                      {runs.length === 0 && <tr><td colSpan={5} className="py-4 text-pixel-dim">No runs recorded yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-1 py-4 text-[9px] text-pixel-dim">
          <span>PIXELSCRIPT · LOCAL COMPILER WORKBENCH</span>
          <span>FOUR STAGES · ONE SOURCE FILE</span>
        </footer>
      </div>

      <LanguageDrawer
        open={languageOpen}
        onOpenChange={setLanguageOpen}
        language={language}
        onInsert={insertKeyword}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="border-2 border-pixel-line bg-pixel-panel font-mono text-pixel-text shadow-[4px_4px_0_var(--pixel-bg)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left text-sm">{currentProgram ? "Update program" : "Save program"}</DialogTitle>
            <DialogDescription className="text-left text-xs text-pixel-dim">Keep this source in your local compiler library.</DialogDescription>
          </DialogHeader>
          <label htmlFor="program-name" className="text-[10px] font-bold text-pixel-dim">PROGRAM NAME</label>
          <Input id="program-name" autoFocus maxLength={120} value={programName} onChange={(event) => setProgramName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleSaveProgram(); }} placeholder="e.g. Score counter" className="pixel-surface-input rounded-none font-mono text-sm" />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-9 border-2 border-pixel-line bg-transparent font-mono text-xs text-pixel-text shadow-none hover:bg-pixel-raised" onClick={() => setSaveOpen(false)}>CANCEL</Button>
            <Button className="h-9 border-2 border-pixel-green bg-pixel-green font-mono text-xs text-primary-foreground shadow-none hover:bg-pixel-green/90" disabled={!programName.trim() || saving} onClick={() => void handleSaveProgram()}>
              {saving ? <LoaderCircle className="size-3 animate-spin" /> : <Save className="size-3" />} SAVE PROGRAM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LanguageDrawer({
  open,
  onOpenChange,
  language,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: LanguageReference | null;
  onInsert: (keyword: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="pixel-sheet soft-scrollbar w-[min(94vw,640px)] overflow-y-auto p-0 text-pixel-text sm:max-w-[640px]">
        <SheetHeader className="border-b-2 border-pixel-line p-5 pr-14 text-left">
          <SheetTitle className="font-mono text-base">PixelScript Language</SheetTitle>
          <SheetDescription className="text-xs text-pixel-dim">{language?.description ?? "Language reference from the compiler API."}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 p-5">
          <ReferenceTable title="KEYWORDS" headers={["Keyword", "Purpose", "Token"]}>
            {language?.keywords.map((item) => (
              <tr key={item.keyword}>
                <td><Button variant="ghost" className="h-auto p-0 font-mono text-[11px] font-bold text-pixel-pink hover:bg-transparent hover:text-pixel-pink" onClick={() => onInsert(item.keyword)}>{item.keyword}</Button></td>
                <td>{item.purpose}</td>
                <td className="text-pixel-dim">{item.token}</td>
              </tr>
            ))}
          </ReferenceTable>
          <ReferenceTable title="OPERATORS" headers={["Operator", "Purpose"]}>
            {language?.operators.map((item) => (
              <tr key={item.symbol}>
                <td className="font-bold text-pixel-cyan">{item.symbol}</td>
                <td>{item.purpose}</td>
              </tr>
            ))}
          </ReferenceTable>
          <ReferenceTable title="DATA TYPES" headers={["Declaration", "Type", "Example"]}>
            {language?.data_types.map((item) => (
              <tr key={item.keyword}>
                <td><Button variant="ghost" className="h-auto p-0 font-mono text-[11px] font-bold text-pixel-pink hover:bg-transparent hover:text-pixel-pink" onClick={() => onInsert(item.keyword)}>{item.keyword}</Button></td>
                <td>{item.type}</td>
                <td className="break-all text-pixel-dim">{item.example}</td>
              </tr>
            ))}
          </ReferenceTable>
          <section>
            <h3 className="mb-2 text-[10px] font-bold tracking-widest text-pixel-dim">GRAMMAR</h3>
            <pre className="soft-scrollbar max-h-80 overflow-auto border-2 border-pixel-line bg-pixel-bg p-3 text-[10px] leading-6 text-pixel-cyan">{language?.grammar ?? "Load the local API to view the grammar."}</pre>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReferenceTable({ title, headers, children }: { title: string; headers: string[]; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold tracking-widest text-pixel-dim">{title}</h3>
      <div className="overflow-x-auto border-2 border-pixel-line">
        <table className="pixel-table min-w-full">
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyOutput({ engine, running }: { engine: EngineName; running: boolean }) {
  return (
    <div className="grid min-h-[400px] place-items-center border border-dashed border-pixel-line bg-pixel-bg/40 p-6 text-center">
      <div className="max-w-xs">
        <div className="mx-auto grid size-12 place-items-center border-2 border-pixel-line text-pixel-cyan">
          {running ? <LoaderCircle className="size-5 animate-spin" /> : engine === "icg" ? <Code2 className="size-5" /> : <FileCode2 className="size-5" />}
        </div>
        <h3 className="mt-4 text-xs font-bold text-pixel-text">{running ? "ANALYZING SOURCE" : `${ENGINE_LABELS[engine].toUpperCase()} OUTPUT`}</h3>
        <p className="mt-2 text-[10px] leading-5 text-pixel-dim">{running ? "Your local compiler is processing this engine." : "Run the selected engine to inspect its result."}</p>
      </div>
    </div>
  );
}

function EngineView({
  engine,
  response,
  rawTree,
  setRawTree,
  expandedNodes,
  setExpandedNodes,
  onJump,
  stale,
  onSwitchEngine,
}: {
  engine: EngineName;
  response: EngineResponse;
  rawTree: boolean;
  setRawTree: (value: boolean) => void;
  expandedNodes: Set<string>;
  setExpandedNodes: (value: Set<string>) => void;
  onJump: (diagnostic: Diagnostic) => void;
  stale: boolean;
  onSwitchEngine: (engine: EngineName) => void;
}) {
  const { output } = response;
  return (
    <div className={cn("space-y-4", stale && "opacity-50")}>
      {engine === "lexical" && (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(output.counts ?? {}).map(([category, count]) => <span key={category} className={cn("border border-pixel-line bg-pixel-bg px-2 py-1 text-[9px] font-bold", tokenColor(category))}>{category} <span className="ml-1 text-pixel-text">{count}</span></span>)}
            <span className="border border-pixel-line bg-pixel-bg px-2 py-1 text-[9px] text-pixel-dim">{output.token_count ?? 0} TOKENS</span>
          </div>
          <div className="max-h-[420px] overflow-auto border-2 border-pixel-line">
            <table className="pixel-table min-w-[540px]">
              <thead><tr><th>#</th><th>Type</th><th>Lexeme</th><th>Category</th><th>Line:Col</th></tr></thead>
              <tbody>
                {(output.tokens ?? []).filter((token) => token.category !== "EOF").map((token) => (
                  <tr key={`${token.index}-${token.line}-${token.column}`}>
                    <td className="text-pixel-dim">{token.index}</td><td>{token.type}</td><td className={cn("font-bold", tokenColor(token.category))}>{token.lexeme}</td><td><span className={cn("text-[9px] font-bold", tokenColor(token.category))}>{token.category}</span></td><td className="whitespace-nowrap text-pixel-dim">{token.line}:{token.column}</td>
                  </tr>
                ))}
                {(output.tokens ?? []).filter((token) => token.category !== "EOF").length === 0 && <tr><td colSpan={5} className="py-6 text-center text-pixel-dim">No tokens were returned.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {engine === "syntax" && (
        <>
          {response.success && output.tree && !rawTree && (
            <div className="max-h-[460px] overflow-auto border-2 border-pixel-line bg-pixel-bg p-3">
              <TreeNode node={output.tree} path="0" depth={0} expandedNodes={expandedNodes} setExpandedNodes={setExpandedNodes} />
            </div>
          )}
          {response.success && output.tree_text && rawTree && <pre className="mono-block soft-scrollbar max-h-[460px] overflow-auto border-2 border-pixel-line bg-pixel-bg p-4 text-[11px] leading-6 text-pixel-cyan">{output.tree_text}</pre>}
          {response.success && output.tree && <div className="flex justify-end"><Button variant="outline" className="h-8 border border-pixel-line bg-transparent px-2 font-mono text-[10px] text-pixel-dim shadow-none hover:bg-pixel-raised hover:text-pixel-text" onClick={() => setRawTree(!rawTree)}>{rawTree ? <Braces className="size-3" /> : <Code2 className="size-3" />}{rawTree ? "TREE VIEW" : "RAW TEXT"}</Button></div>}
        </>
      )}
      {engine === "semantic" && (
        <div className="overflow-hidden border-2 border-pixel-line">
          <table className="pixel-table">
            <thead><tr><th>Name</th><th>Type</th><th>Declared at line</th></tr></thead>
            <tbody>
              {(output.symbols ?? []).map((symbol, index) => <tr key={`${symbol.name}-${symbol.line}-${index}`}><td className="font-bold text-pixel-cyan">{symbol.name}</td><td>{symbol.type}</td><td className="text-pixel-dim">{symbol.line}</td></tr>)}
              {(output.symbols ?? []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-pixel-dim">No symbols found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {engine === "icg" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-widest text-pixel-dim"><Code2 className="size-3.5 text-pixel-cyan" /> THREE-ADDRESS CODE</h3>
            <pre className="mono-block soft-scrollbar min-h-44 max-h-[420px] overflow-auto border-2 border-pixel-line bg-pixel-bg p-3 text-[11px] leading-6 text-pixel-green">{(output.tac ?? []).map((line) => line.endsWith(":") ? line : `    ${line}`).join("\n") || "No intermediate code."}</pre>
          </section>
          <section className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-widest text-pixel-dim"><Braces className="size-3.5 text-pixel-amber" /> QUADRUPLES</h3>
            <div className="soft-scrollbar max-h-[420px] overflow-auto border-2 border-pixel-line">
              <table className="pixel-table min-w-[440px]">
                <thead><tr><th>#</th><th>op</th><th>arg1</th><th>arg2</th><th>result</th></tr></thead>
                <tbody>
                  {(output.quads ?? []).map((quad) => <tr key={quad.index}><td className="text-pixel-dim">{quad.index}</td><td className="font-bold text-pixel-pink">{quad.op}</td><td>{quad.arg1 || "—"}</td><td>{quad.arg2 || "—"}</td><td className="text-pixel-cyan">{quad.result || "—"}</td></tr>)}
                  {(output.quads ?? []).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-pixel-dim">No quadruples generated.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {response.errors.length > 0 && (
        <section className="border-t-2 border-pixel-line pt-4">
          <h3 className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-widest text-pixel-pink"><AlertTriangle className="size-3.5" /> DIAGNOSTICS <span className="text-pixel-dim">{response.errors.length}</span></h3>
          <div className="space-y-2">
            {response.errors.map((diagnostic, index) => (
              <Button key={`${diagnostic.line}-${diagnostic.column}-${index}`} variant="ghost" className="h-auto w-full justify-start border border-pixel-line bg-pixel-bg/60 px-3 py-2.5 text-left font-mono hover:bg-pixel-raised" onClick={() => onJump(diagnostic)}>
                <span className="mt-0.5 shrink-0 border border-pixel-pink/50 px-1.5 py-0.5 text-[9px] font-bold text-pixel-pink">L{diagnostic.line}:{diagnostic.column}</span>
                <span className="min-w-0 whitespace-normal text-[10px] leading-5 text-pixel-text">{diagnostic.formatted || diagnostic.message}</span>
                <ChevronRight className="ml-auto size-3 shrink-0 text-pixel-dim" />
              </Button>
            ))}
          </div>
        </section>
      )}
      {!response.success && response.blocked_by && (
        <Button variant="outline" className="h-8 border border-pixel-amber bg-transparent px-2 text-[10px] text-pixel-amber shadow-none hover:bg-pixel-amber/10 hover:text-pixel-amber" onClick={() => onSwitchEngine(response.blocked_by as EngineName)}>
          <ChevronRight className="size-3" /> SWITCH TO {ENGINE_LABELS[response.blocked_by].toUpperCase()}
        </Button>
      )}
      {response.success && response.errors.length === 0 && (
        <div className="flex items-center gap-2 border-t border-pixel-line pt-3 text-[10px] font-semibold text-pixel-green"><Check className="size-3.5" /> No errors reported by this engine.</div>
      )}
    </div>
  );
}

function TreeNode({
  node,
  path,
  depth,
  expandedNodes,
  setExpandedNodes,
}: {
  node: SyntaxTree;
  path: string;
  depth: number;
  expandedNodes: Set<string>;
  setExpandedNodes: (value: Set<string>) => void;
}) {
  const children = node.children ?? [];
  const expandable = children.length > 0;
  const expanded = expandedNodes.size === 0 || expandedNodes.has(path);
  const toggle = () => {
    const next = new Set(expandedNodes);
    if (expanded) {
      if (next.size === 0) {
        collectTreePaths(node, path, next);
        next.delete(path);
      } else {
        next.delete(path);
      }
    } else {
      next.add(path);
    }
    setExpandedNodes(next);
  };
  return (
    <div className={cn("syntax-tree pl-2", depth === 1 && "ml-2", depth === 2 && "ml-3", depth >= 3 && "ml-4")}>
      <div className="flex min-h-8 items-center gap-2 border-b border-pixel-line/60 px-1">
        {expandable ? (
          <Button variant="ghost" size="icon" className="size-6 text-pixel-dim hover:bg-pixel-raised hover:text-pixel-green" aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`} onClick={toggle}><ChevronDown className={cn("size-3 transition-transform", !expanded && "-rotate-90")} /></Button>
        ) : <span className="w-6" />}
        <span className={cn("text-[11px]", expandable ? "font-bold text-pixel-cyan" : "text-pixel-text")}>{node.label}</span>
        {expandable && <span className="text-[9px] text-pixel-dim">{children.length}</span>}
      </div>
      {expandable && expanded && <div>{children.map((child, index) => <TreeNode key={`${path}.${index}`} node={child} path={`${path}.${index}`} depth={depth + 1} expandedNodes={expandedNodes} setExpandedNodes={setExpandedNodes} />)}</div>}
    </div>
  );
}

function collectTreePaths(node: SyntaxTree, path: string, paths: Set<string>) {
  paths.add(path);
  (node.children ?? []).forEach((child, index) => collectTreePaths(child, `${path}.${index}`, paths));
}

function highlightLine(line: string, pattern: RegExp, keywords: string[]) {
  const pieces = line.split(pattern);
  return pieces.map((piece, index) => {
    if (!piece) return null;
    const isOperator = piece.startsWith("[") && piece.endsWith("]");
    const isKeyword = !isOperator && keywords.includes(piece);
    if (isOperator) return <span key={index} className="token-operator">{piece}</span>;
    if (isKeyword) return <span key={index} className="token-keyword">{piece}</span>;
    return <span key={index}>{piece}</span>;
  });
}

function tokenColor(category: string) {
  switch (category.toUpperCase()) {
    case "KEYWORD": return "text-pixel-pink";
    case "NUMBER": return "text-pixel-amber";
    case "STRING": return "text-pixel-green";
    case "OPERATOR": return "text-pixel-cyan";
    case "DELIMITER": return "text-pixel-dim";
    default: return "text-pixel-text";
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
