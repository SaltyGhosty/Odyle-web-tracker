---
name: Odyle Tracker
description: "Carta celeste de Atreia: each character is an astro of liquid light inside a ring of 56 stars, on a flat slate chart ruled in 1px gold (Luz) or silver (Sombra)."
colors:
  slate-dusk: "#2F3B55"
  slate-deep: "#1F2840"
  well-ink: "#18203A"
  parchment: "#F4E7C8"
  mist: "#B9C2D6"
  astro-gold: "#E3A853"
  astro-gold-bright: "#F2C77E"
  chart-sky: "#9CC3E6"
  crimson: "#D2453A"
  crimson-button: "#B9372D"
  crimson-text: "#FF9A8E"
  moss-ok: "#8FD9A8"
  amber-warn: "#FFC27A"
  abyss-night: "#1B1530"
  abyss-deep: "#120E22"
  abyss-well: "#0D0A19"
  abyss-ink: "#ECE8F6"
  abyss-mist: "#B9B3D0"
  abyss-violet: "#A58CE8"
  abyss-violet-bright: "#C9B8F5"
  abyss-silver: "#C8CDE4"
  abyss-liquid-deep: "#7A58C0"
  luz-liquid-deep: "#5C8DC2"
typography:
  brand:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "1.9rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.06em"
  page-title:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0"
  heading:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "1.2rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.03em"
  character-name:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.01em"
  energy-number:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "3rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  body:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.45
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  orb: "104px"
  orb-phone: "72px"
  rail: "232px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.parchment}"
    rounded: "{rounded.none}"
    typography: "{typography.label}"
    padding: "9px 16px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.astro-gold}"
    textColor: "{colors.slate-deep}"
    rounded: "{rounded.none}"
    padding: "9px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.astro-gold-bright}"
  button-spend-urgent:
    backgroundColor: "{colors.crimson-button}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.none}"
    height: "44px"
  button-spend:
    backgroundColor: "transparent"
    textColor: "{colors.chart-sky}"
    rounded: "{rounded.none}"
    height: "44px"
  panel:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.none}"
    padding: "16px"
  input:
    backgroundColor: "{colors.well-ink}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.none}"
    padding: "9px 12px"
    height: "44px"
  badge:
    backgroundColor: "{colors.astro-gold}"
    textColor: "{colors.slate-deep}"
    rounded: "{rounded.none}"
    padding: "3px 10px"
  rail:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.mist}"
    rounded: "{rounded.none}"
    width: "{spacing.rail}"
  rail-item-current:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.astro-gold}"
    rounded: "{rounded.none}"
    height: "44px"
---

# Design System: Odyle Tracker

Source of truth is the built CSS: the token block at the top of `index.html` (`:root` and `:root[data-faction="asmodian"]`), `web/social.css`, `starorb.js`, `runes.js`, `icons.js`, `layout.js`, `theme.js`. Frontmatter values are the Luz (Elyos) theme; Sombra overrides are listed under Colors and in `.impeccable/design.json`. This replaces the earlier white Elyos v2 and "laca y nacar" worlds.

## Overview

**Creative North Star: "Carta celeste de Atreia"**

Characters are astros on a star chart. Each one is a glass sphere of liquid light ringed by 56 four-point stars (one per +15 OD, 840 cap), and a gold meridian on a tick ruler measures time to the next recharge. The page is a flat chart: slate ground, 1px rules, square corners, no glass, no card shadows. Luz is a mid-tone golden dusk on slate (nothing white); Sombra is the violet Abyss with silver rules. Both are dark worlds; the same crimson marks "at cap" in both.

Density is calm and ruled: flat rows divided by hairlines rather than boxed cards. Everything that is not the orb is quiet so that the one hot thing (an astro at cap, crimson) reads first.

**Key Characteristics:**
- Two dark faction themes switched by `data-faction` on `<html>`; every colour on the page is a token.
- Rules, not boxes: 1px gold (Luz) or silver (Sombra) lines, square corners everywhere.
- Marcellus for brand, character names and section headings; Gothic A1 for UI with tabular numerals.
- One authored motion moment: the orb recharge ripple and the crimson cap beat.
- Authored line icons, drawn orbs; no photography, no 3D, no particles behind the page.

