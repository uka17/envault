// Stash delivery retry settings shared by the worker, which applies them, and the API,
// which derives the delivery status from them. See docs/stash-delivery-retries.md.
export default {
  maxAttempts: 8,
  baseDelayMs: 60 * 1000,
  maxDelayMs: 60 * 60 * 1000,
};
