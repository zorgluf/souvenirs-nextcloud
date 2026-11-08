<template>
    <!-- In-app user guide (issue #47): a sectioned dialog whose content comes
         from utils/helpContent.js. The dialog adapts to the reader: the public
         (shared link) view hides everything about editing, and touch devices
         read about swipes instead of arrows. -->
    <NcDialog :name="sTitle" size="large" :navigation-classes="['help-nav']"
        :content-classes="['help-content']" :dialog-classes="['help-dialog']"
        @update:open="onUpdateOpen">
        <template #navigation>
            <nav class="help-nav__list" :aria-label="sSections">
                <button v-for="section in sections" :key="section.id" type="button"
                    :class="['help-nav__item', { 'help-nav__item--active': section.id === current }]"
                    :aria-current="section.id === current ? 'page' : null"
                    v-on:click="current = section.id">
                    <component :is="section.icon" :size="20" />
                    <span>{{ section.title }}</span>
                </button>
            </nav>
        </template>

        <section v-if="current === 'structure'" class="help-section help-section--structure">
            <h3>{{ sStructureTitle }}</h3>
            <p>{{ sStructureIntro }}</p>
            <!-- A book seen from above: the open page shows how tiles share it,
                 with the soundtrack badge and the drawing on top. Decorative,
                 the legend below carries the meaning. -->
            <div class="help-diagram" aria-hidden="true">
                <div class="help-diagram__page help-diagram__page--side"></div>
                <div class="help-diagram__page help-diagram__page--open">
                    <div class="help-diagram__tile help-diagram__tile--photo">
                        <ImageOutline :size="28" />
                    </div>
                    <div class="help-diagram__tile help-diagram__tile--photo">
                        <MovieOpenOutline :size="28" />
                    </div>
                    <div class="help-diagram__tile help-diagram__tile--text">
                        <FormatText :size="20" />
                        <span class="help-diagram__line"></span>
                    </div>
                    <svg class="help-diagram__paint" viewBox="0 0 100 60" preserveAspectRatio="none">
                        <path d="M6 48 C 25 10, 45 60, 62 30 S 88 20, 95 44" fill="none" stroke-width="2.5" stroke-linecap="round" />
                    </svg>
                    <span class="help-diagram__badge">
                        <MusicNoteOutline :size="14" />
                    </span>
                </div>
                <div class="help-diagram__page help-diagram__page--side"></div>
            </div>
            <dl class="help-terms">
                <div v-for="term in terms" :key="term.id" class="help-term">
                    <dt>
                        <component :is="term.icon" :size="20" />
                        <span>{{ term.title }}</span>
                    </dt>
                    <dd>{{ term.text }}</dd>
                </div>
            </dl>
        </section>

        <section v-else-if="current === 'modes'" class="help-section help-section--modes">
            <h3>{{ sModesTitle }}</h3>
            <div class="help-cards">
                <article v-for="mode in modes" :key="mode.id" :class="['help-card', 'help-mode--' + mode.id]">
                    <h4>
                        <component :is="mode.icon" :size="20" />
                        <span>{{ mode.title }}</span>
                    </h4>
                    <p class="help-card__how">{{ mode.how }}</p>
                    <p>{{ mode.text }}</p>
                </article>
            </div>
            <p v-if="!canEdit" class="help-note">{{ sOwnerOnly }}</p>
        </section>

        <section v-else-if="current === 'media'" class="help-section help-section--media">
            <h3>{{ sMediaTitle }}</h3>
            <p v-if="canEdit">{{ sMediaIntro }}</p>
            <ul class="help-media">
                <li v-for="kind in mediaKinds" :key="kind.id" :class="['help-media__item', 'help-media--' + kind.id]">
                    <component :is="mediaIcons[kind.id]" :size="28" class="help-media__icon" />
                    <div class="help-media__body">
                        <h4>{{ kind.title }}</h4>
                        <p>{{ kind.text }}</p>
                        <p v-if="kind.formats.length > 0" class="help-formats">
                            <span v-for="format in kind.formats" :key="format" class="help-format">{{ format }}</span>
                        </p>
                    </div>
                </li>
            </ul>
        </section>

        <section v-else-if="current === 'shortcuts'" class="help-section help-section--shortcuts">
            <h3>{{ sShortcutsTitle }}</h3>
            <p>{{ sShortcutsIntro }}</p>
            <div class="help-shortcut-groups">
                <div v-for="group in shortcutGroups" :key="group.id" :class="['help-shortcut-group', 'help-group--' + group.id]">
                    <h4>{{ group.title }}</h4>
                    <table class="help-shortcuts">
                        <tbody>
                            <tr v-for="item in group.items" :key="item.id" :class="'help-shortcut--' + item.id">
                                <td class="help-shortcuts__keys">
                                    <template v-for="(combo, ci) in (item.keys || [])" :key="'combo-' + ci">
                                        <span v-if="ci > 0" class="help-or">{{ sOr }}</span>
                                        <span class="help-combo">
                                            <template v-for="(key, ki) in combo" :key="'key-' + ki">
                                                <span v-if="ki > 0" class="help-plus">+</span>
                                                <kbd>{{ key }}</kbd>
                                            </template>
                                        </span>
                                    </template>
                                    <template v-if="item.gesture">
                                        <span v-if="item.keys" class="help-or">{{ sOr }}</span>
                                        <span class="help-gesture">{{ item.gesture }}</span>
                                    </template>
                                </td>
                                <td class="help-shortcuts__label">{{ item.label }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <footer class="help-footer">
            <a href="https://github.com/zorgluf/souvenirs-nextcloud" target="_blank" rel="noopener noreferrer">{{ sProject }}</a>
            <span class="help-footer__sep">·</span>
            <a href="https://github.com/zorgluf/souvenirs-android" target="_blank" rel="noopener noreferrer">{{ sAndroid }}</a>
        </footer>
    </NcDialog>
</template>

<script>

import { NcDialog } from '@nextcloud/vue'
import BookOpenPageVariantOutline from 'vue-material-design-icons/BookOpenPageVariantOutline.vue'
import EyeOutline from 'vue-material-design-icons/EyeOutline.vue'
import ImageMultipleOutline from 'vue-material-design-icons/ImageMultipleOutline.vue'
import KeyboardOutline from 'vue-material-design-icons/KeyboardOutline.vue'
import PencilOutline from 'vue-material-design-icons/PencilOutline.vue'
import PlayOutline from 'vue-material-design-icons/PlayOutline.vue'
import Fullscreen from 'vue-material-design-icons/Fullscreen.vue'
import ImageOutline from 'vue-material-design-icons/ImageOutline.vue'
import PanoramaSphereOutline from 'vue-material-design-icons/PanoramaSphereOutline.vue'
import MovieOpenOutline from 'vue-material-design-icons/MovieOpenOutline.vue'
import MusicNoteOutline from 'vue-material-design-icons/MusicNoteOutline.vue'
import FormatText from 'vue-material-design-icons/FormatText.vue'
import Brush from 'vue-material-design-icons/Brush.vue'
import ViewDashboardVariantOutline from 'vue-material-design-icons/ViewDashboardVariantOutline.vue'
import { SECTION_IDS, getMediaKinds, getShortcutGroups } from '../utils/helpContent.js'

// Icon of each media kind of helpContent.getMediaKinds. A module constant,
// not component state: components must not be made reactive.
const MEDIA_ICONS = {
    photo: ImageOutline,
    panorama: PanoramaSphereOutline,
    video: MovieOpenOutline,
    audio: MusicNoteOutline,
    text: FormatText,
    paint: Brush,
}

export default {
    name: 'HelpDialog',
    props: {
        // Whether the reader can edit this album (false in the public view):
        // everything about editing is left out otherwise.
        canEdit: {
            type: Boolean,
            default: false,
        },
        // Touch readers turn pages with swipes, not arrows.
        isTouchDevice: {
            type: Boolean,
            default: false,
        },
        // Section opened first: the "?" key lands on the shortcuts.
        initialSection: {
            type: String,
            default: 'structure',
        },
    },
    emits: ['close'],
    components: {
        NcDialog,
        BookOpenPageVariantOutline,
        EyeOutline,
        ImageMultipleOutline,
        KeyboardOutline,
        PencilOutline,
        PlayOutline,
        Fullscreen,
        ImageOutline,
        PanoramaSphereOutline,
        MovieOpenOutline,
        MusicNoteOutline,
        FormatText,
        Brush,
        ViewDashboardVariantOutline,
    },
    data: function() {
        return {
            current: SECTION_IDS.includes(this.initialSection) ? this.initialSection : SECTION_IDS[0],
            sTitle: t('souvenirs', 'Souvenirs guide'),
            sSections: t('souvenirs', 'Guide sections'),
            sOr: t('souvenirs', 'or'),
            sStructureTitle: t('souvenirs', 'How an album is built'),
            sStructureIntro: t('souvenirs', 'A Souvenirs album is a book: a series of pages, each one a composition of tiles.'),
            sModesTitle: t('souvenirs', 'Ways to use an album'),
            sOwnerOnly: t('souvenirs', 'Editing is reserved to the owner of the album, from their own Nextcloud.'),
            sMediaTitle: t('souvenirs', 'What a page can hold'),
            sMediaIntro: t('souvenirs', 'In edit mode, the + button of a page adds media picked from your Nextcloud files or uploaded from this device. Several files at once each get their own page.'),
            sShortcutsTitle: t('souvenirs', 'Keyboard and gestures'),
            sShortcutsIntro: t('souvenirs', 'Shortcuts are ignored while you type in a text or a form field.'),
            sProject: t('souvenirs', 'Project page'),
            sAndroid: t('souvenirs', 'Android app'),
        }
    },
    computed: {
        mediaIcons: function() {
            return MEDIA_ICONS
        },
        sections: function() {
            const titles = {
                structure: { title: t('souvenirs', 'Structure'), icon: BookOpenPageVariantOutline },
                modes: { title: t('souvenirs', 'Modes'), icon: EyeOutline },
                media: { title: t('souvenirs', 'Media'), icon: ImageMultipleOutline },
                shortcuts: { title: t('souvenirs', 'Shortcuts'), icon: KeyboardOutline },
            }
            return SECTION_IDS.map(id => ({ id, ...titles[id] }))
        },
        terms: function() {
            return [
                {
                    id: 'album',
                    icon: BookOpenPageVariantOutline,
                    title: t('souvenirs', 'Album'),
                    text: this.canEdit
                        ? t('souvenirs', 'A book of pages. On your Nextcloud it is a plain folder (under Souvenirs by default, changeable in your personal settings) holding album.json, the description of the pages, and a data folder with the media. The Souvenirs Android app reads and writes the same folder.')
                        : t('souvenirs', 'A book of pages, shared with you by its owner through a link: no account needed.'),
                },
                {
                    id: 'page',
                    icon: ViewDashboardVariantOutline,
                    title: t('souvenirs', 'Page'),
                    text: t('souvenirs', 'One screen of the book, turned like a paper page. A page may also carry a soundtrack and a drawing on top of its tiles.'),
                },
                {
                    id: 'element',
                    icon: ImageOutline,
                    title: t('souvenirs', 'Tile'),
                    text: t('souvenirs', 'A photo, a 360° panorama, a video or a text placed on a page, each with its own position and size, and for photos its own framing inside the tile.'),
                },
            ]
        },
        modes: function() {
            const modes = [
                {
                    id: 'view',
                    icon: EyeOutline,
                    title: t('souvenirs', 'Viewing'),
                    how: t('souvenirs', 'The mode an album opens in.'),
                    text: this.isTouchDevice
                        ? t('souvenirs', 'Swipe to turn the pages. Tap a photo to see it full size, tap a video to play it large, and drag inside a 360° panorama to look around.')
                        : t('souvenirs', 'Turn the pages with the side arrows, the dots at the bottom or the keyboard arrows. Click a photo to see it full size, click a video to play it large, and drag inside a 360° panorama to look around.'),
                },
            ]
            if (this.canEdit) {
                modes.push({
                    id: 'edit',
                    icon: PencilOutline,
                    title: t('souvenirs', 'Editing'),
                    how: t('souvenirs', 'Menu › Edit, or press E. Press E again or use the menu to finish.'),
                    text: t('souvenirs', 'Every page gets a toolbar to add media, add text, paint over the page and switch between layouts. Click a tile to select it, then move it with its handle, resize it from its corners and reframe the photo inside. The + between pages inserts a page, the chevrons move it. Changes are saved as you go.'),
                })
            }
            modes.push({
                id: 'slideshow',
                icon: PlayOutline,
                title: t('souvenirs', 'Slideshow'),
                how: t('souvenirs', 'Menu › Start slideshow, or press Space.'),
                text: t('souvenirs', 'Pages turn by themselves at the pace set in the menu (in seconds). The slideshow stops on the last page, from the menu or with Space.'),
            })
            modes.push({
                id: 'fullscreen',
                icon: Fullscreen,
                title: t('souvenirs', 'Fullscreen'),
                how: t('souvenirs', 'Menu › Fullscreen.'),
                text: t('souvenirs', 'The album fills the screen on a black background and the menu steps aside. Press Esc to come back.'),
            })
            return modes
        },
        mediaKinds: function() {
            return getMediaKinds({ canEdit: this.canEdit })
        },
        shortcutGroups: function() {
            return getShortcutGroups({ canEdit: this.canEdit, isTouchDevice: this.isTouchDevice })
        },
    },
    methods: {
        onUpdateOpen: function(open) {
            if (!open) {
                this.$emit('close')
            }
        },
    },
}
</script>

<style scoped>
/* Navigation ----------------------------------------------------------- */

.help-nav__list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
}

.help-nav__item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 6px 12px;
    margin: 0;
    border: none;
    border-radius: var(--border-radius-element, 8px);
    background: transparent;
    color: var(--color-main-text);
    font-size: inherit;
    text-align: start;
    cursor: pointer;
}

