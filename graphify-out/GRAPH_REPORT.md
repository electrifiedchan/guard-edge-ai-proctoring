# Graph Report - guard-edge-ai-proctoring  (2026-07-05)

## Corpus Check
- 26 files · ~15,745 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 200 nodes · 228 edges · 20 communities (15 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d773181c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_edge_main.py|edge_main.py]]
- [[_COMMUNITY_BehavioralEventAccumulator|BehavioralEventAccumulator]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_🚀 Setup & Boot|🚀 Setup & Boot]]
- [[_COMMUNITY_copy-mediapipe.mjs|copy-mediapipe.mjs]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_layout.tsx|layout.tsx]]
- [[_COMMUNITY_voice_engine.py|voice_engine.py]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_eslint.config.mjs|eslint.config.mjs]]
- [[_COMMUNITY_next.config.ts|next.config.ts]]
- [[_COMMUNITY_postcss.config.mjs|postcss.config.mjs]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `BehavioralEventAccumulator` - 15 edges
3. `scripts` - 8 edges
4. `🚀 Setup & Boot` - 7 edges
5. `analyze_frame()` - 6 edges
6. `🧠 The Intelligence Stack` - 6 edges
7. `_compute_session_breakdown()` - 4 edges
8. `generate_verdict()` - 4 edges
9. `ViolationType` - 4 edges
10. `write_evidence_frame()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `VerdictData` --references--> `SessionBreakdown`  [EXTRACTED]
  frontend/src/app/verdict/page.tsx → frontend/src/lib/violation-templates.ts
- `ViolationCardProps` --references--> `ViolationBucket`  [EXTRACTED]
  frontend/src/components/ViolationCard.tsx → frontend/src/lib/violation-templates.ts
- `ViolationCardProps` --references--> `ViolationType`  [EXTRACTED]
  frontend/src/components/ViolationCard.tsx → frontend/src/lib/violation-templates.ts

## Import Cycles
- None detected.

## Communities (20 total, 5 thin omitted)

### Community 0 - "edge_main.py"
Cohesion: 0.12
Nodes (18): analyze_frame(), _compute_session_breakdown(), determine_verdict(), FinalStats, _format_breakdown_for_prompt(), FramePayload, generate_verdict(), get_session_breakdown() (+10 more)

### Community 1 - "BehavioralEventAccumulator"
Cohesion: 0.15
Nodes (8): Any, BehavioralEventAccumulator, Wall-clock duration-based escalation. Single-frame glances are ignored;, Maps a sustained-gaze duration to (tier, risk_penalty, seconds_to_next_tier)., Commits one historical event per tier crossing so risk persists through brief re, Maps numeric risk to (intervention_level, autopsy_flag)., Rolling 3-of-5 critical buffer. Filters single-frame anomalies (lighting glitche, Logs a fatal-level violation silently (Mobile Phone / Tab Switch).         Chan

### Community 2 - "dependencies"
Cohesion: 0.09
Nodes (21): dependencies, clsx, d3-shape, framer-motion, @mediapipe/camera_utils, @mediapipe/face_mesh, next, react (+13 more)

### Community 3 - "README.md"
Cohesion: 0.10
Nodes (20): *A Sovereign Edge-AI Proctoring Ecosystem*, AI Coach — Two Modes, 🌐 API Reference, 🔧 Configuration, Deterministic Verdict Engine — `edge_main.py`, Dual-Model Vision Pipeline, **Guardianship Utilizing AI for Real-time Detection**, 📄 License (+12 more)

### Community 4 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 5 - "page.tsx"
Cohesion: 0.12
Nodes (8): AuditLog, DEFAULT_MESSAGES, LoadingOverlayProps, RiskPacket, SniperScopeHandle, SniperScopeProps, VoiceOrbProps, VoiceState

### Community 6 - "page.tsx"
Cohesion: 0.24
Nodes (13): riskTone(), VerdictData, VerdictPage(), formatClock(), ViolationCard(), ViolationCardProps, SessionBreakdown, Severity (+5 more)

### Community 7 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/d3-shape, @types/node, @types/react (+2 more)

### Community 8 - "🚀 Setup & Boot"
Cohesion: 0.29
Nodes (7): 1. Clone, 2. Backend, 3. Frontend, 4. Environment Variables, 🟢 Boot Sequence, Prerequisites, 🚀 Setup & Boot

### Community 9 - "copy-mediapipe.mjs"
Cohesion: 0.33
Nodes (5): ASSET_EXTS, dest, __dirname, root, src

### Community 10 - "dependencies"
Cohesion: 0.33
Nodes (5): dependencies, clsx, framer-motion, lucide-react, tailwind-merge

### Community 11 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 13 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 14 - "page.tsx"
Cohesion: 0.67
Nodes (3): AutopsyLog, AutopsyPage(), resolveEvidenceSrc()

## Knowledge Gaps
- **95 isolated node(s):** `@kilocode/plugin`, `eslintConfig`, `nextConfig`, `name`, `version` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `dependencies`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `@kilocode/plugin`, `Rolling 3-of-5 critical buffer. Filters single-frame anomalies (lighting glitche`, `Logs a fatal-level violation silently (Mobile Phone / Tab Switch).         Chan` to the rest of the system?**
  _104 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `edge_main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.12318840579710146 - nodes in this community are weakly interconnected._
- **Should `BehavioralEventAccumulator` be split into smaller, more focused modules?**
  _Cohesion score 0.14624505928853754 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `README.md` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._