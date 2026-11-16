/**
 * Local notifications of the offline feature (issue #22): a toast in the
 * app, doubled by a system notification when the tab is in the background
 * and the user allowed notifications. No server push: nothing is notified
 * while the app is closed.
 */

import { showSuccess, showWarning } from '@nextcloud/dialogs'

function systemNotification(text) {
    try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted'
            && globalThis.document && globalThis.document.visibilityState === 'hidden') {
            // eslint-disable-next-line no-new
            new Notification('Souvenirs', { body: text, tag: 'souvenirs-sync' })
        }
    } catch (error) {
        // some browsers only allow notifications from a service worker
    }
}

/** Whether system notifications can be asked for or are already settled. */
export function notificationPermission() {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Ask for the permission; must be called from a user gesture. */
export async function requestNotifications() {
    if (typeof Notification === 'undefined') {
        return 'unsupported'
    }
    try {
        return await Notification.requestPermission()
    } catch (error) {
        return Notification.permission
    }
}

/** The changes made on this device reached the server. */
export function notifySynced(albumName) {
    const text = t('souvenirs', 'Album "{name}" synchronized.', { name: albumName || '' })
    showSuccess(text)
    systemNotification(text)
}

/** Changes on this device and on the server cannot be merged. */
export function notifyConflict(albumName) {
    const text = t('souvenirs', 'Album "{name}" was modified both here and on the server: open it to choose which version to keep.', { name: albumName || '' })
    showWarning(text)
    systemNotification(text)
}
