import assert from "node:assert/strict";
import test from "node:test";
import { isSafeIdentityMask } from "./customer-identity-validation.js";

test("accepts NOLI and CPay masked identity forms",()=>{
  assert.equal(isSafeIdentityMask("••••••9012"),true);
  assert.equal(isSafeIdentityMask("AB******12"),true);
});

test("rejects raw or weakly masked identification numbers",()=>{
  assert.equal(isSafeIdentityMask("CM123456789012"),false);
  assert.equal(isSafeIdentityMask("1234567890123*"),false);
  assert.equal(isSafeIdentityMask("AB*12"),false);
});