.help-nav__item:hover,
.help-nav__item:focus-visible {
    background-color: var(--color-background-hover);
}

.help-nav__item--active,
.help-nav__item--active:hover {
    background-color: var(--color-primary-element-light);
    color: var(--color-primary-element-light-text);
    font-weight: bold;
}

@media only screen and (max-width: 512px) {
    .help-nav__list {
        flex-direction: row;
        flex-wrap: wrap;
    }

    .help-nav__item {
        width: auto;
        flex: 1 1 auto;
        justify-content: center;
    }
}

/* Content -------------------------------------------------------------- */

.help-section {
    padding: 0 12px 12px;
    line-height: 1.5;
    /* Modal content is normally scrolled by NcDialog; nothing here is wider
       than the dialog, but a long format list may wrap. */
    overflow-wrap: anywhere;
}

.help-section h3 {
    font-size: 1.3em;
    font-weight: bold;
    margin: 8px 0 12px;
}

.help-section h4 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.05em;
    font-weight: bold;
    margin: 0 0 4px;
}

.help-section p {
    margin: 0 0 8px;
}

.help-note {
    color: var(--color-text-maxcontrast);
    font-style: italic;
}

/* Structure: diagram and glossary */

.help-diagram {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 16px auto 20px;
    max-width: 420px;
}

