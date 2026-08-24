import assert from "node:assert/strict";
import test from "node:test";
import { verifyIdentitySyncSecret } from "./customer-identity-sync-auth.js";

const secret="0123456789abcdef0123456789abcdef";

test("identity sync secret fails closed when not configured",()=>{
  assert.deepEqual(verifyIdentitySyncSecret(secret,undefined),{configured:false,valid:false});
});

test("identity sync secret requires an exact constant-time comparable value",()=>{
  assert.deepEqual(verifyIdentitySyncSecret(secret,secret),{configured:true,valid:true});
  assert.deepEqual(verifyIdentitySyncSecret(`${secret}x`,secret),{configured:true,valid:false});
  assert.deepEqual(verifyIdentitySyncSecret("wrong",secret),{configured:true,valid:false});
});
