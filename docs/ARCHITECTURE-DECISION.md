# Pilot Architecture Decision

Electron is the analyst desktop shell. Core discovery and risk logic is kept in services so the product can later become a hosted control plane.

The pilot is intentionally read-only against Microsoft Entra. No permission changes, identity changes, or tenant policy changes are performed.

Security baseline:
- contextIsolation enabled
- nodeIntegration disabled
- sandbox enabled
- restrictive CSP
- no untrusted external navigation
- no credentials in renderer
- read-only Graph integration
