<template>
    <div class="souvenirs-main" id="souvenirs-main">
        <router-view></router-view>
    </div>
</template>


<style scoped>
.souvenirs-main {
    background-color: white;
    position: relative;
    width: 100%;
    overflow-y: scroll;
}

@media (prefers-color-scheme: dark) {
    .souvenirs-main {
        background-color: black;
    }

}

</style>
