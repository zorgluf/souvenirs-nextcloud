/**
 * Long, localized dates ("4 novembre 2023", "November 4, 2023").
 *
 * These used the `moment` global of Nextcloud, which newer Nextcloud
 * versions no longer provide; the browser formats dates on its own.
 */

/**
 * @param {*} value an album date ("YYYYMMDDHHmmss"), an ISO or SQL date
 *   string, a timestamp or a Date
 * @return {Date|null} null when the value is not a date
 */
export function parseDate(value) {
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value
    }
    if (value == null || value === '') {
        return null
    }
    let date
    const compact = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/.exec(String(value))
    if (compact != null) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = compact
        date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    } else if (typeof value === 'number') {
        date = new Date(value)
    } else {
        // "2026-11-16 23:59:59" is not parsed by every browser without the "T"
        date = new Date(String(value).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2'))
    }
    return isNaN(date.getTime()) ? null : date
}

/**
 * @param {*} value see parseDate
 * @param {string} [locale] defaults to the browser's language
 * @return {string} the date in long form, or '' when the value is not a date
 */
export function formatLongDate(value, locale) {
    const date = parseDate(value)
    if (date == null) {
        return ''
    }
    const language = locale || (typeof navigator !== 'undefined' ? navigator.language : undefined)
    try {
        return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date)
    } catch (error) {
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date)
    }
}
