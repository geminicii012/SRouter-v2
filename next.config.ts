import type { NextConfig } from "next";
const securityHeaders=[
 {key:"X-Content-Type-Options",value:"nosniff"},
 {key:"X-Frame-Options",value:"DENY"},
 {key:"Referrer-Policy",value:"no-referrer"},
 {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
 {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"},
 {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
];
const nextConfig:NextConfig={reactStrictMode:true,poweredByHeader:false,experimental:{serverActions:{bodySizeLimit:"4mb"}},async headers(){return[{source:"/:path*",headers:securityHeaders}]}};
export default nextConfig;
