import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCustomerServiceAccess } from "./customer-service-access.js";

test("profile setup is distinct from protected rental eligibility",()=>{
  const result=evaluateCustomerServiceAccess({
    profileSetupComplete:true,
    termsAccepted:true,
    phoneVerified:false,
    identityConfigured:false,
    identityConsentAccepted:false,
    identityStatus:"NOT_SUBMITTED"
  });
  assert.equal(result.allowed,false);
  assert.equal(result.state,"PHONE_REQUIRED");
  assert.deepEqual(result.missing,["PHONE_VERIFICATION","IDENTITY","IDENTITY_CONSENT","IDENTITY_VERIFICATION"]);
});

test("every NOLI power-bank requirement must be satisfied",()=>{
  const result=evaluateCustomerServiceAccess({
    profileSetupComplete:true,
    termsAccepted:true,
    phoneVerified:true,
    identityConfigured:true,
    identityConsentAccepted:true,
    identityStatus:"VERIFIED"
  });
  assert.equal(result.allowed,true);
  assert.equal(result.state,"READY");
  assert.deepEqual(result.missing,[]);
});

test("format-valid identity never grants protected service access",()=>{
  const result=evaluateCustomerServiceAccess({
    profileSetupComplete:true,
    termsAccepted:true,
    phoneVerified:true,
    identityConfigured:true,
    identityConsentAccepted:true,
    identityStatus:"FORMAT_VALID"
  });
  assert.equal(result.allowed,false);
  assert.equal(result.state,"IDENTITY_VERIFICATION_REQUIRED");
  assert.deepEqual(result.missing,["IDENTITY_VERIFICATION"]);
});
