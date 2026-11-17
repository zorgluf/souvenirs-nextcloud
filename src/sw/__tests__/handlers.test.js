// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeCaches } from '../../../tests/frontend/fakeCaches.js'
import { MEDIA_CACHE, PENDING_CACHE, SHELL_CACHE, mediaKey } from '../../offline/mediaKeys.js'
import {
    route, isAppPage, isShellResource, handlePage, handleShellResource, handleMedia, respondWithStored,
    warmShell, recordShellUse, shellPageKey, SHELL_MAX_AGE_MS, readForced, writeForced, isBlockedWhenForced,
} from '../handlers.js'

// Service worker request handling (issue #22), against an in-memory Cache
// API and a scripted network.

const ORIGIN = 'https://cloud.example.com'
const APP = '/index.php/apps/souvenirs/'

let env
let network

function request(url, { mode = 'no-cors', destination = '', method = 'GET', headers = {} } = {}) {
    return { url: url.startsWith('http') ? url : ORIGIN + url, method, mode, destination, headers: new Headers(headers) }
}

function response(body, { status = 200, type = 'text/plain', redirected = false } = {}) {
    const res = new Response(body, { status, headers: { 'Content-Type': type } })
    // what a same-origin fetch gives; the constructor cannot set these
    Object.defineProperty(res, 'type', { value: 'basic' })
    Object.defineProperty(res, 'redirected', { value: redirected })
    return res
}

function offline() {
    network.mockImplementation(async () => { throw new TypeError('Failed to fetch') })
}

beforeEach(() => {
    network = vi.fn(async () => response('from network'))
    env = { caches: new FakeCaches(), fetch: network, origin: ORIGIN, appPath: APP }
})

