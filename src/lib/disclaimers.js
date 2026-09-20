// Centralised user-facing copy for the regulatory disclaimer and the two
// opaque error states the gated Report route can land in. Kept verbatim
// because the disclaimer is the legal boundary between "advisory" and
// "regulatory assurance" (Article 26 of Regulation (EU) 2020/852), and the
// error copy is intentionally non-diagnostic — entitlement-failure reasons
// (invalid_format / not_found / not_active / expired / network) are surfaced
// via console.warn for debugging but never to the user, so an attacker
// probing engagement references cannot use the UI to distinguish "ref
// doesn't exist" from "ref exists but is expired."

export const ARTICLE_26_DISCLAIMER =
  "This document is advisory in nature. It does not constitute regulatory " +
  "assurance, audit, or verification within the meaning of Article 26 of " +
  "Regulation (EU) 2020/852 or under any equivalent regime in the United " +
  "Kingdom or any other jurisdiction.";

export const ENTITLEMENT_ERROR_COPY = {
  message:
    "We couldn't verify access to this Report. If you believe you have a " +
    "valid engagement, please contact hello@perennitybridge.com with your " +
    "engagement reference.",
};

// ITEM-17: shown when the engagement itself is valid — reference recognised,
// status active, not expired — but a child-table fetch came back short of the
// rows the parent record says exist. That means evidence we know is on file
// was not read, so any report we rendered would understate it. We refuse
// rather than issue an understated opinion, and we say so plainly instead of
// implying a transient glitch the reader should retry through.
export const DATA_INCOMPLETE_COPY = {
  message:
    "We cannot issue this Report right now. Some of the evidence recorded " +
    "against your engagement could not be read, and we will not issue an " +
    "opinion that understates it. This is our problem, not yours — we have " +
    "been alerted. Please contact hello@perennitybridge.com if you need it " +
    "urgently.",
};

// ITEM-17 (B5): shown when the engagement's Target Label is one the SPA cannot
// route. Two causes, both of which mean the engagement is not ready to report:
// uk_sdr_mixed_goals, which is selectable in Airtable but not built; and a
// BLANK Target Label, which since 20 Sep 2026 is no longer defaulted to
// eu_taxonomy_aligned_8_1. The client-facing wording covers both — from the
// reader's side an unscoped engagement and an unbuilt framework are the same
// thing, and in neither case is their reference at fault. The console.error in
// ReportRoute names which one it was. The generic engine-error copy invited
// the reader to "try again shortly", which would never have worked.
export const UNSUPPORTED_LABEL_COPY = {
  message:
    "This engagement is scoped to a framework we do not yet issue Reports " +
    "against. Nothing is wrong with your engagement reference. Please contact " +
    "hello@perennitybridge.com and we will confirm the right scope with you.",
};

export const ENGINE_ERROR_COPY = {
  message:
    "We hit a problem generating your Report. Please try again shortly, or " +
    "contact hello@perennitybridge.com if the issue persists.",
};
