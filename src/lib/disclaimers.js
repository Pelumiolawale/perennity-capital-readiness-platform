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

export const ENGINE_ERROR_COPY = {
  message:
    "We hit a problem generating your Report. Please try again shortly, or " +
    "contact hello@perennitybridge.com if the issue persists.",
};
