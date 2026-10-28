---
name: Odyle Tracker
description: "Engaste de orbes: each character is an orb of liquid light in a ring of 56 runes, set in a gold (Luz) or violet (Sombra) hairline, on rounded cards floating over a slowly living sky."
colors:
  slate-dusk: "#2F3B55"
  slate-deep: "#1F2840"
  well-ink: "#18203A"
  parchment: "#F4E7C8"
  mist: "#B9C2D6"
  astro-gold: "#E3A853"
  astro-gold-bright: "#F2C77E"
  chart-sky: "#9CC3E6"
  sky-blue-deep: "#5C8DC2"
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
  abyss-violet-deep: "#7A58C0"
typography:
  page-title:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0"
  heading:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.03em"
  stage-name:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "58px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
  tile-name:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.2
  event-name:
    fontFamily: "Marcellus, Trajan Pro, Georgia, serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.25
  stage-number:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  tile-number:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  countdown:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  clock-value:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
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
  micro:
    fontFamily: "Gothic A1, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  control: "10px"
  popover: "12px"
  inner-card: "14px"
  card: "18px"
  orb-ring: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "28px"
  topbar-height: "72px"
  clock-height: "48px"
  tap: "44px"
  stage-orb: "390px"
  tile-orb: "136px"
components:
  topbar:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.parchment}"
    height: "{spacing.topbar-height}"
    padding: "0 36px"
  clock:
    backgroundColor: "{colors.slate-dusk}"
    textColor: "{colors.chart-sky}"
    rounded: "{rounded.control}"
    typography: "{typography.clock-value}"
    height: "{spacing.clock-height}"
    padding: "0 14px"
  clock-reset:
    backgroundColor: "{colors.slate-dusk}"
    textColor: "{colors.astro-gold-bright}"
    rounded: "{rounded.control}"
    height: "{spacing.clock-height}"
  stage:
    backgroundColor: "{colors.well-ink}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.card}"
    padding: "40px 28px 36px"
  case:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.card}"
    padding: "28px 32px 32px"
  tile:
    backgroundColor: "{colors.slate-dusk}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.card}"
    padding: "22px 12px 14px"
  event-card:
    backgroundColor: "{colors.slate-dusk}"
    textColor: "{colors.mist}"
    rounded: "{rounded.inner-card}"
    padding: "18px 20px 20px"
  panel-card:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.card}"
    padding: "22px"
  button:
    backgroundColor: "transparent"
    textColor: "{colors.parchment}"
    rounded: "{rounded.control}"
    typography: "{typography.label}"
    padding: "9px 16px"
    height: "{spacing.tap}"
  button-primary:
    backgroundColor: "{colors.astro-gold}"
    textColor: "{colors.slate-deep}"
    rounded: "{rounded.control}"
    height: "{spacing.tap}"
  button-primary-hover:
    backgroundColor: "{colors.astro-gold-bright}"
  button-spend-urgent:
    backgroundColor: "{colors.crimson-button}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.control}"
    height: "{spacing.tap}"
  input:
    backgroundColor: "{colors.well-ink}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "{spacing.tap}"
  popover:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.popover}"
    padding: "6px"
  fan-foot:
    backgroundColor: "{colors.slate-deep}"
    textColor: "{colors.mist}"
    padding: "14px 16px"
---

# Design System: Odyle Tracker

Source of truth is the shipped CSS: the token block and inline styles of `index.html` (`:root` and `:root[data-faction="asmodian"]`), `web/auth.css`, `web/social.css`, `sky.js` with `web/sky-boot.js`, and `icons.js`. Frontmatter values are Luz (Elyos); Sombra overrides are under Colors and in `.impeccable/design.json`. This replaces the earlier "Carta celeste" world (flat slate chart, square corners, 1px rules).

## Overview

**Creative North Star: "Engaste de orbes"**

