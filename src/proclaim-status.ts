import { EventEmitter } from 'node:events'

export interface ProclaimStatusEvents {
  'onAirChanged': [onAir: boolean]
  'configuredChanged': [configured: boolean]
  'configValidChanged': [configValid: boolean]
  'connectedChanged': [connected: boolean]
}

export class ProclaimStatus extends EventEmitter<ProclaimStatusEvents> {
  #configured: boolean = false
  #configValid: boolean = false
  #connected: boolean = false
  #onAir: boolean = false

  constructor() {
    super()
  }

  get configured() {
    return this.#configured
  }

  set configured(value: boolean) {
    if (this.#configured !== value) {
      this.#configured = value
      this.emit('configuredChanged', value)
    }
  }

  get configValid() {
    return this.#configValid
  }

  set configValid(value: boolean) {
    if (this.#configValid !== value) {
      this.#configValid = value
      this.emit('configValidChanged', value)
    }
  }

  get connected() {
    return this.#connected
  }

  set connected(value: boolean) {
    if (this.#connected !== value) {
      this.#connected = value
      this.emit('connectedChanged', value)
    }
  }

  get onAir() {
    return this.#onAir
  }

  set onAir(value: boolean) {
    if (this.#onAir !== value) {
      this.#onAir = value
      this.emit('onAirChanged', value)
    }
  }
}
