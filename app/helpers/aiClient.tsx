import { flootAi, FlootAiOutOfCreditsError } from "@floot/ai";
import { createHash } from "crypto";
import { db } from "./db";
import type { AgentName } from "./schema";

// Bump when any agent prompt changes so cached answers are not reused.
const PROMPT_VERSION = "2026-10-13.1";

export type AgentCallResult<T> = {
  data: T;
  credits: number;
  cached: boolean;
  durationMs: number;
  inputChars: number;
  model: string;
};

function cacheKey(parts: string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

async function readCache(key: string) {
  const hit = await db.selectFrom("llmCache").select("response").where("cacheKey", "=", key).executeTakeFirst();
  return hit?.response;
}

async function writeCache(key: string, agent: AgentName, response: unknown) {
  await db
    .insertInto("llmCache")
    .values({ cacheKey: key, agent, response: response as never })
    .onConflict((oc) => oc.column("cacheKey").doNothing())
    .execute();
}

function outOfCredits(): Error {
  return Object.assign(new Error("AI features are temporarily unavailable. Please contact the app owner."), {
    status: 503,
    code: "OUT_OF_CREDITS",
  });
}

// One structured (JSON-schema constrained) chat call with a content-hash cache.
// Token optimization lives here: low reasoning effort, capped output, strict
// schema (no prose to parse) and exact-input caching.
async function structured<T>(opts: {
  agent: AgentName;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  model?: string;
}): Promise<AgentCallResult<T>> {
  const model = opts.model ?? "gpt-6-luna";
  const started = Date.now();
  const key = cacheKey([PROMPT_VERSION, opts.agent, model, opts.instructions, opts.input]);
  const cached = await readCache(key);
  if (cached !== undefined) {
    return { data: cached as T, credits: 0, cached: true, durationMs: Date.now() - started, inputChars: opts.input.length, model };
  }
  try {
    const r = await flootAi.chat({
      model,
      instructions: opts.instructions,
      input: opts.input,
      reasoning: { effort: "low" },
      max_output_tokens: opts.maxOutputTokens ?? 2500,
      text: { format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true } },
    } as never);
    const response = r as unknown as {
      output_text?: string;
      output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
      status?: string;
      incomplete_details?: { reason?: string };
      flootCredits?: { consumed: number };
    };
    const parts = (response.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    const refusal = parts.find((p) => p.type === "refusal")?.refusal;
    if (refusal) throw new Error(`The ${opts.agent} agent declined: ${refusal}`);
    const text =
      response.output_text ||
      parts
        .filter((p) => p.type === "output_text")
        .map((p) => p.text ?? "")
        .join("");
    if (!text) {
      console.error(`${opts.agent} empty output`, JSON.stringify(response).slice(0, 2000));
      throw new Error(
        `The ${opts.agent} agent returned no output (${response.status ?? "unknown"}${response.incomplete_details?.reason ? `: ${response.incomplete_details.reason}` : ""}).`
      );
    }
    const data = JSON.parse(text) as T;
    await writeCache(key, opts.agent, data);
    return {
      data,
      credits: response.flootCredits?.consumed ?? 0,
      cached: false,
      durationMs: Date.now() - started,
      inputChars: opts.input.length,
      model,
    };
  } catch (err) {
    if (err instanceof FlootAiOutOfCreditsError) throw outOfCredits();
    throw err;
  }
}

type EvaluateQuestion = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

// Fast typed yes/no judgments (verifier and pre-auth necessity checks). No text
// is generated, so this is the cheapest call in the pipeline.
async function judge(opts: {
  agent: AgentName;
  state: Record<string, unknown>;
  questions: Record<string, EvaluateQuestion>;
}): Promise<AgentCallResult<Record<string, number>>> {
  const model = "jev-1.13.0";
  const started = Date.now();
  const input = JSON.stringify({ state: opts.state, questions: opts.questions });
  const key = cacheKey([PROMPT_VERSION, opts.agent, model, input]);
  const cached = await readCache(key);
  if (cached !== undefined) {
    return { data: cached as Record<string, number>, credits: 0, cached: true, durationMs: Date.now() - started, inputChars: input.length, model };
  }
  try {
    const r = (await flootAi.evaluate({ model, state: opts.state, questions: opts.questions } as never)) as unknown as {
      answers: Record<string, { noul?: number }>;
      flootCredits?: { consumed: number };
    };
    const data: Record<string, number> = {};
    for (const [id, a] of Object.entries(r.answers)) data[id] = a.noul ?? 0;
    await writeCache(key, opts.agent, data);
    return { data, credits: r.flootCredits?.consumed ?? 0, cached: false, durationMs: Date.now() - started, inputChars: input.length, model };
  } catch (err) {
    if (err instanceof FlootAiOutOfCreditsError) throw outOfCredits();
    throw err;
  }
}

export const aiClient = { structured, judge };