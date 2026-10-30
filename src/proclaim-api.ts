import { request, Agent, setGlobalDispatcher, errors } from 'undici'
import { ProclaimStatus } from "./proclaim-status.js"
import { ServiceItemKind, ServicePart, type Presentation, type PresentationStatus, type ProclaimAuthResponse } from './proclaim-types.js'
import { sleep } from './util.js'

setGlobalDispatcher(
  new Agent({
    connectTimeout: 500,
  })
)

export class ProclaimAPI {

  #ip?: string
  #password?: string

  #pollInterval?: ReturnType<typeof setInterval>

  #statusPromise?: Promise<void> | null

  #status: ProclaimStatus = new ProclaimStatus()

  get ip() {
    return this.#ip
  }

  get password() {
    return this.#password
  }

  /**
   * Authentication is required for IPs other than 127.0.0.1
   */
  private get authRequired() {
    return this.#ip !== '127.0.0.1'
  }

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
   * @param ip IP address where Proclaim is running
   * @param password Proclaim local remote password - required if ip is other than 127.0.0.1
   */
  async configure(ip?: string, password?: string) {
    this.#ip = ip || '127.0.0.1'
    this.#password = password || ''

    this.#status.configured = true
    this.#status.configValid = this.configIsValid()

    this.addEventListeners()

    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
    await this.initOnAirPolling()
  }

  /** 
   * Add internal event listeners for ProclaimStatus events
   */ 
  private addEventListeners() {
    // When we get connected to Proclaim, get an auth token if required
    this.#status.on('connected', async ({data}) => {
      if (data && this.authRequired) {
        await this.getAuthToken()
      }
    })

    // When we get a new session ID, fetch the presentation data for that session and set the current step to 0
    this.#status.on('sessionId', async ({data}) => {
      if (data !== '') {
        // Gone on air - set step to 0 and load presentation data
        this.#status.onAir = true
        this.#status.step = 0
        await this.loadPresentation()
      } else {
        // Gone off air - clear presentation data
        this.#status.onAir = false
        this.#status.presentation = null
        this.#status.itemId = ''
        this.#status.itemCount = 0
        this.#status.songCount = 0
      }
    })

    // When we load a new presentation, note its local revision and start checking presentation status
    this.#status.on('presentation', async ({data}) => {
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
        await sleep(1000)
        this.#statusPromise = this.getPresentationStatus()
      }
    })

    // When the presentation local revision changes, reload the whole presentation
    this.#status.on('presentationLocalRevision', ({data}) => {
      // First check if we already have this location revision - this will be
      // the case if presentationLocalRevision was changed because the presentation
      // itself was just loaded
      if (this.#status.presentation?.localRevision !== data) {
        this.loadPresentation()
      }
    })

    // When the selected item ID changes, load details of that item
    this.#status.on('itemId', ({data}) => {
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
   * @param data ID of live service item
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
    } else {
      this.#status.itemIndex = -1
      this.#status.itemTitle = ''
      this.#status.itemKind = null
      this.#status.itemSlideCount = 0
      this.#status.servicePart = null
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
      const {statusCode, body} = await request(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
        },
      })

      if (statusCode >= 200 && statusCode < 300) {
        const text = await body.text()
        this.#status.connected = true
        this.#status.sessionId = (statusCode === 200) ? text : ''

      } else {
        // Some other unexpected status code - set disconnected, clear session ID
        this.#status.connected = false
        this.#status.sessionId = ''
      }

    } catch (error) {
      // Some unexpected error - set disconnected, clear session ID
      const undiciError = error as errors.UndiciError
      if ((undiciError.code !== 'ECONNREFUSED') && (undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT')) {
        console.error('Error polling onAir session:', error)
      }

      this.#status.connected = false
      this.#status.sessionId = ''
    }
  }

  /**
   * Load details of the on-air presentation
   */
  private async loadPresentation() {
		if (this.#status.sessionId.length === 0) {
			console.error('debug', 'No sessionId available, cannot fetch presentation')
			return null
		}

		const url = `http://${this.#ip}:52195/presentations/onair`

    try {
      const {statusCode, body} = await request(url, {
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
      if ((undiciError.code !== 'ECONNREFUSED') && (undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT')) {
        console.error('Connection refused retrieving presentation data:', error)
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
      const {statusCode, body} = await request(url, {
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
          console.error('/onair/statusChanged returned no data, will back off and try again')

          await sleep(1000)
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
      if ((undiciError.code !== 'ECONNREFUSED') && (undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT')) {
        console.error('Connection refused retrieving presentation status:', error)
      }

      this.#status.connected = false
      this.#status.sessionId = ''
      this.#statusPromise = null
    }
  }

  private async getAuthToken(): Promise<void> {
    console.log('Getting auth token')
    const url = `http://${this.#ip}:52195/appCommand/authenticate`
    try {
      const {statusCode, body} = await request(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          Password: this.#password
        })
      })

      if (statusCode !== 200) {
        console.error(`Authentication error in getAuthToken()`)
        if (this.authRequired) {
          this.#status.authenticated = false
        }
      }

      const data = (await body.json()) as ProclaimAuthResponse
      this.#status.authToken = data?.proclaimAuthToken
      this.#status.authenticated = true
    } catch (error) {
      console.error(`Authentication error in getAuthToken(): ${error}`)
      if (this.authRequired) {
        this.#status.authenticated = false
      }
    }
  }

  async reconnect(): Promise<void> {
		if (this.authRequired) {
			await this.getAuthToken()
		}
	}

  // Send any app command to Proclaim
	async sendAppCommand(command: string, index?: number): Promise<void> {
		let url = `http://${this.#ip}:52195/appCommand/perform?appCommandName=${command}`
		if (index !== undefined) {
			url = `${url}&index=${index}`
		}

    console.log('Sending app command')

		try {
			const {statusCode, body} = await request(url, {
				headers: {
					'Content-Type': 'application/json',
					...(this.authRequired && this.#status.authenticated ? { ProclaimAuthToken: this.#status.authToken } : {}),
				},
			})

      const data = await body.text()

      if (statusCode === 401 || statusCode === 403) {
        console.log(`Proclaim authentication failed: ${statusCode} ${data}`)
        this.#status.authenticated = false
        this.#status.authToken = ''
        return
      } else if (statusCode !== 200) {
        console.log(`Proclaim command failed: ${statusCode} ${data}`)
        return
      }

			if (data !== 'success') {
				console.log('debug', `Unexpected response from Proclaim: ${data}`)
			}
		} catch (error) {
			console.log('warn', `Proclaim command failed: ${error}`)
		}
	}

  /**
   * On being destroyed, clear the on-air polling interval
   */
  destroy(): void {
    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
  }
}
