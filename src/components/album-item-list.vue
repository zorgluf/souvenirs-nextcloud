<template>
    <div v-bind:class="isWinPortrait ? 'albumlist-portrait': ''">
        <!-- Shown from this device while the server cannot be reached (issue #22). -->
        <div v-if="!online" class="offline-banner" role="status">
            <CloudOffOutline :size="20" />
            <span>{{ sOfflineBanner }}</span>
        </div>
        <album-item v-for='(album, index) in albumList' v-bind:key='index' v-bind:a-path='album["path"]'
        v-bind:album-image-path='("albumImage" in album) ? album["albumImage"] : ""'
        v-bind:name='album["name"]' v-bind:album-id='album["id"]' v-bind:date='album["date"]' v-bind:shares='shares'
        v-bind:is-win-portrait="isWinPortrait"
        v-bind:local-state="localStates[album['id']] || null" v-bind:online="online"
        v-bind:unavailable="!online && !hasLocalCopy(album['id'])"
        v-on:refresh-shares="refreshShares" v-on:snackbar="activateSnackbar" v-on:refresh-albums="refreshAlbums"
        v-on:edit-album="openEdit" v-on:offline-album="openOffline">
        </album-item>
        <div v-if="(loading <= 0) && (unsortedAlbumList.length == 0) && online" class="center">
            <div class="icon-folder"></div>
            <h2>{{ sNoAblum }}</h2>
        </div>
        <!-- First start without the server: nothing was ever kept here. -->
        <div v-if="(loading <= 0) && (unsortedAlbumList.length == 0) && !online" class="offline-empty">
            <CloudOffOutline :size="64" />
            <h2>{{ sOfflineEmptyTitle }}</h2>
            <p>{{ sOfflineEmptyText }}</p>
        </div>
        <div v-if="loading > 0" class="center">
            <NcLoadingIcon v-bind:title="sLoading" :size="64">
            </NcLoadingIcon>
        </div>
        <div id="snackbar">{{snackbarText}}
        </div>
        <NcButton variant="secondary" class="storage-fab" :aria-label="sStorage" :title="sStorage" v-on:click="showStorage = true">
            <template #icon>
                <Harddisk :size="24" />
            </template>
        </NcButton>
        <offline-dialog v-if="offlineAlbum != null" :album="offlineAlbum" :online="online"
            v-on:close="offlineAlbum = null" v-on:changed="refreshLocalStates" v-on:open-storage="openStorageFromOffline">
        </offline-dialog>
        <storage-dialog v-if="showStorage" v-on:close="showStorage = false" v-on:changed="refreshLocalStates">
        </storage-dialog>
        <NcButton variant="primary" class="create-album-fab" :aria-label="sNewAlbum" :disabled="!online"
            :title="online ? sNewAlbum : sCreateNeedsServer" v-on:click="openCreate">
            <template #icon>
                <Plus :size="24" />
            </template>
        </NcButton>
        <NcModal v-if="showCreate" size="small" v-on:close="closeCreate">
            <div class="create-album-dialog">
                <h2>{{ editingAlbumId ? sEditAlbum : sNewAlbum }}</h2>
                <NcTextField :label="sAlbumName" v-model="newAlbumName" v-on:keydown.enter="doSaveAlbum" />
                <NcDateTimePickerNative type="date" :label="sAlbumDate" v-model="newAlbumDate" />
                <NcButton variant="primary" :disabled="creating || newAlbumName.trim() === ''" v-on:click="doSaveAlbum">
                    {{ editingAlbumId ? sSave : sCreate }}
                </NcButton>
            </div>
        </NcModal>
    </div>
</template>

<script>

import AlbumItem from './album-item.vue'
import { NcLoadingIcon, NcModal, NcButton, NcTextField, NcDateTimePickerNative } from '@nextcloud/vue'
import { showError } from '@nextcloud/dialogs'
import Plus from 'vue-material-design-icons/Plus.vue'
import CloudOffOutline from 'vue-material-design-icons/CloudOffOutline.vue'
import Harddisk from 'vue-material-design-icons/Harddisk.vue'
import { v4 as uuidv4 } from 'uuid'
import { createAlbum, updateAlbum } from '../api/albumApi.js'
import OfflineDialog from './OfflineDialog.vue'
import StorageDialog from './StorageDialog.vue'
import { connectivity, onReconnect, reportOffline, reportOnline } from '../offline/connectivity.js'
import { rememberAlbumList, knownAlbumList, localStates, syncAll, saveAlbumInfo, forgetMissingAlbums, orphanAlbums } from '../offline/offlineManager.js'
import { notifySynced, notifyConflict } from '../offline/notify.js'

export default {
    props: {
    },
    data: function() {
        return {
            shares: [],
            snackbarText: "",
            unsortedAlbumList: [],
            loading: 0,
            lastPage: 0,
            "isWinPortrait": false,
            "sLoading": t("souvenirs","Loading album list…"),
            "sNoAblum": t("souvenirs","No album available. You will need to upload them from the Android app Souvenirs (https://github.com/zorgluf/souvenirs-android)."),
            "showCreate": false,
            "editingAlbumId": null,
            "newAlbumName": "",
            "newAlbumDate": new Date(),
            "creating": false,
            "sNewAlbum": t("souvenirs","New album"),
            "sEditAlbum": t("souvenirs","Edit album"),
            "sAlbumName": t("souvenirs","Album name"),
            "sAlbumDate": t("souvenirs","Date"),
            "sCreate": t("souvenirs","Create"),
            "sSave": t("souvenirs","Save"),
            // Offline support (issue #22): status of the local copies by
            // album id, the album whose offline dialog is open, the storage
            // screen, and whether the whole server list was loaded.
            "localStates": {},
            "offlineAlbum": null,
            "showStorage": false,
            "listComplete": false,
            "backgroundSynced": false,
            "listGeneration": 0,
            "pageRequestInFlight": false,
            "connectivity": connectivity,
            "sStorage": t("souvenirs","Offline storage"),
            "sCreateNeedsServer": t("souvenirs","Creating an album needs a connection"),
            "sOfflineBanner": t("souvenirs","Offline: albums kept on this device can be viewed and edited. Changes are sent when the connection is back."),
            "sOfflineEmptyTitle": t("souvenirs","Nothing is available offline yet"),
            "sOfflineEmptyText": t("souvenirs","Souvenirs needs a first synchronization: connect, open the albums you want to work on (or make them available offline), and they will then be usable without a connection."),
        }
    },
    components: {
        'album-item': AlbumItem,
        NcLoadingIcon,
        NcModal,
        NcButton,
        NcTextField,
        NcDateTimePickerNative,
        Plus,
        CloudOffOutline,
        Harddisk,
        'offline-dialog': OfflineDialog,
        'storage-dialog': StorageDialog,
    },
    created: function() {
        this.refreshAlbums();
        this.refreshShares();
        this.refreshLocalStates();
        window.addEventListener("resize", this.resizeEventHandler);
        // Back online (issue #22): the real list, and the changes made offline.
        var that = this;
        this.stopReconnectWatch = onReconnect(function() {
            that.refreshAlbums();
            that.refreshShares();
        });
    },
    beforeUnmount: function() {
        if (this.stopReconnectWatch) {
            this.stopReconnectWatch();
        }
    },
    mounted: function() {
        this.resizeEventHandler(null);
        document.getElementById("souvenirs-main").onscroll = (event) => this.loadAlbumPageIfNeeded();
    },
    destroyed: function() {
        window.removeEventListener("resize", this.resizeEventHandler);
    },
    watch: {
        loading(newLoading, oldLoading) {
            //console.log("old : "+oldLoading+" new: "+newLoading);
            if ((newLoading == 0) && (oldLoading != 0)) {
                this.loadAlbumPageIfNeeded();
                this.afterListLoaded();
            }
        }
    },
    computed: {
        "albumList": function() {
            return this.unsortedAlbumList.sort(function(a,b) {
                return String(b["date"] || "").localeCompare(String(a["date"] || ""));
            });
        },
        "online": function() {
            return this.connectivity.online;
        },
    },
    methods: {
        refreshShares: function() {
            fetch("apiv2/share", {
                headers: {
                    'requesttoken': OC.requestToken,
                }
                })
            .then(response => {
                response.json().then(data => {
                    this.shares.splice(0);
                    for (var d in data) {
                        this.shares.push(data[d]);
                    }
                })
            }).catch(error => {
                console.log("Error in fetching share status.");
            });
        },
        refreshAlbums: function() {
            this.unsortedAlbumList.splice(0);
            this.lastPage = 0;
            // A new load: answers of the previous one are ignored, and the
            // counter starts over - it ends below zero after a complete
            // list, and going through zero again would make the watcher
            // fetch the first page a second time, then skip the next one.
            this.listGeneration += 1;
            this.pageRequestInFlight = false;
            this.loading = 0;
            this.listComplete = false;
            this.backgroundSynced = false;
            // ids the server listed, whether or not their details loaded
            this.serverAlbumIds = [];
            if (!this.online) {
                this.showLocalList();
                return;
            }
            this.loadOneAlbumsPage();
        },
        showLocalList: function() {
            // The server cannot be reached (issue #22): the list as last
            // seen, kept on this device.
            var that = this;
            this.loading += 1;
            knownAlbumList().then(albums => {
                that.unsortedAlbumList.splice(0);
                albums.forEach(album => that.unsortedAlbumList.push(album));
            }).catch(() => {}).finally(() => {
                that.loading -= 1;
            });
            this.refreshLocalStates();
        },
        refreshLocalStates: function() {
            var that = this;
            return localStates().then(states => {
                that.localStates = states;
            }).catch(() => {});
        },
        hasLocalCopy: function(albumId) {
            var state = this.localStates[albumId];
            return state != null && state.status !== "none";
        },
        afterListLoaded: function() {
            // Keep what was loaded for the next start without the server,
            // then send the changes made offline and refresh the albums
            // kept offline, in the background (issue #22).
            if (!this.online || (this.unsortedAlbumList.length === 0 && !this.listComplete)) {
                return;
            }
            var that = this;
            var loaded = this.unsortedAlbumList.slice();
            var complete = this.listComplete;
            var serverIds = (this.serverAlbumIds || []).slice();
            (complete ? Promise.resolve([]) : knownAlbumList())
                .then(known => {
                    // a partial list (more pages to scroll to) must not make
                    // the albums of the other pages disappear offline
                    var ids = new Set(loaded.map(album => album.id));
                    return rememberAlbumList(loaded.concat(known.filter(album => !ids.has(album.id))));
                })
                .then(() => {
                    // albums deleted elsewhere leave nothing behind here -
                    // judged on the ids the server listed, not on the
                    // details that happened to load
                    return complete ? forgetMissingAlbums(serverIds) : null;
                })
                .then(() => (complete ? orphanAlbums(serverIds) : []))
                .then(orphans => {
                    // gone from the server but with changes never sent: still
                    // listed, so they can be opened and dealt with
                    orphans.forEach(album => {
                        if (!that.unsortedAlbumList.some(listed => listed.id === album.id)) {
                            that.unsortedAlbumList.push(album);
                        }
                    });
                })
                .then(() => that.refreshLocalStates())
                .catch(() => {});
            if (this.backgroundSynced) {
                // once per list load, not for each page scrolled to
                return;
            }
            this.backgroundSynced = true;
            syncAll(function(result) {
                if (result.conflict) {
                    notifyConflict(result.record.info.name);
                } else if (result.pushed) {
                    notifySynced(result.record.info.name);
                }
                // a name or date edited offline just reached the server (or
                // came from it): the list entry follows
                var entry = that.unsortedAlbumList.find(album => album.id === result.record.id);
                if (entry != null) {
                    entry.name = result.record.info.name;
                    entry.date = result.record.info.date;
                }
                that.refreshLocalStates();
            }).then(() => that.refreshLocalStates());
        },
        openOffline: function(album) {
            this.offlineAlbum = album;
        },
        openStorageFromOffline: function() {
            this.offlineAlbum = null;
            this.showStorage = true;
        },
        loadAlbumPageIfNeeded: function() {
            if (!this.online) {
                // the list comes from this device: nothing more to load
                return;
            }
            let bottomOfWindow = Math.abs(document.getElementById("souvenirs-main").scrollHeight - document.getElementById("souvenirs-main").clientHeight - document.getElementById("souvenirs-main").scrollTop) <= 1;
            //console.log("bottomOfWindow:"+bottomOfWindow);
            if (bottomOfWindow & (this.loading == 0)) {
                this.loadOneAlbumsPage();
            }
        },
        loadOneAlbumsPage: function() {
            // One page request at a time, each asked exactly once: the ids
            // gathered here decide which local copies are of albums that no
            // longer exist (issue #22), so no page may be skipped.
            if (this.pageRequestInFlight) {
                return;
            }
            this.pageRequestInFlight = true;
            this.loading += 1;
            var that = this;
            var generation = this.listGeneration;
            var current = function() { return generation === that.listGeneration; };
            var unreachable = function() {
                if (!current()) {
                    return;
                }
                that.pageRequestInFlight = false;
                that.loading -= 1;
                // the server did not answer (issue #22): show what this
                // device knows; the reconnection reloads the real list
                reportOffline();
                that.showLocalList();
            };
            var unreadable = function() {
                // it answered, with something that is not a list (an error
                // page): nothing more to load, but this is not "offline"
                if (current()) {
                    that.pageRequestInFlight = false;
                    // ends below zero, like after the last page: back at
                    // zero, the watcher would ask for the page again, forever
                    that.loading -= 2;
                }
            };
            fetch("apiv2/album?page="+(that.lastPage+1), {
                headers: { 'requesttoken': OC.requestToken, }
                })
            .then(response => {
                return response.json().then(data => {
                    if (!current()) {
                        return;
                    }
                    reportOnline();
                    if (data == null) {
                        throw new Error("no list");
                    }
                    that.pageRequestInFlight = false;
                    if (Array.isArray(data) && data.length === 0) {
                        // no more pages: the whole list is on screen
                        that.listComplete = true;
                    }
                    if (data.length > 0) {
                        that.lastPage += 1;
                        data.forEach(albumId => {
                            that.serverAlbumIds.push(albumId);
                            that.loading += 1;
                            fetch("apiv2/album/"+albumId, {
                                headers: { 'requesttoken': OC.requestToken, }
                                })
                            .then(response => {
                                return response.json().then(data => {
                                    if (!current()) {
                                        return;
                                    }
                                    that.unsortedAlbumList.push(data);
                                    that.loading -= 1;
                                })
                            }).catch(error => {
                                if (current()) {
                                    that.loading -= 1;
                                }
                            });
                        });
                    } else {
                        that.loading -= 1;
                    }
                    that.loading -= 1;
                    if (that.listComplete) {
                        // the counter ends below zero after the last (empty)
                        // page, which the watcher does not see as "loaded"
                        that.afterListLoaded();
                    }
                }).catch(unreadable);
            }, unreachable);
        },
        activateSnackbar: function(texte) {
            var x = document.getElementById("snackbar");
            this.snackbarText = texte;
            x.className = "show";
            setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
        },
        resizeEventHandler: function(e) {
            if (window.innerHeight > window.innerWidth) {
                if (!this.isWinPortrait) {
                    this.isWinPortrait = true;
                }
            } else {
                if (this.isWinPortrait) {
                    this.isWinPortrait = false;
                }
            }
        },
        openCreate: function() {
            this.editingAlbumId = null;
            this.newAlbumName = "";
            this.newAlbumDate = new Date();
            this.showCreate = true;
        },
        openEdit: function(album) {
            // Reuse the create dialog, prefilled, to edit an album's name and date.
            this.editingAlbumId = album.albumId;
            this.newAlbumName = album.name || "";
            this.newAlbumDate = parseAlbumDate(album.date);
            this.showCreate = true;
        },
        closeCreate: function() {
            this.showCreate = false;
        },
        doSaveAlbum: function() {
            var name = this.newAlbumName.trim();
            if (this.creating || name === "") {
                return;
            }
            this.creating = true;
            var that = this;
            var fields = { name: name, date: formatAlbumDate(this.newAlbumDate) };
            var saved;
            if (this.editingAlbumId) {
                // Edit existing album metadata: on the server, or in the
                // album's local copy while offline (issue #22).
                saved = saveAlbumInfo(this.editingAlbumId, fields);
            } else {
                // Blank album with a generated id, then set its name and date.
                var id = uuidv4();
                saved = createAlbum(id).then(() => updateAlbum(id, fields));
            }
            saved
                .then(() => {
                    that.creating = false;
                    that.showCreate = false;
                    that.refreshAlbums();
                    that.refreshLocalStates();
                })
                .catch(error => {
                    that.creating = false;
                    showError(that.editingAlbumId
                        ? t("souvenirs","Could not save the album.")
                        : t("souvenirs","Could not create the album."));
                });
        },
    }
}

function formatAlbumDate(d) {
    // album.json stores the date as a YYYYMMDDHHMMSS string.
    var date = (d instanceof Date && !isNaN(d)) ? d : new Date();
    var pad = function(n) { return String(n).padStart(2, "0"); };
    return "" + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate())
        + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
}

