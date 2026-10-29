import { request, Agent, setGlobalDispatcher, errors } from 'undici'
import { ProclaimStatus } from "./proclaim-status.js"
import type { Presentation, PresentationStatus } from './proclaim-types.js'

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

  private get authRequired() {
    return this.#ip !== '127.0.0.1'
  }

  get status(): ProclaimStatus {
    return this.#status
  }

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

  // Internal event listeners for ProclaimStatus events
  private addEventListeners() {
    // When we get a new session ID, fetch the presentation data for that session and set the current step to 0
    this.#status.on('sessionId', async ({data}) => {
      if (data !== '') {
        this.#status.step = 0
        await this.loadPresentation()
      } else {
        this.#status.presentation = null
      }
    })

    // When we load a new presentation, note its local revision and start checking presentation status
    this.#status.on('presentation', ({data}) => {
      if (data === null) {
        return
      }
      this.#status.presentationLocalRevision = data.localRevision

      // If we already have a #statusPromise, don't create another
      if (!this.#statusPromise) {
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
  }

  private async initOnAirPolling() {
		this.#pollInterval = setInterval(() => {
			void this.onAirPoll()
		}, 1000)
		void this.onAirPoll()
  }

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
        this.#status.onAir = (statusCode === 200)
        this.#status.sessionId = (statusCode === 200) ? text : ''

      } else {
        // Some other unexpected status code - set disconnected, set off air, clear session ID, clear presentation
        this.#status.connected = false
        this.#status.onAir = false
        this.#status.sessionId = ''
        this.#status.presentation = null
      }

    } catch (error) {
      // Some unexpected error - set disconnected, set off air, clear session ID, clear presentation
      const undiciError = error as errors.UndiciError
      if ((undiciError.code !== 'ECONNREFUSED') && (undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT')) {
        console.error('Error polling onAir session:', error)
      }

      this.#status.connected = false
      this.#status.onAir = false
      this.#status.sessionId = ''
      this.#status.presentation = null
    }
  }

  private async loadPresentation() {
		if (this.#status.sessionId.length === 0) {
			console.log('debug', 'No sessionId available, cannot fetch presentation')
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
        this.#status.presentation = (await body.json()) as Presentation

      } else if (statusCode === 404) {
        // Off air - set off air, clear session ID, clear presentation
        this.#status.onAir = false
        this.#status.sessionId = ''
        this.#status.presentation = null

      } else {
        // Some other unexpected status code - set disconnected, set off air, clear session ID, clear presentation
        this.#status.connected = false
        this.#status.onAir = false
        this.#status.sessionId = ''
        this.#status.presentation = null
      }

    } catch (error) {
      // Some unexpected error - set disconnected, set off air, clear session ID, clear presentation
      const undiciError = error as errors.UndiciError
      if ((undiciError.code !== 'ECONNREFUSED') && (undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT')) {
        console.error('Connection refused retrieving presentation data:', error)
      }

      this.#status.connected = false
      this.#status.onAir = false
      this.#status.sessionId = ''
      this.#status.presentation = null
    }
	}

  private async getPresentationStatus() {
    // Call /onair/statusChanged to get current presentation status, passing the current session ID, presentation
    // local revision and step. If the details sent are all current, Proclaim will long-poll for up to a minute
    // before responding.
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

        // Update the current local revision and step
        this.#status.step = status.status.revision
        this.#status.presentationLocalRevision = status.presentationLocalRevision

        // TODO: add more ProclaimStatus properties for other returned values
        console.log(`Presentation status: ${JSON.stringify(status, null, 2)}`)

        // Call getPresentationStatus() again to get the next status update
        this.#statusPromise = this.getPresentationStatus()

      } else if (statusCode === 404) {
        // Off air - set off air, clear session ID, clear presentation
        this.#status.onAir = false
        this.#status.sessionId = ''
        this.#status.presentation = null
        this.#statusPromise = null

      } else {
        // Some other unexpected status code - set disconnected, set off air, clear session ID, clear presentation
        this.#status.connected = false
        this.#status.onAir = false
        this.#status.sessionId = ''
        this.#status.presentation = null
        this.#statusPromise = null
      }

    } catch (error) {
      // Some unexpected error - set disconnected, set off air, clear session ID, clear presentation
      const undiciError = error as errors.UndiciError
      if ((undiciError.code !== 'ECONNREFUSED') && (undiciError.code !== 'UND_ERR_CONNECT_TIMEOUT')) {
        console.error('Connection refused retrieving presentation status:', error)
      }

      this.#status.connected = false
      this.#status.onAir = false
      this.#status.sessionId = ''
      this.#status.presentation = null
      this.#statusPromise = null
    }
  }

  destroy(): void {
    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
  }
}
