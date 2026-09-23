# v2 look: "the thread"

His brief (2026-09-23): the v2 UI read as default shadcn cards on grey, "boring and trivial". Redesign drastically,
Apple-grade, still for everyday office workers (plain words; technical detail only in Details).

## The idea

You hand a brief to a colleague and watch the work happen. The agent's work is one **golden thread** drawn through
its plan: it grows step by step while the agent works, a bright bead marks where it is, and it settles into green
when the work is done. The thread is the one memorable thing on the screen. Everything around it is quiet,
graphite on mist, like a well-made desk tool.

Subject words to design with: brief, hand over, the plan, the thread, what it made, looks right, try it on an
example, ready to use.

## Tokens (in `src/app/globals.css`, light / dark via `light-dark()`)

| name | light | dark | job |
|---|---|---|---|
| mist | `#EDF0F4` | `#0D1219` | the app's ground behind every surface |
| paper | `#FFFFFF` | `#151C26` | the run sheet, dialogs, the composer |
| graphite | `#17202B` | `#E6EBF2` | text and the primary button (an ink pill, not a blue button) |
| slate | `#5B6878` | `#98A4B3` | secondary text (checked at 4.5:1 on paper and mist) |
| saffron | `#E89A0C` | `#F5B437` | the agent at work: the thread while running, the live bead, "working" |
| fern | `#15845A` | `#3CC489` | done, looks right, approved, ready |
| crimson | `#C62F43` | `#F0697A` | failed, blocked, not right |
| hairline | graphite at 8% | white at 9% | separators, never a box around everything |

No blue anywhere except the browser's own focus ring colour, which is graphite here. Links are graphite, underlined.

## Type

- **Display: Funnel Display** (`next/font/google`, variable). Only for the brief as a run's title, page titles,
  an automation's command in the gallery, and the empty state's question. Sizes 28-44 px, line-height 1.05-1.15,
  tracking -0.02em (tighter as it grows).
- **Everything else: the system font** (`system-ui`, SF Pro on a Mac) with `font-optical-sizing: auto`, body 15 px
  / 1.5, small text 13 px with +0.01em tracking. Numbers `tabular-nums`.
- Hierarchy from weight + size + leading together. No all-caps labels, no eyebrow labels, no monospace outside
  Details, no one-word accent in a headline, no "A · B · C" meta strings, no "->" on buttons.

## Materials and depth (Apple)

- **Ground**: mist. **Sheets**: paper, radius 22 px, a two-layer shadow (a 1 px contact shadow and a soft 24 px
  ambient one), no border.
- **Top bar and composer are glass**: paper at ~72% with `backdrop-filter: blur(20px) saturate(180%)`, a light top
  edge; content scrolls under them; a soft fade mask where content meets them, not a 1 px line.
- **Rail**: a heavier, tinted material (mist darkened 3%), no card per row: rows are text on the material, the
  selected row is a paper chip.
- **Details** is a parallel panel, not a modal: it slides in from the right over the run with no scrim, and leaves
  the same way.
- Radius by size: sheet 22, tile 16, control 12, chip and pill fully round. `prefers-reduced-transparency`: solid
  paper, no blur. `prefers-contrast: more`: solid surfaces with a visible border.

## Motion

- Springs for anything that moves in space (the `motion` package): critically damped by default
  (`bounce: 0, duration: 0.35`), `bounce 0.2` only after a flick or drag. Animate transform and opacity only,
  from the current on-screen value, never lock input during a transition.
- Press feedback on pointer-down: controls scale to 0.97 in 100 ms.
- **The one orchestrated moment**: pressing Run hands the brief over - the text you typed travels from the
  composer into the run's title (React `<ViewTransition>` shared element, which Next 16 supports without config),
  and the thread starts drawing. No entrance animations anywhere else, no hover lift on cards.
- The thread: the filled length grows with a spring as steps finish; the running bead breathes slowly (opacity
  and scale, 1.6 s, not a spin); a finished step's node fills fern with a small spring pop.
- Reduced motion: every spring becomes a 150 ms cross-fade; the bead stops breathing; nothing is skipped.

## Screens

- **Home, no run open (first visit)**: the paper sheet holds one large question in display type, "What should
  the agent do?", the composer under it (large, glass, focused), and under the composer the workspace's saved
  automations as `/command` tokens you can click. No example prompts (his rule: free text, no presets).
- **Home, a run open**: the brief as the title (display type); one line of outcome in plain words beside a status
  glyph; "Why?" as a quiet disclosure; the thread with its steps and notes (the hero); "What it made" as deliverable
  tiles (a CSV tile shows its row count and first columns; a chart tile shows the chart; a spreadsheet tile its
  sheets); the report at a reading width of 66 ch; actions (Make an automation, Ask for a change) as a quiet row at
  the end. The composer floats at the bottom of the sheet as a glass capsule.
- **Automations**: a gallery where each automation is a command token in display type (`/audit`) with one line of
  what it produces and its state (Draft, Ready, Off). The builder reads like a document: the brief with `{input}`
  shown as an inline token, the outputs and steps as editable lists; "Try it" is a column of example cards, each
  with a mini thread and Looks right / Not right; approval is a bar that fills as examples are judged.
- **Settings**: grouped inset lists, like iOS Settings: rounded groups on the mist, rows with a trailing control,
  a short plain footer under a group when it needs one.
- **Sign-in**: a split: on the left the thread draws itself once through three example steps on the mist; on the
  right the form on paper.
