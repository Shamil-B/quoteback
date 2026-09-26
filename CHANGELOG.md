# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

Initial release.

### Added

- `Ledger` with verbatim-quote verification, per-key contradiction detection, acknowledged reversals, supersede and withdraw.
- `recall` (BM25), `due`, `history`, `active` and a token-budgeted `context` block.
- `rulesExtractor` with default rules, and `llmExtractor` for any completion function.
- Optional comparator hook for fuzzy value comparison.
- JSON snapshot persistence via `saveJSON` / `loadJSON`.
- `quoteback` CLI with `demo` and `check` commands.

[Unreleased]: https://github.com/Shamil-B/quoteback/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Shamil-B/quoteback/releases/tag/v0.1.0
