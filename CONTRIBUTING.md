# Contributing

Thanks for taking a look. quoteback is deliberately small, so the bar for new features is "does this belong in a ledger with a verifier?" Bug reports, sharper extraction rules and better docs are always welcome.

## Setup

Node 20 or newer.

```
git clone https://github.com/Shamil-B/quoteback
cd quoteback
npm install
npm test
```

## Before opening a pull request

```
npm run typecheck
npm run build
npm test
```

CI runs the same three commands on Node 20, 22 and 24.

- Add a test for any behaviour change. Tests live in `test/` and use `node:test`.
- Keep the package dependency-free at runtime.
- The verbatim-quote rule is the point of the library. Changes that loosen `verifyQuote` need a strong reason and tests showing what is and isn't accepted.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`. One logical change per commit.

## Issues

For bugs, include the message text, the extractor you used and what the ledger did versus what you expected. A failing test is the best possible bug report.

By contributing you agree that your contributions are licensed under the MIT License.
