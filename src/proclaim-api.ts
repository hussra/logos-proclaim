import { request, Agent, setGlobalDispatcher, errors } from 'undici'
import { LogLevel, ProclaimStatus } from './proclaim-status.js'
import {
	IndexedAppCommand,
	ServiceItemKind,
	ServicePart,
	SimpleAppCommand,
	type Presentation,
	type PresentationStatus,
	type ProclaimAppCommandAPIAuthResponse,
	type ProclaimLocalWiFiAPIAuthResponse,
} from './proclaim-types.js'

export * from './proclaim-types.js'
export * from './proclaim-status.js'

// Reduce the connect timeout for UnDici connections
setGlobalDispatcher(
	new Agent({
		connectTimeout: 500,
	}),
)

/**
 * Encapsulate the Proclaim API connections
 */
export class ProclaimAPI {
	#ip?: string
	#password?: string

	#pollInterval?: ReturnType<typeof setInterval>
	#statusPromise?: Promise<void> | null

	#status: ProclaimStatus = new ProclaimStatus()
	#statusListenersAdded = false

	/**
	 * The IP address of the computer where Proclaim is running
	 */
	get ip() {
		return this.#ip
	}

	/**
	 * The password to use to connection to the App Command API
	 */
	get password() {
		return this.#password
	}

	/**
	 * Authentication is required for IPs other than 127.0.0.1
	 */
	get authRequired() {
		return this.#ip !== '127.0.0.1'
	}

	/**
	 * The status object representing the current state of the API connection and any on-air presentation
	 */
	get status(): ProclaimStatus {
		return this.#status
	}

	/**
	 * Config is valid if we have an IP address, and (unless IP is 127.0.0.1) we have a password specified
	 * @returns boolean
	 */
	private configIsValid() {
		if (!this.#ip || this.#ip.trim() === '') {
			return false
		}
		if (this.authRequired) {
			if (!this.#password || this.#password.trim() === '') {
				return false
			}
		}
		return true
	}

