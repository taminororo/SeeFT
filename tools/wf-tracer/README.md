# wf-tracer

A small, portable CLI that traces a single **Workflow** run: it reads the
run's on-disk artifacts and produces a machine-readable `trace.json` plus a
human Markdown report (wall-clock duration, agent count, per-agent tokens, and
tool calls).

## Usage

```bash
node index.mjs <runId>
```

Examples:

```bash
node index.mjs wf_553acf8a-5d5
node index.mjs wf_553acf8a-5d5 --out /tmp/trace.json
node index.mjs wf_553acf8a-5d5 --json
node index.mjs wf_553acf8a-5d5 --root /path/to/claude/projects/<project-slug>
```

Flags:

- `--root <dir>` — base directory to search for the run. Defaults to
  `/Users/eisaki/.claude/projects/-Users-eisaki-workspace-SeeFT`.
- `--out <file>` — where to write `trace.json`. Defaults to `trace.json` next
  to `index.mjs`.
- `--json` — print the raw trace JSON to stdout instead of the Markdown report.
  (`trace.json` is written either way.)

Exit codes: `0` success, `1` run not found / read error, `2` missing `runId`.

## What it reports

- Run header: workflow name, summary, status, model, total duration, agent count.
- Phases (from the run metadata).
- A per-agent **Markdown table**: label, duration, tokens, and tool calls broken
  down by type.
- Totals: tokens (with an explicit source classification) and tool calls.
- A Mermaid `xychart-beta` bar of per-agent duration.

### Token source classification

Token cost is ultimately server-side, so the headline total is labelled with how
it was obtained:

- **exact** — every subagent transcript on disk carried `message.usage`; the
  total is summed from those (input + output + cache read + cache creation).
- **partial** — only some transcripts had usage; the total is a lower bound.
- **estimated** — no per-agent usage on disk, fell back to the run metadata's
  `totalTokens` field.
- **unavailable** — no usage anywhere.

The report also shows the metadata-reported `totalTokens` alongside the summed
figure for cross-checking. They commonly differ: the transcript sum includes
cache-read/cache-creation tokens, whereas the metadata total tends to track only
the non-cached billable input/output.

## On-disk format it reads

For a run `wf_<id>` under `<root>/<sessionDir>/`:

```text
workflows/wf_<id>.json
    Run metadata. Fields used: runId, workflowName, summary, status,
    defaultModel, durationMs, agentCount, phases[] ({title, detail}),
    totalTokens, totalToolCalls.

subagents/workflows/wf_<id>/agent-<agentId>.jsonl
    Full Claude Code transcript per subagent. Used:
      - assistant lines:  message.usage.{input_tokens, output_tokens,
                          cache_read_input_tokens, cache_creation_input_tokens}
      - tool_use content blocks: c.name  (tool calls, counted by type)
      - first user line:  the task prompt (used as the agent label)
      - line timestamps:  bound the per-agent duration

subagents/workflows/wf_<id>/journal.jsonl
    started/result events keyed by agentId (ordering hint; not required).
```

The CLI locates these by recursively searching `--root`, so it does not need to
know the `<sessionDir>` (the project UUID) up front.

## Portability

This is a plain Node ESM script using **only Node built-ins** (`fs`, `path`) —
no `npm install`, no `package.json` required. It does **not** depend on the
Claude Code runtime: it only reads files. The single Claude-Code-specific input
is the data directory path, which is overridable via `--root`. That makes the
tool tool-agnostic — it runs the same under Node directly, under Codex, or in
CI, as long as the run's artifact directory is reachable.