.help-diagram__page {
    border: 2px solid var(--color-border-dark);
    border-radius: 6px;
    background: var(--color-main-background);
}

.help-diagram__page--side {
    width: 14%;
    height: 90px;
    opacity: 0.5;
    border-style: dashed;
}

.help-diagram__page--open {
    position: relative;
    width: 60%;
    aspect-ratio: 16 / 10;
    padding: 6px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 2fr 1fr;
    gap: 6px;
    border-color: var(--color-primary-element);
    box-shadow: 0 2px 8px var(--color-box-shadow);
}

.help-diagram__tile {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 4px;
    background: var(--color-background-dark);
    color: var(--color-text-maxcontrast);
}

.help-diagram__tile--text {
    grid-column: 1 / -1;
}

.help-diagram__line {
    display: inline-block;
    width: 45%;
    height: 4px;
    border-radius: 2px;
    background: var(--color-text-maxcontrast);
    opacity: 0.6;
}

.help-diagram__paint {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.help-diagram__paint path {
    stroke: var(--color-error);
}

.help-diagram__badge {
    position: absolute;
    top: -10px;
    right: -10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-primary-element);
    color: var(--color-primary-element-text);
}

.help-terms {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
}

.help-term dt {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
}

.help-term dd {
    margin: 2px 0 0 28px;
}

