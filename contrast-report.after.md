# Contrast audit — 2026-05-23T14:40:05.260Z

Targets: text ≥ 4.5:1 (≥ 3:1 if large), UI/border/bg ≥ 3:1.

## Header (pre-search)

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Brand wordmark | fg:`rgb(255, 56, 92)` / bg:`rgb(255, 255, 255)` (large) | 3.52 | 3.0 | PASS |
| Search input value | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Search input border | fg:`rgb(130, 130, 130)` / bg:`rgb(255, 255, 255)`  | 3.84 | 3.0 | PASS |
| Plan trip button | fg:`rgb(255, 255, 255)` / bg:`rgb(227, 28, 95)`  | 4.57 | 4.5 | PASS |
| Sign in button | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Sign in button border | fg:`rgb(130, 130, 130)` / bg:`rgb(255, 255, 255)`  | 3.84 | 3.0 | PASS |
| Hamburger button border | fg:`rgb(130, 130, 130)` / bg:`rgb(255, 255, 255)`  | 3.84 | 3.0 | PASS |

## Search results (Tokyo)

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Card body bg vs page bg | fg:`rgb(255, 255, 255)` / bg:`rgb(240, 240, 240)`  | 1.14 | 1.1 | PASS |
| Card border vs page bg | fg:`rgb(204, 204, 204)` / bg:`rgb(240, 240, 240)`  | 1.41 | 1.1 | PASS |
| Card title text | _missing_ | — | — | SKIP |
| Activity name | _missing_ | — | — | SKIP |
| Activity summary | _missing_ | — | — | SKIP |
| Activity num chip | _missing_ | — | — | SKIP |
| Tab button (inactive) | fg:`rgb(89, 89, 89)` / bg:`rgb(255, 255, 255)`  | 7.00 | 4.5 | PASS |
| Tab button (active) | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Globe chip (inactive) | _missing_ | — | — | SKIP |
| Wishlist tab text | fg:`rgb(34, 34, 34)` / bg:`rgb(228, 228, 228)`  | 12.51 | 4.5 | PASS |

## Wishlist overlay

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Wishlist overlay title | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| List tab inactive text | _missing_ | — | — | SKIP |
| List tab inactive border | _missing_ | — | — | SKIP |
| List tab count | _missing_ | — | — | SKIP |
| Empty state message | fg:`rgb(89, 89, 89)` / bg:`rgb(255, 255, 255)`  | 7.00 | 4.5 | PASS |

## Plan mode

| Pair | Sample | Ratio | Target | Status |
| --- | --- | ---: | ---: | :---: |
| Plan day card bg vs page bg | fg:`rgb(255, 255, 255)` / bg:`rgb(228, 228, 228)`  | 1.27 | 1.1 | PASS |
| Plan day card border | fg:`rgb(204, 204, 204)` / bg:`rgb(228, 228, 228)`  | 1.26 | 1.1 | PASS |
| Plan day title | _missing_ | — | — | SKIP |
| Plan day total (muted) | _missing_ | — | — | SKIP |
| Plan session card bg | _missing_ | — | — | SKIP |
| Plan session border | _missing_ | — | — | SKIP |
| Plan session name | _missing_ | — | — | SKIP |
| Plan session addr | _missing_ | — | — | SKIP |
| Plan phase label | fg:`rgb(34, 34, 34)` / bg:`rgb(255, 255, 255)`  | 15.91 | 4.5 | PASS |
| Plan phase count | fg:`rgb(89, 89, 89)` / bg:`rgb(255, 255, 255)`  | 7.00 | 4.5 | PASS |
| Plan inline input text | _missing_ | — | — | SKIP |
| Plan inline input border | _missing_ | — | — | SKIP |
| Plan inline separator | _missing_ | — | — | SKIP |
| Plan day tab inactive | fg:`rgb(89, 89, 89)` / bg:`rgb(240, 240, 240)`  | 6.15 | 4.5 | PASS |
| Plan empty hint | _missing_ | — | — | SKIP |


## Summary

- PASS: 19
- FAIL: 0
- SKIP: 18
