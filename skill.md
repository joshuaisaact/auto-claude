# Skill: autoresearch

Scaffold and run autonomous performance research projects. Use when the user wants to systematically optimize a hot path, benchmark alternatives, or investigate a performance question.

## What it does

1. **Init**: Creates a research project from templates (program.md, bench.sh, AGENTS.md, results.md)
2. **Run**: Executes the autonomous experiment loop (hypothesize → change → measure → keep/revert → commit)
3. **Analyze**: Steps back after N experiments to find patterns and update strategy

## When to use

- "optimize this function"
- "why is this slow"
- "benchmark X vs Y"
- "find where the cycles go"
- "set up a performance research project"

## Init flow

Ask the user for:
1. **Target**: what code to optimize (file, function, binary)
2. **Baseline command**: how to build and measure the current state
3. **Success criteria**: what "better" means (cycles, throughput, latency, IPC)

Then:
1. Run `perf stat` on the baseline to get hardware counters
2. Identify the bottleneck type (memory-stalled if IPC < 1.0, compute-bound if IPC > 2.0, branch-bound if mispredict rate > 5%)
3. Generate program.md from template with the bottleneck analysis baked in
4. Generate bench.sh, AGENTS.md, results.md
5. Commit the scaffolding

## Run flow

Read program.md and execute the experiment loop from AGENTS.md. For each experiment:

```
1. Hypothesis (one sentence)
2. Single focused change
3. Build + verify correctness
4. taskset -c 0 perf stat -e cycles,instructions,L1-dcache-load-misses,L1-dcache-loads,cache-references,branch-misses ./binary
5. Compare IPC, cache miss rate, cycles vs baseline
6. git commit (KEEP with results, or REVERT with explanation)
```

## Key lessons (from elastic-hash research)

These are hard-won from ~150 experiments:

- **LLVM eliminates prefetch instructions.** Use `core::arch::asm!` with `options(nostack, readonly, preserves_flags)` or compiler fences to prevent this.
- **Single-lookup prefetch has a ceiling.** If there aren't enough instructions between prefetch and access (~80 cycles for L3), the prefetch can't complete. Batch multiple operations to create latency gaps.
- **perf stat first, hypothesize second.** IPC tells you whether you're memory-bound or compute-bound. Don't guess.
- **Micro-optimizations that work in simple code often don't transfer to complex codebases.** The abstraction overhead dominates. Test patches in the actual target, not a reimplementation.
- **Wall-clock benchmarks hide the mechanism.** Two implementations can have the same wall-clock time for completely different reasons (one memory-stalled, one compute-bound). perf stat reveals this.

## Templates

Located in `templates/`:
- `program.md.template` -- the research plan
- `bench.sh.template` -- measurement harness
- `AGENTS.md.template` -- agent loop instructions
- `results.md.template` -- findings accumulator
