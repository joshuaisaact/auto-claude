---
name: autoresearch
description: Autonomous performance optimization. Set up an experiment loop that edits code, benchmarks, and keeps or reverts changes automatically. Use when optimizing a hot path, data structure, codec, or any code with a measurable metric.
metadata:
  trigger: Performance optimization, benchmarking, autoresearch, autonomous experimentation
  author: Josh Tuddenham
---

# autoresearch

Run autonomous experiments to optimize code. You edit a file, measure a metric, keep improvements, revert regressions, and repeat.

## When invoked interactively (setup mode)

Work with the user to set up a new experiment. Ask for:

1. **What to optimize** — the target file(s) and what "better" means
2. **How to measure** — the exact command and how to extract the metric
3. **What's frozen** — files the agent cannot touch (benchmarks, test harness, corpus)
4. **Constraints** — what's off limits (breaking the API, adding dependencies, etc.)

Then:

1. Propose a run tag based on today's date (e.g. `mar29-lru`)
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Write a `program.md` using the template below
4. Run the baseline: execute the measurement command
5. Create `results.tsv` with header + baseline
6. Confirm with the user, then begin the loop

## The experiment loop

```
LOOP FOREVER:
1. Read the current state of the editable file(s) and results.tsv
2. Form a hypothesis (one focused change)
3. Edit the code
4. git commit
5. Run the measurement command
6. Record results in results.tsv (do NOT commit this file)
7. If metric improved: keep the commit
8. If worse or equal: git reset HEAD~1 --hard
9. Repeat
```

**NEVER STOP.** Once the loop begins, do not pause to ask the user. If you run out of ideas, re-read the code, look at the per-case breakdown, try combining near-misses, try radical rewrites. The loop runs until the user interrupts.

## program.md template

Use this structure when creating a program.md:

```markdown
# autoresearch: <description>

<One-line goal.>

## Setup

1. Agree on a run tag
2. Create branch: `git checkout -b autoresearch/<tag>`
3. Read these files for context:
   - `<editable file>` -- the file you modify
   - `<frozen files>` -- do not modify
4. Install deps if needed
5. Run the baseline: `<measurement command>`
6. Initialize results.tsv

## Experimentation

**What you CAN do:** <scope>
**What you CANNOT do:** <constraints>
**The goal: <metric description>.** Lower/higher is better.
**Simplicity criterion**: simpler code at the same speed beats complex code.
**The first run**: establish the baseline.

## Output format

<measurement command>

Extract the metric:
<how to read the number>

## Logging results

commit	<metric_name>	status	description

## The experiment loop

LOOP FOREVER:
1. Look at current state + results
2. Edit with an experimental idea
3. git commit
4. Run measurement
5. If improved: keep
6. If worse/equal: git reset HEAD~1 --hard
7. Record in results.tsv

**Timeout**: <max time per run>
**NEVER STOP**: run until interrupted.
```

## Key principles

- **One file, one metric.** Small action space, clear signal.
- **Fixed budget per experiment.** Each run takes roughly the same time.
- **Git as experiment log.** Every experiment is a commit. The git log IS the history.
- **Keep or discard immediately.** Don't carry regressions forward.
- **Simplicity bias.** A small improvement from deleting code is worth keeping. A minor improvement requiring ugly complexity is not.

## Examples

See the auto-claude repo for worked examples:
- **LRU cache** — beat mnemonist by 26% in 25 experiments
- **Source map codec** — beat @jridgewell/sourcemap-codec by 12-23% on real production maps
- **Glob matching** — 3.7x faster than picomatch, feature-complete
- **JSON serialization** — 53% faster than JSON.stringify on real API data
