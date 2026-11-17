/**
 * Human-readable size, for the offline storage figures (issue #22).
 *
 * @param {number} bytes
 * @returns {string} e.g. "0 B", "512 KB", "1.4 GB"
 */
export function formatBytes(bytes) {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value <= 0) {
        return '0 B'
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    const scaled = value / Math.pow(1024, exponent)
    // one decimal below 10 (1.4 GB), none above (512 KB), none for bytes
    const digits = exponent > 0 && scaled < 10 ? 1 : 0
    return scaled.toFixed(digits) + ' ' + units[exponent]
}
