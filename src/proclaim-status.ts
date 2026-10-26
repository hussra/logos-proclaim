import { EventEmitter } from 'node:events'
import type { Presentation } from './proclaim-types.js'

export interface ProclaimStatusEvents {
  'onAirChanged': [onAir: boolean]
  'configuredChanged': [configured: boolean]
  'configValidChanged': [configValid: boolean]
  'connectedChanged': [connected: boolean]
  'authenticatedChanged': [authenticated: boolean]
  'sessionIdChanged': [sessionId: string]
  'presentationChanged': [presentation: Presentation | null]
}

export class ProclaimStatus extends EventEmitter<ProclaimStatusEvents> {
  #configured: boolean = false
  #configValid: boolean = false
  #connected: boolean = false
  #authenticated: boolean = false
  #onAir: boolean = false

  #sessionId: string = ''
  #authToken: string = ''
  #presentation: Presentation | null = null

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

  get authenticated() {
    return this.#authenticated
  }

  set authenticated(value: boolean) {
    if (this.#authenticated !== value) {
      this.#authenticated = value
      this.emit('authenticatedChanged', value)
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

  get sessionId() {
    return this.#sessionId
  }

  set sessionId(value: string) {
    if (this.#sessionId !== value) {
      this.#sessionId = value
      this.emit('sessionIdChanged', value)
    }
  }

  get authToken() {
    return this.#authToken
  }

  set authToken(value: string) {
    if (this.#authToken !== value) {
      this.#authToken = value
    }
  }

  get presentation() {
    return this.#presentation
  }

  set presentation(value: Presentation | null) {
    if (this.#presentation !== value) {
      this.#presentation = value
      this.emit('presentationChanged', value)
    }
  }
}
