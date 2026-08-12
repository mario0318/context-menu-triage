# Privacy Policy

Context Menu Triage does not collect telemetry, create user accounts, or send registry, file, machine, or usage data to the maintainer or any third party.

The program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Its GUI listens only on `127.0.0.1` and opens in the user's browser. The browser communicates with that local process using a random launch token.

The program may create these local files:

- `triage-log.json` in the current working directory for applied-action history
- `triage-snapshot-*.json` in the current working directory for rollback snapshots
- `%USERPROFILE%\.context-menu-triage-last-change.json` as a pointer to the latest rollback snapshot
- `%TEMP%\triage-cache.json` as a temporary CLI result cache
- user-selected JSON, CSV, or SARIF exports
- a browser local-storage preference for the GUI theme

Users can remove these files at any time after retaining any rollback snapshots they still need. Deleting local records does not undo registry changes; restore desired handler state before deletion.
