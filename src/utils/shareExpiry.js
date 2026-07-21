/**
 * Default share expiration: 3 months from the given date.
 * Clamps to the last day of the target month when the day would
 * overflow (e.g. Nov 30 + 3 months -> Feb 28/29, not Mar 2).
 *
 * @param {Date} from reference date (defaults to now)
 * @return {Date}
 */
export function defaultExpiryDate(from = new Date()) {
    const d = new Date(from.getFullYear(), from.getMonth() + 3, from.getDate())
    if (d.getDate() !== from.getDate()) {
        d.setDate(0)
    }
    return d
}

/**
 * Format a date as the YYYY-MM-DD string expected by the share API.
 *
 * @param {Date} date
 * @return {string}
 */
export function toApiDate(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
