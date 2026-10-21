/**
 * Normalize a verified token claim or stored version for comparison.
 * @param {unknown} value
 * @returns {number|null} Zero for legacy absence; null for invalid state.
 * This does not verify JWT signatures. Callers must verify tokens first.
 */
export function sessionVersion(value) {
    // Only a missing field is legacy version zero. Malformed values must fail
    // closed rather than silently becoming a valid session version.
    if (value === undefined) return 0;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
