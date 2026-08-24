export type ProtectedService = "POWER_BANK_RENTAL";

export const customerServiceAccessPolicy={
  service:"POWER_BANK_RENTAL" as const,
  baselineVersion:"NOLI_POWER_BANK_RENTAL_V1",
  requirements:[
    {code:"PROFILE",label:"Basic profile complete"},
    {code:"TERMS",label:"Current Terms and Privacy Notice accepted"},
    {code:"PHONE_VERIFICATION",label:"Registered phone verified"},
    {code:"IDENTITY",label:"Accepted identification document configured"},
    {code:"IDENTITY_CONSENT",label:"Identity-verification consent accepted"},
    {code:"IDENTITY_VERIFICATION",label:"Authoritative identity status is VERIFIED"}
  ]
};

export type CustomerServiceAccessSnapshot = {
  profileSetupComplete: boolean;
  termsAccepted: boolean;
  phoneVerified: boolean;
  identityConfigured: boolean;
  identityConsentAccepted: boolean;
  identityStatus: string;
};

export type CustomerServiceAccessResult = {
  service: ProtectedService;
  allowed: boolean;
  state: "READY" | "PROFILE_REQUIRED" | "TERMS_REQUIRED" | "PHONE_REQUIRED" | "IDENTITY_REQUIRED" | "IDENTITY_CONSENT_REQUIRED" | "IDENTITY_VERIFICATION_REQUIRED";
  missing: string[];
};

export function evaluateCustomerServiceAccess(
  snapshot: CustomerServiceAccessSnapshot,
  service: ProtectedService = "POWER_BANK_RENTAL"
): CustomerServiceAccessResult {
  const missing: string[] = [];
  if (!snapshot.profileSetupComplete) missing.push("PROFILE");
  if (!snapshot.termsAccepted) missing.push("TERMS");
  if (!snapshot.phoneVerified) missing.push("PHONE_VERIFICATION");
  if (!snapshot.identityConfigured) missing.push("IDENTITY");
  if (!snapshot.identityConsentAccepted) missing.push("IDENTITY_CONSENT");
  if (snapshot.identityStatus !== "VERIFIED") missing.push("IDENTITY_VERIFICATION");

  let state: CustomerServiceAccessResult["state"] = "READY";
  if (missing.includes("PROFILE")) state = "PROFILE_REQUIRED";
  else if (missing.includes("TERMS")) state = "TERMS_REQUIRED";
  else if (missing.includes("PHONE_VERIFICATION")) state = "PHONE_REQUIRED";
  else if (missing.includes("IDENTITY")) state = "IDENTITY_REQUIRED";
  else if (missing.includes("IDENTITY_CONSENT")) state = "IDENTITY_CONSENT_REQUIRED";
  else if (missing.includes("IDENTITY_VERIFICATION")) state = "IDENTITY_VERIFICATION_REQUIRED";

  return { service, allowed: missing.length === 0, state, missing };
}
