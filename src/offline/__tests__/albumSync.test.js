import { describe, it, expect, vi } from 'vitest'
import {
    reconcile, recordFromRemote, decide, planStructurePush, stableStringify, tokenEquals,
    hasLocalChanges, syncStatus, pageAssets, infoOf, MAX_BATCH_OPERATIONS,
} from '../albumSync.js'

// Reconciliation of a local album copy with the server (issue #22). The
// "server" here applies the batch operations the way Album.php does, so the
// tests check the outcome (what the server ends up with), not only the calls.

function page(id, text, token = 't-' + id) {
    return { id, lastEditDate: token, elements: [{ id: 'e-' + id, class: 'TextElement', text }] }
}

function album(pages, overrides = {}) {
    return {
        id: 'album-1',
        name: 'Trip',
        date: '20260101120000',
        elementMargin: 1,
        lastEditDate: 'info-1',
        pageLastEditDate: 'pages-1',
        path: '/Souvenirs/trip',
        pages,
        ...overrides,
    }
}

/** A server holding `remote`, applying writes like Api2Controller. */
function makeServer(remote) {
    let clock = 0
    const stamp = () => 'srv-' + (++clock)
    const state = JSON.parse(JSON.stringify(remote))
    const api = {
        updateAlbum: vi.fn(async fields => {
            Object.assign(state, fields)
            state.lastEditDate = stamp()
            return { lastEditDate: state.lastEditDate }
        }),
        pageOperations: vi.fn(async operations => {
            const results = []
            let structural = false
            for (const operation of operations) {
                if (operation.op === 'update') {
                    const target = state.pages.find(p => p.id === operation.page.id)
                    if (target == null) {
                        throw Object.assign(new Error('unknown page'), { status: 404 })
                    }
                    target.elements = JSON.parse(JSON.stringify(operation.page.elements))
                    target.lastEditDate = stamp()
                    results.push({ lastEditDate: target.lastEditDate })
                } else if (operation.op === 'create') {
                    if (state.pages.some(p => p.id === operation.page.id)) {
                        throw Object.assign(new Error('page already exists'), { status: 400 })
                    }
                    const created = { ...JSON.parse(JSON.stringify(operation.page)), lastEditDate: stamp() }
                    state.pages.splice(operation.pos, 0, created)
                    structural = true
                    results.push({ lastEditDate: created.lastEditDate })
                } else if (operation.op === 'delete') {
                    const index = state.pages.findIndex(p => p.id === operation.id)
                    if (index < 0) {
                        throw Object.assign(new Error('unknown page'), { status: 404 })
                    }
                    state.pages.splice(index, 1)
                    structural = true
                    results.push({})
                } else if (operation.op === 'move') {
                    // Album::movePage: remove, then insert at pos (-1 when it came from before)
                    const oldPos = state.pages.findIndex(p => p.id === operation.id)
                    const [moved] = state.pages.splice(oldPos, 1)
                    state.pages.splice(oldPos <= operation.pos ? operation.pos - 1 : operation.pos, 0, moved)
                    structural = true
                    results.push({})
                }
            }
            const response = { results }
            if (structural) {
                state.pageLastEditDate = stamp()
                response.pageLastEditDate = state.pageLastEditDate
            }
            return response
        }),
        uploadPending: vi.fn(async () => {}),
        dropPending: vi.fn(async () => {}),
        cleanAssets: vi.fn(async () => {}),
    }
    return { state, api, snapshot: () => JSON.parse(JSON.stringify(state)) }
}

function ids(pages) {
    return pages.map(p => p.id)
}

function texts(pages) {
    return pages.map(p => p.elements[0].text)
}

