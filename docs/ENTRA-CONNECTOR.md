# Microsoft Entra Connector — Read-Only Discovery

**Version:** 1.0  
**Date:** 2026-08-17  
**Status:** Production Pilot  
**Scope:** Microsoft Graph v1.0 Agent Identity discovery for cybersecurity risk assessment

---

## Overview

The Entra Connector is a read-only integration with Microsoft Graph that discovers AI agent identities, their permissions, and ownership in Microsoft Entra tenants. It supports the Agent Security Platform's core MVP workflow: **discover → analyze → report**.

**Critical Design Principle:** This connector performs read-only operations only. It never modifies tenant state.

---

## Required Permissions

### Delegated Permissions (User Consent)

These permissions are requested on behalf of the signed-in analyst:

| Permission | Scope | Purpose |
|-----------|-------|---------|
| `AgentIdentity.Read.All` | Entra | Enumerate agent identities and their properties |
| `Application.Read.All` | Entra | Read service principal details, app roles, and OAuth scopes |
| `ServicePrincipal.Read.All` | Entra | Access service principal relationships and owners |

### Admin Consent Requirement

- **AgentIdentity.Read.All** requires tenant admin consent (not available via user interactive flow).
- **Application.Read.All** and **ServicePrincipal.Read.All** may require admin consent depending on tenant policies.

Recommend: Obtain admin consent before analyst onboarding. In-app setup wizard should guide users through the Microsoft Entra admin center.

---

## Microsoft Graph Endpoints

All endpoints target **Microsoft Graph v1.0** for stability and compatibility.

### Core Discovery Endpoints

#### 1. Agent Identities
```
GET https://graph.microsoft.com/v1.0/servicePrincipals/microsoft.graph.agentIdentity
```

**Query Parameters:**
```
$select=id,displayName,description,accountEnabled,createdDateTime,agentIdentityBehavior,servicePrincipalNames,tags
$top=999
$skip={page_offset}
```

**Response:**
- Agent identity resource (servicePrincipal-derived)
- Properties: `id`, `displayName`, `description`, `accountEnabled`, `createdDateTime`, `agentIdentityBehavior` (behavior classification)
- Pagination: `@odata.nextLink` for continuation

**Read-Only:** ✅ Safe. Does not modify agent.

#### 2. Agent Owners
```
GET https://graph.microsoft.com/v1.0/servicePrincipals/{agent-id}/owners
```

**Query Parameters:**
```
$select=id,displayName,userPrincipalName,mail,jobTitle,department
$top=999
```

**Response:**
- Array of user or service principal owners
- Properties: `displayName`, `userPrincipalName` (UPN), `mail`
- **Failure Mode:** If agent has no owners, returns empty array (acceptable).

**Read-Only:** ✅ Safe. Does not modify ownership.

#### 3. Application Role Assignments
```
GET https://graph.microsoft.com/v1.0/servicePrincipals/{agent-id}/appRoleAssignments
```

**Query Parameters:**
```
$top=999
```

**Response:**
- Array of app role assignments to this agent
- Properties: `id`, `appRoleId`, `resourceId`, `resourceDisplayName`, `principalId`, `principalDisplayName`
- **Interpretation:** Agent has been granted role `appRoleId` on resource `resourceId`

**Read-Only:** ✅ Safe. Does not modify assignments.

#### 4. OAuth 2.0 Permission Grants (Delegated)
```
GET https://graph.microsoft.com/v1.0/servicePrincipals/{agent-id}/oauth2PermissionGrants
```

**Query Parameters:**
```
$top=999
```

**Response:**
- Array of delegated permission grants (OAuth scopes)
- Properties: `id`, `scope`, `resourceId`, `resourceDisplayName`, `expiryTime`, `grantType` (e.g., `AllPrincipals` or `Principal`)
- **Interpretation:** Agent has been granted OAuth delegated scope `scope` on resource `resourceId`

**Read-Only:** ✅ Safe. Does not modify grants.

