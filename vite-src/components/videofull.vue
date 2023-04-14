<template>
    <video id="video_full" class="video-full" v-on:click="closeVideoFull"
        autoplay="true">
        <source v-bind:src="videoUrl">
    </video>
</template>

<script>

export default {
    props: {
      "videoUrl": String,
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
    z-index: 1;
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