function parseAlbumDate(s) {
    // Inverse of formatAlbumDate: YYYYMMDDHHMMSS string -> Date (fallback today).
    if (typeof s !== "string" || s.length < 8) {
        return new Date();
    }
    var date = new Date(+s.slice(0, 4), (+s.slice(4, 6)) - 1, +s.slice(6, 8),
        +s.slice(8, 10) || 0, +s.slice(10, 12) || 0, +s.slice(12, 14) || 0);
    return isNaN(date) ? new Date() : date;
}
</script>

<style scoped>

.albumlist-portrait {
    width: 100vw;
}

.create-album-fab {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 100;
    /* Round "+" button, like the album options menu button. */
    border-radius: 50% !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.storage-fab {
    position: fixed;
    right: 24px;
    bottom: 84px;
    z-index: 100;
    border-radius: 50% !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.offline-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 20px 0 20px;
    padding: 8px 16px;
    border: 1px solid var(--color-warning, #e9a500);
    border-radius: var(--border-radius-large, 10px);
    color: var(--color-main-text, #222);
    background-color: var(--color-main-background, #fff);
}

.offline-empty {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: min(90vw, 480px);
    text-align: center;
}

.create-album-dialog {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
}

.create-album-dialog h2 {
    margin: 0;
}

.create-album-dialog > .button-vue {
    align-self: flex-end;
}

#snackbar {
  visibility: hidden; 
  min-width: 250px; 
  margin-left: -125px; 
  background-color: #333; 
  color: #fff; 
  text-align: center; 
  border-radius: 2px; 
  padding: 16px; 
  position: fixed; 
  z-index: 1; 
  left: 50%; 
  bottom: 30px; 
}

#snackbar.show {
  visibility: visible;
  animation: fadein 0.5s, fadeout 0.5s 2.5s;
}

.center {
  position: fixed;
  top: 50%;
  left: 50%;
}

@keyframes fadein {
  from {bottom: 0; opacity: 0;}
  to {bottom: 30px; opacity: 1;}
}

@keyframes fadeout {
  from {bottom: 30px; opacity: 1;}
  to {bottom: 0; opacity: 0;}
}

</style>
