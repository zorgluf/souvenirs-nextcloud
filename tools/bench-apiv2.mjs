#!/usr/bin/env node
/**
 * Edit-mode API benchmark (issue #50).
 *
 * Replays the request sequences the web editor sends for the common edit
 * actions against a real Nextcloud instance, and reports wall-clock latency
 * per action plus the server-side breakdown from the `Server-Timing` header
 * (added by TimingMiddleware; absent on older app versions, which is fine for
 * a baseline).
 *
 * Everything it creates is temporary and removed at the end: one album named
 * "souvenirs-bench-<random>" and one folder of the same name in the user's
 * files holding small generated JPEG files.
 *
 * Usage (Node >= 18, no dependencies):
 *
 *   node tools/bench-apiv2.mjs --url https://cloud.example.org --user alice \
 *        --password <app password> [--runs 5] [--media 10] [--json out.json]
 *
 * Use an app password (Settings > Security). Run it once on the old version
 * and once on the new one with --json, then compare:
 *
 *   node tools/bench-apiv2.mjs --compare before.json after.json
 *
 * Scenarios:
 *   caption-edit     one page save                  (text, resize, pan/zoom, swap)
 *   remove-element   page save + asset clean
 *   pick-media       link N existing files and put them on pages:
 *                      legacy: N x (assetsearch + page save/create)
 *                      batch:  1 assetsearch batch + 1 page batch (if supported)
 *   layout-change    4 tile previews at new sizes
 *   clean            asset clean alone, on the album filled by pick-media
 */

import { randomUUID, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

// --- arguments ---------------------------------------------------------------

function parseArgs(argv) {
    const args = { runs: 5, media: 10 }
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i]
        const next = () => argv[++i]
        switch (key) {
            case '--url': args.url = next().replace(/\/+$/, ''); break
            case '--user': args.user = next(); break
            case '--password': args.password = next(); break
            case '--runs': args.runs = parseInt(next(), 10); break
            case '--media': args.media = parseInt(next(), 10); break
            case '--json': args.json = next(); break
            case '--compare': args.compare = [next(), next()]; break
            case '-h': case '--help': args.help = true; break
            default: throw new Error('Unknown argument: ' + key)
        }
    }
    return args
}

// --- statistics ----------------------------------------------------------------

function percentile(sorted, p) {
    if (sorted.length === 0) {
        return NaN
    }
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
    return sorted[Math.max(0, idx)]
}

function summarize(samples) {
    const sorted = [...samples].sort((a, b) => a - b)
    return {
        runs: sorted.length,
        min: sorted[0],
        median: percentile(sorted, 50),
        p95: percentile(sorted, 95),
    }
}

/** Parse `a;dur=1.2;desc="1x", b;dur=3` into { a: 1.2, b: 3 }. */
export function parseServerTiming(header) {
    const out = {}
    if (!header) {
        return out
    }
    for (const part of header.split(',')) {
        const [name, ...params] = part.trim().split(';')
        const dur = params.map(p => p.trim()).find(p => p.startsWith('dur='))
        if (name && dur) {
            out[name] = (out[name] || 0) + parseFloat(dur.slice(4))
        }
    }
    return out
}

// --- HTTP client ----------------------------------------------------------------

class Client {
    constructor(baseUrl, user, password) {
        this.baseUrl = baseUrl
        this.user = user
        this.auth = 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
        this.requests = 0
        this.serverTiming = {}
    }

    app(path) {
        return this.baseUrl + '/index.php/apps/souvenirs/' + path
    }

    dav(path) {
        const encoded = path.split('/').filter(s => s !== '').map(encodeURIComponent).join('/')
        return this.baseUrl + '/remote.php/dav/files/' + encodeURIComponent(this.user) + '/' + encoded
    }

    async request(method, url, { json, body, headers, okStatuses } = {}) {
        const init = { method, headers: { Authorization: this.auth, ...headers } }
        if (json !== undefined) {
            init.headers['Content-Type'] = 'application/json'
            init.body = JSON.stringify(json)
        } else if (body !== undefined) {
            init.body = body
        }
        this.requests++
        const response = await fetch(url, init)
        const timing = parseServerTiming(response.headers.get('server-timing'))
        for (const [name, ms] of Object.entries(timing)) {
            this.serverTiming[name] = (this.serverTiming[name] || 0) + ms
        }
        const allowed = okStatuses || []
        if (!response.ok && !allowed.includes(response.status)) {
            const text = await response.text().catch(() => '')
            throw new Error(method + ' ' + url + ' -> ' + response.status + ' ' + text.slice(0, 200))
        }
        return response
    }

