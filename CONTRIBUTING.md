# Contributing

Parts of this project are built with AI assistance (Claude Code and Codex). All changes are reviewed, tested, and owned by the maintainer.

Issues and focused pull requests are welcome. For scanner changes, include the exact registry path, hive, registry view, Windows build, and a redacted JSON sample. Do not add guessed CLSIDs or unsourced conflict records.

Before submitting a change:

```powershell
npm ci
npm run check
npm test
npm run test:windows
```

Keep mutations limited to these registry locations:

- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked` for handler blocking
- `HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}` for classic-menu mode

Do not delete or rename handler registrations or COM server keys. New write surfaces require a threat-model update, dry-run behavior, rollback coverage, and explicit user confirmation.
