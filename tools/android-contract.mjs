#!/usr/bin/env node
/**
 * Android API compatibility check (issue #50).
 *
 * Replays the API usage of the Android app (souvenirs-android v3.1.0:
 * NCAPI.java, AlbumNC.java, AlbumsNC.java, PageNC.java, nc/Utils.java), with
 * the same request bodies as its Gson models, against an instance: album
 * creation and edits, the asset push flow (assetprobe -> assetsearch ->
 * WebDAV upload, assets before pages), pages, clean, asset pull, the error
 * paths, shares, deletion. Every response is recorded with its status and
 * JSON body, normalized (ids, dates, tokens and run-specific names masked),
 * plus the album state after each step.
 *
 * Run it on the current release and on the new version, then compare:
 *
 *   node tools/android-contract.mjs --url https://cloud.example.org --user alice  *        --password <app password> --out before.json
 *   node tools/android-contract.mjs ... --out after.json
 *   node tools/android-contract.mjs --compare before.json after.json
 *
 * Everything it creates (one album, one folder of random files) is deleted.
 */
import { randomUUID, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const args = {}
for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i]
    if (key === '--compare') {
        args.compare = [process.argv[++i], process.argv[++i]]
    } else {
        args[key.replace(/^--/, '')] = process.argv[++i]
    }
}
if (args.compare) {
    const [a, b] = args.compare.map(f => JSON.parse(readFileSync(f, 'utf8')))
    if (a.length !== b.length) {
        console.log('Different number of records: ' + a.length + ' vs ' + b.length)
        process.exit(1)
    }
    let differences = 0
    a.forEach((x, i) => {
        if (JSON.stringify(x) !== JSON.stringify(b[i])) {
            differences++
            console.log('DIFF ' + x.step)
            console.log('  before: ' + JSON.stringify(x))
            console.log('  after:  ' + JSON.stringify(b[i]))
        }
    })
    console.log(a.length + ' records compared, ' + differences + ' difference(s)')
    process.exit(differences === 0 ? 0 : 1)
}
if (!args.url || !args.user || !args.password || !args.out) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0])
    process.exit(1)
}
const BASE = args.url.replace(/\/+$/, '')
const AUTH = 'Basic ' + Buffer.from(args.user + ':' + args.password).toString('base64')
const API = BASE + '/index.php/apps/souvenirs/apiv2/'
const WEBDAV = BASE + '/remote.php/webdav/'
const out = []

// --- normalization: keep keys, types and stable values; mask what changes per run
const ids = new Map()
function mask(value) {
    if (typeof value !== 'string') {
        return value
    }
    let v = value
    for (const [real, alias] of ids) {
        v = v.split(real).join(alias)
    }
    v = v.replace(/\b\d{14}\b/g, '<date>')
    v = v.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    v = v.replace(/public\/[A-Za-z0-9]{20,}/g, 'public/<token>')
    return v
}
function normalize(x) {
    if (Array.isArray(x)) {
        return x.map(normalize)
    }
    if (x && typeof x === 'object') {
        const o = {}
        for (const k of Object.keys(x).sort()) {
            o[k] = (k === 'shareToken') ? '<token>' : normalize(x[k])
        }
        return o
    }
    return mask(x)
}
const alias = (real, name) => ids.set(real, '<' + name + '>')

async function call(step, method, path, { json, form, base = API, body } = {}) {
    const headers = { Authorization: AUTH, 'OCS-APIRequest': 'true' }
    let payload
    if (json !== undefined) {
        headers['Content-Type'] = 'application/json'
        payload = JSON.stringify(json)
    } else if (form !== undefined) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        payload = new URLSearchParams(form).toString()
    } else if (body !== undefined) {
        payload = body
    }
    const r = await fetch(base + path, { method, headers, body: payload })
    const type = (r.headers.get('content-type') || '').split(';')[0]
    const text = await r.text()
    let parsed = text
    if (type === 'application/json') {
        try { parsed = JSON.parse(text) } catch (e) { /* keep text */ }
    } else if (text.length > 120) {
        parsed = '<' + text.length + ' bytes>'
    }
    out.push({ step, request: method + ' ' + mask(path), status: r.status, type, body: normalize(parsed) })
    return { status: r.status, body: parsed }
}