#### 5. Resource App Role Definitions
```
GET https://graph.microsoft.com/v1.0/servicePrincipals/{resource-id}
```

**Query Parameters:**
```
$select=id,displayName,appRoles,servicePrincipalType
```

**Response:**
- Service principal representing the resource/API
- `appRoles` array: `id`, `value` (name), `displayName`, `description`, `allowedMemberTypes`
- **Purpose:** Resolve `appRoleId` from assignment (step 3) to human-readable role name

**Read-Only:** ✅ Safe. Does not modify service principal.

---

## Authentication Flow

### Device Code Flow (Recommended for Desktop)

Implements OAuth 2.0 Device Authorization Grant (RFC 8628).

**Why:** 
- No client secret required.
- User-friendly: analyst sees code on screen, completes auth on another device or browser.
- Aligns with Electron + desktop security posture.
- Supported by MSAL Node.

**Flow:**
1. App calls `acquireTokenByDeviceCode()`
2. MSAL requests device code from Entra
3. Entra returns: user code (e.g., `ABC123`), device code, verification URL
4. App displays: *"Sign in at https://microsoft.com/devicelogin and enter code: ABC123"*
5. Analyst opens URL, enters code, authenticates with tenant
6. Entra device flow polls for user approval
7. Once approved, Entra issues access token
8. MSAL returns token to app

**Token Properties:**
- **Expiry:** ~60 minutes (standard)
- **Refresh:** Not automatically issued; requires re-auth after expiry
- **Scope:** Delegated scopes requested in `acquireTokenByDeviceCode()` call

### Token Storage

**Current (Pilot):** In-memory only. Token is cleared on app close.

```typescript
let accessToken: string = '';
```

**Security Rationale:**
- No disk/localStorage exposure
- No credential persistence in local DB
- Session-limited: re-auth required after app restart
- Acceptable for pilot; production may require secure credential storage (Electron `safeStorage` or OS keychain)

**Future (Post-Pilot):** 
- Introduce `electron.safeStorage.encryptString()` + local persistence
- Or use `keytar` for OS-level credential storage
- Requires migration path for token refresh and rotation

---

## Data Collection

### What Is Collected

**Agent Identity Records:**
- Agent ID (GUID)
- Display name
- Description (if available)
- Account enabled status
- Created date/time
- Agent behavior classification
- Service principal names

**Ownership:**
- Owner(s) display name
- Owner(s) UPN (user principal name)
- Owner(s) email (if available)

**Permissions:**
- App role assignments: role ID, resource name, resource ID
- Delegated OAuth grants: scope names, resource name, resource ID
- Resource collection: list of unique resources with assigned permissions

**Evidence Snapshots:**
- Source API version (v1.0)
- Timestamp of discovery
- Entra tenant ID (captured from token)
- Data completeness indicators (partial failure flags)

### What Is NOT Collected

- Client secrets, API keys, or PII beyond job title
- Application manifest or source code
- Tenant configuration or policies
- User member lists or groups
- Exchange mailbox, Teams, or SharePoint data
- Audit logs or sign-in events
- Credential material of any kind

### Data Lifetime

**In Pilot:**
- Held in memory during analysis session
- Lost on app close
- Optional export to HTML report file

**Future:**
- Database storage with immutable evidence records
- Data retention policies (e.g., 90 days)
- Deletion controls tied to tenant/compliance requirements

---

## Failure Modes & Handling

### 1. Authentication Failures

**Scenario:** User cancels device code flow, or device code expires (10 min).

**Handler:**
```typescript
catch (error: any) {
  if (error.errorCode === 'device_code_expired') {
    // Prompt user to re-initiate connect
  } else if (error.errorCode === 'authorization_pending') {
    // Device code waiting for user input—continue polling
  } else {
    // Generic auth error—log and report
  }
}
```

**User Experience:**
- Clear error message with retry button
- No app crash
- Option to attempt re-connection

### 2. Missing Permissions