An orb is a jewel and the page is its setting. The most urgent character sits on a stage: a 3D orb of liquid light inside a ring of 56 Atreia runes, closed by a thin gold (Luz) or violet (Sombra) hairline circle, the setting. Beside it a case holds the other characters as round-cornered tiles, each with its own smaller orb. Everything sits on soft rounded cards over a living sky of slow gold and blue light, so the page feels like a night over Atreia, not a spreadsheet.

Both themes are dark and mid-tone: Luz is golden dusk on slate (nothing white), Sombra is the violet Abyss with silver. Card ground steps from sky to bar to card to field; separation comes from tone, not lines. Crimson is shared by both and means one thing: someone is at cap.

**Key Characteristics:**
- Two faction themes switched by `data-faction` on `<html>`; every colour is a token, including the three sky tokens `--sky-1..3`.
- Rounded cards (18px) with 10px controls; the only 1px gold/violet lines are hairlines that mean something (reset, setting, bar edge).
- Marcellus for names and headings, Gothic A1 tabular for everything operated or counted.
- One-line top bar with three clocks, then stage plus case; the orb is the focal point.
- Motion is slow and optional: living sky, refill pulse, one-time entrances, floating tile orbs.

## Colors

Restrained: one faction accent, one sky ink, one alarm colour. The accent token `--gold` is gold in Luz and violet in Sombra.

### Primary
- **Astro Gold** (`--gold`): accent in Luz. Primary button fill, lit runes, setting hairline (40% mix), reset hairline (75% mix), current menu item, selected tile ring. **Astro Gold Bright** (`--gold-bright`) is hover, big numbers, reset and active clock/event values.
- **Abyss Violet** and **Abyss Violet Bright** take the same roles in Sombra.

