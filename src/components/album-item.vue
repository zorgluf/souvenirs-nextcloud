<template>

<div v-bind:class="[isWinPortrait ? 's-box-portrait': 's-box', { 's-box--unavailable': unavailable }]"
    v-bind:title="unavailable ? sUnavailable : null"> 
    <div class="s-spiral"></div>
    <!-- Sync status of the album's copy on this device (issue #22). -->
    <span v-if="badge != null" :class="['s-sync-badge', 's-sync-badge--' + badge.id]"
        :title="badge.label" :aria-label="badge.label" role="img">
        <component :is="badge.icon" :size="20" />
    </span>
    <router-link :to="{ path: '/show', query: { apath: encodeURIComponent(aPath) }}">
        <div v-bind:class="isWinPortrait ? 's-square-portrait': 's-square'">
            <img v-bind:class="isWinPortrait ? 's-album-image-portrait': 's-album-image'" v-bind:src='albumImageUrl'
            v-on:error="coverFailed = true" />
        </div>
        <div class="s-oneline s-title">
            {{name}}
        </div>
        <div class="s-subtitle s-oneline">
            {{dateString}}
        </div>
    </router-link>
    <div v-bind:class="[ 'right', isWinPortrait ? 's-action-menu-portrait': 's-action-menu' ]">
        <NcActions default-icon="icon-shared" :force-menu="true" :disabled="!online" v-bind:style='(isShared) ? "opacity: 1" : "opacity: 0.3"'>
            <NcActionInput type="date" :is-native-picker="true" :label="sExpiresOn" v-model="shareExpiry" v-if="!(isShared)">{{sExpiresOn}}</NcActionInput>
            <NcActionButton icon="icon-shared" @click="toggleShare" v-if="!(isShared)">Share album</NcActionButton>
            <NcActionLink icon="icon-external" v-bind:href="shareUrl" target="_blank" v-if="isShared" v-on:click="copyShareUrlToClipboard">Link to public album</NcActionLink>
            <NcActionText icon="icon-calendar-dark" v-if="isShared && shareExpiryString != ''">{{sExpiresOn}} {{shareExpiryString}}</NcActionText>
            <NcActionButton icon="icon-delete" @click="toggleShare" v-if="isShared" :close-after-click="true">Remove share</NcActionButton>
        </NcActions>
        <NcButton variant="tertiary" :aria-label="sEditAlbum" :title="sEditAlbum" v-on:click="onEditInfo">
            <template #icon>
                <Pencil :size="20" />
            </template>
        </NcButton>
        <NcButton variant="tertiary" :aria-label="sOffline" :title="sOffline" v-on:click="onOffline">
            <template #icon>
                <CloudDownload v-if="localState != null && localState.offline" :size="20" />
                <CloudDownloadOutline v-else :size="20" />
            </template>
        </NcButton>
        <NcActions default-icon="icon-delete" :force-menu="true" :disabled="!online">
            <NcActionButton icon="icon-error" @click="deleteAlbum">CONFIRM ALBUM DELETION</NcActionButton>
        </NcActions>
    </div>
    <input type="text"  style="display: none" v-bind:value="shareUrl"/>
    <textarea style="display: none; height: 0px" v-model="shareUrl" v-bind:id='"input-"+aPath'></textarea>
</div>

</template>

<script>

import { NcActionLink, NcActionButton, NcActionInput, NcActionText, NcActions, NcButton } from '@nextcloud/vue'
import { generateUrl, imagePath } from '@nextcloud/router'
import { formatLongDate } from '../utils/dateFormat.js'
import Pencil from 'vue-material-design-icons/Pencil.vue'
import CloudDownload from 'vue-material-design-icons/CloudDownload.vue'
import CloudDownloadOutline from 'vue-material-design-icons/CloudDownloadOutline.vue'
import CloudCheckOutline from 'vue-material-design-icons/CloudCheckOutline.vue'
import CloudUploadOutline from 'vue-material-design-icons/CloudUploadOutline.vue'
import AlertCircleOutline from 'vue-material-design-icons/AlertCircleOutline.vue'
import { formatBytes } from '../offline/format.js'
import { defaultExpiryDate, toApiDate } from '../utils/shareExpiry.js'

