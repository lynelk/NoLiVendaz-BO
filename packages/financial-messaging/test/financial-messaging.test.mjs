import test from "node:test";
import assert from "node:assert/strict";
import { isProfileActive, validateBicSyntax, validateEnvelopeMetadata } from "../dist/index.js";

test("validates BIC structure without claiming registry validity", () => {
  assert.equal(validateBicSyntax("DEUTDEFF").valid, true);
  assert.equal(validateBicSyntax("DEUTDEFF500").valid, true);
  assert.equal(validateBicSyntax("bad").valid, false);
  assert.equal(validateBicSyntax("1234DEFF").valid, false);
});

test("requires an active effective message profile", () => {
  assert.equal(isProfileActive({
    id: "pacs-test",
    standard: "ISO20022",
    standardVersion: "approved-version",
    businessService: "test",
    messageDefinition: "approved-definition",
    state: "ACTIVE",
    effectiveFrom: "2026-01-01T00:00:00Z",
    mappingVersion: "1"
  }, new Date("2026-08-24T00:00:00Z")), true);
});

test("validates envelope traceability metadata", () => {
  const errors = validateEnvelopeMetadata({
    correlationId: "corr-1",
    standard: "ISO8583",
    profileId: "network-profile-v1",
    standardVersion: "2023",
    messageDefinition: "network-approved-profile",
    direction: "INBOUND",
    eventTimestamp: "2026-08-24T10:00:00Z",
    observedTimestamp: "2026-08-24T10:00:01Z",
    validationStatus: "VALID",
    validationErrors: [],
    contentDigest: `sha256:${"a".repeat(64)}`,
    mappingVersion: "1"
  });
  assert.deepEqual(errors, []);
});