### Secondary
- **Chart Sky** (`--sky`): secondary data ink: clock values, class names, orb rim, focus outline. Sombra: **Abyss Silver**.
- **Sky Blue Deep** (`--sky-3`, also the liquid's deep end in Luz) and Abyss Violet Deep (Sombra) complete the living-sky trio: `--sky-1` gold, `--sky-2` chart sky, `--sky-3` blue deep (Sombra: violet, silver, violet deep).

### Tertiary
- **Crimson** (`--urgent`): the at-cap signal: tile inset ring, full orb runes and rim, stage glow. **Crimson Button** (`--urgent-strong`) fills the spend button of a full character; **Crimson Text** (`--danger`) is error, destructive and "lost OD" text. Identical in both themes.

### Neutral
- **Slate Dusk** (`--bg`): page ground, clock fill, tile and event-card fill. **Slate Deep** (`--bg-2` / `--glass`): top bar, clock strip, case, panel cards, popovers, fan-foot. **Well Ink** (`--field`): stage, inputs, orb glass, Hoy items.
- **Parchment** (`--fg`) text; **Mist** (`--muted`) secondary text.
- Sombra: **Abyss Night** ground, **Abyss Deep** cards, **Abyss Well** fields, **Abyss Ink** text, **Abyss Mist** muted.
- Status: **Moss** (`--ok`), **Amber** (`--warn`). Rules: `--line` (gold .32 / silver .30) and `--line-strong` (.6) for control borders only.

### Named Rules
**The Crimson-Means-Cap Rule.** Crimson appears only for a character at cap or for destructive and error states. Never decoration, never an accent.
**The Token-Only Rule.** A component reads a variable; it never writes a colour, so both factions stay in step. The sky reads `--sky-1..3` and nothing else.
**The Tone-Not-Line Rule.** Separate cards by stepping the ground (sky, bar, card, field); a line is allowed only as a hairline that carries meaning.

## Typography

**Display Font:** Marcellus (with Trajan Pro, Georgia, serif)
**Body Font:** Gothic A1 (with system-ui, Segoe UI, sans-serif), 400/500/700/800

**Character:** An inscribed classical serif for things with names, set against a plain humanist sans for everything you operate. Numerals are tabular on body so live clocks and counts do not jitter.

### Hierarchy
- **Stage name** (Marcellus 400, 58px, 1; 2.5rem under 900px): the featured character.
- **Heading** (Marcellus 400, 1.5rem desktop / 1.3125rem phone, .03em; 1.625rem on the case): card and panel titles. Stage-empty title 2rem.
- **Tile name** (Marcellus 400, 1.25rem) and **event name** (Marcellus 1.1875rem).
- **Numbers** (Gothic 800): stage OD 2.5rem, tile OD 1.875rem, both tabular, bright gold, crimson text at cap. Event countdown 32px weight 700 in sky, bright gold when reset or active.
- **Page title** (Gothic 800, 1.625rem phone / 1.875rem desktop, 1.1) and **Body** (Gothic 400, 15px, 1.45).
- **Label** (Gothic 700, .875rem buttons; 500 .8125rem field labels). **Clock value** 18px 700 (17px in the phone strip).
- **Micro** (Gothic 700-800, 11px, uppercase, .12-.14em): clock names, class under a character, Premium mark. Data labels only.

### Named Rules
**The Name-In-Marcellus Rule.** A proper name (character, event, heading) is Marcellus; every number, button and helper is Gothic A1.
**The Tabular Rule.** Every counting number is tabular.

## Layout

Page column is `min(100%, 928px)` centred, 28px 16px padding, 24px gap. Energía widens to 1408px and splits into stage (560px; 40% min 420px from 900 to 1199px) and a flexible case, 24px gap, stage sticky at top 16px. Under 900px they stack with 20px gap.

Top bar: at 900px and up one grid line, 72px tall, 36px side padding, 32px gap: logo, menu, then clocks, profile and Luz/Sombra. From 1200px all three clocks show (daily reset, refill, event); 900-1199px shows the daily reset and a "Relojes" popover for the rest. Under 900px the bar is logo, profile, switch, and the clocks ride in a sticky strip below it (daily reset first, event name may wrap, no label or value clipped at 390px), with navigation in a bottom bar and Más sheet.

Tiles fill the case in an auto-fill grid (min 224px, 18px gap), orb on top, name, class, number, actions. Event cards: auto-fill, min 260px, 12px gap. Spacing rhythm 4/8/12/16/24/28; tap targets 44px minimum, clocks 48px.

## Elevation & Depth

Flat tonal layering; no drop shadows (`--shadow: none`) and no blur. Depth is the step of ground: sky, then bar and case (`--bg-2`), then tiles and event cards (`--bg`), then stage and fields (`--field`). Emphasis is an inset ring (`box-shadow: inset 0 0 0 1px` or `2px`) in accent or crimson, never an outer shadow. The stage turns red only by a radial glow behind the orb when someone is at cap. Popovers and menus take a 1px `--line-strong` or gold border.

### Named Rules
**The Inset-Ring Rule.** Marking a card (reset, active, selected, full) is an inset ring, 1px for a standing fact, 2px for a state.

## Shapes

Soft and round, in three steps: 18px for stage, case, tiles and panel cards; 14px for cards nested in a card (event cards, Hoy items, inner panels); 10px for buttons, fields, chips and clocks; 12px popovers and 6-8px menu items. The orb and its setting are circles. Buttons keep a 1px accent border; fields a 1px strong rule. The setting is a 1px circle at 40% accent, 10px outside the rune ring (390px slot, 410px hairline), crimson at 55% at cap.

## Components

### Top bar and clocks
Slate-deep bar with an 18% accent bottom hairline. Each clock is a 48px, 138px-minimum, 10px-radius tile on the ground colour: micro name above, 18px sky value below. The daily reset clock carries the 75% accent inset hairline with accent name and bright value; hover (pointer only) lifts the fill 7%. Popovers (Más, Relojes) are 12px, placed under their button.

### Stage (signature: orb in its setting)
Well Ink card, 18px, centred column: orb slot (390px, 320px at 900-1199px, up to 280px on phones) with the 3D orb and its rune ring, the 1px setting circle, the name, the OD number, why-line, actions. At cap the setting and glow go crimson and the main action fills Crimson Button. Empty state shows a dimmed orb.

### Character tiles
Slate-dusk 18px cards, orb 136px on top, centred name, uppercase sky class, tile number, 44px actions. Hover (pointer only) mixes 5% parchment; selected is a 2px accent inset ring; full is a 2px crimson inset ring with the spend button in Crimson Button. The orb is a button that moves the character to the stage.

### Event cards
Slate-dusk 14px cards: Marcellus name, muted note, 32px countdown. Resets lead and carry the 1px 75% accent hairline with bright gold values; the active event carries a 2px accent ring.

### Buttons and fields
44px minimum, 10px radius inside cards, Gothic 700 .875rem, transparent with accent border; primary fills with accent and deep ink, hover brightens; danger has crimson text and border. Press scales .97 over 160ms. Focus is a 2px sky outline, 2px offset. Fields are Well Ink with a strong 1px rule; invalid recolours the border to crimson text.

### Rune orb
Drawn SVG (and the WebGL orb on the stage and tiles): glass sphere with liquid at energy/cap (560 Normal, 840 Premium), sky rim, ring of 56 original runes (28 glyphs repeated), one per 1/56 of the cap. Lit runes take the accent; unlit are parchment at 26%; at cap lit runes and rim go crimson.

### Fan foot
Slate-deep strip at the page end with a faint 12% accent top hairline, centred muted text; on phones padded 84px below to clear the bottom bar.

### Motion grammar
- **Living sky:** canvas behind the page (8px oversize for mouse parallax), three drifting blobs and motes in `--sky-1..3` (40 at 30fps desktop, 16 at 24fps under 900px). One still frame with reduced motion or "Reducir animaciones" (lite); paused while the tab is hidden. Account pages run the same sky with Luz tokens.
- **Refill pulse:** a ring from the stage orb into the sky on each recharge, started by the event, never by the per-second repaint. Orb ripple 900ms with the new rune flaring 500ms; floating gain label 1.6s.
- **Entrances:** `rise` .45s, 14px, first time a section is shown per session, 60ms steps, at most 6.
- **Orb float:** tile orbs bob 6px over 4s, each out of phase; numbers never move. Crimson beat 2.4s at cap.
- **Gates:** everything above is inside `prefers-reduced-motion: no-preference` and off under `body.calm`; menus 160ms and sheets 240ms ease-out.

### Account pages
Faction-neutral Luz tokens (`web/auth.css`) over the same living sky, Marcellus titles, the split gold/silver emblem. Social screens follow the same card skin (`web/social.css`).

## Do's and Don'ts

### Do:
- **Do** read every colour from a variable and check both `data-faction` themes.
- **Do** use 18px for top-level cards, 14px for cards inside them, 10px for controls.
- **Do** mark a card state with an inset ring, not an outer shadow.
- **Do** keep names in Marcellus and numbers, buttons and helpers in Gothic A1 tabular.
- **Do** gate any new motion behind `prefers-reduced-motion` and `body.calm`, and start it from an event, not from the per-second repaint.
- **Do** keep tap targets at 44px and clock text unclipped at 390px.

### Don't:
- **Don't** use crimson for anything that is not at-cap or destructive.
- **Don't** add drop shadows, backdrop blur or glass; stack tone instead.
- **Don't** put text directly on the sky; text lives on a card.
- **Don't** return to a white Elyos or to square corners on cards.
- **Don't** replace the authored line icons with glyph characters or an icon set.
- **Don't** copy the official Aion 2 script, NCSOFT art or Elder Futhark runes into the ring; the 28 glyphs are original.
- **Don't** set a display face other than Marcellus for names or headings.
