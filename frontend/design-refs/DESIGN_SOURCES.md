# Guard UI Design Sources

This app uses a composed visual system inspired by public DESIGN.md references from `VoltAgent/awesome-design-md`.

## Source Roles

| Source | Role in Guard |
| --- | --- |
| VoltAgent | Near-black canvas, emerald active signal, terminal/code credibility |
| Sentry | Severity vocabulary for event streams: info, warning, amber, danger |
| Warp | Monospace transcript/log treatment and command-line prompt rhythm |
| Raycast | Quick interaction feedback, soft focus states, compact controls |
| Vercel | Geist typography, black/white precision, data-dense hierarchy |

## Applied Tokens

| Token | Value | Source Influence | Usage |
| --- | --- | --- | --- |
| `--color-canvas` | `#050507` | VoltAgent | Page background |
| `--color-surface` | `#0f1011` | VoltAgent / Vercel | Panels and controls |
| `--color-hairline` | `#23252a` | VoltAgent / Vercel | Borders and dividers |
| `--color-iris` | `#7553ff` | Sentry / Raycast | Primary actions and focus |
| `--color-signal` | `#00d992` | VoltAgent | Secure/live indicators |
| `--color-warn` | `#ffba00` | Sentry / VoltAgent | Soft warning state |
| `--color-amber` | `#ff8c2a` | Sentry | Hard warning state |
| `--color-danger` | `#fb565b` | Sentry / VoltAgent | Severe violation state |
| `--font-sans` | Geist/system stack | Vercel | UI text |
| `--font-mono` | Geist Mono/SFMono stack | Warp / Vercel | Logs and transcripts |

## Guardrails

- Keep surfaces mostly flat and border-defined.
- Reserve emerald for live/secure states, not decoration.
- Use amber/red only for semantic violations.
- Keep cards at `8px` radius or less.
- Keep display letter spacing at `0` for consistency.

References:

- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/voltagent/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/sentry/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/warp/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/raycast/DESIGN.md
- https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/vercel/DESIGN.md

Note: the upstream README mentions Linear, but the current `design-md` directory does not expose a `linear` source folder. It is therefore not used as an auditable raw source here.
