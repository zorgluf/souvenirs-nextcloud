import { describe, it, expect } from 'vitest'
import { planMediaInsertion, applyPageOperationsLocally } from '../mediaInsertion.js'

const image = id => ({ id, class: 'ImageElement', image: 'data/' + id + '.jpg' })
const audio = id => ({ id, class: 'AudioElement', audio: 'data/' + id + '.mp3' })

function album() {
    return [
        { id: 'p0', elements: [] },
        { id: 'p1', elements: [image('existing')] },
        { id: 'p2', elements: [] },
    ]
}

describe('planMediaInsertion', () => {
    it('puts the first visual medium on the target page and the others on new pages after it', () => {
        const plan = planMediaInsertion(album(), 1, [image('a'), image('b'), image('c')])

        expect(plan.operations.map(o => o.op)).toEqual(['update', 'create', 'create'])
        expect(plan.operations[0].page.id).toBe('p1')
        expect(plan.operations[0].page.elements.map(e => e.id)).toEqual(['existing', 'a'])
        expect(plan.operations[1].pos).toBe(2)
        expect(plan.operations[2].pos).toBe(3)
        expect(plan.visualCount).toBe(3)
    })

    it('gives an audio medium to the page the batch is on, inside the same operation', () => {
        const plan = planMediaInsertion(album(), 1, [image('a'), image('b'), audio('m')])

        expect(plan.operations).toHaveLength(2)
        const created = plan.operations[1]
        expect(created.op).toBe('create')
        expect(created.page.elements.map(e => e.id)).toEqual(['b', 'm'])
    })

    it('reports a replaced audio track', () => {
        const pages = album()
        pages[0].elements = [audio('old')]
        const plan = planMediaInsertion(pages, 0, [audio('new')])

        expect(plan.audioReplaced).toBe(true)
        expect(plan.operations).toEqual([{ op: 'update', page: expect.objectContaining({ id: 'p0' }) }])
        expect(plan.operations[0].page.elements.map(e => e.id)).toEqual(['new'])
    })

    it('does not modify the given pages', () => {
        const pages = album()
        const snapshot = JSON.stringify(pages)
        planMediaInsertion(pages, 1, [image('a'), image('b')])
        expect(JSON.stringify(pages)).toBe(snapshot)
    })
})

describe('applyPageOperationsLocally', () => {
    it('reproduces the planned album', () => {
        const pages = album()
        const plan = planMediaInsertion(pages, 1, [image('a'), image('b'), image('c')])

        applyPageOperationsLocally(pages, plan.operations)

        expect(pages.map(p => p.id).slice(0, 2)).toEqual(['p0', 'p1'])
        expect(pages).toHaveLength(5)
        expect(pages[2].elements[0].id).toBe('b')
        expect(pages[3].elements[0].id).toBe('c')
        expect(pages[4].id).toBe('p2')
    })

    it('refuses operations it cannot reproduce locally', () => {
        expect(() => applyPageOperationsLocally(album(), [{ op: 'move', id: 'p1', pos: 3 }])).toThrow()
    })

    it('applies deletes', () => {
        const pages = album()
        applyPageOperationsLocally(pages, [{ op: 'delete', id: 'p1' }])
        expect(pages.map(p => p.id)).toEqual(['p0', 'p2'])
    })
})