    /** Reset the per-action counters and return the previous ones. */
    takeCounters() {
        const counters = { requests: this.requests, serverTiming: this.serverTiming }
        this.requests = 0
        this.serverTiming = {}
        return counters
    }
}

// --- album helpers (same calls as src/api/albumApi.js) ----------------------------

function pagePath(albumId, pageId) {
    return 'apiv2/album/' + encodeURIComponent(albumId) + '/page/' + encodeURIComponent(pageId)
}

function savePage(client, albumId, page) {
    return client.request('POST', client.app(pagePath(albumId, page.id)), { json: { elements: page.elements } })
}

function createPage(client, albumId, pos, page) {
    return client.request('PUT', client.app(pagePath(albumId, pos)), { json: page })
}

function clean(client, albumId) {
    return client.request('GET', client.app('apiv2/album/' + encodeURIComponent(albumId) + '/clean'))
}

function imageElement(name, size) {
    return {
        id: randomUUID(),
        class: 'ImageElement',
        image: 'data/' + randomUUID() + '.jpg',
        name,
        size,
        mime: 'image/jpeg',
        top: 0, left: 0, bottom: 100, right: 100,
    }
}

// A 64x48 JPEG; bytes appended after the EOI marker keep it decodable and give
// every generated file a distinct size (assetsearch matches name AND size).
const TINY_JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCzRRRXwR9sFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//9k=',
    'base64')

function jpegOfSize(extra) {
    return Buffer.concat([TINY_JPEG, randomBytes(extra)])
}

// --- scenarios --------------------------------------------------------------------

async function timeAction(client, fn) {
    client.takeCounters()
    const start = performance.now()
    await fn()
    const ms = performance.now() - start
    return { ms, ...client.takeCounters() }
}

async function supportsBatch(client, albumId) {
    // The batch endpoints are additive (issue #50); an older server answers 404/405.
    const response = await client.request('POST',
        client.app('apiv2/album/' + encodeURIComponent(albumId) + '/pages'),
        { json: { operations: [] }, okStatuses: [404, 405] })
    return response.ok
}

async function run(args) {
    const client = new Client(args.url, args.user, args.password)
    const tag = 'souvenirs-bench-' + randomBytes(4).toString('hex')
    const albumId = tag
    const mediaFolder = tag
    const results = {}
    const record = (name, sample) => {
        results[name] = results[name] || { samples: [], requests: [], serverTiming: [] }
        results[name].samples.push(sample.ms)
        results[name].requests.push(sample.requests)
        results[name].serverTiming.push(sample.serverTiming)
    }

    console.log('Setting up album ' + albumId + ' and ' + args.media + ' media files...')
    await client.request('PUT', client.app('apiv2/album/' + encodeURIComponent(albumId)))
    try {
        const albumInfo = await (await client.request('GET', client.app('apiv2/album/' + encodeURIComponent(albumId)))).json()
        const albumPath = albumInfo.path
        await client.request('MKCOL', client.dav(mediaFolder))
        const media = []
        for (let i = 0; i < args.media * args.runs; i++) {
            const name = tag + '-' + i + '.jpg'
            const bytes = jpegOfSize(16 + i)
            await client.request('PUT', client.dav(mediaFolder + '/' + name), { body: bytes, headers: { 'Content-Type': 'image/jpeg' } })
            media.push({ name, size: bytes.length })
        }
        const firstPage = { id: randomUUID(), elements: [] }
        await createPage(client, albumId, 0, firstPage)
        const batch = await supportsBatch(client, albumId)
        console.log('Batch endpoints: ' + (batch ? 'available' : 'not available (legacy server)'))

        for (let r = 0; r < args.runs; r++) {
            process.stdout.write('Run ' + (r + 1) + '/' + args.runs + '\r')
            const runMedia = media.slice(r * args.media, (r + 1) * args.media)

            // pick-media, legacy sequence: one assetsearch + one page write per medium
            const legacyPages = []
            record('pick-media (legacy)', await timeAction(client, async () => {
                for (let i = 0; i < runMedia.length; i++) {
                    const el = imageElement(runMedia[i].name, runMedia[i].size)
                    const params = new URLSearchParams({ asset: el.image, asset_name: el.name, asset_size: String(el.size) })
                    await client.request('GET', client.app('apiv2/album/' + encodeURIComponent(albumId) + '/assetsearch?' + params))
                    const page = { id: randomUUID(), elements: [el] }
                    await createPage(client, albumId, 1 + i, page)
                    legacyPages.push(page)
                }
            }))

            // pick-media, batch sequence (same work, new endpoints)
            if (batch) {
                record('pick-media (batch)', await timeAction(client, async () => {
                    const elements = runMedia.map(m => imageElement(m.name, m.size))
                    await client.request('POST', client.app('apiv2/album/' + encodeURIComponent(albumId) + '/assetsearch'), {
                        // the web chooser knows where the picked files are: no search needed
                        json: { assets: elements.map(el => ({ asset: el.image, asset_name: el.name, asset_size: el.size, source: '/' + mediaFolder + '/' + el.name })) },
                    })
                    await client.request('POST', client.app('apiv2/album/' + encodeURIComponent(albumId) + '/pages'), {
                        json: { operations: elements.map((el, i) => ({ op: 'create', pos: 1 + i, page: { id: randomUUID(), elements: [el] } })) },
                    })
                }))
            }

            // caption-edit: one page save
            const target = legacyPages[0]
            target.elements[0] = { ...target.elements[0], text: 'caption ' + r }
            record('caption-edit', await timeAction(client, () => savePage(client, albumId, target)))

            // layout-change: 4 previews at sizes never requested before (cache miss)
            if (albumPath) {
                record('layout-change', await timeAction(client, async () => {
                    await Promise.all(legacyPages.slice(0, 4).map((page, i) => {
                        const file = page.elements[0].image.split('/').pop()
                        const size = 200 + 37 * r + i
                        return client.request('GET', client.app('preview?apath=' + encodeURIComponent(albumPath)
                            + '&file=' + encodeURIComponent(file) + '&width=' + size + '&height=' + size))
                    }))
                }))
            }

            // remove-element: page save + clean (what the editor does on removal)
            const removed = legacyPages[1]
            removed.elements = []
            record('remove-element', await timeAction(client, async () => {
                await savePage(client, albumId, removed)
                await clean(client, albumId)
            }))

            // clean alone, now that the album holds all the media of this run
            record('clean', await timeAction(client, () => clean(client, albumId)))
        }
        process.stdout.write('\n')
    } finally {
        console.log('Cleaning up...')
        await client.request('DELETE', client.app('apiv2/album/' + encodeURIComponent(albumId)), { okStatuses: [404] }).catch(e => console.error(e.message))
        await client.request('DELETE', client.dav(mediaFolder), { okStatuses: [404] }).catch(e => console.error(e.message))
    }
    return results
}

