# Aion 2 Stamina Tracker — Decisions Log

_Date: 2026-10-10 · Status: brainstorming (design not yet approved)_

## Goal

A small app to track **Odyle (OD) energy** across several Aion 2 characters, so I can
see at a glance how much each one has and when they will be full.

## Decisions so far

| # | Decision | Reason |
|---|----------|--------|
| 1 | Main purpose: **track several characters** at once | Multiple alts, one place to check |
| 2 | Platform: **web page** (runs in a browser on PC or phone) | Simplest to build and change |
| 3 | Data entry: **manual** — I type each character's current energy; the app counts it up from there | No public Aion 2 API exposes live energy; scraping or reading the game client is fragile and may break the game's terms of service |
| 4 | Regen rule: **+15 OD energy every 3 hours** (= 120 per day) | Stated by user |
| 5 | Max energy: **840 for every character** | Confirmed by user |
| 6 | Ticks are **shared**: all characters get +15 at the same clock times | Confirmed by user; app keeps one tick schedule |
| 7 | Storage: **synced across PC and phone** (hosted page) | Same numbers on any device |
| 8 | Alerts: **none** — just a page to check | Keep it simple (YAGNI) |

## Starting data (as entered on 2026-10-10)

| Character | OD energy | Max | Next +15 in |
|-----------|-----------|-----|-------------|
| SaltyGhosty (main) | 225 | 840 | 37 min |
| shutaruku | 180 | 840 | 37 min |
| PraiseTheSun | 90 | 840 | 37 min |

## Observations

- All three characters show the same 37 minutes to the next tick, which suggests the
  +15 ticks happen at **fixed server times** (every 3 h), not per character. If true,
  the app only needs one shared tick schedule plus each character's energy value.
- Time to full at this rate: SaltyGhosty ≈ 41 ticks (~5.1 days), shutaruku ≈ 44 ticks
  (~5.5 days), PraiseTheSun ≈ 50 ticks (~6.25 days).

## Open questions

1. How to host and sync the page (approach choice pending).
