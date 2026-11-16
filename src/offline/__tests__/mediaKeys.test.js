import { describe, it, expect } from 'vitest'
import { normalizePath, assetFile, mediaKey, albumKeyPrefix, parseMediaRequest, parseRange } from '../mediaKeys.js'

const ORIGIN = 'https://cloud.example.com'
const APP = '/index.php/apps/souvenirs/'

describe('mediaKeys', () => {
    it('normalizes album paths', () => {
        expect(normalizePath('/Souvenirs/2026 trip/')).toBe('Souvenirs/2026 trip')
        expect(normalizePath('Souvenirs//a')).toBe('Souvenirs/a')
        expect(normalizePath(null)).toBe('')
    })

    it('reduces an asset reference to its file name', () => {
        expect(assetFile('data/abc.jpg')).toBe('abc.jpg')
        expect(assetFile('abc.jpg')).toBe('abc.jpg')
    })

    it('gives one key per medium, whatever the spelling of the path', () => {
        const key = mediaKey(ORIGIN, '/Souvenirs/été 2026', 'data/a b.jpg')
        expect(key).toBe(mediaKey(ORIGIN, 'Souvenirs/été 2026/', 'a b.jpg'))
        expect(key.startsWith(albumKeyPrefix(ORIGIN, 'Souvenirs/été 2026'))).toBe(true)
        expect(key.startsWith(ORIGIN + '/')).toBe(true)
        // a valid URL: Cache API keys must be
        expect(new URL(key).href).toBe(key)
    })

    it('does not mix up albums whose paths share a prefix', () => {
        expect(mediaKey(ORIGIN, 'Souvenirs/a', 'x.jpg').startsWith(albumKeyPrefix(ORIGIN, 'Souvenirs'))).toBe(false)
    })

    it('recognizes preview and asset requests of an album', () => {
        const preview = new URL(ORIGIN + APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg&width=300&height=200')
        expect(parseMediaRequest(preview, APP)).toEqual({ path: 'Souvenirs/a', file: 'x.jpg', raw: false })
        const asset = new URL(ORIGIN + APP + 'asset?apath=%2FSouvenirs%2Fa&file=v.mp4')
        expect(parseMediaRequest(asset, APP)).toEqual({ path: 'Souvenirs/a', file: 'v.mp4', raw: true })
    })

    it('gives the same key for any size of a preview and for the raw asset', () => {
        const small = parseMediaRequest(new URL(ORIGIN + APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg&width=10&height=10'), APP)
        const full = parseMediaRequest(new URL(ORIGIN + APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg&v=42'), APP)
        expect(mediaKey(ORIGIN, small.path, small.file)).toBe(mediaKey(ORIGIN, full.path, full.file))
    })

    it('ignores everything else', () => {
        // public share media carry no album path
        expect(parseMediaRequest(new URL(ORIGIN + APP + 'public/tok/preview?file=x.jpg'), APP)).toBeNull()
        expect(parseMediaRequest(new URL(ORIGIN + APP + 'apiv2/album/1'), APP)).toBeNull()
        expect(parseMediaRequest(new URL(ORIGIN + APP + 'preview?file=x.jpg'), APP)).toBeNull()
        expect(parseMediaRequest(new URL(ORIGIN + '/index.php/core/preview?apath=a&file=x.jpg'), APP)).toBeNull()
    })

    it('resolves byte ranges', () => {
        expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
        expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
        expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
        expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    })

    it('rejects absent, malformed and unsatisfiable ranges', () => {
        expect(parseRange(null, 1000)).toBeNull()
        expect(parseRange('bytes=-', 1000)).toBeNull()
        expect(parseRange('bytes=5-2', 1000)).toBeNull()
        expect(parseRange('bytes=1000-', 1000)).toBeNull()
        expect(parseRange('bytes=0-1,5-9', 1000)).toBeNull()
        expect(parseRange('items=0-1', 1000)).toBeNull()
        expect(parseRange('bytes=0-1', 0)).toBeNull()
    })
})
