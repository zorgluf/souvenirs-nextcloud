<template>
    <div class="image-full">
		<img class="fill" v-bind:src="imageUrl" v-on:click="closeImgFull"/>
    </div>
</template>

<script>

export default {
    props: {
      "imageUrl": String,
    },
    data: function() {
        return {
        }
    },
    methods: {
        closeImgFull: function() {
            this.$emit("closeimagefull");
        }
    }
}
</script>

<style scoped>

.image-full {
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