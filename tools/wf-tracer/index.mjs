#!/usr/bin/env node
// wf-tracer — portable, dependency-light Workflow run tracer.
//
// Reads the on-disk artifacts that the Claude Code "Workflow" tool persists for a
// single run and produces (a) a machine-readable trace.json and (b) a human
// Markdown report on stdout.
//
// Pure Node ESM. Built-ins only (fs, path) so it runs under any tool, including
// Codex — there is NO dependency on the Claude Code runtime. The only
// Claude-Code-specific input is the data directory path (--root), which can be
// overridden for other environments.
//
// On-disk format (discovered, see README):
//   <root>/<sessionDir>/workflows/wf_<id>.json
//       run metadata: runId, workflowName, durationMs, agentCount, phases[],
//       result{}, logs[], totalTokens, totalToolCalls, defaultModel, status,
//       startTime, ...
//   <root>/<sessionDir>/subagents/workflows/wf_<id>/agent-<agentId>.jsonl
//       full Claude Code transcript per subagent. Assistant lines carry
//       message.usage (input/output/cache tokens) and tool_use content blocks
//       (c.name). The first user line is the task prompt (used as a label);
//       line timestamps bound the agent duration.
//   <root>/<sessionDir>/subagents/workflows/wf_<id>/journal.jsonl
//       started/result events keyed by agentId (ordering hint).

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROOT =
  "/Users/eisaki/.claude/projects/-Users-eisaki-workspace-SeeFT";

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { _: [], root: DEFAULT_ROOT, out: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a.startsWith("--root=")) args.root = a.slice(7);
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else args._.push(a);
  }
  return args;
}

