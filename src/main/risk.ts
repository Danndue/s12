import {Agent,Finding,RiskLevel} from '../shared/types';
export function riskLevel(score:number):RiskLevel{return score>=75?'CRITICAL':score>=50?'HIGH':score>=25?'MEDIUM':'LOW';}
export function calculateRisk(input:{owner?:string;permissions:string[];resources:string[];production:boolean;unknownOwner?:boolean}):{score:number;findings:Finding[]} {
 let score=0; const f:Finding[]=[]; const add=(n:number,x:Finding)=>{score+=n;f.push(x)};
 if(!input.owner||input.unknownOwner)add(15,{id:'identity-owner',severity:'HIGH',category:'IDENTITY',title:'Agent owner is missing or unverified',description:'The agent cannot be reliably attributed to an accountable human owner.',recommendation:'Assign and verify an owner.'});
 const dangerous=input.permissions.filter(p=>/DELETE|ADMIN|APPROVE|EXECUTE|PAYMENT|WRITE/i.test(p));
 if(dangerous.length)add(Math.min(30,dangerous.length*6),{id:'privilege',severity:'CRITICAL',category:'PRIVILEGE',title:'High-impact permissions detected',description:`Detected ${dangerous.length} permission(s): ${dangerous.slice(0,6).join(', ')}`,recommendation:'Review and remove unnecessary high-impact permissions.'});
 const broad=input.permissions.filter(p=>/ALL|\*|FULL/i.test(p));
 if(broad.length)add(Math.min(25,broad.length*8),{id:'broad',severity:'HIGH',category:'PERMISSION',title:'Broad permissions detected',description:`Detected ${broad.length} broad permission(s).`,recommendation:'Replace broad grants with least-privilege scopes.'});
 const sensitive=input.resources.filter(r=>/BANK|PAYMENT|HR|PAYROLL|CUSTOMER|FINANCE|SECRET|CREDENTIAL/i.test(r));
 if(sensitive.length)add(Math.min(20,sensitive.length*5),{id:'data',severity:'HIGH',category:'DATA',title:'Sensitive resources are accessible',description:`Detected ${sensitive.length} sensitive resource(s).`,recommendation:'Validate business need and restrict access to sensitive resources.'});
 if(input.production)add(10,{id:'prod',severity:'HIGH',category:'CONFIGURATION',title:'Production access detected',description:'The agent operates against production resources.',recommendation:'Use least privilege and consider human approval for consequential actions.'});
 score=Math.min(100,score); return {score,findings:f};
}
export function enrichAgent(a:Omit<Agent,'riskScore'|'riskLevel'|'findings'>):Agent{const r=calculateRisk({owner:a.owner,permissions:a.permissions,resources:a.resources,production:a.environment==='Production'});return {...a,riskScore:r.score,riskLevel:riskLevel(r.score),findings:r.findings};}