**Scenario:** Tenant admin has not granted `AgentIdentity.Read.All`.

**Handler:**
```typescript
catch (error: any) {
  if (error.status === 403 && error.message.includes('insufficient_privileges')) {
    throw new ConnectorError(
      'INSUFFICIENT_PERMISSIONS',
      'Admin consent required. Entra admin must grant AgentIdentity.Read.All.',
      { remediation: 'Contact tenant admin or request at Azure AD admin center' }
    );
  }
}
```

**User Experience:**
- Specific error code and remediation link
- Clear indication this is a tenant configuration issue, not an app bug
- Offer to open admin center link

### 3. Token Expiry

**Scenario:** Access token expires during discover or while generating report.

**Handler:**
```typescript
async discover(token: string): Promise<Agent[]> {
  try {
    // Make Graph call with current token
  } catch (error: any) {
    if (error.status === 401) {
      throw new ConnectorError(
        'TOKEN_EXPIRED',
        'Session expired. Please reconnect.',
        { remediation: 'Click "Connect" to re-authenticate' }
      );
    }
  }
}
```

**Current Limitation:** No automatic refresh; requires user to reconnect.

**Future:** Implement refresh token flow or request new token in background.

### 4. Graph Throttling (429)

**Scenario:** Too many requests in short time; Graph returns 429 Too Many Requests.

**Handler:**
```typescript
async graph(url: string, token: string, retries = 3): Promise<GraphPage> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60');
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Graph error: ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
    }
  }
}
```

**User Experience:**
- Discovery may take longer on large tenants
- UI shows "Loading..." with no timeout
- Transparent retry; user does not need to intervene

### 5. Transient Network Errors (5xx, timeout)

**Scenario:** Graph temporarily unavailable or connection lost.

**Handler:**
```typescript
async graph(url: string, token: string): Promise<GraphPage> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (res.status >= 500) {
      throw new Error(`Graph service error: ${res.status}`);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('timeout')) {
      throw new ConnectorError('NETWORK_TIMEOUT', 'Request to Graph timed out. Check your network.');
    }
    throw error;
  }
}
```

**User Experience:**
- Clear timeout error
- Retry option
- No silent failures

### 6. Partial Discovery Failure

**Scenario:** Discover agents succeeds, but fetching owners for one agent fails.

**Current Behavior:** Silent catch with empty array.
```typescript
const owners = await this.all(url, token).catch(() => []);
```

**Issue:** Partial data presented as complete—may yield false LOW risk if owner is missing.

**Improved Handler:**
```typescript
const ownersResult = await this.all(url, token).catch((error) => ({
  error: true,
  reason: error.message.slice(0, 500),
  data: []
}));

if (ownersResult.error) {
  evidence.push({
    source: 'entra.owners',
    field: 'fetch_status',
    value: 'PARTIAL_FAILURE',
    reason: ownersResult.reason,
    observedAt: new Date().toISOString()
  });
}
```

**User Experience:**
- Warning badge on affected agent
- Evidence shows data completeness
- Risk calculation flags unknown owner as a finding

---

## Pagination & Large Tenants

### Pagination Strategy

**Problem:** Tenant may have 10,000+ agents; single request returns at most 999 items.

**Solution:** Follow `@odata.nextLink` chain.

```typescript
private async all(url: string, token: string): Promise<any[]> {
  let next = url;
  let items: any[] = [];
  
  while (next) {
    const page = await this.graph(next, token);
    items.push(...(page.value ?? []));
    next = page['@odata.nextLink'] ?? '';
    
    // Log progress for UI
    this.onProgress?.(items.length);
  }
  
  return items;
}
```

### Performance Considerations

- **Sequential Per-Agent Sub-Queries:** For each agent, fetch owners, app roles, delegated grants, and resource names. ~5 API calls per agent minimum.
- **Large Tenant Impact:** 1000 agents × 5 calls = 5000 requests. At Graph throttling limits (~2000 req/60sec), this takes ~3-4 minutes.
- **Mitigation:** 
  - Display progress bar: "Discovered 500 / 1000 agents..."
  - Parallel sub-queries with backoff (Promise.all with rate limiting)
  - Option to cancel discover mid-run