// ---------------------------------------------------------------------------
// file location
// ---------------------------------------------------------------------------
// Recursively look for a file matching `predicate` under `dir` (bounded depth).
function findFile(dir, predicate, depth = 6) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  // files first
  for (const e of entries) {
    if (e.isFile() && predicate(path.join(dir, e.name))) {
      return path.join(dir, e.name);
    }
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const hit = findFile(path.join(dir, e.name), predicate, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

function findDir(dir, predicate, depth = 6) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const full = path.join(dir, e.name);
      if (predicate(full)) return full;
      const hit = findDir(full, predicate, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

function locateRun(root, runId) {
  // metadata: .../workflows/<runId>.json (not under subagents/)
  const metaPath = findFile(root, (p) => {
    const b = path.basename(p);
    return (
      b === `${runId}.json` &&
      p.includes(`${path.sep}workflows${path.sep}`) &&
      !p.includes(`${path.sep}subagents${path.sep}`)
    );
  });
  // subagents dir: .../subagents/workflows/<runId>/
  const agentsDir = findDir(root, (p) => {
    return (
      path.basename(p) === runId &&
      p.includes(`${path.sep}subagents${path.sep}workflows${path.sep}`)
    );
  });
  return { metaPath, agentsDir };
}

// ---------------------------------------------------------------------------
// jsonl helpers
// ---------------------------------------------------------------------------
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonl(file) {
  const out = [];
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* tolerate a truncated/partial trailing line */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// per-agent extraction
// ---------------------------------------------------------------------------
function extractAgent(file) {
  const agentId = path
    .basename(file)
    .replace(/^agent-/, "")
    .replace(/\.jsonl$/, "");
  const lines = readJsonl(file);

  let label = null;
  let firstTs = null;
  let lastTs = null;
  let model = null;
  let usagePresent = false;
  const tok = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
  const toolCalls = {}; // byType

  for (const o of lines) {
    if (o.timestamp) {
      if (!firstTs) firstTs = o.timestamp;
      lastTs = o.timestamp;
    }
    const msg = o.message;
    if (!msg) continue;

    if (!label && o.type === "user") {
      let c = msg.content;
      if (Array.isArray(c))
        c = c.map((x) => (typeof x === "string" ? x : x.text || "")).join(" ");
      if (typeof c === "string" && c.trim()) {
        label = c.replace(/\s+/g, " ").trim().slice(0, 90);
      }
    }

    if (!model && msg.model) model = msg.model;

    if (msg.usage) {
      usagePresent = true;
      const u = msg.usage;
      tok.input += u.input_tokens || 0;
      tok.output += u.output_tokens || 0;
      tok.cacheRead += u.cache_read_input_tokens || 0;
      tok.cacheCreate += u.cache_creation_input_tokens || 0;
    }

    if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c && c.type === "tool_use" && c.name) {
          toolCalls[c.name] = (toolCalls[c.name] || 0) + 1;
        }
      }
    }
  }

  const durationMs =
    firstTs && lastTs ? new Date(lastTs) - new Date(firstTs) : null;

  const totalToolCalls = Object.values(toolCalls).reduce((a, b) => a + b, 0);
  // "tokens" headline = everything that flowed through the model for this agent.
  const tokensTotal =
    tok.input + tok.output + tok.cacheRead + tok.cacheCreate;

  return {
    agentId,
    label,
    model,
    durationMs,
    firstTs,
    lastTs,
    usagePresent,
    tokens: usagePresent
      ? {
          total: tokensTotal,
          input: tok.input,
          output: tok.output,
          cacheRead: tok.cacheRead,
          cacheCreate: tok.cacheCreate,
        }
      : null,
    toolCalls: { total: totalToolCalls, byType: toolCalls },
  };
}

// ---------------------------------------------------------------------------
// trace build
// ---------------------------------------------------------------------------
function buildTrace(runId, root) {
  const { metaPath, agentsDir } = locateRun(root, runId);
  if (!metaPath && !agentsDir) {
    throw new Error(
      `Could not locate run "${runId}" under ${root}. ` +
        `Pass --root <dir> to point at the Claude Code projects directory.`
    );
  }

  const meta = metaPath ? readJson(metaPath) : {};

  // phases
  let phases = [];
  if (Array.isArray(meta.phases)) {
    phases = meta.phases.map((p, i) => ({
      index: i + 1,
      title: p.title || p.name || `Phase ${i + 1}`,
      detail: p.detail || p.description || null,
    }));
  }

  // per-agent
  const agents = [];
  if (agentsDir) {
    const files = fs
      .readdirSync(agentsDir)
      .filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))
      .sort();
    for (const f of files) {
      agents.push(extractAgent(path.join(agentsDir, f)));
    }
    // order agents by first timestamp when available
    agents.sort((a, b) => {
      if (a.firstTs && b.firstTs) return new Date(a.firstTs) - new Date(b.firstTs);
      return 0;
    });
  }

  // aggregate tokens / tool calls from agent transcripts
  const agentsWithUsage = agents.filter((a) => a.usagePresent);
  const aggFromAgents = {
    tokensTotal: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate: 0,
    toolCalls: 0,
  };
  for (const a of agents) {
    if (a.tokens) {
      aggFromAgents.tokensTotal += a.tokens.total;
      aggFromAgents.input += a.tokens.input;
      aggFromAgents.output += a.tokens.output;
      aggFromAgents.cacheRead += a.tokens.cacheRead;
      aggFromAgents.cacheCreate += a.tokens.cacheCreate;
    }
    aggFromAgents.toolCalls += a.toolCalls.total;
  }

  // token source classification
  // - "exact": every agent has on-disk usage (and that's the whole run)
  // - "partial": some but not all agents have usage
  // - "unavailable": no agent usage anywhere
  // (We compute headline tokens from transcripts when present; we also keep the
  //  metadata-reported totalTokens for cross-checking.)
  let tokenSource;
  if (agents.length === 0) {
    tokenSource = "unavailable";
  } else if (agentsWithUsage.length === agents.length) {
    tokenSource = "exact";
  } else if (agentsWithUsage.length > 0) {
    tokenSource = "partial";
  } else {
    tokenSource = "unavailable";
  }

  // headline token total: prefer the summed transcript usage; fall back to
  // metadata.totalTokens if transcripts carry no usage.
  let tokens;
  let tokenNote;
  if (tokenSource === "exact" || tokenSource === "partial") {
    tokens = {
      total: aggFromAgents.tokensTotal,
      input: aggFromAgents.input,
      output: aggFromAgents.output,
      cacheRead: aggFromAgents.cacheRead,
      cacheCreate: aggFromAgents.cacheCreate,
    };
    if (typeof meta.totalTokens === "number") {
      tokens.metadataReportedTotal = meta.totalTokens;
    }
    tokenNote =
      tokenSource === "exact"
        ? "Summed from per-agent message.usage in every subagent transcript on disk (input + output + cache read + cache creation)."
        : "Summed from per-agent message.usage, but only some subagent transcripts contained usage — total is a partial lower bound.";
  } else if (typeof meta.totalTokens === "number") {
    tokenSource = "estimated";
    tokens = { total: meta.totalTokens, metadataReportedTotal: meta.totalTokens };
    tokenNote =
      "No per-agent usage found in transcripts; using the run metadata totalTokens field (server-reported, not derivable per agent).";
  } else {
    tokens = { total: 0 };
    tokenNote =
      "Token usage is server-side and was not found on disk (no per-agent usage, no metadata total).";
  }

  const toolCallsTotal =
    aggFromAgents.toolCalls ||
    (typeof meta.totalToolCalls === "number" ? meta.totalToolCalls : 0);

  return {
    runId: meta.runId || runId,
    workflowName: meta.workflowName || meta.script?.match?.(/name:\s*'([^']+)'/)?.[1] || null,
    summary: meta.summary || null,
    status: meta.status || null,
    defaultModel: meta.defaultModel || null,
    durationMs:
      typeof meta.durationMs === "number" ? meta.durationMs : null,
    agentCount:
      typeof meta.agentCount === "number" ? meta.agentCount : agents.length,
    phases,
    agents: agents.map((a) => ({
      agentId: a.agentId,
      label: a.label,
      model: a.model || meta.defaultModel || null,
      durationMs: a.durationMs,
      tokens: a.tokens,
      toolCalls: a.toolCalls,
    })),
    totals: {
      tokens,
      tokenSource,
      tokenNote,
      toolCalls: toolCallsTotal,
      metadataReportedToolCalls:
        typeof meta.totalToolCalls === "number" ? meta.totalToolCalls : null,
    },
    sources: {
      metadata: metaPath,
      agentsDir,
    },
  };
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
function fmtNum(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function fmtDur(ms) {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(0);
  return `${m}m ${rem}s`;
}

function shortId(id) {
  return id ? id.slice(0, 8) : "—";
}

function toMarkdown(trace) {
  const L = [];
  L.push(`# Workflow Trace — ${trace.workflowName || "(unknown)"}`);
  L.push("");
  L.push(`**Run:** \`${trace.runId}\`  `);
  if (trace.summary) L.push(`**Summary:** ${trace.summary}  `);
  L.push(`**Status:** ${trace.status || "—"}  `);
  L.push(`**Model:** ${trace.defaultModel || "—"}  `);
  L.push(`**Duration:** ${fmtDur(trace.durationMs)}  `);
  L.push(`**Agents:** ${trace.agentCount}`);
  L.push("");

  // phases
  if (trace.phases.length) {
    L.push("## Phases");
    L.push("");
    L.push("| # | Phase | Detail |");
    L.push("| --- | --- | --- |");
    for (const p of trace.phases) {
      L.push(`| ${p.index} | ${p.title} | ${p.detail || "—"} |`);
    }
    L.push("");
  }

  // per-agent table
  L.push("## Per-agent");
  L.push("");
  L.push("| Agent | Label | Duration | Tokens | Tool calls (by type) |");
  L.push("| --- | --- | ---: | ---: | --- |");
  for (const a of trace.agents) {
    const byType = Object.entries(a.toolCalls.byType)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k}×${v}`)
      .join(", ");
    const tok = a.tokens ? fmtNum(a.tokens.total) : "n/a";
    const label = a.label ? a.label.replace(/\|/g, "\\|") : "—";
    L.push(
      `| \`${shortId(a.agentId)}\` | ${label} | ${fmtDur(
        a.durationMs
      )} | ${tok} | ${byType || "—"} |`
    );
  }
  L.push("");

  // totals
  const t = trace.totals;
  L.push("## Totals");
  L.push("");
  L.push("| Metric | Value |");
  L.push("| --- | --- |");
  L.push(`| Tokens (${t.tokenSource}) | ${fmtNum(t.tokens.total)} |`);
  if (t.tokens.input != null)
    L.push(`| · input | ${fmtNum(t.tokens.input)} |`);
  if (t.tokens.output != null)
    L.push(`| · output | ${fmtNum(t.tokens.output)} |`);
  if (t.tokens.cacheRead != null)
    L.push(`| · cache read | ${fmtNum(t.tokens.cacheRead)} |`);
  if (t.tokens.cacheCreate != null)
    L.push(`| · cache creation | ${fmtNum(t.tokens.cacheCreate)} |`);
  if (t.tokens.metadataReportedTotal != null)
    L.push(
      `| · metadata-reported total | ${fmtNum(
        t.tokens.metadataReportedTotal
      )} |`
    );
  L.push(`| Tool calls | ${fmtNum(t.toolCalls)} |`);
  L.push("");
  L.push(`> **Token source: ${t.tokenSource}.** ${t.tokenNote}`);
  L.push("");

  // mermaid bar of per-agent duration
  const durAgents = trace.agents.filter((a) => a.durationMs != null);
  if (durAgents.length) {
    L.push("## Duration by agent");
    L.push("");
    L.push("```mermaid");
    L.push("---");
    L.push("config:");
    L.push('  xyChart:');
    L.push("    width: 720");
    L.push("    height: 320");
    L.push("---");
    L.push("xychart-beta");
    L.push('  title "Per-agent duration (seconds)"');
    const labels = durAgents
      .map((a) => `"${shortId(a.agentId)}"`)
      .join(", ");
    const vals = durAgents
      .map((a) => (a.durationMs / 1000).toFixed(0))
      .join(", ");
    L.push(`  x-axis [${labels}]`);
    L.push(`  y-axis "seconds"`);
    L.push(`  bar [${vals}]`);
    L.push("```");
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push(
    `*Sources: metadata \`${trace.sources.metadata || "(none)"}\`, ` +
      `transcripts \`${trace.sources.agentsDir || "(none)"}\`.*`
  );
  L.push("");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args._[0];
  if (!runId) {
    process.stderr.write(
      "Usage: node index.mjs <runId> [--root <dir>] [--out <trace.json>] [--json]\n"
    );
    process.exit(2);
  }

  let trace;
  try {
    trace = buildTrace(runId, args.root);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  }

  const outPath =
    args.out || path.join(path.dirname(new URL(import.meta.url).pathname), "trace.json");
  fs.writeFileSync(outPath, JSON.stringify(trace, null, 2) + "\n");

  if (args.json) {
    process.stdout.write(JSON.stringify(trace, null, 2) + "\n");
  } else {
    process.stdout.write(toMarkdown(trace));
  }
  process.stderr.write(`\n[wf-tracer] wrote ${outPath}\n`);
}

main();