describe('routing', () => {
    it('knows the pages the shell can render', () => {
        expect(isAppPage(new URL(ORIGIN + APP), env)).toBe(true)
        expect(isAppPage(new URL(ORIGIN + '/index.php/apps/souvenirs'), env)).toBe(true)
        expect(isAppPage(new URL(ORIGIN + APP + 'show?apath=%2FSouvenirs%2Fa'), env)).toBe(true)
        expect(isAppPage(new URL(ORIGIN + APP + 'public/token'), env)).toBe(false)
        expect(isAppPage(new URL(ORIGIN + APP + 'apiv2/albums'), env)).toBe(false)
        expect(isAppPage(new URL(ORIGIN + '/index.php/apps/files/'), env)).toBe(false)
    })

    it('knows what belongs to the shell', () => {
        const shell = (url, destination) => isShellResource({ destination }, new URL(ORIGIN + url), env)
        expect(shell('/dist/core-common.js?v=abc', 'script')).toBe(true)
        expect(shell('/extra-apps/souvenirs/js/vite/js/souvenirs-index.mjs', 'script')).toBe(true)
        expect(shell('/core/css/server.css?v=abc', 'style')).toBe(true)
        expect(shell('/index.php/apps/theming/manifest/souvenirs?v=1', 'manifest')).toBe(true)
        // data, not shell
        expect(shell('/index.php/core/preview?fileId=5&x=256&y=256', 'image')).toBe(false)
        expect(shell('/remote.php/webdav/Photos/a.jpg', 'image')).toBe(false)
        expect(shell('/index.php/avatar/bob/64', 'image')).toBe(false)
        expect(shell('/ocs/v2.php/apps/notifications/api/v2/notifications', '')).toBe(false)
        expect(shell(APP + 'apiv2/albums', '')).toBe(false)
    })

    it('leaves alone what it has no business with', () => {
        expect(route(request(APP + 'apiv2/album/1'), env)).toBeNull()
        expect(route(request(APP + 'apiv2/album/1', { method: 'POST' }), env)).toBeNull()
        expect(route(request('https://elsewhere.example.com/a.js', { destination: 'script' }), env)).toBeNull()
        expect(route(request(APP + 'public/token', { mode: 'navigate' }), env)).toBeNull()
        expect(route(request('/index.php/apps/files/', { mode: 'navigate' }), env)).toBeNull()
        expect(route(request(APP + 'public/token/preview?file=a.jpg', { destination: 'image' }), env)).toBeNull()
        expect(route(request('/index.php/csrftoken'), env)).toBeNull()
    })

    it('handles app pages, shell resources and album media', async () => {
        expect(route(request(APP, { mode: 'navigate' }), env)).toBeInstanceOf(Promise)
        expect(route(request('/dist/core-common.js?v=1', { destination: 'script' }), env)).toBeInstanceOf(Promise)
        expect(route(request(APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg&width=10&height=10', { destination: 'image' }), env)).toBeInstanceOf(Promise)
    })
})

describe('app pages', () => {
    it('serves the page from the network and keeps it as the shell', async () => {
        network.mockResolvedValue(response('<html>list</html>', { type: 'text/html; charset=utf-8' }))
        const res = await handlePage(request(APP, { mode: 'navigate' }), env)
        expect(await res.text()).toBe('<html>list</html>')
        const shell = await (await env.caches.open(SHELL_CACHE)).match(shellPageKey(env))
        expect(await shell.text()).toBe('<html>list</html>')
    })

    it('serves the shell for any app page when the server cannot be reached', async () => {
        network.mockResolvedValue(response('<html>shell</html>', { type: 'text/html' }))
        await handlePage(request(APP, { mode: 'navigate' }), env)
        offline()
        const res = await handlePage(request(APP + 'show?apath=%2FSouvenirs%2Fa', { mode: 'navigate' }), env)
        expect(await res.text()).toBe('<html>shell</html>')
    })

    it('never keeps a login redirect or an error page as the shell', async () => {
        network.mockResolvedValue(response('<html>login</html>', { type: 'text/html', redirected: true }))
        await handlePage(request(APP, { mode: 'navigate' }), env)
        network.mockResolvedValue(response('<html>oops</html>', { type: 'text/html', status: 500 }))
        await handlePage(request(APP, { mode: 'navigate' }), env)
        expect(await (await env.caches.open(SHELL_CACHE)).match(shellPageKey(env))).toBeUndefined()
    })

    it('explains itself when there is no shell yet', async () => {
        offline()
        const res = await handlePage(request(APP, { mode: 'navigate' }), env)
        expect(res.status).toBe(503)
        expect(res.headers.get('Content-Type')).toContain('text/html')
        expect(await res.text()).toContain('Souvenirs')
    })
})

describe('shell resources', () => {
    it('takes them from the network and keeps a copy for offline', async () => {
        network.mockResolvedValue(response('js v1'))
        const req = request('/extra-apps/souvenirs/js/vite/js/souvenirs-index.mjs', { destination: 'script' })
        expect(await (await handleShellResource(req, env)).text()).toBe('js v1')
        offline()
        expect(await (await handleShellResource(req, env)).text()).toBe('js v1')
    })

    it('always asks the server for unversioned files (a new release must show)', async () => {
        const req = request('/extra-apps/souvenirs/js/vite/js/souvenirs-index.mjs', { destination: 'script' })
        network.mockResolvedValue(response('js v1'))
        await handleShellResource(req, env)
        network.mockResolvedValue(response('js v2'))
        expect(await (await handleShellResource(req, env)).text()).toBe('js v2')
        offline()
        expect(await (await handleShellResource(req, env)).text()).toBe('js v2')
    })

    it('serves versioned files from the shell without a round trip', async () => {
        const req = request('/dist/core-common.js?v=abc', { destination: 'script' })
        network.mockResolvedValue(response('core'))
        await handleShellResource(req, env)
        network.mockClear()
        expect(await (await handleShellResource(req, env)).text()).toBe('core')
        expect(network).not.toHaveBeenCalled()
    })

    it('falls back to another version of the file when offline', async () => {
        network.mockResolvedValue(response('core old'))
        await handleShellResource(request('/dist/core-common.js?v=old', { destination: 'script' }), env)
        offline()
        const res = await handleShellResource(request('/dist/core-common.js?v=new', { destination: 'script' }), env)
        expect(await res.text()).toBe('core old')
    })

    it('does not keep error responses, and fails when there is nothing to serve', async () => {
        const req = request('/dist/missing.js', { destination: 'script' })
        network.mockResolvedValue(response('nope', { status: 404 }))
        expect((await handleShellResource(req, env)).status).toBe(404)
        offline()
        await expect(handleShellResource(req, env)).rejects.toThrow()
    })

    it('reports the entries it uses', async () => {
        const used = vi.fn()
        await handleShellResource(request('/dist/core-common.js?v=abc', { destination: 'script' }), env, used)
        expect(used).toHaveBeenCalledWith(ORIGIN + '/dist/core-common.js?v=abc')
    })
})

describe('album media', () => {
    const medium = { path: 'Souvenirs/a', file: 'x.jpg' }
    const req = (headers) => request(APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg&width=300&height=200', { destination: 'image', headers })

    async function store(cacheName, body, type = 'image/jpeg') {
        const cache = await env.caches.open(cacheName)
        await cache.put(mediaKey(ORIGIN, medium.path, medium.file), new Response(body, { headers: { 'Content-Type': type } }))
    }

    it('goes to the server when it answers, even with an offline copy', async () => {
        await store(MEDIA_CACHE, 'copy')
        network.mockResolvedValue(response('fresh'))
        expect(await (await handleMedia(req(), medium, env)).text()).toBe('fresh')
    })

    it('serves the offline copy when the server cannot be reached', async () => {
        await store(MEDIA_CACHE, 'copy')
        offline()
        const res = await handleMedia(req(), medium, env)
        expect(await res.text()).toBe('copy')
        expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    })

    it('answers 503 for a medium that is not kept on the device', async () => {
        offline()
        expect((await handleMedia(req(), medium, env)).status).toBe(503)
    })

    it('serves media waiting for their upload before asking a server that does not have them', async () => {
        await store(PENDING_CACHE, 'pending bytes')
        network.mockResolvedValue(response('not found', { status: 404 }))
        expect(await (await handleMedia(req(), medium, env)).text()).toBe('pending bytes')
        expect(network).not.toHaveBeenCalled()
    })

    it('prefers the offline copy to an error or a login page', async () => {
        await store(MEDIA_CACHE, 'copy')
        network.mockResolvedValue(response('<html>login</html>', { type: 'text/html', redirected: true }))
        expect(await (await handleMedia(req(), medium, env)).text()).toBe('copy')
        network.mockResolvedValue(response('gone', { status: 404 }))
        expect(await (await handleMedia(req(), medium, env)).text()).toBe('copy')
    })

    it('passes the server error on when there is no copy', async () => {
        network.mockResolvedValue(response('gone', { status: 404 }))
        expect((await handleMedia(req(), medium, env)).status).toBe(404)
    })

    it('answers byte ranges of a stored medium (video playback)', async () => {
        await store(MEDIA_CACHE, '0123456789', 'video/mp4')
        offline()
        const res = await handleMedia(req({ Range: 'bytes=2-5' }), medium, env)
        expect(res.status).toBe(206)
        expect(await res.text()).toBe('2345')
        expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10')
        expect(res.headers.get('Content-Length')).toBe('4')
        expect(res.headers.get('Content-Type')).toBe('video/mp4')
        const tail = await handleMedia(req({ Range: 'bytes=7-' }), medium, env)
        expect(await tail.text()).toBe('789')
    })

    it('rejects a range it cannot satisfy', async () => {
        const stored = new Response('0123456789')
        const res = await respondWithStored(stored, req({ Range: 'bytes=50-60' }))
        expect(res.status).toBe(416)
        expect(res.headers.get('Content-Range')).toBe('bytes */10')
    })
})

describe('shell upkeep', () => {
    it('warms the shell with the page and what it loaded, skipping data', async () => {
        network.mockImplementation(async url => (url === ORIGIN + APP
            ? response('<html>shell</html>', { type: 'text/html' })
            : response('body of ' + url)))
        await warmShell([
            ORIGIN + '/dist/core-common.js?v=1',
            '/core/css/server.css?v=1',
            ORIGIN + '/remote.php/webdav/secret.jpg',
            ORIGIN + APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg',
            'https://elsewhere.example.com/lib.js',
        ], env)
        const cache = await env.caches.open(SHELL_CACHE)
        const keys = (await cache.keys()).map(k => k.url).sort()
        expect(keys).toEqual([
            ORIGIN + '/core/css/server.css?v=1',
            ORIGIN + '/dist/core-common.js?v=1',
            shellPageKey(env),
        ].sort())
    })

    it('does not keep a login page as the shell while warming', async () => {
        network.mockResolvedValue(response('<html>login</html>', { type: 'text/html', redirected: true }))
        await warmShell([], env)
        expect(await (await env.caches.open(SHELL_CACHE)).match(shellPageKey(env))).toBeUndefined()
    })

    it('drops shell entries of releases that are no longer used', async () => {
        const cache = await env.caches.open(SHELL_CACHE)
        const oldUrl = ORIGIN + '/dist/core-common.js?v=old'
        const liveUrl = ORIGIN + '/dist/core-common.js?v=new'
        await cache.put(oldUrl, new Response('old'))
        await cache.put(liveUrl, new Response('new'))
        await cache.put(shellPageKey(env), new Response('<html></html>'))
        const start = 1000000
        await recordShellUse([oldUrl, liveUrl], env, start)
        // only the live one keeps being used
        await recordShellUse([liveUrl], env, start + SHELL_MAX_AGE_MS / 2)
        expect(await cache.match(oldUrl)).toBeDefined()
        await recordShellUse([liveUrl], env, start + SHELL_MAX_AGE_MS + 1)
        expect(await cache.match(oldUrl)).toBeUndefined()
        expect(await cache.match(liveUrl)).toBeDefined()
        // the page itself is never aged out
        expect(await cache.match(shellPageKey(env))).toBeDefined()
    })
})

describe('working offline by choice', () => {
    const mediaUrl = APP + 'preview?apath=%2FSouvenirs%2Fa&file=x.jpg&width=300&height=200'

    beforeEach(() => {
        env.forced = true
    })

    async function blocked(req) {
        const res = await route(req, env)
        return res != null && res.type === 'error'
    }

    it('remembers the choice across restarts of the worker', async () => {
        expect(await readForced(env)).toBe(false)
        await writeForced(env, true)
        expect(await readForced(env)).toBe(true)
        // kept through the clean-up of old shell entries
        await recordShellUse([], env, 1000000)
        await recordShellUse([], env, 1000000 + SHELL_MAX_AGE_MS * 2)
        expect(await readForced(env)).toBe(true)
        await writeForced(env, false)
        expect(await readForced(env)).toBe(false)
    })

    it('lets no request leave the device', async () => {
        expect(await blocked(request(APP + 'apiv2/album/1'))).toBe(true)
        expect(await blocked(request(APP + 'apiv2/album/1', { method: 'POST' }))).toBe(true)
        expect(await blocked(request('/remote.php/webdav/Souvenirs/a/data/x.jpg', { method: 'PUT' }))).toBe(true)
        expect(await blocked(request('/index.php/csrftoken'))).toBe(true)
        expect(await blocked(request('/ocs/v2.php/apps/notifications/api/v2/notifications'))).toBe(true)
        expect(await blocked(request('/index.php/avatar/bob/64', { destination: 'image' }))).toBe(true)
        expect(await blocked(request('https://elsewhere.example.com/a.js', { destination: 'script' }))).toBe(true)
        expect(network).not.toHaveBeenCalled()
    })

    it('leaves navigations, public shares and non-network requests alone', () => {
        expect(route(request('/index.php/apps/files/', { mode: 'navigate' }), env)).toBeNull()
        expect(route(request(APP + 'public/token', { mode: 'navigate' }), env)).toBeNull()
        expect(route(request(APP + 'public/token/album'), env)).toBeNull()
        expect(route(request(APP + 'public/token/preview?file=a.jpg', { destination: 'image' }), env)).toBeNull()
        expect(isBlockedWhenForced({ mode: 'cors' }, new URL('blob:' + ORIGIN + '/1234'), env)).toBe(false)
        expect(isBlockedWhenForced({ mode: 'no-cors' }, new URL('data:image/png;base64,AAAA'), env)).toBe(false)
    })

    it('blocks nothing when the choice is off', () => {
        env.forced = false
        expect(route(request(APP + 'apiv2/album/1'), env)).toBeNull()
        expect(route(request(APP + 'apiv2/album/1', { method: 'POST' }), env)).toBeNull()
    })

    it('serves the page from the shell without asking the server', async () => {
        await (await env.caches.open(SHELL_CACHE)).put(shellPageKey(env), new Response('<html>shell</html>'))
        const res = await route(request(APP + 'show?apath=%2FSouvenirs%2Fa', { mode: 'navigate' }), env)
        expect(await res.text()).toBe('<html>shell</html>')
        expect(network).not.toHaveBeenCalled()
    })

    it('asks the server for a page only when there is no shell to start from', async () => {
        network.mockResolvedValue(response('<html>list</html>', { type: 'text/html' }))
        const res = await route(request(APP, { mode: 'navigate' }), env)
        expect(await res.text()).toBe('<html>list</html>')
        expect(network).toHaveBeenCalledTimes(1)
    })

    it('serves shell files from their copy, versioned or not, even of another version', async () => {
        const cache = await env.caches.open(SHELL_CACHE)
        await cache.put(ORIGIN + '/apps/souvenirs/js/vite/index.mjs', new Response('unversioned'))
        await cache.put(ORIGIN + '/dist/core-common.js?v=old', new Response('old release'))
        const plain = await route(request('/apps/souvenirs/js/vite/index.mjs', { destination: 'script' }), env)
        expect(await plain.text()).toBe('unversioned')
        const other = await route(request('/dist/core-common.js?v=new', { destination: 'script' }), env)
        expect(await other.text()).toBe('old release')
        expect(network).not.toHaveBeenCalled()
    })

    it('fetches a shell file that is missing, so the app still starts', async () => {
        network.mockResolvedValue(response('fresh file'))
        const res = await route(request('/dist/core-main.js?v=1', { destination: 'script' }), env)
        expect(await res.text()).toBe('fresh file')
        expect(network).toHaveBeenCalledTimes(1)
    })

    it('serves media from the device only', async () => {
        const key = mediaKey(ORIGIN, 'Souvenirs/a', 'x.jpg')
        expect((await route(request(mediaUrl, { destination: 'image' }), env)).status).toBe(503)
        await (await env.caches.open(MEDIA_CACHE)).put(key, new Response('copy', { headers: { 'Content-Type': 'image/jpeg' } }))
        expect(await (await route(request(mediaUrl, { destination: 'image' }), env)).text()).toBe('copy')
        await (await env.caches.open(PENDING_CACHE)).put(key, new Response('pending', { headers: { 'Content-Type': 'image/jpeg' } }))
        expect(await (await route(request(mediaUrl, { destination: 'image' }), env)).text()).toBe('pending')
        expect(network).not.toHaveBeenCalled()
    })
})
