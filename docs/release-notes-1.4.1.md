# Context Menu Triage 1.4.1

A follow-up to 1.4.0 that fixes three issues found in review.

- "Launch as administrator" works again. Each portable window now uses its own browser profile, so opening an elevated window no longer forwards its address to the first window and shuts down its own backend.
- The portable executable's console is now actually hidden on launch; the previous check counted its own helper and never hid anything.
- A handler whose DLL under the Windows folder has been deleted now rates among the worst offenders. It had been mistaken for a trusted system handler and scored as safe to leave alone, even though Explorer blocks on it.

Windows 11 note: this inventories legacy `IContextMenu` handlers shown under **Show more options** or Shift+F10. It does not enumerate the primary `IExplorerCommand` menu.

Signing note: this is an **unsigned release**. Windows SmartScreen may warn about an unknown publisher. Verify the download against its published `.sha256` checksum before running it; the release also includes a CycloneDX SBOM and GitHub release-asset digest. A future signed release will identify its certificate issuer and include signature-verification instructions.
