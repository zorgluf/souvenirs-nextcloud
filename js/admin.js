/**
 * Used to update the admin settings
 * Rewritten without jQuery: the server no longer provides the global
 * jQuery library (deprecated since NC 19 and removed since NC 34).
 */
document.addEventListener('DOMContentLoaded', () => {
	'use strict'

	const souvenirsPathInput = document.querySelector('#souvenirs input[name="souvenirs-path"]')
	const savedMessage = document.getElementById('souvenirs-saved-message')

	let fadeTimer

	const saved = () => {
		savedMessage.style.display = 'block'
		clearTimeout(fadeTimer)
		fadeTimer = setTimeout(() => {
			savedMessage.style.display = 'none'
		}, 5000)
	}

	const submit = () => {
		fetch(OC.generateUrl('/apps/souvenirs/admin'), {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				requesttoken: OC.requestToken,
			},
			body: JSON.stringify({
				souvenirsPath: souvenirsPathInput.value,
			}),
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error('HTTP status ' + response.status)
				}
				return response.json()
			})
			.then((data) => {
				saved()
				souvenirsPathInput.value = data.souvenirsPath
			})
			.catch((error) => {
				console.error('Failed to save Souvenirs settings', error)
			})
	}

	souvenirsPathInput.addEventListener('blur', submit)
})
