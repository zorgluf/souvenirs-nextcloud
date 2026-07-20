// Global test setup: provide the Nextcloud globals the app code relies on so
// units can run without a real Nextcloud runtime.

// CSRF token used by the API layer (albumApi.js).
globalThis.OC = globalThis.OC || { requestToken: 'test-token' }

// Translation helper used throughout the components; pass text through
// verbatim, substituting {placeholders} like the real helper does.
globalThis.t = globalThis.t || ((app, text, vars) => (
    vars ? text.replace(/{([^{}]+)}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : text
))
globalThis.n = globalThis.n || ((app, singular, plural, count) => (count === 1 ? singular : plural))
