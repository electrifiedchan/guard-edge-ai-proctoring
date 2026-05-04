# DESIGN.md — Guard Edge-AI Proctoring Frontend

Source: VoltAgent design system
Reference: https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/voltagent/DESIGN.md

---

## 1. Visual Theme & Atmosphere

A deep-space command terminal for the AI age. Near-pure-black surfaces where the only interruption is the electric pulse of Emerald Signal Green. This is not a friendly SaaS dashboard — it's an engineering-grade proctoring system that announces itself through code snippets, dense data panels, and raw technical confidence.

**Key Characteristics:**
- Carbon-black canvas (`#050507`) with Warm Charcoal border containment (`#3d3a39`) — not cold or sterile
- Single-accent identity: Emerald Signal Green (`#00d992`) as the sole chromatic energy source
- VoltAgent Mint (`#2fd6a1`) for CTA button text on dark surfaces — more readable than pure Signal Green
- Dual-typography: `system-ui` for compressed display headings, `Inter` for precise UI/body text, `SFMono-Regular` for all code/terminal content
- Ultra-tight heading line-heights (1.0–1.11) with negative letter-spacing (-0.02em)
- Warm neutral palette (`#3d3a39`, `#8b949e`, `#b8b3b0`) that prevents the dark theme from feeling clinical

---

## 2. Color Palette & Roles

| Token | Hex | Role |
|-------|-----|------|
| `--color-canvas` | `#050507` | Abyss Black — page background |
| `--color-surface` | `#101010` | Carbon Surface — cards, panels |
| `--color-surface-2` | `#161616` | Elevated / hovered state |
| `--color-surface-3` | `#1d1d1d` | Dropdowns, popovers |
| `--color-hairline` | `#3d3a39` | Warm Charcoal — standard border/containment |
| `--color-hairline-strong` | `#524f4d` | Emphasis border |
| `--color-signal` | `#00d992` | Emerald Signal Green — brand accent, active states |
| `--color-mint` | `#2fd6a1` | VoltAgent Mint — CTA button text |
| `--color-snow` | `#f2f2f2` | Snow White — primary text |
| `--color-parchment` | `#b8b3b0` | Warm Parchment — secondary text |
| `--color-slate` | `#8b949e` | Steel Slate — tertiary / metadata |
| `--color-fog` | `#62666d` | De-emphasized, placeholders |
| `--color-warn` | `#ffba00` | Warning Amber |
| `--color-amber` | `#ff8c2a` | Amber — elevated warnings |
| `--color-danger` | `#fb565b` | Danger Coral — errors, critical violations |
| `--color-info` | `#4cb3d4` | Info Teal — informational |

---

## 3. Typography Rules

| Role | Font | Size | Weight | Line-height | Letter-spacing |
|------|------|------|--------|-------------|----------------|
| Display / Hero Number | `system-ui` | 60–64px | 600 | 1.00 | -0.02em |
| Section Heading | `system-ui` | 18–24px | 600 | 1.05 | -0.02em |
| Eyebrow / Overline | `Inter` | 11px | 600 | 1.4 | 0.45px + uppercase |
| Body / UI | `Inter` | 12–16px | 400–500 | 1.5 | normal |
| Code / Terminal | `SFMono-Regular` | 11–14px | 400 | 1.4 | normal |

---

## 4. Component Stylings

### Buttons
- **Primary CTA**: Carbon Surface bg (`#101010`) + VoltAgent Mint text (`#2fd6a1`) + Warm Charcoal border (`1px solid #3d3a39`) + hover → border shifts to Emerald Signal Green + text shifts to Signal Green
- **Destructive / Disengage**: Carbon Surface bg + Steel Slate text + hover → border shifts to Danger Coral / text shifts to Danger Coral
- **Ghost / Secondary**: Transparent bg + Warm Charcoal border + Steel Slate text + hover → Snow White text + stronger border
- **NEVER use colored (filled) backgrounds for buttons** — the "powered-on" signal is the mint text on dark, not a colored button fill

### Cards / Panels
- Background: `#101010` (Carbon Surface)
- Border: `1px solid #3d3a39` (Warm Charcoal) for standard; `2px solid #00d992` for active/highlighted
- Radius: `8px` for content cards; `6px` for smaller interactive elements
- Shadow: `rgba(92, 88, 85, 0.20) 0px 0px 15px` (Warm Ambient Haze) on hover/featured

### Status Indicators
- Active / Live: `#00d992` with `pulse-signal` animation
- Compromised / Error: `#fb565b` with `pulse-danger` animation
- Idle: `#62666d` (no animation)

---

## 5. Layout Principles

- Max container width: `1400px`, centered
- Base spacing unit: `8px`
- Cards maintain `p-5` (20px) internal padding
- Section gaps: `gap-6` (24px) between major sibling cards
- Border-defined separation — the Warm Charcoal border IS the whitespace signal

---

## 6. Depth & Elevation

| Level | Treatment |
|-------|-----------|
| Level 0 | No border, no shadow (page background only) |
| Level 1 | `1px solid #3d3a39` (standard cards — `.lift-1`) |
| Level 2 | `1px solid #524f4d` (elevated nested — `.lift-2`) |
| Level 3 (Accent) | `2px solid #00d992` (active/highlighted cards — `.ring-accent`) |
| Level 4 (Ambient) | `rgba(92, 88, 85, 0.20) 0px 0px 15px` (hover glow — `.haze`) |
| Level 5 (Dramatic) | `rgba(0,0,0,0.70) 0px 20px 60px` + inset ring (hero/modal — `.haze-dramatic`) |

---

## 7. Do's and Don'ts

### Do
- Use `#050507` for page background, `#101010` for ALL card/panel surfaces
- Reserve `#00d992` (Signal Green) for active states, live indicators, and accent borders only
- Use `#2fd6a1` (VoltAgent Mint) for CTA button text on dark surfaces
- Use `#3d3a39` (Warm Charcoal) as the primary border color — it's warm, not sterile
- Use `system-ui` with negative letter-spacing and tight line-heights for all display/heading text
- Use `SFMono-Regular` for ALL terminal output, code blocks, and status messages
- Use border weight/color shifts to communicate state — not background color fills

### Don't
- Don't use filled/colored button backgrounds — no purple (#7553ff), no filled green
- Don't use pure white (`#ffffff`) as body text — always `#f2f2f2` (Snow White) or `#b8b3b0` (Warm Parchment)
- Don't introduce warm colors (orange, yellow) as decorative accents — reserved for semantic states only
- Don't use Emerald Signal Green as a large surface or background fill
- Don't add duplicate UI sections that repeat data already shown in components
- Don't use shadows generously — depth comes from border treatment, not box-shadow
- Don't use border-radius larger than `8px` on content cards — `9999px` only for pills/tags/badges
