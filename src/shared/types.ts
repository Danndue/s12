export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskCategory =
  | 'IDENTITY'
  | 'PRIVILEGE'
  | 'PERMISSION'
  | 'DATA'
  | 'CONFIGURATION'
  | 'OWNERSHIP';

export interface RiskEvidence {
  /** Unique identifier for this evidence record */
  id: string;
  
  /** Source system (e.g., 'entra.permissions', 'entra.ownership') */
  source: string;
  
  /** Field being observed (e.g., 'permission_name', 'owner_status') */
  field: string;
  
  /** Actual observed value */
  value: string;
  
  /** When this observation was made */
  observedAt: string;
  
  /** Additional context (e.g., permission resource, app role ID) */
  context?: Record<string, string>;
}

/**
 * Audit-trail compatible finding.
 * Every finding must be reproducible from evidence.
 */
export interface Finding {
  /** Unique finding ID within an assessment */
  id: string;
  
  /** Agent ID this finding relates to */
  agentId: string;
  
  /** When this finding was generated */
  timestamp: string;
  
  /** Risk category */
  category: RiskCategory;
  
  /** Severity level */
  severity: RiskLevel;
  
  /** Human-readable title */
  title: string;
  
  /** Detailed description */
  description: string;
  
  /** Analyst recommendation */
  recommendation: string;
  
  /** Score contribution (0-100) */
  riskContribution: number;
  
  /** Evidence IDs that support this finding */
  evidenceIds: string[];
  
  /** Explanation of how risk was calculated */
  riskCalculation: string;
  
  /** Optional: permission that triggered this finding */
  permission?: string;
  
  /** Optional: resource involved */
  resource?: string;
  
  /** Optional: owner involved */
  owner?: string;
}

export interface Agent {
  id: string;
  name: string;
  provider: string;
  owner?: string;
  status: string;
  environment: string;
  permissions: string[];
  resources: string[];
  riskScore: number;
  riskLevel: RiskLevel;
  findings: Finding[];
  
  /** Timestamp of last risk assessment */
  assessedAt: string;
  
  /** Evidence records collected for this agent */
  evidence: RiskEvidence[];
}

export interface Evidence {
  source: string;
  field: string;
  value: string;
  observedAt: string;
}

export interface TenantSummary {
  tenantId: string;
  displayName: string;
  agents: Agent[];
  connectedAt: string;
}