describe('helpers', () => {
    it('compares tokens as opaque values, absent meaning null', () => {
        expect(tokenEquals('a', 'a')).toBe(true)
        expect(tokenEquals(undefined, null)).toBe(true)
        expect(tokenEquals('a', null)).toBe(false)
    })

    it('stringifies independently of the key order', () => {
        expect(stableStringify({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(stableStringify({ b: [{ d: 3, c: 2 }], a: 1 }))
        expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
    })

    it('decides the direction of a domain', () => {
        expect(decide(false, true, false)).toBe('pull')
        expect(decide(false, false, false)).toBe('pull')
        expect(decide(true, true, false)).toBe('push')
        expect(decide(true, false, false)).toBe('conflict')
        expect(decide(true, false, false, 'local')).toBe('push')
        expect(decide(true, false, false, 'remote')).toBe('pull')
        // dirty but identical: nothing to send, nothing to argue about
        expect(decide(true, false, true)).toBe('pull')
    })

    it('builds a clean record from the server album', () => {
        const record = recordFromRemote(album([page('p1', 'one')]), '/Souvenirs/trip')
        expect(record.path).toBe('Souvenirs/trip')
        expect(record.info.name).toBe('Trip')
        expect(record.info.pages).toBeUndefined()
        expect(record.info.path).toBeUndefined()
        expect(record.base).toEqual({ info: 'info-1', pages: 'pages-1', content: { p1: 't-p1' } })
        expect(hasLocalChanges(record)).toBe(false)
        expect(syncStatus(record)).toBe('synced')
    })

    it('reports the status of a record', () => {
        const record = recordFromRemote(album([page('p1', 'one')]))
        expect(syncStatus(null)).toBe('none')
        expect(syncStatus({ ...record, pages: null })).toBe('none')
        record.dirty.content.p1 = true
        expect(syncStatus(record)).toBe('pending')
        record.conflicts = { content: ['p1'] }
        expect(syncStatus(record)).toBe('conflict')
        const pendingOnly = recordFromRemote(album([]))
        pendingOnly.pendingAssets.push('data/x.jpg')
        expect(syncStatus(pendingOnly)).toBe('pending')
    })

    it('lists the assets of a page and drops API-only album fields', () => {
        expect(pageAssets({ elements: [{ image: 'data/a.jpg', video: 'data/a.mp4' }, { audio: 'data/b.mp3' }, { text: 'x' }, { image: '' }] }))
            .toEqual(['data/a.jpg', 'data/a.mp4', 'data/b.mp3'])
        expect(infoOf({ name: 'n', pages: [], path: '/p', isShared: true, shareToken: 't' })).toEqual({ name: 'n' })
    })
})

describe('planStructurePush', () => {
    function apply(remotePages, operations) {
        const server = makeServer(album(remotePages))
        return server.api.pageOperations(operations).then(() => ids(server.state.pages))
    }

    it('turns the server list into the local one', async () => {
        const remote = [page('a'), page('b'), page('c'), page('d')]
        const cases = [
            ['a', 'b', 'c', 'd'],
            ['d', 'c', 'b', 'a'],
            ['b', 'a', 'd', 'c'],
            ['a', 'c'],
            ['x', 'a', 'b', 'c', 'd', 'y'],
            ['c', 'x', 'a', 'y'],
            [],
            ['x'],
            ['d', 'x', 'y', 'a'],
        ]
        for (const wanted of cases) {
            const local = wanted.map(id => page(id))
            expect(await apply(remote, planStructurePush(local, remote))).toEqual(wanted)
        }
    })

    it('needs no operation when the lists already match', () => {
        const pages = [page('a'), page('b')]
        expect(planStructurePush(pages, pages)).toEqual([])
    })

    it('creates pages with their content', () => {
        const operations = planStructurePush([page('a'), page('new', 'hello')], [page('a')])
        expect(operations).toEqual([{ op: 'create', pos: 1, page: page('new', 'hello') }])
    })
})

describe('reconcile', () => {
    it('does nothing when both sides are in sync', async () => {
        const remote = album([page('p1', 'one'), page('p2', 'two')])
        const record = recordFromRemote(remote)
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.pushed).toBe(false)
        expect(result.pulled).toBe(false)
        expect(result.record.conflicts).toBeNull()
        expect(server.api.pageOperations).not.toHaveBeenCalled()
        expect(server.api.updateAlbum).not.toHaveBeenCalled()
        expect(server.api.cleanAssets).not.toHaveBeenCalled()
    })

    it('does not modify the record it is given', async () => {
        const remote = album([page('p1', 'one')])
        const record = recordFromRemote(remote)
        record.pages[0].elements[0].text = 'edited'
        record.dirty.content.p1 = true
        const before = JSON.stringify(record)
        const server = makeServer(remote)
        await reconcile(record, server.snapshot(), server.api)
        expect(JSON.stringify(record)).toBe(before)
    })

    it('pulls everything the server changed when nothing changed locally', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        const remote = album([page('p2', 'two edited', 't2b'), page('p3', 'three')], {
            name: 'Renamed', lastEditDate: 'info-2', pageLastEditDate: 'pages-2',
        })
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.pulled).toBe(true)
        expect(result.pushed).toBe(false)
        expect(result.record.info.name).toBe('Renamed')
        expect(ids(result.record.pages)).toEqual(['p2', 'p3'])
        expect(texts(result.record.pages)).toEqual(['two edited', 'three'])
        expect(result.record.base).toEqual({ info: 'info-2', pages: 'pages-2', content: { p2: 't2b', p3: 't-p3' } })
        expect(result.record.conflicts).toBeNull()
        expect(server.api.pageOperations).not.toHaveBeenCalled()
    })

    it('pushes an edited page and records the token the server returns', async () => {
        const remote = album([page('p1', 'one'), page('p2', 'two')])
        const record = recordFromRemote(remote)
        record.pages[1].elements[0].text = 'two edited'
        record.dirty.content.p2 = true
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.pushed).toBe(true)
        expect(texts(server.state.pages)).toEqual(['one', 'two edited'])
        expect(server.api.pageOperations).toHaveBeenCalledTimes(1)
        expect(server.api.pageOperations.mock.calls[0][0].map(o => o.op)).toEqual(['update'])
        expect(result.record.dirty.content).toEqual({})
        expect(result.record.base.content.p2).toBe(server.state.pages[1].lastEditDate)
        expect(hasLocalChanges(result.record)).toBe(false)
        expect(server.api.cleanAssets).toHaveBeenCalledTimes(1)
    })

    it('pushes the album name and date, nothing else', async () => {
        const remote = album([page('p1', 'one')])
        const record = recordFromRemote(remote)
        record.info.name = 'New name'
        record.info.elementMargin = 5
        record.dirty.info = true
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(server.api.updateAlbum).toHaveBeenCalledWith({ name: 'New name', date: '20260101120000' })
        expect(server.state.name).toBe('New name')
        expect(result.record.dirty.info).toBe(false)
        expect(result.record.base.info).toBe(server.state.lastEditDate)
        // fields this client does not edit follow the server
        expect(result.record.info.elementMargin).toBe(1)
    })

    it('pushes pages created, deleted and reordered offline in one batch', async () => {
        const remote = album([page('p1', 'one'), page('p2', 'two'), page('p3', 'three')])
        const record = recordFromRemote(remote)
        // delete p2, create n1 in front, swap the rest
        record.pages = [page('n1', 'new', undefined), record.pages[2], record.pages[0]]
        delete record.pages[0].lastEditDate
        record.dirty.pages = true
        record.dirty.content.n1 = true
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(server.api.pageOperations).toHaveBeenCalledTimes(1)
        expect(ids(server.state.pages)).toEqual(['n1', 'p3', 'p1'])
        expect(texts(server.state.pages)).toEqual(['new', 'three', 'one'])
        expect(result.record.dirty).toEqual({ info: false, pages: false, content: {} })
        expect(result.record.base.pages).toBe(server.state.pageLastEditDate)
        expect(Object.keys(result.record.base.content).sort()).toEqual(['n1', 'p1', 'p3'])
        expect(result.record.base.content.n1).toBe(server.state.pages[0].lastEditDate)
        expect(result.record.conflicts).toBeNull()
    })

    it('mixes directions: pushes what changed here, pulls what changed there', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages[0].elements[0].text = 'one local'
        record.dirty.content.p1 = true
        const remote = album([page('p1', 'one'), page('p2', 'two remote', 't2b')])
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.pushed).toBe(true)
        expect(result.pulled).toBe(true)
        expect(texts(server.state.pages)).toEqual(['one local', 'two remote'])
        expect(texts(result.record.pages)).toEqual(['one local', 'two remote'])
        expect(result.record.conflicts).toBeNull()
    })

    it('reports a content conflict and leaves both sides untouched', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages[0].elements[0].text = 'one local'
        record.dirty.content.p1 = true
        const server = makeServer(album([page('p1', 'one remote', 't1b'), page('p2', 'two')]))
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toEqual({ content: ['p1'] })
        expect(result.pushed).toBe(false)
        expect(texts(result.record.pages)).toEqual(['one local', 'two'])
        expect(texts(server.state.pages)).toEqual(['one remote', 'two'])
        expect(result.record.dirty.content.p1).toBe(true)
        // the token of the last sync is kept: the conflict is seen again
        expect(result.record.base.content.p1).toBe('t-p1')
        expect(syncStatus(result.record)).toBe('conflict')
    })

    it('resolves a content conflict by keeping the local version', async () => {
        const record = recordFromRemote(album([page('p1', 'one')]))
        record.pages[0].elements[0].text = 'one local'
        record.dirty.content.p1 = true
        const server = makeServer(album([page('p1', 'one remote', 't1b')]))
        const result = await reconcile(record, server.snapshot(), server.api, { content: 'local' })
        expect(texts(server.state.pages)).toEqual(['one local'])
        expect(result.record.conflicts).toBeNull()
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('resolves a content conflict by keeping the server version', async () => {
        const record = recordFromRemote(album([page('p1', 'one')]))
        record.pages[0].elements[0].text = 'one local'
        record.dirty.content.p1 = true
        const server = makeServer(album([page('p1', 'one remote', 't1b')]))
        const result = await reconcile(record, server.snapshot(), server.api, { content: 'remote' })
        expect(server.api.pageOperations).not.toHaveBeenCalled()
        expect(texts(result.record.pages)).toEqual(['one remote'])
        expect(result.pulled).toBe(true)
        expect(result.record.conflicts).toBeNull()
        expect(result.record.base.content.p1).toBe('t1b')
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('reports an info conflict, resolved either way', async () => {
        const base = album([page('p1', 'one')])
        const record = recordFromRemote(base)
        record.info.name = 'Local name'
        record.dirty.info = true
        const remote = album([page('p1', 'one')], { name: 'Remote name', lastEditDate: 'info-2' })

        let server = makeServer(remote)
        let result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toEqual({ info: true })
        expect(server.api.updateAlbum).not.toHaveBeenCalled()

        result = await reconcile(result.record, server.snapshot(), server.api, { info: 'remote' })
        expect(result.record.info.name).toBe('Remote name')
        expect(result.record.conflicts).toBeNull()

        server = makeServer(remote)
        result = await reconcile(record, server.snapshot(), server.api, { info: 'local' })
        expect(server.state.name).toBe('Local name')
        expect(result.record.conflicts).toBeNull()
    })

    it('reports a structure conflict and still syncs the content of shared pages', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages.push(page('n1', 'new'))
        record.dirty.pages = true
        record.pages[0].elements[0].text = 'one local'
        record.dirty.content.p1 = true
        // meanwhile the server got another page
        const server = makeServer(album([page('p1', 'one'), page('p2', 'two'), page('r1', 'remote new')], { pageLastEditDate: 'pages-2' }))
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toEqual({ pages: true })
        // structure untouched on both sides
        expect(ids(result.record.pages)).toEqual(['p1', 'p2', 'n1'])
        expect(ids(server.state.pages)).toEqual(['p1', 'p2', 'r1'])
        // but the edit of a page present on both sides went through
        expect(server.state.pages[0].elements[0].text).toBe('one local')
        expect(result.record.dirty.content.p1).toBeUndefined()
        expect(result.record.dirty.pages).toBe(true)
    })

    it('resolves a structure conflict with the local page list', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages = [record.pages[1], record.pages[0], page('n1', 'new')]
        record.dirty.pages = true
        const server = makeServer(album([page('p1', 'one'), page('p2', 'two'), page('r1', 'remote new')], { pageLastEditDate: 'pages-2' }))
        const result = await reconcile(record, server.snapshot(), server.api, { pages: 'local' })
        expect(ids(server.state.pages)).toEqual(['p2', 'p1', 'n1'])
        expect(result.record.conflicts).toBeNull()
        expect(hasLocalChanges(result.record)).toBe(false)
        expect(result.record.base.content.r1).toBeUndefined()
    })

    it('resolves a structure conflict with the server page list', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages.push(page('n1', 'new'))
        record.dirty.pages = true
        record.dirty.content.n1 = true
        record.pendingAssets = ['data/n1.jpg']
        record.pages[2].elements.push({ id: 'img', class: 'ImageElement', image: 'data/n1.jpg' })
        const server = makeServer(album([page('p2', 'two'), page('r1', 'remote new')], { pageLastEditDate: 'pages-2' }))
        const result = await reconcile(record, server.snapshot(), server.api, { pages: 'remote' })
        expect(server.api.pageOperations).not.toHaveBeenCalled()
        expect(ids(result.record.pages)).toEqual(['p2', 'r1'])
        expect(result.record.conflicts).toBeNull()
        expect(result.record.dirty).toEqual({ info: false, pages: false, content: {} })
        // the media of the page that was given up are forgotten
        expect(server.api.dropPending).toHaveBeenCalledWith('data/n1.jpg')
        expect(result.record.pendingAssets).toEqual([])
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('does not silently drop a page edited here that the server deleted', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages[1].elements[0].text = 'two local'
        record.dirty.content.p2 = true
        const remote = album([page('p1', 'one')], { pageLastEditDate: 'pages-2' })

        let server = makeServer(remote)
        let result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toEqual({ pages: true })
        expect(ids(result.record.pages)).toEqual(['p1', 'p2'])
        expect(ids(server.state.pages)).toEqual(['p1'])

        // keeping the local version brings the page back, with its edit
        result = await reconcile(result.record, server.snapshot(), server.api, { pages: 'local' })
        expect(ids(server.state.pages)).toEqual(['p1', 'p2'])
        expect(server.state.pages[1].elements[0].text).toBe('two local')
        expect(result.record.conflicts).toBeNull()
        expect(hasLocalChanges(result.record)).toBe(false)

        // keeping the server version drops it
        server = makeServer(remote)
        result = await reconcile(record, server.snapshot(), server.api, { pages: 'remote' })
        expect(ids(result.record.pages)).toEqual(['p1'])
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('does not silently delete a page deleted here that the server edited', async () => {
        const record = recordFromRemote(album([page('p1', 'one'), page('p2', 'two')]))
        record.pages.splice(1, 1)
        record.dirty.pages = true
        // structure token unchanged, but p2 was edited there
        const remote = album([page('p1', 'one'), page('p2', 'two remote', 't2b')])

        let server = makeServer(remote)
        let result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toEqual({ pages: true })
        expect(ids(server.state.pages)).toEqual(['p1', 'p2'])

        result = await reconcile(result.record, server.snapshot(), server.api, { pages: 'remote' })
        expect(ids(result.record.pages)).toEqual(['p1', 'p2'])
        expect(texts(result.record.pages)).toEqual(['one', 'two remote'])

        server = makeServer(remote)
        result = await reconcile(record, server.snapshot(), server.api, { pages: 'local' })
        expect(ids(server.state.pages)).toEqual(['p1'])
        expect(result.record.conflicts).toBeNull()
    })

    it('deletes on the server a page deleted here that nobody touched', async () => {
        const remote = album([page('p1', 'one'), page('p2', 'two')])
        const record = recordFromRemote(remote)
        record.pages.splice(1, 1)
        record.dirty.pages = true
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(ids(server.state.pages)).toEqual(['p1'])
        expect(result.record.conflicts).toBeNull()
        expect(result.record.base.content).toEqual({ p1: 't-p1' })
    })

    it('recognizes its own write whose response was lost', async () => {
        // the page was sent, the server applied it (new token), the response
        // never arrived: the edit is still flagged, the token is the old one
        const record = recordFromRemote(album([page('p1', 'one')]))
        record.pages[0].elements[0].text = 'one edited'
        record.dirty.content.p1 = true
        record.pages.push(page('n1', 'new'))
        record.dirty.pages = true
        record.info.name = 'Renamed'
        record.dirty.info = true
        const server = makeServer(album([page('p1', 'one edited', 't1b'), page('n1', 'new', 'tn')],
            { name: 'Renamed', lastEditDate: 'info-2', pageLastEditDate: 'pages-2' }))
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toBeNull()
        expect(server.api.pageOperations).not.toHaveBeenCalled()
        expect(server.api.updateAlbum).not.toHaveBeenCalled()
        expect(hasLocalChanges(result.record)).toBe(false)
        expect(result.record.base).toEqual({ info: 'info-2', pages: 'pages-2', content: { p1: 't1b', n1: 'tn' } })
    })

    it('treats albums without tokens (written by old versions) as unchanged', async () => {
        const remote = album([{ id: 'p1', elements: [{ id: 'e', text: 'one' }] }], { lastEditDate: undefined, pageLastEditDate: undefined })
        const record = recordFromRemote(remote)
        expect(record.base).toEqual({ info: null, pages: null, content: { p1: null } })
        record.pages[0].elements[0].text = 'edited'
        record.dirty.content.p1 = true
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toBeNull()
        expect(server.state.pages[0].elements[0].text).toBe('edited')
    })

    it('uploads the pending media of the pages it pushes, before pushing', async () => {
        const remote = album([page('p1', 'one')])
        const record = recordFromRemote(remote)
        record.pages[0].elements.push({ id: 'img', class: 'ImageElement', image: 'data/new.jpg' })
        record.dirty.content.p1 = true
        record.pendingAssets = ['data/new.jpg']
        const server = makeServer(remote)
        const order = []
        server.api.uploadPending.mockImplementation(async asset => { order.push('upload ' + asset) })
        const original = server.api.pageOperations.getMockImplementation()
        server.api.pageOperations.mockImplementation(async operations => { order.push('push'); return original(operations) })
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(order).toEqual(['upload data/new.jpg', 'push'])
        expect(result.record.pendingAssets).toEqual([])
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('keeps the pending media of pages still in conflict', async () => {
        const record = recordFromRemote(album([page('p1', 'one')]))
        record.pages[0].elements.push({ id: 'img', class: 'ImageElement', image: 'data/new.jpg' })
        record.dirty.content.p1 = true
        record.pendingAssets = ['data/new.jpg']
        const server = makeServer(album([page('p1', 'one remote', 't1b')]))
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toEqual({ content: ['p1'] })
        expect(server.api.uploadPending).not.toHaveBeenCalled()
        expect(server.api.dropPending).not.toHaveBeenCalled()
        expect(result.record.pendingAssets).toEqual(['data/new.jpg'])
    })

    it('forgets pending media that no page uses any more', async () => {
        const remote = album([page('p1', 'one')])
        const record = recordFromRemote(remote)
        record.pendingAssets = ['data/gone.jpg']
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(server.api.dropPending).toHaveBeenCalledWith('data/gone.jpg')
        expect(server.api.uploadPending).not.toHaveBeenCalled()
        expect(result.record.pendingAssets).toEqual([])
    })

    it('uploads the media of a page whose push went through but whose response was lost', async () => {
        // the server already has the page (with the new image); the bytes may
        // or may not have arrived: they are sent (again), and the copy is clean
        const record = recordFromRemote(album([page('p1', 'one')]))
        record.pages[0].elements.push({ id: 'img', class: 'ImageElement', image: 'data/new.jpg' })
        record.dirty.content.p1 = true
        record.pendingAssets = ['data/new.jpg']
        const remotePage = page('p1', 'one', 't1b')
        remotePage.elements.push({ id: 'img', class: 'ImageElement', image: 'data/new.jpg' })
        const server = makeServer(album([remotePage]))
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(server.api.pageOperations).not.toHaveBeenCalled()
        expect(server.api.uploadPending).toHaveBeenCalledWith('data/new.jpg')
        expect(result.record.pendingAssets).toEqual([])
        expect(hasLocalChanges(result.record)).toBe(false)
        expect(syncStatus(result.record)).toBe('synced')
    })

    it('uploads a drawing repainted in place even though its page did not change', async () => {
        const paintPage = { id: 'p1', lastEditDate: 't-p1', elements: [{ id: 'paint', class: 'PaintElement', image: 'data/paint.png', size: 500 }] }
        const remote = album([paintPage])
        const record = recordFromRemote(remote)
        // same asset, same size: the page JSON is identical, only the bytes differ
        record.dirty.content.p1 = true
        record.pendingAssets = ['data/paint.png']
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(server.api.uploadPending).toHaveBeenCalledWith('data/paint.png')
        expect(result.pushed).toBe(true)
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('rejects when a write fails, and the next run picks up where the server is', async () => {
        const remote = album([page('p1', 'one')])
        const record = recordFromRemote(remote)
        record.info.name = 'Renamed'
        record.dirty.info = true
        record.pages[0].elements[0].text = 'edited'
        record.dirty.content.p1 = true
        const server = makeServer(remote)
        const working = server.api.pageOperations.getMockImplementation()
        server.api.pageOperations.mockImplementationOnce(async () => { throw new TypeError('network') })
        await expect(reconcile(record, server.snapshot(), server.api)).rejects.toThrow('network')
        // the rename did reach the server; the caller still holds `record`
        expect(server.state.name).toBe('Renamed')
        server.api.pageOperations.mockImplementation(working)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.record.conflicts).toBeNull()
        expect(server.api.updateAlbum).toHaveBeenCalledTimes(1)
        expect(server.state.pages[0].elements[0].text).toBe('edited')
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('survives a failing cleanup', async () => {
        const remote = album([page('p1', 'one')])
        const record = recordFromRemote(remote)
        record.pages[0].elements[0].text = 'edited'
        record.dirty.content.p1 = true
        const server = makeServer(remote)
        server.api.cleanAssets.mockRejectedValue(new Error('boom'))
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(result.pushed).toBe(true)
        expect(hasLocalChanges(result.record)).toBe(false)
    })

    it('splits a very large push into batches the server accepts', async () => {
        const remotePages = []
        for (let i = 0; i < MAX_BATCH_OPERATIONS + 20; i++) {
            remotePages.push(page('p' + i, 'text ' + i))
        }
        const remote = album(remotePages)
        const record = recordFromRemote(remote)
        for (const p of record.pages) {
            p.elements[0].text += ' edited'
            record.dirty.content[p.id] = true
        }
        const server = makeServer(remote)
        const result = await reconcile(record, server.snapshot(), server.api)
        expect(server.api.pageOperations).toHaveBeenCalledTimes(2)
        expect(server.api.pageOperations.mock.calls[0][0]).toHaveLength(MAX_BATCH_OPERATIONS)
        expect(server.state.pages.every(p => p.elements[0].text.endsWith(' edited'))).toBe(true)
        expect(hasLocalChanges(result.record)).toBe(false)
        // each page got the token of its own result
        for (const p of server.state.pages) {
            expect(result.record.base.content[p.id]).toBe(p.lastEditDate)
        }
    })

    it('ends in sync: a second run finds nothing to do', async () => {
        const remote = album([page('p1', 'one'), page('p2', 'two'), page('p3', 'three')])
        const record = recordFromRemote(remote)
        record.pages = [record.pages[2], page('n1', 'new'), record.pages[0]]
        record.pages[0].elements[0].text = 'three edited'
        record.dirty.pages = true
        record.dirty.content.p3 = true
        record.info.name = 'Renamed'
        record.dirty.info = true
        const server = makeServer(remote)
        const first = await reconcile(record, server.snapshot(), server.api)
        server.api.pageOperations.mockClear()
        server.api.updateAlbum.mockClear()
        const second = await reconcile(first.record, server.snapshot(), server.api)
        expect(second.pushed).toBe(false)
        expect(second.pulled).toBe(false)
        expect(server.api.pageOperations).not.toHaveBeenCalled()
        expect(server.api.updateAlbum).not.toHaveBeenCalled()
        expect(ids(second.record.pages)).toEqual(ids(server.state.pages))
    })
})
