export class ProclaimAPI {

  #ip?: string
  #password?: string

  #pollInterval?: ReturnType<typeof setInterval>

  constructor() {
  }

  get ip() {
    return this.#ip
  }

  get password() {
    return this.#password
  }

  get authRequired() {
    return this.#ip !== '127.0.0.1'
  }

  async configure(ip?: string, password?: string) {
    this.#ip = ip || '127.0.0.1'
    this.#password = password || ''

    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
    await this.initOnAirPolling()
  }

  private async initOnAirPolling() {
		this.#pollInterval = setInterval(() => {
			void this.onAirPoll()
		}, 1000)
		void this.onAirPoll()
  }

  private async onAirPoll() {
    // Placeholder for on-air polling logic
    console.log('Polling on-air status...');
  }

  destroy(): void {
    if (this.#pollInterval !== undefined) {
      clearInterval(this.#pollInterval)
    }
  }
}
