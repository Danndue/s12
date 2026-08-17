# Real Environment Pilot

The first connector uses Microsoft Graph v1.0 only.

## Data collected
- Agent identities
- Owners
- Application-role assignments
- Delegated OAuth permission grants
- Evidence snapshots

Microsoft documents `agentIdentity` as a servicePrincipal-derived resource with appRoleAssignments and oauth2PermissionGrants relationships. The pilot does not call write endpoints. See Microsoft documentation for the current API and least-privilege requirements.

## Requested delegated permissions
- `AgentIdentity.Read.All`
- `Application.Read.All`

Validate tenant role/consent in a test tenant before customer deployment. Do not add write permissions merely to make discovery work.

## Important limitation
Application-role assignments expose `appRoleId` and resource information. A production customer report should resolve each appRoleId to the resource's human-readable app role value/display name before describing the permission as a specific business capability.
