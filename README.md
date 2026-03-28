# auto-claude

Autonomous research harness for Claude Code. Give an agent a problem, a file to edit, and a way to measure, then let it run.

Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch). Same idea, generalized beyond ML training: the agent modifies code, runs an experiment, checks if the result improved, keeps or discards, and repeats. You come back to a log of experiments and (hopefully) a better solution.

## How it works

Three things matter:

- **`program.md`** -- instructions for the agent. What to optimize, how to measure, what files to edit. Written by the human.
- **The editable file(s)** -- whatever the agent is iterating on. Could be anything: a hash table, a compiler pass, a prompt template, a config file.
- **`results.tsv`** -- log of every experiment. The agent appends to this after each run.

You point Claude at `program.md` and let it go:

```
claude "read program.md and start experimenting"
```

## The loop

```
LOOP FOREVER:
1. Read the current state
2. Come up with an idea (one focused change)
3. Edit the code
4. git commit
5. Run the experiment
6. Record results in results.tsv
7. If improved: keep the commit, advance
8. If worse: git reset back
9. Repeat
```

The agent runs until you stop it. If each experiment takes ~2 minutes, that's ~30/hour, ~240 overnight.

## Writing a program.md

A program.md needs:

1. **What to optimize** -- the target, the metric, what "better" means
2. **What to edit** -- which files are fair game, which are frozen
3. **How to measure** -- the exact command to run and how to extract the result
4. **Constraints** -- what the agent cannot do (break the API, add dependencies, etc.)

See `templates/program.md.template` for the skeleton. See `examples/` for concrete examples:

- **[LRU cache optimization](examples/lru-cache/)** -- Agent started from a naive LRU cache and beat mnemonist (the performance-focused LRU library) by 26% in 25 experiments. [Full results.](examples/lru-cache/RESULTS.md)
- **[Perf optimization with hardware counters](examples/perf-optimization.md)** -- Template for optimizing hot paths using `perf stat`.

## Design choices

- **Single metric.** The agent needs one number to optimize. If you have multiple metrics, define a composite or pick the most important one.
- **Fixed budget per experiment.** Each run should take roughly the same time regardless of what the agent changes. This makes results comparable.
- **Commit everything.** Including failures. The git log IS the experiment log.
- **Keep or discard immediately.** Don't carry regressions forward hoping the next change will fix them.
- **Never stop.** The agent runs autonomously until interrupted. If it runs out of ideas, it should think harder, not ask.

## License

MIT
