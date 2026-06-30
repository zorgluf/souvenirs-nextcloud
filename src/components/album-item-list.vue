<template>
    <div v-bind:class="isWinPortrait ? 'albumlist-portrait': ''">
        <album-item v-for='(album, index) in albumList' v-bind:key='index' v-bind:a-path='album["path"]'
        v-bind:album-image-path='("albumImage" in album) ? album["albumImage"] : ""'
        v-bind:name='album["name"]' v-bind:album-id='album["id"]' v-bind:date='album["date"]' v-bind:shares='shares'
        v-bind:is-win-portrait="isWinPortrait"
        v-on:refresh-shares="refreshShares" v-on:snackbar="activateSnackbar" v-on:refresh-albums="refreshAlbums"
        v-on:edit-album="openEdit">
        </album-item>
        <div v-if="(loading <= 0) && (unsortedAlbumList.length == 0)" class="center">
            <div class="icon-folder"></div>
            <h2>{{ sNoAblum }}</h2>
        </div>
        <div v-if="loading > 0" class="center">
            <NcLoadingIcon v-bind:title="sLoading" :size="64">
            </NcLoadingIcon>
        </div>
        <div id="snackbar">{{snackbarText}}
        </div>
        <NcButton variant="primary" class="create-album-fab" :aria-label="sNewAlbum" :title="sNewAlbum" v-on:click="openCreate">
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
import { v4 as uuidv4 } from 'uuid'
import { createAlbum, updateAlbum } from '../api/albumApi.js'

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
    },
    created: function() {
        this.refreshAlbums();
        this.refreshShares();
        window.addEventListener("resize", this.resizeEventHandler);
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
            }
        }
    },
    computed: {
        "albumList": function() {
            return this.unsortedAlbumList.sort(function(a,b) {
                return b["date"].localeCompare(a["date"]);
            });
        }
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
            this.loadOneAlbumsPage();
        },
        loadAlbumPageIfNeeded: function() {
            let bottomOfWindow = Math.abs(document.getElementById("souvenirs-main").scrollHeight - document.getElementById("souvenirs-main").clientHeight - document.getElementById("souvenirs-main").scrollTop) <= 1;
            //console.log("bottomOfWindow:"+bottomOfWindow);
            if (bottomOfWindow & (this.loading == 0)) {
                this.loadOneAlbumsPage();
            }
        },
        loadOneAlbumsPage: function() {
            this.loading += 1;
            var that = this;
            fetch("apiv2/album?page="+(that.lastPage+1), {
                headers: { 'requesttoken': OC.requestToken, }
                })
            .then(response => {
                response.json().then(data => {
                    if (data.length > 0) {
                        that.lastPage += 1;
                        data.forEach(albumId => {
                            that.loading += 1;
                            fetch("apiv2/album/"+albumId, {
                                headers: { 'requesttoken': OC.requestToken, }
                                })
                            .then(response => {
                                response.json().then(data => {
                                    that.unsortedAlbumList.push(data);
                                    that.loading -= 1;
                                })
                            }).catch(error => {
                                that.loading -= 1;
                            });
                        });
                    } else {
                        that.loading -= 1;
                    }
                    that.loading -= 1;
                })
            }).catch(error => {
                that.loading -= 1;
            });
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
                // Edit existing album metadata.
                saved = updateAlbum(this.editingAlbumId, fields);
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
