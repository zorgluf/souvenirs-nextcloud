<template>

<div class="s-box"> 
    <div class="s-spiral"></div>
    <a v-bind:href='"show?apath="+encodeURIComponent(aPath)'>
        <div class="s-square">
            <img class="s-album-image" v-bind:src='albumImageUrl'
            />
        </div>
    </a>
    <div class="s-oneline s-title">
        {{name}}
    </div>
    <div class="s-subtitle s-oneline">
        {{dateString}}
    </div>
    <div class="right s-action-menu">
        <Actions default-icon="icon-shared" :force-menu="true" v-bind:style='(isShared) ? "opacity: 1" : "opacity: 0.3"'>
            <ActionButton icon="icon-shared" @click="toggleShare" v-if="!(isShared)">Share album</ActionButton>
            <ActionLink icon="icon-external" v-bind:href="shareUrl" target="_blank" v-if="isShared" v-on:click="copyShareUrlToClipboard">Link to public album</ActionLink>
            <ActionButton icon="icon-delete" @click="toggleShare" v-if="isShared" :close-after-click="true">Remove share</ActionButton>
        </Actions>
        <Actions default-icon="icon-delete" :force-menu="true">
            <ActionButton icon="icon-error" @click="deleteAlbum">CONFIRM ALBUM DELETION</ActionButton>
        </Actions>
    </div>
    <input type="text"  style="display: none" v-bind:value="shareUrl"/>
    <textarea style="display: none; height: 0px" v-model="shareUrl" v-bind:id='"input-"+aPath'></textarea>
</div>

</template>

<script>

import Actions from '@nextcloud/vue/dist/Components/Actions'
import ActionButton from '@nextcloud/vue/dist/Components/ActionButton'
import ActionLink from '@nextcloud/vue/dist/Components/ActionLink'
import { generateUrl, imagePath } from '@nextcloud/router'

export default {
    props: {
        'shares': Array,
        'aPath': String,
        'albumImagePath': String,
        'name': String,
        'date': String,
        'albumId': String,
    },
    components: {
        Actions,
        ActionButton,
        ActionLink
    },
    computed: {
        "isShared": function() {
            return (this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }) != undefined);
        },
        "dateString": function() {
            moment.locale(window.navigator.language);
            return moment(this.date, "YYYYMMDDhhmmss").format("LL");
        },
        "shareToken": function() {
            if (this.isShared) {
                return this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }).token;
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
            if (this.albumImagePath == "") {
                return imagePath("souvenirs","album_image.png");
            } else {
                return "preview?apath="+encodeURIComponent(this.aPath)+"&file="+this.albumImagePath.replace(/.*\//,"")+"&width=256&height=256";
            }
        }
    },
    methods: {
        'deleteAlbum': function() {
            $.ajax({
                    url: "apiv2/album/"+this.albumId,
                    type: "DELETE",
                    success: data => {
                        this.$emit("snackbar","Album deleted.");
                        this.$emit('refresh-albums');
                    }
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
                var token = this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }).token;
                $.ajax({
                    url: "apiv2/share/"+token,
                    type: "DELETE",
                    success: data => {
                        this.$emit('refresh-shares');
                        this.$emit("snackbar","Album share removed.");
                    }
                });
            }
        },
        'createShare': function() {
            if (!this.isShared) {
                $.ajax({
                    url: "apiv2/share",
                    data: {'albumId': this.albumId},
                    type: "POST",
                    success: data => {
                        
                        this.$emit('refresh-shares');
                        
                    }
                });
            }
        },
        'copyShareUrlToClipboard': function() {
            navigator.clipboard.writeText(this.shareUrl).then(function() {
                this.$emit("snackbar","Album shared. Public URL copied to clipboard.");
            }, function() {
                this.$emit("snackbar","Clipboard error!");
            });
        }
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
.s-box:hover {
	box-shadow: 5px 5px var(--color-box-shadow);
}

.s-square {
	padding-top: 100%;
	position: relative;
}

.s-album-image {
	object-fit: cover;
	width: 100%;
	height: 100%;
	position: absolute;
	top: 0px;
	left: 0px;
}

.s-action-menu {
    display: inline;
}

.right {
    float: right;
}
</style>