## Colors

Strategy: restrained, one faction accent plus one alarm colour. The accent (`--gold`) is gold in Luz and violet in Sombra; crimson is shared and reserved for "at cap".

### Primary
- **Astro Gold** (#E3A853, `--gold`): faction accent in Luz. Primary button fill, current rail item, heading marks, header rule, meridian, `Plan` and quick-spend highlights, lit orb stars. Bright variant **Astro Gold Bright** (#F2C77E, `--gold-bright`) for primary hover, numbers inside chips, active event rows, liquid top.
- **Abyss Violet** (#A58CE8, `--gold`) and **Abyss Violet Bright** (#C9B8F5) take the same roles in Sombra.

### Secondary
- **Chart Sky** (#9CC3E6, `--sky`): secondary data ink: class names, spend buttons, event times, orb rim, focus outline. Sombra: **Abyss Silver** (#C8CDE4).

### Tertiary
- **Crimson** (#D2453A, `--urgent`): the at-cap signal: lit stars and rim of a full orb, band underline. **Crimson Button** (#B9372D, `--urgent-strong`) fills the Gastar button of a full character and the band action; **Crimson Text** (#FF9A8E, `--danger`) is the text/error/destructive colour. Identical in Sombra.

### Neutral
- **Slate Dusk** (#2F3B55, `--bg`): Luz page ground. **Slate Deep** (#1F2840, `--bg-2`/`--glass`): rail, panels, sheets, toast. **Well Ink** (#18203A, `--field`): inputs and orb glass.
- **Parchment** (#F4E7C8, `--fg`) text; **Mist** (#B9C2D6, `--muted`) secondary text.
- Sombra: **Abyss Night** (#1B1530) ground, **Abyss Deep** (#120E22) panels, **Abyss Well** (#0D0A19) fields, **Ink** (#ECE8F6) text, **Mist** (#B9B3D0) muted.
- Rules: `--line` rgba(227,168,83,.32) gold / rgba(200,205,228,.30) silver; `--line-strong` at .6 for input and switch borders.
- Status: **Moss** (#8FD9A8, `--ok`), **Amber** (#FFC27A, `--warn`).
- Orb liquid runs `--orb-liquid-top` to `--orb-liquid-deep`: Luz #F2C77E to #5C8DC2, Sombra #C8CDE4 to #7A58C0.

### Named Rules
**The Crimson-Means-Cap Rule.** Crimson appears only for an astro at cap (or a destructive/error state). It is never decoration and never a faction accent.
**The Token-Only Rule.** No component writes a colour; it reads a variable, so both factions stay in step. The only literal is the crimson family, shared by both themes.
**The Gold-Is-The-Accent Rule.** `--gold` is whichever accent the faction owns; do not hard-code gold into Sombra surfaces.

## Typography

**Display Font:** Marcellus (with Trajan Pro, Georgia, serif)
**Body Font:** Gothic A1 (with system-ui, Segoe UI, sans-serif), loaded at 400/500/700/800

**Character:** An inscribed classical serif for things with names (the brand, characters, section headings) set against a plain humanist sans for everything you operate. Numerals are always tabular (`font-variant-numeric: tabular-nums` on body).

### Hierarchy
- **Brand** (Marcellus 400, 1.35rem, .06em tracking; 1.9rem in the rail, gold): the "Odyle" mark.
- **Page title** (Gothic 800, 1.625rem phone / 1.875rem desktop, 1.1): the section name, e.g. Energia.
- **Heading** (Marcellus 400, 1.2rem, .03em): panel headings (Eventos, Plan de hoy, social panels). Group titles 1.25rem.
- **Character name** (Marcellus 400, 1.5rem, 1.2): row names, also nicknames and plan row heads (1.0625rem).
- **Energy number** (Gothic 800, 3rem desktop / 2rem phone and compact, 1, tabular): the big per-row OD value; crimson text at cap.
- **Body** (Gothic 400, 15px, 1.45): default. Subtitle line 1rem muted with the live time in gold bold 1.0625rem.
- **Label** (Gothic 500-700, .8125-.875rem): buttons (700, .875rem), field labels (500, .8125rem), chips (500).
- **Micro** (Gothic 700, .6875-.75rem, uppercase, .08-.14em tracking): class name under a character, badges, meridian label. Only on data labels that carry information.

### Named Rules
**The Name-In-Marcellus Rule.** A proper name (brand, character, nickname, section heading) is Marcellus; any number, button or helper text is Gothic A1.
**The Tabular Rule.** Every counting number (OD, timers, counts) is tabular so columns and live clocks do not jitter.

## Layout

Two frames. At 900px and up a fixed 232px rail on the left and a centred column of at most 928px (`min(100%, 928px)`, page padding 28px 16px, 24px gap between blocks); from 1200px a fixed 248px events column on the right (the page gains 280px right margin). Below 900px the rail becomes a bottom bar of four items plus Mas, and the page reserves bottom space for it.

Character rows are a four-column grid: orb (104px; 72px under 720px; 64px compact) | name + class + status | number (132px) | actions (264px), gap 4px 20px, vertical padding 8px, 1px bottom rule. Every row uses the same orb column, so the orb and the name sit at the same x in every row (no zigzag). A dotted 1px gold constellation (2px dash, 5px gap, 75% opacity) runs straight from each orb centre to the next. On phones the grid becomes orb | text | number with actions on their own row.

Header: h1 title, live subtitle ("+15 OD en hh:mm:ss", character count, cap 840) and two worded actions (Ajustar recarga, Anadir personaje) sit on a tick ruler: long ticks every 48px, short every 12px, with the gold meridian (1px line, 7px rotated-square cap) positioned by `--mer`. On desktop the ruler is 30px tall and carries the countdown label on the meridian, flipping left of the line past about 60%; on phones the ruler is 12px with no label. Spacing rhythm is 4/8/12/16/24; tap targets are at least 44px.

Next-decision band: a single line with a 1px bottom rule, 8px vertical padding, tone by rule colour (crimson at cap, gold when waste is coming, neutral otherwise) and a Gastar action.

## Elevation & Depth

Flat. There are no card shadows and no glass or backdrop blur (`--shadow: none`). Depth is carried by hairline rules (1px, 32% alpha), the step from slate ground to deeper panel fill, and a 1px gold or silver border on anything that floats (menus, sheets, toast, modals, assistant panel). The scrim behind modals and the Mas sheet is a flat translucent navy/near-black. The only halo in the build is a 3px ring of faction gold at 35% on the "near cap" status diamond.

### Named Rules
**The Rule-Not-Shadow Rule.** To separate or lift something, draw a 1px rule or step the fill. Never add a shadow, blur or glass.

## Shapes

Square. Every button, input, panel, sheet, badge, avatar, chip and bar has a 0 radius. The recurring silhouettes are the diamond (a rotated 6-7px square marks "next recharge" status and the meridian cap), the 1px rule, and the circle only where it is the orb itself. Borders are 1px: gold or silver for controls, `--line` for dividers, dashed `--line` for empty states and the legion code.

## Components

### Buttons
- **Shape:** square, 1px gold border, 44px minimum height, padding 9px 16px, Gothic 700 .875rem.
- **Default:** transparent fill, parchment text; hover (pointer devices only) adds a 7% parchment wash; press scales to .97 (160ms ease-out, off with reduced motion).
- **Primary:** solid faction accent with deep ink text; hover brightens to `--gold-bright`. In rows the primary Actualizar is transparent with a gold border.
- **Spend:** sky border and text; on a character at cap it becomes solid Crimson Button with parchment text. Danger: crimson text, crimson-button border.
- **Focus:** 2px sky outline, 2px offset.

### Orb column (signature: the star-orb)
A drawn SVG, 104 viewBox: a glass sphere (radius 36, Well Ink fill) holding a liquid whose level equals energy/840, with a gently waved surface (36-unit wavelength), a 1px sky rim at 75% and a faint highlight; around it a ring (radius 46) of 56 four-point stars, 3.3 units (4 on orbs under 60px such as the friends list), one per +15 OD. Lit stars are faction accent; unlit stars are parchment at 26%. At cap, lit stars and the rim turn crimson. Motion, only when `prefers-reduced-motion` allows it and "Reducir animaciones" (body.calm) is off: a 900ms recharge ripple that slides the surface one wavelength while the newest star scales in over 500ms (started only by a gain, never by the per-second repaint), and a 2.4s crimson beat of the ring at cap, phased on the wall clock. A floating "+15" gain label rises over the orb.

### Character row
Name in Marcellus 1.5rem; class in micro sky caps; status line with a gold diamond (crimson diamond when OD is being lost); big energy number; actions Gastar or Actualizar plus a square 44px overflow button opening a gold-bordered menu (fade/scale 160ms).

### Quick spends and Plan de hoy
Quick spends: a heading naming the urgent character in gold, then a wrap of 44px chips (card-fill, hairline border, price in bright gold) with a muted underlined Undo chip pushed right. Plan de hoy: a table on desktop (minimum 520px, 44px rows, header with a gold bottom rule, names in Marcellus, hot cells crimson bold, dim cells muted); on phones each character becomes a block with the name and next goal on top and compact "Nx spend" values beneath.

### Navigation
Rail (desktop): slate-deep fill, gold right rule, brand block with hairline, items with authored stroke icons (22px, 1.75 stroke), muted text, current item gold bold on a 10% gold wash, square gold count badges, a foot with the Luz/Sombra switch (two pressed-state buttons, pressed fills with accent), profile chip and fan-site notice. Phone: bottom bar of four items (Energia, Eventos, Amigos, Chat on web) with 0.7rem labels and a gold top rule, plus Mas. The Mas sheet is a bottom sheet with a 3-column grid of square tiles and the fan notice centred below.

### Events panel
Flat panel: from 1200px a fixed 248px column with a gold top border and an uppercase gold small heading; otherwise a collapsible Eventos panel. Rows are hairline-separated, times in sky tabular, active event in bright gold on a 10% gold wash, two columns from 860px.

### Toast and alert
The undo toast is a slate-deep bar with a 1px gold border, centred on desktop and, under 900px, docked full-width directly above the bottom bar (top and bottom rules only); the page reserves its height while shown and the assistant button lifts above it.

### Inputs and badges
Fields: Well Ink fill, 1px strong rule, 44px, no radius; invalid state recolours the border to crimson text. Badges are square, accent fill with deep ink text, bold tabular 0.7rem.

## Do's and Don'ts

### Do:
- **Do** read every colour from a variable, and verify both `data-faction` themes.
- **Do** draw separation with a 1px `--line` rule; use `--line-strong` on interactive borders.
- **Do** keep all corners square (0 radius) and badges square.
- **Do** keep the orb column identical in every row and the constellation straight and dotted.
- **Do** put names in Marcellus and operable text and numbers in Gothic A1 tabular.
- **Do** give any new motion a `prefers-reduced-motion` gate and the body.calm switch, and start it from an event, not from the per-second repaint.
- **Do** keep tap targets at 44px minimum and the toast docked above the bottom bar on phones.

### Don't:
- **Don't** use crimson for anything that is not at-cap or destructive.
- **Don't** add card shadows, backdrop blur or glass, or rounded cards.
- **Don't** return to a white or light Elyos; Luz stays mid-tone slate dusk.
- **Don't** put 3D, particles or imagery behind the page; the orbs are drawn.
- **Don't** replace the authored line icons with glyph characters or an icon set.
- **Don't** set a display face other than Marcellus for names or headings.

## Account pages (login, register, reset)

Faction-neutral by design, since the visitor has not chosen Luz or Sombra yet: graphite night `#262A36`, panel `#1B1E28`, starlight ink `#ECE6D9`, a starlight primary button `#D8CEB8`, sky links `#A9C4E0`. Gold and silver appear only together, in the split-sky emblem above the title (half gold, half silver, a ring of 12 stars, a meridian). A tick rule under the subtitle echoes the app header. Same Marcellus and Gothic A1, square corners, 1px rules.
