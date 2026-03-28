# auto-claude

Autonomous performance research harness for Claude Code. Extracted from [elastic-hash](https://github.com/joshuaisaact/elastic-hash), where ~150 experiments across 3 languages discovered that hashbrown's ctrl byte array is an L1 bottleneck and batched prefetch yields 28% cycle reduction.

## What this is

A reusable pattern for Claude Code agents to autonomously run performance experiments: hypothesize, change, measure, keep or revert, commit, repeat. The agent makes one focused change at a time, measures with hardware counters, and commits every result (including failures).

## Usage

```
claude "use the autoresearch skill to set up a performance research project targeting [your hot path]"
```

The skill scaffolds:
- `program.md` -- research plan with hypothesis, success criteria, keep/revert rules
- `bench.sh` -- measurement script with perf stat, CPU pinning, cache flushing
- `results.md` -- accumulating findings log
- `AGENTS.md` -- instructions for the autonomous research loop

Then launch the agent:
```
claude "read program.md and execute the research loop autonomously"
```

## The pattern

Learned from 8 rounds of hash table optimization:

1. **One change at a time.** Never combine two hypotheses in one experiment.
2. **Measure with hardware counters.** Wall-clock time lies. `perf stat` shows cycles, IPC, cache misses, branch mispredictions. These tell you WHY something is fast or slow.
3. **Commit every experiment.** Including failures. The revert history is as valuable as the keep history.
4. **Keep/revert immediately.** Don't carry forward a regression hoping the next change will fix it.
5. **Revert rate of ~70% is healthy.** Most hypotheses are wrong. That's fine.
6. **Every ~10 experiments, step back.** Analyze patterns, update strategy, document insights.
7. **Report honestly.** Especially negative results. "This didn't work because..." is more useful than only showing wins.
