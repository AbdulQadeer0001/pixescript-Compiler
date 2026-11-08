import { afterEach, describe, expect, it, vi } from "vitest";

import { runAll, runEngine } from "@/lib/pixelscript-api";

describe("PixelScript FastAPI requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts only the selected engine and includes the source and program id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          engine: "syntax",
          success: true,
          summary: "Syntax is correct",
          output: { tree: { label: "program", children: [] }, tree_text: "program" },
          errors: [],
          blocked_by: null,
          run_id: 17,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runEngine("syntax", "press_start", 4);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/engines/syntax",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ source: "press_start", program_id: 4 }),
      }),
    );
  });

  it("uses the compile endpoint only when all engines are requested", async () => {
    const emptyResult = (engine: string) => ({
      engine,
      success: true,
      summary: "ok",
      output: {},
      errors: [],
      blocked_by: null,
      run_id: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          lexical: emptyResult("lexical"),
          syntax: emptyResult("syntax"),
          semantic: emptyResult("semantic"),
          icg: emptyResult("icg"),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runAll("render(1);");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/compile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ source: "render(1);", program_id: null }),
      }),
    );
  });
});