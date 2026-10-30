import { request, Agent, setGlobalDispatcher, errors } from 'undici'
import { ProclaimStatus } from "./proclaim-status.js"
import { ServiceItemKind, ServicePart, type Presentation, type PresentationStatus } from './proclaim-types.js'
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
        this.#status.itemCount = presentation.serviceItems.length
        this.#status.songCount = presentation.serviceItems.filter((item) => item.kind === ServiceItemKind.SongLyrics).length

        // TODO: If we already have a current itemId, we should recalculate itemIndex, itemTitle, itemKind, itemSlideCount, servicePart which may have changed

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

  destroy(): void {
    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
  }
}
