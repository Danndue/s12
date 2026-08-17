# Agent Security Pilot

Production-oriented pilot MVP for discovering Microsoft Entra Agent ID identities, calculating deterministic risk, and presenting evidence-backed findings.

## Important
This repository is a pilot. It is not a substitute for an enterprise security review. The first connector is read-only and intentionally does not change tenant permissions.

## Microsoft setup
1. Register an app in Microsoft Entra.
2. Add delegated Microsoft Graph permissions: `AgentIdentity.Read.All` and `Application.Read.All` as required by the tenant/API surface.
3. Grant admin consent where required.
4. Put the client ID into the application.
5. Use device-code authentication.

Do not commit client secrets or tokens.

## Run
npm install
npm run typecheck
npm test
npm run build
npm run package

## Pilot acceptance test
Fresh machine -> install -> connect to a real Entra tenant -> discover agent identities -> inspect risk -> inspect evidence.