/* Modes: cards */

.help-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
}

.help-card {
    padding: 12px;
    border-radius: var(--border-radius-large, 12px);
    background: var(--color-background-hover);
}

.help-card__how {
    color: var(--color-text-maxcontrast);
    font-size: 0.95em;
}

/* Media: list */

.help-media {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.help-media__item {
    display: flex;
    gap: 12px;
}

.help-media__icon {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--color-primary-element);
}

.help-media__body {
    min-width: 0;
}

.help-formats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.help-format {
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--color-primary-element-light);
    color: var(--color-primary-element-light-text);
    font-size: 0.85em;
    white-space: nowrap;
}

/* Shortcuts: tables */

.help-shortcut-groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 8px 24px;
}

.help-shortcut-group {
    margin-bottom: 12px;
}

.help-shortcuts {
    width: 100%;
    border-collapse: collapse;
}

.help-shortcuts td {
    padding: 4px 8px 4px 0;
    vertical-align: top;
    border-bottom: 1px solid var(--color-border);
}

.help-shortcuts tr:last-child td {
    border-bottom: none;
}

.help-shortcuts__keys {
    width: 45%;
    white-space: normal;
}

.help-combo {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 1px 6px;
    border: 1px solid var(--color-border-dark);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--color-background-dark);
    color: var(--color-main-text);
    font-family: inherit;
    font-size: 0.9em;
    line-height: 1.4;
    text-align: center;
}

.help-or,
.help-plus {
    margin: 0 4px;
    color: var(--color-text-maxcontrast);
    font-size: 0.9em;
}

.help-gesture {
    font-style: italic;
}

/* Footer */

.help-footer {
    padding: 8px 12px 0;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-maxcontrast);
    font-size: 0.9em;
}

.help-footer a {
    text-decoration: underline;
}

.help-footer__sep {
    margin: 0 6px;
}
</style>
