import fs from "node:fs";
const packagePath=new URL("../apps/backoffice-web/package.json",import.meta.url);
const pkg=JSON.parse(fs.readFileSync(packagePath,"utf8"));
const version=String(pkg.dependencies?.next??"");
const deadline=Date.parse("2026-08-26T00:00:00Z");
if(Date.now()>=deadline&&version==="16.3.0"){
  console.error("SECURITY GATE: Next.js 16.3.0 must be upgraded to the August 26, 2026 security release before build/deployment.");
  process.exit(1);
}
console.log(`Next.js security gate OK (${version}).`);
