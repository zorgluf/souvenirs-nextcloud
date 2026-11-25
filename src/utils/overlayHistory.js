// Lets the browser "back" action (Android back gesture/button, browser back
// button) close a fullscreen overlay instead of leaving the album (issue #63).
//
// Opening an overlay pushes one history entry at the same URL; going back pops
// it and calls onClose. Closing the overlay any other way (its close button,
// Escape) removes that entry again with history.back(), so the history holds
// no stray entries.
//
// The pushed state is a copy of the current one: vue-router keeps its own
// bookkeeping (position, back, forward) in history.state, and a pop back to an
// entry with the same position and URL is a no-op navigation for it.

export function createOverlayHistory(onClose, win = window) {
    let pushed = false
    let closingOurselves = false

    function onPopState() {
        if (closingOurselves) {
            // the pop caused by close() below
            closingOurselves = false
            return
        }
        if (pushed) {
            pushed = false
            onClose()
        }
    }

    win.addEventListener('popstate', onPopState)

    return {
        // An overlay was opened.
        open() {
            if (pushed) {
                return
            }
            win.history.pushState({ ...(win.history.state || {}), souvenirsOverlay: true }, '')
            pushed = true
        },
        // The overlay was closed by the app (not by "back").
        close() {
            if (!pushed) {
                return
            }
            pushed = false
            closingOurselves = true
            win.history.back()
        },
        // The component goes away: leave history as it is (a route change
        // already moved past our entry) and stop listening.
        destroy() {
            pushed = false
            win.removeEventListener('popstate', onPopState)
        },
        get isOpen() {
            return pushed
        },
    }
}
