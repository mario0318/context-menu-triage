# Contributing

Issues and focused pull requests are welcome. For scanner changes, include the exact registry path, hive, registry view, Windows build, and a redacted JSON sample. Do not add guessed CLSIDs or unsourced conflict records.

Before submitting a change:

```powershell
npm ci
npm run check
npm test
npm run test:windows
```

Keep mutations limited to the registry locations documented in `BUILD.md`. New write surfaces require a threat-model update, dry-run behavior, rollback coverage, and explicit user confirmation.
