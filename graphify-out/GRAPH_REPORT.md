# Graph Report - guard-edge-ai-proctoring  (2026-05-03)

## Corpus Check
- 15 files · ~8,915 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 57 nodes · 56 edges · 5 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `BehavioralEventAccumulator` - 10 edges
2. `startCamera()` - 3 edges
3. `init_db()` - 2 edges
4. `lifespan()` - 2 edges
5. `determine_verdict()` - 2 edges
6. `FramePayload` - 2 edges
7. `analyze_frame()` - 2 edges
8. `FinalStats` - 2 edges
9. `checkHardware()` - 2 edges
10. `initGatekeeper()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.26
Nodes (3): BehavioralEventAccumulator, Logs a fatal-level violation silently (Mobile Phone / Tab Switch).         Chan, Evaluates stateless gaze against industry-standard temporal limits.

### Community 2 - "Community 2"
Cohesion: 0.43
Nodes (5): checkHardware(), handleReset(), initGatekeeper(), showToast(), startCamera()

### Community 4 - "Community 4"
Cohesion: 0.67
Nodes (3): FinalStats, FramePayload, BaseModel

### Community 7 - "Community 7"
Cohesion: 1.0
Nodes (2): init_db(), lifespan()

### Community 8 - "Community 8"
Cohesion: 1.0
Nodes (2): analyze_frame(), determine_verdict()

## Knowledge Gaps
- **2 isolated node(s):** `Logs a fatal-level violation silently (Mobile Phone / Tab Switch).         Chan`, `Evaluates stateless gaze against industry-standard temporal limits.`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 7`** (2 nodes): `init_db()`, `lifespan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (2 nodes): `analyze_frame()`, `determine_verdict()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FramePayload` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `FinalStats` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `Logs a fatal-level violation silently (Mobile Phone / Tab Switch).         Chan`, `Evaluates stateless gaze against industry-standard temporal limits.` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._