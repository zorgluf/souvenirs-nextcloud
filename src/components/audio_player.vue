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