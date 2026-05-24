# Contrast audit — 2026-05-23T14:31:21.180Z

Targets: text ≥ 4.5:1 (≥ 3:1 if large), UI/border/bg ≥ 3:1.

## Header (pre-search)

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Brand wordmark | fg:`rgb(255, 56, 92)` / bg:`rgb(255, 255, 255)` (large) | 3.52 | 3.0 | PASS |
| Search input value | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Search input border | fg:`rgb(221, 221, 221)` / bg:`rgb(255, 255, 255)`  | 1.36 | 3.0 | FAIL |
| Plan trip button | fg:`rgb(255, 255, 255)` / bg:`rgb(255, 56, 92)`  | 3.52 | 4.5 | FAIL |
| Sign in button | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Sign in button border | fg:`rgb(221, 221, 221)` / bg:`rgb(255, 255, 255)`  | 1.36 | 3.0 | FAIL |
| Hamburger button border | fg:`rgb(221, 221, 221)` / bg:`rgb(255, 255, 255)`  | 1.36 | 3.0 | FAIL |

## Search results (Tokyo)

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Card body bg vs page bg | fg:`rgb(255, 255, 255)` / bg:`rgb(247, 247, 247)`  | 1.07 | 3.0 | FAIL |
| Card border vs page bg | fg:`rgb(235, 235, 235)` / bg:`rgb(247, 247, 247)`  | 1.11 | 3.0 | FAIL |
| Card title text | _missing_ | — | — | SKIP |
| Activity name | _missing_ | — | — | SKIP |
| Activity summary | _missing_ | — | — | SKIP |
| Activity num chip | _missing_ | — | — | SKIP |
| Tab button (inactive) | fg:`rgb(113, 113, 113)` / bg:`rgb(255, 255, 255)`  | 4.88 | 4.5 | PASS |
| Tab button (active) | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Globe chip (inactive) | _missing_ | — | — | SKIP |
| Wishlist tab text | fg:`rgb(34, 34, 34)` / bg:`rgb(247, 247, 247)`  | 14.85 | 4.5 | PASS |

## Wishlist overlay

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Wishlist overlay title | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| List tab inactive text | _missing_ | — | — | SKIP |
| List tab inactive border | _missing_ | — | — | SKIP |
| List tab count | _missing_ | — | — | SKIP |
| Empty state message | fg:`rgb(113, 113, 113)` / bg:`rgb(255, 255, 255)`  | 4.88 | 4.5 | PASS |

## Plan mode

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Plan day card bg vs page bg | _missing_ | — | — | SKIP |
| Plan day card border | _missing_ | — | — | SKIP |
| Plan day title | _missing_ | — | — | SKIP |
| Plan day total (muted) | _missing_ | — | — | SKIP |
| Plan session card bg | _missing_ | — | — | SKIP |
| Plan session border | _missing_ | — | — | SKIP |
| Plan session name | _missing_ | — | — | SKIP |
| Plan session addr | _missing_ | — | — | SKIP |
| Plan phase label | _missing_ | — | — | SKIP |
| Plan phase count | _missing_ | — | — | SKIP |
| Plan inline input text | _missing_ | — | — | SKIP |
| Plan inline input border | _missing_ | — | — | SKIP |
| Plan inline separator | _missing_ | — | — | SKIP |
| Plan day tab inactive | _missing_ | — | — | SKIP |
| Plan empty hint | _missing_ | — | — | SKIP |


## Summary

- PASS: 8
- FAIL: 6
- SKIP: 23
