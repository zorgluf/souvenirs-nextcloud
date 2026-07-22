import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AudioPlayer from '../audio_player.vue'

// Track every Audio the component creates so tests can assert on play/pause
// across player generations.
const instances = []
class FakeAudio {
    constructor(url) {
        this.url = url
        this.play = vi.fn()
        this.pause = vi.fn()
        instances.push(this)
    }
}
vi.stubGlobal('Audio', FakeAudio)

async function setUrl(wrapper, url) {
    await wrapper.setProps({ audioUrl: url })
}

describe('audio_player', () => {
    beforeEach(() => {
        instances.length = 0
    })

    it('plays the track when a URL arrives', async () => {
        const wrapper = mount(AudioPlayer, { props: { audioUrl: '', stop: false } })
        await setUrl(wrapper, 'track-a')
        expect(instances).toHaveLength(1)
        expect(instances[0].url).toBe('track-a')
        expect(instances[0].play).toHaveBeenCalled()
    })

    it('keeps playing when the URL empties (background-music semantics)', async () => {
        const wrapper = mount(AudioPlayer, { props: { audioUrl: '', stop: false } })
        await setUrl(wrapper, 'track-a')
        await setUrl(wrapper, '')
        expect(instances).toHaveLength(1)
        expect(instances[0].pause).not.toHaveBeenCalled()
    })

    it('stops the previous track before starting a new one', async () => {
        const wrapper = mount(AudioPlayer, { props: { audioUrl: '', stop: false } })
        await setUrl(wrapper, 'track-a')
        await setUrl(wrapper, 'track-b')
        expect(instances[0].pause).toHaveBeenCalled()
        expect(instances[1].url).toBe('track-b')
        expect(instances[1].play).toHaveBeenCalled()
    })

    it('stops the previous player when the same page is revisited', async () => {
        const wrapper = mount(AudioPlayer, { props: { audioUrl: '', stop: false } })
        await setUrl(wrapper, 'track-a')
        await setUrl(wrapper, '') // page without audio in between
        await setUrl(wrapper, 'track-a')
        expect(instances).toHaveLength(2)
        expect(instances[0].pause).toHaveBeenCalled()
        expect(instances[1].play).toHaveBeenCalled()
    })

    it('pauses on the stop command', async () => {
        const wrapper = mount(AudioPlayer, { props: { audioUrl: '', stop: false } })
        await setUrl(wrapper, 'track-a')
        await wrapper.setProps({ stop: true })
        expect(instances[0].pause).toHaveBeenCalled()
    })
})
