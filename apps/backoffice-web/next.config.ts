import type { NextConfig } from "next";

const securityHeaders=[
 {key:"X-Content-Type-Options",value:"nosniff"},
 {key:"Referrer-Policy",value:"no-referrer"},
 {key:"X-Frame-Options",value:"DENY"},
 {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
 {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
 {key:"Content-Security-Policy",value:"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'"}
];
const nextConfig:NextConfig={output:"standalone",reactStrictMode:true,poweredByHeader:false,async headers(){return[{source:"/:path*",headers:securityHeaders}]}};
export default nextConfig;
