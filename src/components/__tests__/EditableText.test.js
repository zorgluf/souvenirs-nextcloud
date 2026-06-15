import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditableText from '../EditableText.vue'

describe('EditableText', () => {
    it('renders the value', () => {
        const wrapper = mount(EditableText, { props: { value: 'hello' } })
        expect(wrapper.element.textContent).toBe('hello')
    })

    it('is not contenteditable in view mode', () => {
        const wrapper = mount(EditableText, { props: { value: 'hello', editable: false } })
        expect(wrapper.attributes('contenteditable')).toBe('false')
    })

    it('is contenteditable in edit mode', () => {
        const wrapper = mount(EditableText, { props: { value: 'hello', editable: true } })
        expect(wrapper.attributes('contenteditable')).toBe('true')
    })

    it('emits save with the new text on blur when changed', async () => {
        const wrapper = mount(EditableText, { props: { value: 'hello', editable: true } })
        wrapper.element.textContent = 'changed'
        await wrapper.trigger('blur')
        expect(wrapper.emitted('save')).toBeTruthy()
        expect(wrapper.emitted('save')[0]).toEqual(['changed'])
    })

    it('does not emit save on blur when unchanged', async () => {
        const wrapper = mount(EditableText, { props: { value: 'hello', editable: true } })
        await wrapper.trigger('blur')
        expect(wrapper.emitted('save')).toBeFalsy()
    })

    it('reflects external value changes while not focused', async () => {
        const wrapper = mount(EditableText, { props: { value: 'hello', editable: true } })
        await wrapper.setProps({ value: 'updated' })
        expect(wrapper.element.textContent).toBe('updated')
    })
})
