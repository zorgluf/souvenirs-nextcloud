<template>
    <div class="bottom right icon icon-shared">
    </div>
</template>

<script>

export default {
    props: {
        'isShared': Boolean,
    },
}

</script>

<style scoped>
.icon:hover {
    opacity: 0.7;
}

.icon {
    size : 16px 16px;
    background-size: 16px 16px;
    opacity: 0.3;
}

.icon-shared {
    background-image: var(--icon-share-000);
}

.bottom {
    position: absolute;
    bottom: 5px;
}

.right {
    position: absolute;
    right: 5px;
}
</style>
