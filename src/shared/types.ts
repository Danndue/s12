export type RiskLevel='LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export interface Agent {id:string;name:string;provider:string;owner?:string;status:string;environment:string;permissions:string[];resources:string[];riskScore:number;riskLevel:RiskLevel;findings:Finding[];evidence:Evidence[];}
export interface Finding {id:string;severity:RiskLevel;category:string;title:string;description:string;recommendation:string;}
export interface Evidence {source:string;field:string;value:string;observedAt:string;}
export interface TenantSummary {tenantId:string;displayName:string;agents:Agent[];connectedAt:string;}