const albumState = async (step) => {
    const r = await fetch(API + 'album/' + albumId + '/full', { headers: { Authorization: AUTH } })
    const a = await r.json()
    out.push({ step: step + ' => state', pages: normalize((a.pages || []).map(p => ({ id: p.id, elements: p.elements.map(e => e.id + ':' + (e.text || e.image || '')) }))) })
}

// --- fixtures: what the phone holds locally ---------------------------------------
const albumId = randomUUID(); alias(albumId, 'album')
const pageA = randomUUID(); alias(pageA, 'pageA')
const pageB = randomUUID(); alias(pageB, 'pageB')
const pageC = randomUUID(); alias(pageC, 'pageC')
const tag = randomBytes(3).toString('hex')
// run-specific names are masked too, so two runs compare equal
const srcDir = 'android-src-' + tag; alias(srcDir, 'srcDir')
const local = randomBytes(1000)            // a photo only on the phone
const shared = randomBytes(2000)           // a photo also auto-uploaded to Nextcloud
const sharedName = 'IMG_' + tag + '.jpg'; alias(sharedName, 'sharedName')
const localName = 'phone-only-' + tag + '.jpg'; alias(localName, 'localName')
const albumName = 'Android ' + tag; alias(albumName, 'albumName')
const assetLocal = 'data/' + randomUUID() + '.jpg'; alias(assetLocal, 'assetLocal')
const assetShared = 'data/' + randomUUID() + '.jpg'; alias(assetShared, 'assetShared')
const assetOrphan = 'data/' + randomUUID() + '.jpg'; alias(assetOrphan, 'assetOrphan')
const el = (id, extra) => ({ id, left: 0, top: 0, right: 100, bottom: 100, size: 0, transformType: 0, zoom: 0, offsetX: 0, offsetY: 0, stop: false, ...extra })
const elLocal = randomUUID(); alias(elLocal, 'elLocal')
const elShared = randomUUID(); alias(elShared, 'elShared')
const elText = randomUUID(); alias(elText, 'elText')

await fetch(WEBDAV + srcDir, { method: 'MKCOL', headers: { Authorization: AUTH } })
await fetch(WEBDAV + srcDir + '/' + sharedName, { method: 'PUT', headers: { Authorization: AUTH }, body: shared })

