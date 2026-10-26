import { ProclaimStatus } from "./proclaim-status.js"
export { ProclaimStatus } from "./proclaim-status.js"
export type { ProclaimStatusEvents } from "./proclaim-status.js"

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

  get status(): ProclaimStatus {
    return this.#status
  }

  async configure(ip?: string, password?: string) {
    this.#ip = ip || '127.0.0.1'
    this.#password = password || ''

    this.#status.configured = true
    this.#status.configValid = this.configIsValid()

    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
    await this.initOnAirPolling()
  }

  private authRequired() {
    return this.#ip !== '127.0.0.1'
  }

  private configIsValid() {
    if (!this.#ip || this.#ip.trim() === '') {
      return false
    }
    // Additional validation logic can be added here
    if (this.authRequired()) {
      if (!this.#password || this.#password.trim() === '') {
        return false
      }
    }
    return true
  }

  private async initOnAirPolling() {
		this.#pollInterval = setInterval(() => {
			void this.onAirPoll()
		}, 1000)
		void this.onAirPoll()
  }

  private async onAirPoll() {
    // Placeholder for on-air polling logic
    console.log('Polling Proclaim status...');
  }

  destroy(): void {
    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
  }
}