---

## Security Considerations

### 1. No Client Secrets in Code

❌ **Wrong:**
```typescript
const clientId = 'xxx-xxx-xxx';
const clientSecret = 'super-secret-key'; // NEVER commit this
```

✅ **Right:**
```typescript
// Get clientId from environment or UI input only
const clientId = process.env.VITE_ENTRA_CLIENT_ID || ''; // From .env.example
// No client secret used; device code flow needs only public client
```

### 2. Token Handling

❌ **Wrong:**
```typescript
// localStorage.setItem('token', token); // NO
// Compromised browser could steal token
```

✅ **Right:**
```typescript
let accessToken: string = ''; // In-memory only (pilot)
// Future: Electron safeStorage or OS keychain with encryption at rest
```

### 3. IPC Boundary

❌ **Wrong:**
```typescript
// Renderer sends token to main
ipcRenderer.invoke('discover', { token });
```

✅ **Right:**
```typescript
// Main process holds token; renderer cannot access it
// Renderer calls: ipcRenderer.invoke('discover')
// Main process: handler checks if token exists in memory, makes Graph call
```

### 4. CSP (Content Security Policy)

**Connector operates in main process; no renderer CSP impact.**

Main process can freely call Graph. Renderer cannot. Preload bridges via IPC only.

---

## Evidence Recording

Each discovery creates an immutable snapshot of what was observed:

```typescript
interface Evidence {
  source: string;           // 'entra.agents' | 'entra.owners' | etc.
  field: string;            // 'agent_count' | 'permission_name' | etc.
  value: string;            // Observed value
  observedAt: string;       // ISO 8601 timestamp
  error?: string;           // If partial failure
}
```

**Example:**
```
{
  "source": "entra.agents",
  "field": "total_discovered",
  "value": "1247",
  "observedAt": "2026-08-17T15:30:00Z"
}
{
  "source": "entra.permissions",
  "field": "high_risk_permission_count",
  "value": "42",
  "observedAt": "2026-08-17T15:30:00Z"
}
{
  "source": "entra.owners",
  "field": "fetch_status",
  "value": "PARTIAL_FAILURE",
  "error": "Rate limited mid-run",
  "observedAt": "2026-08-17T15:30:00Z"
}
```

**Purpose:**
- Audit trail of what data was collected and when
- Transparency in risk scoring (missing owner data → lower confidence)
- Historical comparison across scans

---

## Configuration & Extensibility

### Environment Variables

```bash
# .env or runtime config

VITE_ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_ENTRA_AUTHORITY=https://login.microsoftonline.com/common
VITE_GRAPH_ENDPOINT=https://graph.microsoft.com/v1.0

# Future: Single-tenant mode
# VITE_ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Future: Sovereign clouds
# VITE_ENTRA_CLOUD=usgovernment | china
```

### Mock Connector (Development)

For local testing without Entra tenant:

```typescript
class MockEntraConnector implements IEntraConnector {
  async connect(onCode: (message: string) => void): Promise<any> {
    onCode('Mock device code: ABC123');
    return { accessToken: 'mock-token' };
  }

  async discover(token: string): Promise<Agent[]> {
    // Return hardcoded test agents
  }
}
```

Activated via environment or feature flag:
```typescript
const connector = process.env.MOCK_ENTRA === 'true'
  ? new MockEntraConnector()
  : new EntraConnector(clientId);
```

---

## Testing Strategy

### Unit Tests (Mocked Fetch)

