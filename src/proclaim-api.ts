import { fetch } from 'undici'
import { ProclaimStatus } from "./proclaim-status.js"
import type { Presentation } from './proclaim-types.js'

export class ProclaimAPI {

  #ip?: string
  #password?: string

  #pollInterval?: ReturnType<typeof setInterval>

  #status: ProclaimStatus = new ProclaimStatus()

  constructor() {
  }

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

  // Internal event listeners for ProclaimStatus events
  private addEventListeners() {
    // When we get a new session ID, fetch the presentation data for that session
    this.#status.on('sessionIdChanged', async (sessionId) => {
      if (sessionId !== '') {
        this.#status.presentation = await this.getPresentation()
      } else {
        this.#status.presentation = null
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
    const url = `http://${this.#ip}:52195/onair/session`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
        },
      })

      if (response.ok) {
        const text = await response.text()
        this.#status.connected = true
        this.#status.onAir = (response.status === 200)
        this.#status.sessionId = (response.status === 200) ? text : ''
      }

    } catch (error) {
      this.#status.connected = false
      this.#status.onAir = false
      this.#status.sessionId = ''
    }
  }

  async getPresentation(): Promise<Presentation | null> {
		if (this.#status.sessionId.length === 0) {
			console.log('debug', 'No sessionId available, cannot fetch presentation')
			return null
		}

		const url = `http://${this.#ip}:52195/presentations/onair`

		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Onairsessionid: this.#status.sessionId,
			},
		})

		return response.ok ? ((await response.json()) as Presentation) : null
	}

  destroy(): void {
    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
  }
}
