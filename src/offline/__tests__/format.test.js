import { describe, it, expect } from 'vitest'
import { formatBytes } from '../format.js'

describe('formatBytes', () => {
    it('formats sizes with a fitting unit', () => {
        expect(formatBytes(0)).toBe('0 B')
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB')
        expect(formatBytes(1.4 * 1024 * 1024 * 1024)).toBe('1.4 GB')
    })

    it('tolerates garbage', () => {
        expect(formatBytes(undefined)).toBe('0 B')
        expect(formatBytes(-5)).toBe('0 B')
        expect(formatBytes(NaN)).toBe('0 B')
    })
})