```typescript
describe('EntraConnector', () => {
  it('discovers agents and resolves role names', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ /* agent list */ })
      .mockResolvedValueOnce({ /* owners */ })
      .mockResolvedValueOnce({ /* app roles */ });
    
    const connector = new EntraConnector('test-id', mockFetch);
    const agents = await connector.discover('token');
    
    expect(agents).toHaveLength(1);
    expect(agents[0].permissions).toContain('Mail.Read');
  });
  
  it('retries on Graph 429', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ status: 429, headers: { 'Retry-After': '1' } })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ value: [] }) });
    
    const connector = new EntraConnector('test-id', mockFetch);
    const result = await connector.graph('url', 'token');
    
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

### Integration Tests (Real Tenant)

**Requires:** Test tenant with Agent Identity API access and test app registration.

```typescript
describe('EntraConnector (integration)', () => {
  it('connects to real Entra tenant', async () => {
    const connector = new EntraConnector(process.env.TEST_CLIENT_ID);
    
    // Manual device code flow (tester completes auth)
    const token = await connector.connect(console.log);
    
    // Discover agents
    const agents = await connector.discover(token.accessToken);
    
    expect(agents.length).toBeGreaterThan(0);
  });
});
```

Run only with `--testNamePattern="integration"` and `TEST_CLIENT_ID` set.

---

## Monitoring & Observability

### Structured Logging

```typescript
import { createLogger } from '../logger';

const logger = createLogger('EntraConnector');

logger.info('Discovering agents', { tenantId, agentCount: 1247 });
logger.warn('Partial failure', { resource: 'owners', agent: id, error: e.message });
logger.error('Authentication failed', { errorCode: e.code, retryable: true });
```

### Metrics to Emit (Future)

- `entra.discover.duration_ms`: Discovery latency
- `entra.discover.agent_count`: Agents discovered
- `entra.discover.permission_count`: Total permissions found
- `entra.discover.errors`: Errors encountered
- `entra.api.requests_total`: API call count
- `entra.api.throttle_events`: 429 responses and backoff time

---

## Compliance & Audit

### GDPR Considerations

- **User Data:** Owner UPN and email collected; necessary for risk assessment.
- **Retention:** Pilot holds in-memory only. Future DB implementation must have TTL.
- **Deletion:** No per-user deletion API; recommend export evidence snapshots for audit trail, then purge local DB on request.

### SOX / Audit Trail

- Every discovery logged with timestamp, analyst ID (future), tenant ID.
- Immutable evidence snapshots stored.
- Export report includes "Assessed by Analyst Name on Date" footer.

---

## Roadmap & Future Enhancements

### Post-Pilot (Phase 2)

1. **Token Refresh:** Implement refresh token flow or background re-auth.
2. **Credential Storage:** Migrate from in-memory to Electron `safeStorage` + optional refresh.
3. **Single-Tenant Mode:** Support `VITE_ENTRA_TENANT_ID` for customer deployments.
4. **Sovereign Clouds:** Support US Government and China national clouds.
5. **Parallel Sub-Queries:** Rate-limited Promise.all() for agent sub-resource fetches.
6. **Permission Resolution Library:** Maintain database of appRole IDs → human names (e.g., "Mail.Read").
7. **Health Check Endpoint:** `connector:health` IPC to verify Graph reachability before discover.

### Phase 3+

1. **Backend Service:** Extract to separate service for SaaS deployments.
2. **Event Streaming:** Emit discovery events to audit/SIEM.
3. **Multi-Tenant Workspace:** Support multiple Entra tenants per analyst session.
4. **Incremental Discovery:** Fetch only changed agents since last scan.

---

## Related Documentation

- [`docs/ARCHITECTURE-DECISION.md`](./ARCHITECTURE-DECISION.md) — Electron security baseline
- [`docs/REAL-ENVIRONMENT.md`](./REAL-ENVIRONMENT.md) — Graph API data model
- [`src/main/entra.ts`](../src/main/entra.ts) — Implementation source
- [Microsoft Graph Agent Identity API](https://learn.microsoft.com/en-us/graph/api/resources/agentidentity) — Official reference

---

## Change Log

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-08-17 | Lead Engineer | Initial production documentation |

