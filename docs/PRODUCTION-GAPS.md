# Production Pilot Gate

Required before external customer deployment:

- Code-sign installers for each supported OS.
- Store tokens only in OS-protected credential storage if persistence is introduced; current pilot keeps the access token in main-process memory only.
- Add connector health checks and retry/backoff.
- Resolve appRole IDs into human-readable permission definitions.
- Persist immutable evidence snapshots securely.
- Add RBAC and a complete audit trail.
- Add signed CI/CD releases.
- Add dependency/SBOM scanning and SAST.
- Add E2E tests on clean Windows/macOS environments.
- Add crash reporting with privacy review.
- Perform penetration testing.
- Review Microsoft Graph permissions for least privilege before customer rollout.
- Add data retention/deletion controls.
