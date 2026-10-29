import Emittery from 'emittery'
import type { Presentation } from './proclaim-types.js'

/**
 * Event types for the ProclaimStatus object - emitted when the corresponding properties change
 */
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

/**
 * Status object for the Proclaim API. Holds the various status values, and emits
 * events when their values change. No behaviour other than this.
 */
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

  /**
   * Is the ProclaimAPI object configured?
   */
  get configured() {
    return this.#configured
  }

  set configured(value: boolean) {
    if (this.#configured !== value) {
      this.#configured = value
      this.emit('configured', value)
    }
  }

  /**
   * Is the ProclaimAPI object configuration valid?
   */
  get configValid() {
    return this.#configValid
  }

  set configValid(value: boolean) {
    if (this.#configValid !== value) {
      this.#configValid = value
      this.emit('configValid', value)
    }
  }

  /**
   * Is the ProclaimAPI object connected to Proclaim (i.e. Proclaim is running and reachable)?
   */
  get connected() {
    return this.#connected
  }

  set connected(value: boolean) {
    if (this.#connected !== value) {
      this.#connected = value
      this.emit('connected', value)
    }
  }

  /**
   * Is the ProclaimAPI object authenticated to the App Command API?
   */
  get authenticated() {
    return this.#authenticated
  }

  set authenticated(value: boolean) {
    if (this.#authenticated !== value) {
      this.#authenticated = value
      this.emit('authenticated', value)
    }
  }

  /**
   * Is Proclaim on air?
   */
  get onAir() {
    return this.#onAir
  }

  set onAir(value: boolean) {
    if (this.#onAir !== value) {
      this.#onAir = value
      this.emit('onAir', value)
    }
  }

  /**
   * The Proclaim on-air session ID
   */
  get sessionId() {
    return this.#sessionId
  }

  set sessionId(value: string) {
    if (this.#sessionId !== value) {
      this.#sessionId = value
      this.emit('sessionId', value)
    }
  }

  /**
   * The auth token for the App Command API
   */
  get authToken() {
    return this.#authToken
  }

  set authToken(value: string) {
    if (this.#authToken !== value) {
      this.#authToken = value
    }
  }

  /**
   * The currently on-air presentation
   */
  get presentation() {
    return this.#presentation
  }

  set presentation(value: Presentation | null) {
    if (this.#presentation !== value) {
      this.#presentation = value
      this.emit('presentation', value)
    }
  }

  /**
   * The currently on-air presentation's local revison number - used to detect changes to the presentation while on air
   */
  get presentationLocalRevision() {
    return this.#presentationLocalRevision
  }

  set presentationLocalRevision(value: number) {
    if (this.#presentationLocalRevision !== value) {
      this.#presentationLocalRevision = value
      this.emit('presentationLocalRevision', value)
    }
  }

  /**
   * The currently on-air presentation's "step" - increments with each change to a new slide
   */
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