	/**
	 * Configure this ProclaimAPI instance
	 * @param ip - IP address where Proclaim is running
	 * @param password - Proclaim local remote password - required if ip is other than 127.0.0.1
	 */
	async configure(ip?: string, password?: string) {
		this.#status.emit('log', {
			level: LogLevel.INFO,
			message: `Configuring Proclaim API with IP ${ip} and password ${password ? '***' : '(none)'}`,
		})

		this.#status.initialize()

		this.#ip = ip || '127.0.0.1'
		this.#password = password || ''

		this.#status.configured = true
		this.#status.configValid = this.configIsValid()

		if (!this.#statusListenersAdded) {
			this.addEventListeners()
			this.#statusListenersAdded = true
		}

		if (this.#pollInterval !== undefined) {
			clearInterval(this.#pollInterval)
		}
		await this.initOnAirPolling()
	}

	/**
	 * Add internal event listeners for ProclaimStatus events - these listeners respond
	 * to our own state changes triggering further internal actions
	 */
	private addEventListeners() {
		// When we get connected to Proclaim, get an auth token if required
		this.#status.on('connected', async ({ data }) => {
			if (data && this.authRequired) {
				await this.getAppCommandAPIAuthToken()
			}
		})

		// When we get a new session ID set on-air status, set the current step to 0, fetch the
		// presentation data, and get an auth token for the Local Wi-Fi API
		this.#status.on('sessionId', async ({ data }) => {
			if (data !== '') {
				// Gone on air - set step to 0 and load presentation data
				this.#status.onAir = true
				this.#status.step = 0
				await this.loadPresentation()
				await this.getLocalWiFiRemoteAuthToken()
			} else {
				// Gone off air - clear presentation data
				this.#status.onAir = false
				this.#status.presentation = null
				this.#status.itemId = ''
				this.#status.itemCount = 0
				this.#status.songCount = 0
				this.#status.localWiFiAPIAuthenticated = false
				this.#status.localWifiAPIAuthToken = ''
				this.#status.localWiFiAPIConnectionId = ''
			}
		})

		// When we load a new presentation, note its local revision and start checking presentation status
		this.#status.on('presentation', async ({ data }) => {
			// Just return if the presentation data got cleared
			if (data === null) {
				return
			}
			this.#status.presentationLocalRevision = data.localRevision
			this.#status.itemCount = data.serviceItems.length
			this.#status.songCount = data.serviceItems.filter((item) => item.kind === ServiceItemKind.SongLyrics).length

			// If we already have a current itemId, we should recalculate status properties that depend on it
			if (this.#status.itemId && this.#status.itemId !== '') {
				this.setItemProperties(this.#status.itemId)
			}

			// If we don't already have a #statusPromise, create another (after a short pause)
			if (!this.#statusPromise) {
				await this.sleep(1000)
				this.#statusPromise = this.getPresentationStatus()
			}
		})

		// When the presentation local revision changes, reload the whole presentation
		this.#status.on('presentationLocalRevision', ({ data }) => {
			// First check if we already have this location revision - this will be
			// the case if presentationLocalRevision was changed because the presentation
			// itself was just loaded
			if (this.#status.presentation?.localRevision !== data) {
				this.loadPresentation()
			}
		})

		// When the selected item ID changes, load details of that item
		this.#status.on('itemId', ({ data }) => {
			if (data === '00000000-0000-0000-0000-000000000000') {
				// This seems to happen when a custom quick screen is active, or the on screen Bible - ignore
				return
			}

			this.setItemProperties(data)
		})
	}

	/**
	 * Calculate status properties that depend on the currently live service item:
	 * itemIndex, itemTitle, itemKind, itemSlideCount, servicePart
	 * @param data - ID of live service item
	 */
	private setItemProperties(data: string) {
		const itemIndex = this.#status.presentation?.serviceItems.findIndex((item) => item.id === data) ?? -1
		const item = this.#status.presentation?.serviceItems[itemIndex]

		if (item) {
			this.#status.itemIndex = itemIndex
			this.#status.itemTitle = item?.title
			this.#status.itemKind = item?.kind
			this.#status.itemSlideCount = item?.slides.length

			const warmupStartIndex = this.#status.presentation?.warmupStartIndex ?? -1
			const serviceStartIndex = this.#status.presentation?.serviceStartIndex ?? -1
			const postServiceStartIndex = this.#status.presentation?.postServiceStartIndex ?? -1

			if (itemIndex < warmupStartIndex) {
				this.#status.servicePart = ServicePart.PreService
			} else if (itemIndex < serviceStartIndex) {
				this.#status.servicePart = ServicePart.Warmup
			} else if (itemIndex < postServiceStartIndex) {
				this.#status.servicePart = ServicePart.Service
			} else {
				this.#status.servicePart = ServicePart.PostService
			}

			if (item?.kind === ServiceItemKind.SongLyrics) {
				const index =
					this.#status.presentation?.serviceItems
						.filter((item) => item.kind === ServiceItemKind.SongLyrics)
						.findIndex((item) => item.id === data) ?? -1
				this.#status.songIndex = index + 1
			} else {
				this.#status.songIndex = 0
			}
		} else {
			this.#status.itemIndex = -1
			this.#status.itemTitle = ''
			this.#status.itemKind = null
			this.#status.itemSlideCount = 0
			this.#status.servicePart = null
			this.#status.songIndex = 0
		}
	}

	/**
	 * Initialise polling to check if Proclaim has gone on air - every 1 second
	 */
	private async initOnAirPolling() {
		this.#pollInterval = setInterval(() => {
			void this.onAirPoll()
		}, 1000)
		void this.onAirPoll()
	}

	/**
	 * Poll to see whether Proclaim has gone on air. If already on air, does nothing - going off
	 * air is detected by presentation status changes
	 */
	private async onAirPoll(): Promise<void> {
		// Only poll if we are off air - if we are on air, getPresentationStatus() will detect going off air
		if (this.#status.onAir) return

		const url = `http://${this.#ip}:52195/onair/session`

		try {
			const { statusCode, body } = await request(url, {
				method: 'GET',
				headers: {
					Accept: 'text/plain',
				},
			})

			if (statusCode >= 200 && statusCode < 300) {
				const text = await body.text()
				this.#status.connected = true
				this.#status.sessionId = statusCode === 200 ? text : ''
			} else {
				// Some other unexpected status code - set disconnected, clear session ID
				this.#status.connected = false
				this.#status.sessionId = ''
			}
		} catch (error) {
			// Some unexpected error
			const undiciError = error as errors.UndiciError

			// Don't bother logging connection refused errors, connect timeout errors, or host down/unreachable errors.
			// These are expected if Proclaim is not running.
			if (
				undiciError.code !== 'ECONNREFUSED' &&
				undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT' &&
				undiciError.code !== 'EHOSTDOWN' &&
				undiciError.code !== 'EHOSTUNREACH'
			) {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Error polling onAir session`,
					error: error as Error,
				})
			}

			// Set disconnected, clear session ID
			this.#status.connected = false
			this.#status.sessionId = ''
		}
	}

	/**
	 * Load details of the on-air presentation
	 */
	private async loadPresentation() {
		if (this.#status.sessionId.length === 0) {
			this.#status.emit('log', { level: LogLevel.ERROR, message: `No sessionId available, cannot fetch presentation` })
			return null
		}

		const url = `http://${this.#ip}:52195/presentations/onair`

		try {
			const { statusCode, body } = await request(url, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Onairsessionid: this.#status.sessionId,
				},
			})

			if (statusCode === 200) {
				// Return the actual presentation
				const presentation = (await body.json()) as Presentation
				this.#status.presentation = presentation
			} else if (statusCode === 404) {
				// Off air - clear session ID
				this.#status.sessionId = ''
			} else {
				// Some other unexpected status code - set disconnected & clear session ID
				this.#status.connected = false
				this.#status.sessionId = ''
			}
		} catch (error) {
			// Some unexpected error - set disconnected, & clear session ID
			const undiciError = error as errors.UndiciError
			if (undiciError.code !== 'ECONNREFUSED' && undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT') {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Error retrieving presentation data`,
					error: error as Error,
				})
			}

			this.#status.connected = false
			this.#status.sessionId = ''
		}
	}

	/**
	 * Call /onair/statusChanged to get current presentation status, passing the current session ID, presentation
	 * local revision and step. If the details sent are all current, Proclaim will long-poll for up to a minute
	 * before responding.
	 */
	private async getPresentationStatus() {
		const url = `http://${this.#ip}:52195/onair/statusChanged?localrevision=${this.#status.presentationLocalRevision}&step=${this.#status.step}`
		try {
			const { statusCode, body } = await request(url, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Onairsessionid: this.#status.sessionId,
				},
			})

			if (statusCode === 200) {
				// Return the actual presentation
				const status = (await body.json()) as PresentationStatus

				// Sometimes we seem to get a 200 status but an empty body.
				// If so, try again.
				if (status === null) {
					this.#status.emit('log', {
						level: LogLevel.WARN,
						message: `/onair/statusChanged returned no data, will back off and try again`,
					})

					await this.sleep(1000)
					this.#statusPromise = this.getPresentationStatus()
					return
				}

				// Update the current local revision and step
				this.#status.step = status.status.revision
				this.#status.presentationLocalRevision = status.presentationLocalRevision

				// Update other status properties
				this.#status.itemId = status.status.itemId // This will trigger recalculation of other item properties
				this.#status.slideIndex = status.status.slideIndex
				this.#status.quickScreenKind = status.status.quickScreenKind
				this.#status.mediaState = status.status.mediaState

				// Call getPresentationStatus() again to get the next status update
				this.#statusPromise = this.getPresentationStatus()
			} else if (statusCode === 404) {
				// Off air - clear session ID, clear status promise
				this.#status.sessionId = ''
				this.#statusPromise = null
			} else {
				// Some other unexpected status code - set disconnected, clear session ID, clear status promise
				this.#status.connected = false
				this.#status.sessionId = ''
				this.#statusPromise = null
			}
		} catch (error) {
			// Some unexpected error - set disconnected, clear session ID, clear status promise
			const undiciError = error as errors.UndiciError
			if (undiciError.code !== 'ECONNREFUSED' && undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT') {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Connection refused retrieving presentation status`,
					error: error as Error,
				})
			}

			this.#status.connected = false
			this.#status.sessionId = ''
			this.#statusPromise = null
		}
	}

	/**
	 * Get an auth token for the App Command API
	 */
	private async getAppCommandAPIAuthToken(): Promise<void> {
		const url = `http://${this.#ip}:52195/appCommand/authenticate`
		try {
			const { statusCode, body } = await request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					Password: this.#password,
				}),
			})

			if (statusCode !== 200) {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Authentication error in getAuthToken(): ${statusCode}`,
				})
				if (this.authRequired) {
					this.#status.appCommandAPIAuthenticated = false
				}
			}

			const data = (await body.json()) as ProclaimAppCommandAPIAuthResponse
			this.#status.appCommandAPIAuthToken = data?.proclaimAuthToken
			this.#status.appCommandAPIAuthenticated = true
		} catch (error) {
			this.#status.emit('log', {
				level: LogLevel.ERROR,
				message: `Authentication error in getAuthToken()`,
				error: error as Error,
			})
			if (this.authRequired) {
				this.#status.appCommandAPIAuthenticated = false
			}
		}
	}

	/**
	 * Refresh auth tokens for App Command and Local Wi-Fi APIs
	 */
	async reconnect(): Promise<void> {
		if (this.authRequired) {
			await this.getAppCommandAPIAuthToken()
		}
		await this.getLocalWiFiRemoteAuthToken()
	}

	/**
	 * Send any App Command to Proclaim
	 * @param command - The App Command to send: see documentation at
	 *   https://support.proclaim.logos.com/hc/en-us/articles/19864456647053-Proclaim-App-Command-API
	 * @param index - For certain App Commands (annotated with an * at the API reference), the index to use (1-254)
	 *   e.g. service item number, slide number, verse number etc.
	 * @returns Whether the command was sent successfully
	 */
	async sendAppCommand(
		cmd: { command: SimpleAppCommand } | { command: IndexedAppCommand; index: number },
	): Promise<boolean> {
		const command = cmd.command
		const index = 'index' in cmd ? cmd.index : undefined

		this.#status.emit('log', {
			level: LogLevel.INFO,
			message: `Sending App Command ${command}${index !== undefined ? ` with index ${index}` : ''}`,
		})
		let url = `http://${this.#ip}:52195/appCommand/perform?appCommandName=${command}`
		if (index !== undefined) {
			url = `${url}&index=${index}`
		}

		try {
			const { statusCode, body } = await request(url, {
				headers: {
					'Content-Type': 'application/json',
					...(this.authRequired && this.#status.appCommandAPIAuthenticated
						? { ProclaimAuthToken: this.#status.appCommandAPIAuthToken }
						: {}),
				},
			})

			const data = await body.text()

			if (statusCode === 401 || statusCode === 403) {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Proclaim authentication failed: ${statusCode} ${data}`,
				})
				this.#status.appCommandAPIAuthenticated = false
				this.#status.appCommandAPIAuthToken = ''
				return false
			} else if (statusCode !== 200) {
				this.#status.emit('log', { level: LogLevel.ERROR, message: `Proclaim command failed: ${statusCode} ${data}` })
				return false
			}

			if (data !== 'success') {
				this.#status.emit('log', { level: LogLevel.ERROR, message: `Unexpected response from Proclaim: ${data}` })
				return false
			}
		} catch (error) {
			this.#status.emit('log', { level: LogLevel.ERROR, message: `Proclaim command failed`, error: error as Error })
			return false
		}
		return true
	}

	/**
	 * Get an auth token for the Local Wi-Fi API
	 */
	private async getLocalWiFiRemoteAuthToken() {
		const url = `http://${this.#ip}:52195/auth/control`
		try {
			const { statusCode, body } = await request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					OnAirSessionId: this.#status.sessionId,
				},
				body: JSON.stringify({
					FaithlifeUserId: null,
					UserName: null,
					RemoteDeviceName: 'companion-module-logos-proclaim',
					Password: 'Proclaim',
				}),
			})

			if (statusCode !== 200) {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Unable to authenticate to Local Wi-Fi API: ${statusCode}`,
				})
				this.#status.localWiFiAPIAuthenticated = false
				this.#status.localWifiAPIAuthToken = ''
				this.#status.localWiFiAPIConnectionId = ''
			}

			const data = (await body.json()) as ProclaimLocalWiFiAPIAuthResponse
			this.#status.localWiFiAPIAuthenticated = true
			this.#status.localWifiAPIAuthToken = data.authenticationToken
			this.#status.localWiFiAPIConnectionId = data.connectionId
		} catch (error) {
			this.#status.emit('log', {
				level: LogLevel.ERROR,
				message: `Error taking Local Wi-Fi control`,
				error: error as Error,
			})
			this.#status.localWiFiAPIAuthenticated = false
			this.#status.localWifiAPIAuthToken = ''
			this.#status.localWiFiAPIConnectionId = ''
		}
	}

	/**
	 * Jump to a specific service item by ID, and optionally a specific slide number
	 * @param itemId - ID of the service item to jump to
	 * @param slideIndex - slide number to jump to within that service item (0-based)
	 * @returns Whether the command was sent successfully
	 */
	async goToServiceItemAndSlide(itemId: string, slideIndex = 0): Promise<boolean> {
		this.#status.emit('log', {
			level: LogLevel.INFO,
			message: `Jumping to service item ${itemId} and slide ${slideIndex}`,
		})
		const url = `http://${this.#ip}:52195/onair/statusChanged`

		try {
			const { statusCode, body } = await request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					OnAirSessionId: this.#status.sessionId,
					ProclaimAuthToken: this.#status.localWifiAPIAuthToken,
				},
				body: JSON.stringify({
					PresentationId: this.#status.presentation?.id,
					PresentationLocalRevision: this.#status.presentationLocalRevision,
					Status: {
						Revision: this.#status.step,
						ItemId: itemId,
						SlideIndex: slideIndex,
						QuickScreen: '',
						QuickScreenData: '',
						QuickScreenKind: 'None',
						MediaState: this.#status.mediaState,
					},
				}),
			})

			if (statusCode === 401 || statusCode === 403) {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Proclaim authentication failed: ${statusCode} ${body.text()}`,
				})
				this.#status.localWiFiAPIAuthenticated = false
				this.#status.localWifiAPIAuthToken = ''
				this.#status.localWiFiAPIConnectionId = ''
				return false
			}
			if (statusCode !== 200) {
				this.#status.emit('log', {
					level: LogLevel.ERROR,
					message: `Unexpected response from Proclaim: ${statusCode} ${body.text()}`,
				})
				return false
			}
		} catch (error) {
			this.#status.emit('log', { level: LogLevel.ERROR, message: `Proclaim command failed`, error: error as Error })
			return false
		}
		return true
	}

	/**
	 * On being destroyed, clear the on-air polling interval
	 */
	destroy(): void {
		if (this.#pollInterval !== undefined) {
			clearInterval(this.#pollInterval)
		}
	}

	/**
	 * Sleep
	 * @param ms - number of milliseconds to sleep
	 * @returns Promise that will resolve after the specified time
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
