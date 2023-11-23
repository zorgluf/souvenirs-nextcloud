<template>
    <video id="video_full" class="video-full" v-on:keydown.escape="closeVideoFull"
        autoplay="true" controls>
        <source v-bind:src="videoUrl">
    </video>
</template>

<script>

export default {
    props: {
      "videoUrl": String,
    },
    mounted: function() {
        document.querySelector("#video_full").focus();
    },
    data: function() {
        return {
        }
    },
    methods: {
        closeVideoFull: function() {
            this.$emit("closevideofull");
        }
    }
}
</script>

<style scoped>

.video-full {
    height: 100%;
    width: 100%;
    position: fixed;
    z-index: 100;
    left: 0;
    top: 0;
    background-color: rgb(0,0,0);
    background-color: rgba(0,0,0, 0.9);
    overflow-x: hidden;
    transition: 0.5s;
}


.fill {
    object-fit: contain;
    width: 100%;
	height: 100%;
}

</style>