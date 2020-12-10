<template>
<a v-bind:href='"show?apath="+encodeURIComponent(aPath)' style="display:inline-block;">
    <div class="s-box"> 
        <div class="s-spiral"></div>
        <div class="s-square">
            <img class="s-album-image" v-bind:src='imagePath == "" ? "" : "preview?apath="+encodeURIComponent(aPath)+"&file="+imagePath+"&width=256&height=256"'
            />
        </div>
        <div class="s-oneline s-title">
            {{name}}
        </div>
        <div class="s-subtitle s-oneline">
            {{dateString}}
        </div>
        <div class="right s-action-menu">
            <div class="icon icon-share" v-bind:class='(isShared) ? "icon-activated" : ""'
            v-on:click="toggleShare">
            </div>
            <div class="icon icon-activated icon-delete" v-on:click="deleteAlbum">
            </div>
        </div>
        <input type="text"  style="display: none" v-bind:value="shareUrl"/>
        <textarea style="display: none; height: 0px" v-model="shareUrl" v-bind:id='"input-"+aPath'></textarea>
    </div>
</a>
</template>

<script>

export default {
    props: {
        'shares': Array,
        'aPath': String,
        'imagePath': String,
        'name': String,
        'date': String,
        'albumId': String,
    },
    data: function() {
        return {
            "shareUrl" : ""
        }
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
        }
    },
    methods: {
        'deleteAlbum': function() {
            $.ajax({
                    url: "apiv2/album/"+this.albumId,
                    type: "DELETE",
                    success: data => {
                        //TODO
                        this.$emit('refresh-albums');
                    }
                });
            event.preventDefault();
        },
        'detectAlbumInShare': function() {
            return (this.shares.find(share => {
                    return share['albumId'] == this.albumId
                }) != undefined);
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
                    url: "api/share/"+token,
                    type: "DELETE",
                    success: data => {
                        this.$emit('refresh-shares');
                    }
                });
            }
        },
        'createShare': function() {
            if (!this.isShared) {
                $.ajax({
                    url: "api/share",
                    data: {'albumId': this.albumId},
                    type: "POST",
                    success: data => {
                        //copy to clipboard
                        copyToClipboard(data.shareUrl);
                        this.$emit('refresh-shares');
                        this.$emit("snackbar","Album shared. Public URL copied to clipboard.");
                    }
                });
            }
        }
    },
}

var copyToClipboard = function(texte) {
    var textarea = document.createElement("textarea");
    textarea.innerText = texte;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
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

.icon:hover {
    opacity: 0.7;
}

.icon {
    size : 20px 20px;
    background-size: 16px 16px;
    margin: 5px;
    opacity: 0.3;
    float: left;
}

.icon-activated {
    opacity: 1;
}

.right {
    float: right;
}
</style>