// --- AlbumsNC / AlbumNC.create ---------------------------------------------------------
await call('createAlbum', 'PUT', 'album/' + albumId)
const created = await call('getAlbum (path)', 'GET', 'album/' + albumId)
const albumPath = created.body.path; alias(albumPath.replace(/^\//, ''), 'albumPath')
// modifyAlbum: Gson drops nulls, sends isShared=false and the other fields
await call('modifyAlbum', 'POST', 'album/' + albumId, { json: { id: albumId, name: albumName, date: '20261018120000', albumImage: assetShared, defaultStyle: 'default', elementMargin: 1, isShared: false } })

// --- AlbumNC.pushAsset: probe -> search -> upload (assets BEFORE the page) ----------------
let probe = await call('pushAsset local: probe', 'GET', 'album/' + albumId + '/assetprobe/' + assetLocal)
await call('pushAsset local: search', 'GET', 'album/' + albumId + '/assetsearch?' + new URLSearchParams({ asset: assetLocal, asset_name: localName, asset_size: String(local.length) }))
await fetch(WEBDAV + probe.body.path.replace(/^\//, ''), { method: 'PUT', headers: { Authorization: AUTH }, body: local })
await call('pushAsset local: probe after upload', 'GET', 'album/' + albumId + '/assetprobe/' + assetLocal)

await call('pushAsset shared: probe', 'GET', 'album/' + albumId + '/assetprobe/' + assetShared)
await call('pushAsset shared: search', 'GET', 'album/' + albumId + '/assetsearch?' + new URLSearchParams({ asset: assetShared, asset_name: sharedName, asset_size: String(shared.length) }))
await call('pushAsset shared: probe (link)', 'GET', 'album/' + albumId + '/assetprobe/' + assetShared)

// an asset uploaded for a page that is then never saved (sync interrupted)
probe = await call('pushAsset orphan: probe', 'GET', 'album/' + albumId + '/assetprobe/' + assetOrphan)
await fetch(WEBDAV + probe.body.path.replace(/^\//, ''), { method: 'PUT', headers: { Authorization: AUTH }, body: randomBytes(500) })

// --- pages ----------------------------------------------------------------------------
await call('createPage A @0', 'PUT', 'album/' + albumId + '/page/0', { json: { id: pageA, elements: [el(elLocal, { class: 'ImageElement', image: assetLocal, name: localName, size: local.length, mime: 'image/jpeg' })] } })
await call('createPage B @1', 'PUT', 'album/' + albumId + '/page/1', { json: { id: pageB, elements: [el(elShared, { class: 'ImageElement', image: assetShared, name: sharedName, size: shared.length, mime: 'image/jpeg' })] } })
await call('createPage C @2', 'PUT', 'album/' + albumId + '/page/2', { json: { id: pageC, elements: [el(elText, { class: 'TextElement', text: 'hello' })] } })
await albumState('after createPage x3')
await call('modifyPage C', 'POST', 'album/' + albumId + '/page/' + pageC, { json: { id: pageC, lastEditDate: '20261018120000', elements: [el(elText, { class: 'TextElement', text: 'hello android' })] } })
await call('movePage C -> 0', 'POST', 'album/' + albumId + '/page/' + pageC + '/pos/0')
await albumState('after modify + move')
await call('getAlbumFull', 'GET', 'album/' + albumId + '/full')
await call('getAlbums page 1', 'GET', 'album?page=1')
const details = await fetch(API + 'albums', { headers: { Authorization: AUTH } }).then(r => r.json())
out.push({ step: 'getAlbumsDetails (this album)', body: normalize(details.filter(a => a.id === albumId)) })

// --- clean, as SyncToNextcloudThread does at the end of a sync --------------------------
await call('clean', 'GET', 'album/' + albumId + '/clean')
await call('after clean: probe local', 'GET', 'album/' + albumId + '/assetprobe/' + assetLocal)
await call('after clean: probe shared', 'GET', 'album/' + albumId + '/assetprobe/' + assetShared)
await call('after clean: probe orphan', 'GET', 'album/' + albumId + '/assetprobe/' + assetOrphan)

// --- pullAsset: probe then WebDAV GET of the returned path -----------------------------
for (const [name, asset, bytes] of [['local', assetLocal, local], ['shared', assetShared, shared]]) {
    const p = await fetch(API + 'album/' + albumId + '/assetprobe/' + asset, { headers: { Authorization: AUTH } }).then(r => r.json())
    const g = await fetch(WEBDAV + encodeURI(p.path.replace(/^\//, '')), { headers: { Authorization: AUTH } })
    const got = Buffer.from(await g.arrayBuffer())
    out.push({ step: 'pullAsset ' + name, status: g.status, sameBytes: Buffer.compare(got, bytes) === 0 })
}

// --- error paths the app may hit -------------------------------------------------------
const unknown = randomUUID(); alias(unknown, 'unknown')
await call('getAlbum unknown', 'GET', 'album/' + unknown)
await call('getAlbumFull unknown', 'GET', 'album/' + unknown + '/full')
await call('modifyAlbum unknown', 'POST', 'album/' + unknown, { json: { name: 'x' } })
await call('createAlbum existing', 'PUT', 'album/' + albumId)
await call('modifyPage unknown page', 'POST', 'album/' + albumId + '/page/' + unknown, { json: { id: unknown, elements: [] } })
await call('movePage unknown page', 'POST', 'album/' + albumId + '/page/' + unknown + '/pos/0')
await call('deletePage unknown page', 'DELETE', 'album/' + albumId + '/page/' + unknown)
await call('clean unknown album', 'GET', 'album/' + unknown + '/clean')
await call('probe unknown album', 'GET', 'album/' + unknown + '/assetprobe/data/x.jpg')
await call('search unknown album', 'GET', 'album/' + unknown + '/assetsearch?asset=data/x.jpg&asset_name=x&asset_size=1')

// --- share, delete --------------------------------------------------------------------
const share = await call('createShare', 'POST', 'share', { form: { albumId } })
const token = String(share.body).split('/').pop(); alias(token, 'token')
await call('getAlbum shared', 'GET', 'album/' + albumId)
await call('deleteShare', 'DELETE', 'share/' + token)
await call('deletePage B', 'DELETE', 'album/' + albumId + '/page/' + pageB)
await albumState('after deletePage')
await call('deleteAlbum', 'DELETE', 'album/' + albumId)
await call('getAlbum deleted', 'GET', 'album/' + albumId)
await fetch(WEBDAV + srcDir, { method: 'DELETE', headers: { Authorization: AUTH } })

writeFileSync(args.out, JSON.stringify(out, null, 1))
console.log(out.length + ' records written to ' + args.out)
