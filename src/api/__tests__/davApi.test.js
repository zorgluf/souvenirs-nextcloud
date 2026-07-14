import { describe, it, expect, beforeEach, vi } from 'vitest'
import { listFolder, getPreviewUrl, IMAGE_MIMES } from '../davApi.js'

// A realistic Nextcloud PROPFIND multistatus: the listed collection itself
// (must be skipped), a subfolder, and two images — one with a space + UTF-8
// name, percent-encoded in the href as the server does.
const MULTISTATUS = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/webdav/Photos/Vacances%202024/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getlastmodified>Mon, 01 Jul 2024 10:00:00 GMT</d:getlastmodified>
        <oc:fileid>100</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat>
      <d:prop><d:getcontenttype/><d:getcontentlength/></d:prop>
      <d:status>HTTP/1.1 404 Not Found</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/webdav/Photos/Vacances%202024/Plage/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getlastmodified>Tue, 02 Jul 2024 08:00:00 GMT</d:getlastmodified>
        <oc:fileid>101</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat>
      <d:prop><d:getcontenttype/><d:getcontentlength/></d:prop>
      <d:status>HTTP/1.1 404 Not Found</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/webdav/Photos/Vacances%202024/plage%20%C3%A9t%C3%A9.jpg</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontenttype>image/jpeg</d:getcontenttype>
        <d:getcontentlength>123456</d:getcontentlength>
        <d:getlastmodified>Wed, 03 Jul 2024 12:30:00 GMT</d:getlastmodified>
        <oc:fileid>202</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/webdav/Photos/Vacances%202024/sunset.png</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontenttype>image/png</d:getcontenttype>
        <d:getcontentlength>7890</d:getcontentlength>
        <d:getlastmodified>Mon, 01 Jul 2024 09:00:00 GMT</d:getlastmodified>
        <oc:fileid>203</oc:fileid>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`

describe('davApi', () => {
    beforeEach(() => {
        globalThis.OC = { requestToken: 'test-token' }
        globalThis.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            status: 207,
            text: () => Promise.resolve(MULTISTATUS),
        }))
    })

    describe('listFolder', () => {
        it('issues a Depth-1 PROPFIND on the encoded WebDAV URL with the request token', async () => {
            await listFolder('Photos/Vacances 2024')
            const [url, options] = globalThis.fetch.mock.calls[0]
            expect(url).toMatch(/\/remote\.php\/webdav\/Photos\/Vacances%202024$/)
            expect(options.method).toBe('PROPFIND')
            expect(options.headers.Depth).toBe('1')
            expect(options.headers.requesttoken).toBe('test-token')
            expect(options.body).toContain('oc:fileid')
        })

        it('targets the WebDAV root without a trailing slash for the empty path', async () => {
            await listFolder('')
            const [url] = globalThis.fetch.mock.calls[0]
            expect(url).toMatch(/\/remote\.php\/webdav$/)
        })

        it('parses entries and excludes the listed collection itself', async () => {
            const entries = await listFolder('Photos/Vacances 2024')
            expect(entries.map(e => e.basename)).toEqual(['Plage', 'plage été.jpg', 'sunset.png'])
        })

        it('maps folder entries with isFolder and decoded paths', async () => {
            const entries = await listFolder('Photos/Vacances 2024')
            const folder = entries[0]
            expect(folder).toMatchObject({
                basename: 'Plage',
                path: 'Photos/Vacances 2024/Plage',
                isFolder: true,
                fileid: '101',
            })
        })

        it('maps file entries with mime, size, mtime and fileid', async () => {
            const entries = await listFolder('Photos/Vacances 2024')
            const image = entries.find(e => e.basename === 'plage été.jpg')
            expect(image).toMatchObject({
                path: 'Photos/Vacances 2024/plage été.jpg',
                isFolder: false,
                mime: 'image/jpeg',
                size: 123456,
                fileid: '202',
            })
            expect(image.mtime).toBe(Date.parse('Wed, 03 Jul 2024 12:30:00 GMT'))
        })

        it('rejects when the server responds with an error status', async () => {
            globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401 }))
            await expect(listFolder('Photos')).rejects.toThrow()
        })
    })

    describe('getPreviewUrl', () => {
        it('builds a core preview URL from the fileid', () => {
            const url = getPreviewUrl('123')
            expect(url).toContain('/core/preview')
            expect(url).toContain('fileId=123')
            expect(url).toContain('x=256&y=256&a=1')
        })

        it('honours a custom size', () => {
            expect(getPreviewUrl('123', 512)).toContain('x=512&y=512')
        })
    })

    describe('IMAGE_MIMES', () => {
        it('keeps the mimetypes the old file picker accepted', () => {
            expect(IMAGE_MIMES).toContain('image/jpeg')
            expect(IMAGE_MIMES).toContain('image/svg+xml')
            expect(IMAGE_MIMES).toHaveLength(7)
        })
    })
})
