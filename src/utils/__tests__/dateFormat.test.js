import { describe, it, expect } from 'vitest'
import { parseDate, formatLongDate } from '../dateFormat.js'

describe('parseDate', () => {
    it('reads an album date', () => {
        const date = parseDate('20231104153000')
        expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2023, 10, 4, 15])
    })

    it('reads a date without time, an ISO date and an SQL date', () => {
        expect(parseDate('20231104').getDate()).toBe(4)
        expect(parseDate('2026-02-28T23:59:59+00:00')).toBeInstanceOf(Date)
        expect(parseDate('2026-02-28 23:59:59').getFullYear()).toBe(2026)
    })

    it('gives null for what is not a date', () => {
        expect(parseDate('')).toBeNull()
        expect(parseDate(null)).toBeNull()
        expect(parseDate('not a date')).toBeNull()
        expect(parseDate(new Date('nope'))).toBeNull()
    })
})

describe('formatLongDate', () => {
    it('formats in the given language', () => {
        expect(formatLongDate('20231104120000', 'en-US')).toBe('November 4, 2023')
        expect(formatLongDate('20231104120000', 'fr-FR')).toBe('4 novembre 2023')
    })

    it('gives an empty string for what is not a date', () => {
        expect(formatLongDate('')).toBe('')
        expect(formatLongDate('garbage')).toBe('')
    })

    it('survives an unknown language', () => {
        expect(formatLongDate('20231104120000', 'not_a_locale')).not.toBe('')
    })
})
