<template>
    <div>
        <album-item v-for='(album, index) in albumList' v-bind:key='index' v-bind:a-path='album["path"]'
        v-bind:album-image-path='("albumImage" in album) ? album["albumImage"] : ""'
        v-bind:name='album["name"]' v-bind:album-id='album["id"]' v-bind:date='album["date"]' v-bind:shares='shares' v-on:refresh-shares="refreshShares"
        v-on:snackbar="activateSnackbar" v-on:refresh-albums="refreshAlbums">
        </album-item>
        <div v-if="!loading && (albumList.length == 0)" class="center">
            <div class="icon-folder"></div>
            <h2>No album</h2>
        </div>
        <div v-if="loading" class="center">
            <img src="./img/loading.gif"/>
        </div>
        <div id="snackbar">{{snackbarText}}
        </div>
    </div>
</template>

<script>

import AlbumItem from './album-item';

export default {
    props: {
    },
    data: function() {
        return {
            shares: [],
            snackbarText: "",
            unsortedAlbumList: [],
            loading: true,
        }
    },
    components: {
        'album-item': AlbumItem,
    },
    created: function() {
        this.refreshAlbums();
        this.refreshShares();
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
            $.get("apiv2/share", data => {
                this.shares.splice(0);
                for (var d in data) {
                    this.shares.push(data[d]);
                }
            });
        },
        refreshAlbums: function() {
            this.loading = true;
            $.get("apiv2/album", data => {
                this.unsortedAlbumList.splice(0);
                data.forEach(albumId => {
                    $.get("apiv2/album/"+albumId, album => {
                        this.unsortedAlbumList.push(album);
                    });
                });
                this.loading = false;
            });
        },
        activateSnackbar: function(texte) {
            var x = document.getElementById("snackbar");
            this.snackbarText = texte;
            x.className = "show";
            setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
        }
    }
}
</script>

<style scoped>

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