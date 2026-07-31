export type ApiFormat="openai"|"anthropic"|"gemini";
export type Capability="chat"|"responses"|"embeddings"|"images"|"speech"|"transcription";
export type ProviderKey={id:string;label:string;value:string;enabled:boolean};
export type Relay={id:string;name:string;url:string;secret:string;enabled:boolean;region?:string};
export type OAuthConfig={authorizeUrl:string;tokenUrl:string;clientId:string;clientSecret:string;scopes:string;accessToken?:string;refreshToken?:string;expiresAt?:number;tokenType?:string};
export type Provider={id:string;name:string;baseUrl:string;format:ApiFormat;keys:ProviderKey[];models:string[];capabilities:Capability[];enabled:boolean;headers?:Record<string,string>;relays?:Relay[];relayMode?:"direct"|"prefer"|"only";timeoutMs?:number;oauth?:OAuthConfig};
export type RouteTarget={providerId:string;model:string};
export type Vault={version:number;locale:"id"|"en";providers:Provider[];routes:Record<string,RouteTarget[]>;logging:boolean;logLimit:number;updatedAt:string};
export const emptyVault=():Vault=>({version:1,locale:"id",providers:[],routes:{},logging:true,logLimit:1000,updatedAt:new Date().toISOString()});
