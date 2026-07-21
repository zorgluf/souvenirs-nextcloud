import { describe, it, expect } from 'vitest'
import { defaultExpiryDate, toApiDate } from '../shareExpiry.js'

describe('defaultExpiryDate', () => {
    it('returns a date 3 months ahead', () => {
        const d = defaultExpiryDate(new Date(2026, 0, 15)) // Jan 15 2026
        expect(d.getFullYear()).toBe(2026)
        expect(d.getMonth()).toBe(3) // April
        expect(d.getDate()).toBe(15)
    })

    it('rolls over the year boundary', () => {
        const d = defaultExpiryDate(new Date(2026, 10, 5)) // Nov 5 2026
        expect(d.getFullYear()).toBe(2027)
        expect(d.getMonth()).toBe(1) // February
        expect(d.getDate()).toBe(5)
    })

    it('clamps to the last day of the target month instead of overflowing', () => {
        const d = defaultExpiryDate(new Date(2026, 10, 30)) // Nov 30 2026 -> Feb 2027 (28 days)
        expect(d.getFullYear()).toBe(2027)
        expect(d.getMonth()).toBe(1) // February, not March
        expect(d.getDate()).toBe(28)
    })

    it('clamps to Feb 29 on leap years', () => {
        const d = defaultExpiryDate(new Date(2027, 10, 30)) // Nov 30 2027 -> Feb 2028 (leap)
        expect(d.getFullYear()).toBe(2028)
        expect(d.getMonth()).toBe(1)
        expect(d.getDate()).toBe(29)
    })
})

describe('toApiDate', () => {
    it('formats as YYYY-MM-DD with zero padding', () => {
        expect(toApiDate(new Date(2026, 3, 5))).toBe('2026-04-05')
        expect(toApiDate(new Date(2026, 11, 25))).toBe('2026-12-25')
    })
})
