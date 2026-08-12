# Security Policy

## Supported Versions

Security fixes are applied to the latest release.

## Reporting

Please use GitHub's private vulnerability reporting for this repository. Include the affected version, Windows build, reproduction steps, and whether the GUI was elevated. Do not open a public issue for a vulnerability that can trigger registry writes or code execution.

## Security Boundary

The GUI binds to `127.0.0.1` and protects every API route with a random launch token. HKLM writes require elevation and are limited to the Explorer Shell Extensions `Blocked` list. The tool does not delete handler registrations, install persistence, or send telemetry.

Authenticode status is evidence, not a malware verdict. A valid signature identifies a trusted certificate chain and file integrity; it does not guarantee benign behavior.
