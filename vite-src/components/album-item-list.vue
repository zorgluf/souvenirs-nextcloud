<template>
    <div v-bind:class="isWinPortrait ? 'albumlist-portrait': ''">
        <album-item v-for='(album, index) in albumList' v-bind:key='index' v-bind:a-path='album["path"]'
        v-bind:album-image-path='("albumImage" in album) ? album["albumImage"] : ""'
        v-bind:name='album["name"]' v-bind:album-id='album["id"]' v-bind:date='album["date"]' v-bind:shares='shares' 
        v-bind:is-win-portrait="isWinPortrait"
        v-on:refresh-shares="refreshShares" v-on:snackbar="activateSnackbar" v-on:refresh-albums="refreshAlbums">
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
    </div>
</template>

<script>

import AlbumItem from './album-item.vue'
import { NcLoadingIcon } from '@nextcloud/vue'

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
        }
    },
    components: {
        'album-item': AlbumItem,
        NcLoadingIcon,
    },
    created: function() {
        this.refreshAlbums();
        this.refreshShares();
        window.onscroll = () => this.loadAlbumPageIfNeeded();
        window.addEventListener("resize", this.resizeEventHandler);
    },
    mounted: function() {
        this.resizeEventHandler(null);
    },
    destroyed: function() {
        window.removeEventListener("resize", this.resizeEventHandler);
    },
    watch: {
        loading(newLoading, oldLoading) {
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
            let bottomOfWindow = document.documentElement.scrollTop + window.innerHeight >= document.documentElement.scrollHeight - 2;
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
                        that.loading = -1;
                        return;
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
    }
}
</script>

<style scoped>

.albumlist-portrait {
    width: 100vw;
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