// --- reporting ----------------------------------------------------------------------

function report(results) {
    const rows = []
    for (const [name, r] of Object.entries(results)) {
        const s = summarize(r.samples)
        const spans = {}
        for (const st of r.serverTiming) {
            for (const [k, v] of Object.entries(st)) {
                spans[k] = (spans[k] || 0) + v / r.serverTiming.length
            }
        }
        const breakdown = Object.entries(spans)
            .filter(([k]) => k !== 'total')
            .map(([k, v]) => k + '=' + v.toFixed(0))
            .join(' ')
        rows.push({
            action: name,
            requests: Math.round(r.requests.reduce((a, b) => a + b, 0) / r.requests.length),
            'median ms': s.median.toFixed(0),
            'p95 ms': s.p95.toFixed(0),
            'min ms': s.min.toFixed(0),
            'server ms': spans.total !== undefined ? spans.total.toFixed(0) : '-',
            'server breakdown (avg ms)': breakdown || '-',
        })
    }
    console.table(rows)
}

function compare(beforeFile, afterFile) {
    const before = JSON.parse(readFileSync(beforeFile, 'utf8'))
    const after = JSON.parse(readFileSync(afterFile, 'utf8'))
    const rows = []
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const b = before[name] ? summarize(before[name].samples).median : NaN
        const a = after[name] ? summarize(after[name].samples).median : NaN
        rows.push({
            action: name,
            'before median ms': isNaN(b) ? '-' : b.toFixed(0),
            'after median ms': isNaN(a) ? '-' : a.toFixed(0),
            change: (isNaN(a) || isNaN(b)) ? '-' : ((a - b) / b * 100).toFixed(0) + '%',
        })
    }
    console.table(rows)
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help || (!args.compare && (!args.url || !args.user || !args.password))) {
        console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0])
        process.exit(args.help ? 0 : 1)
    }
    if (args.compare) {
        compare(...args.compare)
        return
    }
    const results = await run(args)
    report(results)
    if (args.json) {
        writeFileSync(args.json, JSON.stringify(results, null, 1))
        console.log('Raw samples written to ' + args.json)
    }
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('bench-apiv2.mjs')) {
    main().catch(error => {
        console.error(error.message)
        process.exit(1)
    })
}
