import { transform } from "sucrase";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
const out = await mkdtemp(join(tmpdir(), "jova-t2-"));
async function tr(rel, seen=new Set()){
  if(seen.has(rel))return; seen.add(rel);
  const src = await readFile(rel,"utf8");
  for(const m of src.matchAll(/from\s+["']([^"']+)["']/g)){
    const s=m[1];
    if(s.startsWith("@/")){const b=join("src",s.slice(2));
      for(const c of [`${b}.ts`,`${b}.tsx`,join(b,"index.ts")]){try{await readFile(c,"utf8");await tr(c,seen);break}catch{}}}
    else if(s.startsWith(".")){const b=join(dirname(rel),s);
      for(const c of [`${b}.ts`,`${b}.tsx`,join(b,"index.ts")]){try{await readFile(c,"utf8");await tr(c,seen);break}catch{}}}
  }
  const code=transform(src,{transforms:["typescript","imports"],filePath:rel}).code;
  const depth=rel.split("/").length-2, up="../".repeat(depth);
  const rw=code.replace(/(["'])@\/([^"']+)\1/g,(_m,q,p)=>`${q}${up}${p}.js${q}`);
  const d=join(out,rel.replace(/\.tsx?$/,".js")); await mkdir(dirname(d),{recursive:true}); await writeFile(d,rw);
}
await tr("src/lib/safe-next.ts");
await tr("src/lib/clerk/config.ts");
const { safeNextPath } = await import(pathToFileURL(join(out,"src/lib/safe-next.js")).href);
const { oauthOrigin } = await import(pathToFileURL(join(out,"src/lib/clerk/config.js")).href);

let fail=0;
const t=(n,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fail++;console.log(`${ok?"PASS":"FAIL"}  ${n}\n        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)};

console.log("--- open redirect protection ---");
t("absolute URL rejected", safeNextPath("https://evil.com"), null);
t("protocol-relative rejected", safeNextPath("//evil.com"), null);
t("backslash form rejected", safeNextPath("/\\evil.com"), null);
t("javascript: rejected", safeNextPath("javascript:alert(1)"), null);
t("control char rejected", safeNextPath("/x\u0000y"), null);
t("auth path rejected", safeNextPath("/auth"), null);
t("auth path w/ query rejected", safeNextPath("/auth?next=/x"), null);
t("signup rejected", safeNextPath("/signup"), null);
t("safe path kept", safeNextPath("/orders"), "/orders");
t("safe path w/ query kept", safeNextPath("/orders?tab=1"), "/orders?tab=1");

console.log("\n--- oauthOrigin (the deployed-domain fix) ---");
t("vercel preview origin kept", oauthOrigin("https://buy-sell-thing-git-main-naija-mart.vercel.app"), "https://buy-sell-thing-git-main-naija-mart.vercel.app");
t("other vercel origin kept", oauthOrigin("https://smart-marketplace-opal.vercel.app"), "https://smart-marketplace-opal.vercel.app");
t("custom domain kept", oauthOrigin("https://jova.ng"), "https://jova.ng");
t("localhost kept", oauthOrigin("http://localhost:3000"), "http://localhost:3000");
t("garbage falls back", oauthOrigin("not-a-url"), "https://naijamart-marketplace-opal.vercel.app");

await rm(out,{recursive:true,force:true});
console.log(`\n${fail===0?"ALL PASSED":fail+" FAILED"}`);
process.exit(fail?1:0);
