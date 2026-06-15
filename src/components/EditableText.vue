<template>
    <div
        ref="el"
        :contenteditable="editable"
        :spellcheck="editable"
        :class="['editable-text', { 'editable-text--editing': editable }]"
        @blur="onBlur"
        @input="onInput"
        @keydown.enter="onEnterKey"
    ></div>
</template>

<script>

/**
 * Inline-editable text primitive.
 *
 * In view mode it simply displays `value`. In edit mode it becomes a
 * contenteditable region with a clear visual affordance and emits `save` with
 * the new text on blur, but only when the text actually changed.
 *
 * The content is driven imperatively (textContent) rather than via a mustache
 * binding: that avoids Vue re-rendering the node while the user types, which
 * would reset the caret. External `value` changes are reflected only while the
 * field is not focused.
 *
 * This component is intentionally generic so it can back any future editable
 * text field (album title, etc.), not just element captions.
 */
export default {
    name: 'EditableText',
    props: {
        value: {
            type: String,
            default: '',
        },
        editable: {
            type: Boolean,
            default: false,
        },
        // When true, shrink the font so the text fits its container (used for
        // captions, whose container starts at a very large font size and is
        // auto-fitted in view mode by the page component).
        autoFit: {
            type: Boolean,
            default: false,
        },
    },
    emits: ['save'],
    watch: {
        value: function () {
            if (document.activeElement !== this.$refs.el) {
                this.render()
            }
        },
    },
    mounted: function () {
        this.render()
    },
    methods: {
        render: function () {
            if (this.$refs.el) {
                this.$refs.el.textContent = this.value ?? ''
                this.fit()
            }
        },
        fit: function () {
            if (!this.autoFit || !this.$refs.el) {
                return
            }
            const el = this.$refs.el
            // Reset to the stylesheet size so the text can grow back as well as
            // shrink, then shrink until it no longer overflows.
            el.style.fontSize = ''
            el.style.lineHeight = ''
            let guard = 0
            while (((el.scrollWidth > el.offsetWidth) || (el.scrollHeight > el.offsetHeight)) && guard < 200) {
                const newSize = (parseFloat(window.getComputedStyle(el).fontSize) * 0.95) + 'px'
                el.style.fontSize = newSize
                el.style.lineHeight = newSize
                guard++
            }
        },
        onInput: function () {
            this.fit()
        },
        onBlur: function () {
            const current = this.$refs.el ? this.$refs.el.textContent : ''
            if (current !== (this.value ?? '')) {
                this.$emit('save', current)
            } else {
                // Re-sync the DOM with the canonical value in case nothing changed.
                this.render()
            }
        },
        onEnterKey: function (e) {
            // Enter commits (blur saves); Shift+Enter inserts a line break.
            if (!e.shiftKey) {
                e.preventDefault()
                this.$refs.el.blur()
            }
        },
    },
}
</script>

<style scoped>
.editable-text--editing {
    /* Make the caption interactive (its container sets pointer-events:none). */
    pointer-events: auto;
    cursor: text;
    outline: 2px dashed var(--color-primary-element, #0082c9);
    outline-offset: 2px;
    background-color: rgba(0, 130, 201, 0.08);
    /* Guarantee a clickable area even when the caption is empty. */
    min-width: 1em;
    min-height: 1em;
}

.editable-text--editing:focus {
    outline-style: solid;
}

.editable-text {
    background-color: rgba(255, 255, 255, 0);
    border: none;
    opacity: 1;
}

/* When the album is shown fullscreen (black background) the caption text must
 * be white. This lived on .s-element-text in selement.vue, but that text is now
 * rendered by this component's root, so the rule belongs here. */
:fullscreen .editable-text {
    color: white;
}
</style>
