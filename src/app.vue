<template>
    <div class="souvenirs-main" id="souvenirs-main">
        <router-view></router-view>
    </div>
</template>

<script setup>
</script>

<style>
/* Public share layout: Nextcloud reserves a footer-height band at the bottom
   of #content (#body-public #content { padding-block-end: var(--footer-height) }),
   but PublicController hides that footer, so the band is dead space. Reclaim
   it so the album fills the whole viewport height. Unscoped on purpose:
   #content is outside this component. */
#body-public #content.app-souvenirs {
    padding-block-end: 0;
}
</style>

<style scoped>
.souvenirs-main {
    background-color: white;
    position: relative;
    width: 100%;
    height: 100%;
    overflow-y: scroll;
}

@media (prefers-color-scheme: dark) {
    .souvenirs-main {
        background-color: black;
    }

}

</style>