export default {
    props: {
        'shares': Array,
        'aPath': String,
        'albumImagePath': String,
        'name': String,
        'date': String,
        'albumId': String,
        'isWinPortrait': Boolean,
        // Offline support (issue #22): status of the album's copy on this
        // device ({ status, offline, offlineBytes }, absent without a copy),
        // whether the server is reachable, and whether the album cannot be
        // opened right now (offline and no copy).
        'localState': { type: Object, default: null },
        'online': { type: Boolean, default: true },
        'unavailable': { type: Boolean, default: false },
    },
    emits: ['edit-album', 'offline-album', 'refresh-albums', 'refresh-shares', 'snackbar'],
    data: function() {
        return {
            "coverFailed": false,
            "sOffline": t("souvenirs","Available offline"),
            "sUnavailable": t("souvenirs","Not available offline: open this album once while connected"),
            "sEditAlbum": t("souvenirs","Edit album"),
            "sExpiresOn": t("souvenirs","Expires on"),
            "shareExpiry": defaultExpiryDate(),
        }
    },
    components: {
        NcActions,
        NcActionButton,
        NcActionInput,
        NcActionLink,
        NcActionText,
        NcButton,
        Pencil,
        CloudDownload,
        CloudDownloadOutline,
    },
    watch: {
        "albumImageUrl": function() {
            this.coverFailed = false;
        },
        "online": function(newOnline) {
            // a cover that failed offline is tried again
            if (newOnline) {
                this.coverFailed = false;
            }
        },
    },
    computed: {
        "badge": function() {
            // Nothing without a copy on this device: the album is simply online.
            var state = this.localState;
            if (state == null || state.status === "none") {
                return null;
            }
            if (state.status === "conflict") {
                return { id: "conflict", icon: AlertCircleOutline, label: t("souvenirs","Modified both here and on the server: open the album to choose") };
            }
            if (state.status === "pending") {
                return { id: "pending", icon: CloudUploadOutline, label: t("souvenirs","Changes waiting to be synchronized") };
            }
            return {
                id: "synced",
                icon: CloudCheckOutline,
                label: state.offline
                    ? t("souvenirs","Synchronized, available offline ({size})", { size: formatBytes(state.offlineBytes) })
                    : t("souvenirs","Synchronized"),
            };
        },
        "isShared": function() {
            return (this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }) != undefined);
        },
        "dateString": function() {
            return formatLongDate(this.date);
        },
        "shareToken": function() {
            if (this.isShared) {
                return this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }).token;
            }
            return "";
        },
        "shareExpiryString": function() {
            if (this.isShared) {
                const validUntil = this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }).validUntil;
                if (validUntil) {
                    return formatLongDate(validUntil);
                }
            }
            return "";
        },
        "shareUrl": function() {
            if (this.shareToken != "") {
                return window.location.protocol + '//' + window.location.host + generateUrl('/apps/souvenirs/public/'+this.shareToken);
            }
            return "";
        },
        "albumImageUrl": function() {
            if (this.albumImagePath == "" || this.coverFailed) {
                return imagePath("souvenirs","album_image.png");
            } else {
                return "preview?apath="+encodeURIComponent(this.aPath)+"&file="+this.albumImagePath.replace(/.*\//,"")+"&width=256&height=256";
            }
        }
    },
    methods: {
        'onOffline': function() {
            // Ask the list to open the "available offline" dialog for this album.
            this.$emit("offline-album", { id: this.albumId, path: this.aPath, name: this.name });
        },
        'onEditInfo': function() {
            // Ask the list to open the album-info dialog prefilled for editing.
            this.$emit("edit-album", { albumId: this.albumId, name: this.name, date: this.date });
        },
        'deleteAlbum': function() {
            var that = this;
            fetch("apiv2/album/"+this.albumId, {
                headers: {
                    'requesttoken': OC.requestToken,
                },
                method: "DELETE",
                })
            .then(response => {
                that.$emit("snackbar","Album deleted.");
                that.$emit('refresh-albums');
            }).catch(error => {
                console.log("Error in deleting album.");
            });
            event.preventDefault();
        },
        'toggleShare': function(event) {
            if (this.isShared) {
                this.deleteShare();
            } else {
                this.createShare();
            }
            event.preventDefault();
        },
        'deleteShare': function() {
            if (this.isShared) {
                var that = this;
                var token = this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }).token;
                fetch("apiv2/share/"+token, {
                    headers: {
                        'requesttoken': OC.requestToken,
                    },
                    method: "DELETE",
                    })
                .then(response => {
                    that.$emit('refresh-shares');
                    that.$emit("snackbar","Album share removed.");
                }).catch(error => {
                    console.log("Error in deleting share.");
                });
            }
        },
        'createShare': function() {
            if (!this.isShared) {
                var that = this;
                fetch("apiv2/share", {
                    headers: {
                        'requesttoken': OC.requestToken,
                        'Content-Type': 'application/json'
                    },
                    method: "POST",
                    body: JSON.stringify({
                        'albumId': this.albumId,
                        //null lets the server apply its default expiration
                        'validUntil': this.shareExpiry ? toApiDate(this.shareExpiry) : null,
                    })
                    })
                .then(response => {
                    that.$emit('refresh-shares');
                }).catch(error => {
                    console.log("Error in creating share.");
                });
            }
        },
        'copyShareUrlToClipboard': function() {
            navigator.clipboard.writeText(this.shareUrl).then(function() {
                this.$emit("snackbar","Album shared. Public URL copied to clipboard.");
            }, function() {
                this.$emit("snackbar","Clipboard error!");
            });
        },
    },
}


