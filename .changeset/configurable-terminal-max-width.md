---
"@nanocollective/nanocoder": minor
---

- Fixed the **hardcoded 120-column width cap** that left most of a wide terminal unused — a 190-column terminal was clamped to a 120-column interface. The default cap is now 160 columns, and it is configurable with `terminal.maxWidth` in `nanocoder-preferences.json`. Thanks to @JimStenstrom. Closes #595.
