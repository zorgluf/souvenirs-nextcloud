<template>
    <div id="audio_player">
    </div>
</template>

<script>


export default {
    props: {
      "audioUrl": String,
      "stop": Boolean,
    },
    data: function() {
        return {
            "audioSrc": "",
            "audioPlayer": null,
        }
    },
    watch: {
        audioUrl(val, oldVal) {
            if (val != "") {
                // Only one track plays at a time: without this, re-entering a
                // page with audio stacks a new player on the still-playing old
                // one. An empty val keeps the previous track playing
                // (background-music semantics), so only a new track stops it.
                if (this.audioPlayer != null) {
                    this.audioPlayer.pause();
                }
                this.audioPlayer = new Audio(val);
                this.audioPlayer.play();
            }
        },
        stop(val, oldVal) {
            if (val == true) {
                if (this.audioPlayer != null) {
                    this.audioPlayer.pause();
                }
            }
        }
    },
}
</script>

<style scoped>



</style>