</script>

<style scoped>
.s-spiral {
	background-image: url('./img/spiral.svg');
	background-repeat: repeat-y;
	background-size: 20px;
	width: 20px;
	height: 100%;
	position: absolute;
	top: 0;
	left: -10px;
}

.s-subtitle {
	font-style: italic;
	padding-left: 20px;
    z-index: 1;
    position: relative;
}

.s-oneline {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.s-title {
	font-weight: bold;
	font-size: 200%;
	line-height: 200%;
    z-index: 1;
    position: relative;
}

.s-box {
	display: inline-block;
	border-width: 2px;  
	border-color: var(--color-border);
	border-style: solid;
	width: 300px;
	margin: 20px;
	padding: 20px;
	position: relative;
}

.s-box-portrait {
	display: block;
	border-width: 2px;  
	border-color: var(--color-border);
	border-style: solid;
    margin: 5px;
    position: relative;
    margin-left: 5px;
}

.s-box-portrait:hover {
	box-shadow: 5px 5px var(--color-box-shadow);
}

.s-box:hover {
	box-shadow: 5px 5px var(--color-box-shadow);
}

.s-box--unavailable > a {
    pointer-events: none;
    opacity: 0.4;
}

.s-sync-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    display: flex;
    padding: 4px;
    border-radius: 50%;
    color: var(--color-main-text, #222);
    background-color: var(--color-main-background-translucent, rgba(255, 255, 255, 0.85));
}

.s-sync-badge--synced {
    opacity: 0.75;
}

.s-sync-badge--pending {
    color: var(--color-warning-text, #a37200);
}

.s-sync-badge--conflict {
    color: var(--color-error-text, #c00);
}

.s-square {
	padding-top: 100%;
	position: relative;
}

.s-square-portrait {
    position: absolute;
    height: 100%;
    width: 100%;
}

.s-album-image {
	object-fit: cover;
	width: 100%;
	height: 100%;
	position: absolute;
	top: 0px;
	left: 0px;
}

.s-album-image-portrait {
    object-fit: cover;
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 20%;
}

.s-action-menu {
    display: flex;
    align-items: center;
    z-index: 1;
    position: relative;
}

.s-action-menu-portrait {
    display: flex;
    align-items: center;
    z-index: 1;
    position: absolute;
    right: 0px;
    top: 50%;
    transform: translateY(-50%);
}


.right {
    float: right;
}

@media (prefers-color-scheme: dark) {
    .s-album-image-portrait {
        opacity: 80%;
    }

    .s-spiral {
        filter: invert(100%);
    }

    .s-box {
        border-color: var(--color-border-dark);
    }

    .s-box-portrait {
        border-color: var(--color-border-dark);
    }

    .s-box-portrait:hover {
        box-shadow: 5px 5px var(--color-primary-element);
    }

    .s-box:hover {
        box-shadow: 5px 5px var(--color-primary-element);
    }

}
</style>
