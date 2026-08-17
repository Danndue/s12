import {PublicClientApplication,DeviceCodeRequest,Configuration} from '@azure/msal-node';
import {enrichAgent} from './risk'; import {Agent} from '../shared/types';
const scopes=['https://graph.microsoft.com/AgentIdentity.Read.All','https://graph.microsoft.com/Application.Read.All'];
type GraphPage={value:any[];['@odata.nextLink']?:string};
export class EntraConnector {
 private pca:PublicClientApplication;
 constructor(private clientId:string){const config:Configuration={auth:{clientId,authority:'https://login.microsoftonline.com/common'}};this.pca=new PublicClientApplication(config);}
 async connect(onCode:(message:string)=>void){const req:DeviceCodeRequest={scopes,deviceCodeCallback:r=>onCode(r.message)};return this.pca.acquireTokenByDeviceCode(req);}
 private async graph(url:string,token:string):Promise<GraphPage>{const res=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!res.ok){const t=await res.text();throw Error(`Microsoft Graph ${res.status}: ${t.slice(0,300)}`)}return res.json() as Promise<GraphPage>}
 private async all(url:string,token:string){let next=url,items:any[]=[];while(next){const p=await this.graph(next,token);items.push(...(p.value??[]));next=p['@odata.nextLink']??'';}return items;}
 async discover(accessToken:string):Promise<Agent[]>{
  const identities=await this.all('https://graph.microsoft.com/v1.0/servicePrincipals/microsoft.graph.agentIdentity?$select=id,displayName,description,accountEnabled,createdDateTime,agentIdentityBlueprintId,createdByAppId',accessToken);
  const agents:Agent[]=[];
  for(const x of identities){
   const owners=await this.all(`https://graph.microsoft.com/v1.0/servicePrincipals/${encodeURIComponent(x.id)}/owners?$select=id,displayName,userPrincipalName`,accessToken).catch(()=>[]);
   const grants=await this.all(`https://graph.microsoft.com/v1.0/servicePrincipals/${encodeURIComponent(x.id)}/appRoleAssignments`,accessToken).catch(()=>[]);
   const delegated=await this.all(`https://graph.microsoft.com/v1.0/servicePrincipals/${encodeURIComponent(x.id)}/oauth2PermissionGrants`,accessToken).catch(()=>[]);
   const roleNames=new Map<string,string>();
   for(const rid of Array.from(new Set(grants.map(g=>g.resourceId).filter(Boolean)))){
    const sp=await this.graph(`https://graph.microsoft.com/v1.0/servicePrincipals/${encodeURIComponent(rid)}?$select=id,displayName,appRoles`,accessToken).catch(()=>({value:[],id:rid} as any));
    const raw=(sp as any).appRoles??[]; for(const role of raw){roleNames.set(`${rid}:${role.id}`,role.value||role.displayName||role.id);}
   }
   const permissions=grants.map(g=>`${g.resourceDisplayName??'Unknown resource'}:${roleNames.get(`${g.resourceId}:${g.appRoleId}`)??g.appRoleId}`).concat(delegated.map(g=>`${g.resourceId??'Unknown resource'}:delegated:${g.scope??''}`));
   const resources=Array.from(new Set(grants.map(g=>g.resourceDisplayName).filter(Boolean)));
   const owner=owners[0]?.displayName??owners[0]?.userPrincipalName;
   agents.push(enrichAgent({id:x.id,name:x.displayName??x.id,provider:'Microsoft Entra Agent ID',owner,status:x.accountEnabled===false?'Disabled':'Active',environment:'Production',permissions,resources,evidence:[{source:'Microsoft Graph v1.0',field:'agentIdentity',value:JSON.stringify(x),observedAt:new Date().toISOString()},{source:'Microsoft Graph v1.0',field:'owners',value:JSON.stringify(owners),observedAt:new Date().toISOString()},{source:'Microsoft Graph v1.0',field:'appRoleAssignments',value:JSON.stringify(grants),observedAt:new Date().toISOString()},{source:'Microsoft Graph v1.0',field:'oauth2PermissionGrants',value:JSON.stringify(delegated),observedAt:new Date().toISOString()}]}));
  }
  return agents;
 }
}
