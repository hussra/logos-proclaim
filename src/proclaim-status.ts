import Emittery from 'emittery'
import type { Presentation } from './proclaim-types.js'

export interface ProclaimStatusEvents {
  'onAir': boolean
  'configured': boolean
  'configValid': boolean
  'connected': boolean
  'authenticated': boolean
  'sessionId': string
  'presentation': Presentation | null
  'presentationLocalRevision': number
  'step': number
}

export class ProclaimStatus extends Emittery<ProclaimStatusEvents> {
  #configured = false
  #configValid = false
  #connected = false
  #authenticated = false
  #onAir = false

  #sessionId = ''
  #authToken = ''

  #presentation: Presentation | null = null
  #presentationLocalRevision = 0
  #step = 0

  constructor() {
    super()
  }

  get configured() {
    return this.#configured
  }

  set configured(value: boolean) {
    if (this.#configured !== value) {
      this.#configured = value
      this.emit('configured', value)
    }
  }

  get configValid() {
    return this.#configValid
  }

  set configValid(value: boolean) {
    if (this.#configValid !== value) {
      this.#configValid = value
      this.emit('configValid', value)
    }
  }

  get connected() {
    return this.#connected
  }

  set connected(value: boolean) {
    if (this.#connected !== value) {
      this.#connected = value
      this.emit('connected', value)
    }
  }

  get authenticated() {
    return this.#authenticated
  }

  set authenticated(value: boolean) {
    if (this.#authenticated !== value) {
      this.#authenticated = value
      this.emit('authenticated', value)
    }
  }

  get onAir() {
    return this.#onAir
  }

  set onAir(value: boolean) {
    if (this.#onAir !== value) {
      this.#onAir = value
      this.emit('onAir', value)
    }
  }

  get sessionId() {
    return this.#sessionId
  }

  set sessionId(value: string) {
    if (this.#sessionId !== value) {
      this.#sessionId = value
      this.emit('sessionId', value)
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
      this.emit('presentation', value)
    }
  }

  get presentationLocalRevision() {
    return this.#presentationLocalRevision
  }

  set presentationLocalRevision(value: number) {
    if (this.#presentationLocalRevision !== value) {
      this.#presentationLocalRevision = value
      this.emit('presentationLocalRevision', value)
    }
  }

  get step() {
    return this.#step
  }

  set step(value: number) {
    if (this.#step !== value) {
      this.#step = value
      this.emit('step', value)
    }
  }
}
