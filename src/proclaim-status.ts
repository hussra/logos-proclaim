import Emittery from 'emittery'
import { MediaState, QuickScreenKind, ServiceItemKind, ServicePart, type Presentation } from './proclaim-types.js'

export enum LogLevel {
	DEBUG,
	INFO,
	WARN,
	ERROR,
}

/**
 * Event types for the ProclaimStatus object - emitted when the corresponding properties change
 */
export interface ProclaimStatusEvents {
	onAir: boolean
	configured: boolean
	configValid: boolean
	connected: boolean
	appCommandAPIAuthenticated: boolean
	sessionId: string
	localWiFiAPIAuthenticated: boolean
	presentation: Presentation | null
	itemCount: number
	songCount: number
	presentationLocalRevision: number
	step: number
	itemId: string
	itemIndex: number
	itemTitle: string
	itemKind: ServiceItemKind | null
	itemSlideCount: number
	slideIndex: number
	songIndex: number
	quickScreenKind: QuickScreenKind
	mediaState: MediaState
	servicePart: ServicePart | null
	stageDirection: string
	log: { level: LogLevel; message: string; error?: Error }
}

/**
 * Status object for the Proclaim API. Holds the various status values, and emits
 * events when their values change. No behaviour other than this.
 */
export class ProclaimStatus extends Emittery<ProclaimStatusEvents> {
	#configured = false
	#configValid = false
	#connected = false
	#appCommandAPIAuthenticated = false
	#onAir = false

	#sessionId = ''
	#appCommandAPIAuthToken = ''
	#localWiFiAPIAuthenticated = false
	#localWiFiAPIConnectionId = ''
	#localWifiAPIAuthToken = ''

	#presentation: Presentation | null = null
	#itemCount = 0
	#songCount = 0
	#presentationLocalRevision = 0
	#step = 0

	#itemId = ''
	#slideIndex = -1
	#itemIndex = -1
	#songIndex = -1
	#itemTitle = ''
	#itemKind: ServiceItemKind | null = null
	#itemSlideCount = 0
	#quickScreenKind = QuickScreenKind.None
	#mediaState = MediaState.Playing
	#servicePart: ServicePart | null = null
	#stageDirection = ''

	constructor() {
		super()
		this.initialize()
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
	get appCommandAPIAuthenticated() {
		return this.#appCommandAPIAuthenticated
	}

	set appCommandAPIAuthenticated(value: boolean) {
		if (this.#appCommandAPIAuthenticated !== value) {
			this.#appCommandAPIAuthenticated = value
			this.emit('appCommandAPIAuthenticated', value)
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
	get appCommandAPIAuthToken() {
		return this.#appCommandAPIAuthToken
	}

	set appCommandAPIAuthToken(value: string) {
		if (this.#appCommandAPIAuthToken !== value) {
			this.#appCommandAPIAuthToken = value
		}
	}

	get localWiFiAPIAuthenticated() {
		return this.#localWiFiAPIAuthenticated
	}

	set localWiFiAPIAuthenticated(value: boolean) {
		if (this.#localWiFiAPIAuthenticated !== value) {
			this.#localWiFiAPIAuthenticated = value
			this.emit('localWiFiAPIAuthenticated', value)
		}
	}

	/**
	 * Connection ID for the local Wi-Fi API
	 */
	get localWiFiAPIConnectionId() {
		return this.#localWiFiAPIConnectionId
	}

	set localWiFiAPIConnectionId(value: string) {
		if (this.#localWiFiAPIConnectionId !== value) {
			this.#localWiFiAPIConnectionId = value
		}
	}

	/**
	 * Auth token for the local Wi-Fi API
	 */
	get localWifiAPIAuthToken() {
		return this.#localWifiAPIAuthToken
	}

	set localWifiAPIAuthToken(value: string) {
		if (this.#localWifiAPIAuthToken !== value) {
			this.#localWifiAPIAuthToken = value
		}
	}

	/**
	 * The currently on-air presentation
	 */
	get presentation(): Readonly<Presentation> | null {
		return this.#presentation
	}

	set presentation(value: Presentation | null) {
		if (this.#presentation !== value) {
			this.#presentation = value
			this.emit('presentation', value)
		}
	}

	/**
	 * The number of service items in the presentation
	 */
	get itemCount() {
		return this.#itemCount
	}

	set itemCount(value: number) {
		if (this.#itemCount !== value) {
			this.#itemCount = value
			this.emit('itemCount', value)
		}
	}

	/**
	 * The number of song items in the presentation
	 */
	get songCount() {
		return this.#songCount
	}

	set songCount(value: number) {
		if (this.#songCount !== value) {
			this.#songCount = value
			this.emit('songCount', value)
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

	/**
	 * The ID of the currently showing service item
	 */
	get itemId() {
		return this.#itemId
	}

	set itemId(value: string) {
		if (this.#itemId !== value) {
			this.#itemId = value
			this.emit('itemId', value)
		}
	}

	/**
	 * The index (within its service item) of the currently showing slide
	 */
	get slideIndex() {
		return this.#slideIndex
	}

	set slideIndex(value: number) {
		if (this.#slideIndex !== value) {
			this.#slideIndex = value
			this.emit('slideIndex', value)
		}
	}

	/**
	 * The index of the currently showing service item
	 */
	get itemIndex() {
		return this.#itemIndex
	}

	set itemIndex(value: number) {
		if (this.#itemIndex !== value) {
			this.#itemIndex = value
			this.emit('itemIndex', value)
		}
	}

	/**
	 * The index of the currently showing song, or 0 if a song is not currently showing
	 */
	get songIndex() {
		return this.#songIndex
	}

	set songIndex(value: number) {
		if (this.#songIndex !== value) {
			this.#songIndex = value
			this.emit('songIndex', value)
		}
	}

	get itemTitle() {
		return this.#itemTitle
	}

	set itemTitle(value: string) {
		if (this.#itemTitle !== value) {
			this.#itemTitle = value
			this.emit('itemTitle', value)
		}
	}

	get itemKind(): ServiceItemKind | null {
		return this.#itemKind
	}

	set itemKind(value: ServiceItemKind | null) {
		if (this.#itemKind !== value) {
			this.#itemKind = value
			this.emit('itemKind', value)
		}
	}

	get itemSlideCount() {
		return this.#itemSlideCount
	}

	set itemSlideCount(value: number) {
		if (this.#itemSlideCount !== value) {
			this.#itemSlideCount = value
			this.emit('itemSlideCount', value)
		}
	}

	/**
	 * The currently showing quick screen type
	 */
	get quickScreenKind() {
		return this.#quickScreenKind
	}

	set quickScreenKind(value: QuickScreenKind) {
		if (this.#quickScreenKind !== value) {
			this.#quickScreenKind = value
			this.emit('quickScreenKind', value)
		}
	}

	/**
	 * The current media state
	 */
	get mediaState() {
		return this.#mediaState
	}

	set mediaState(value: MediaState) {
		if (this.#mediaState !== value) {
			this.#mediaState = value
			this.emit('mediaState', value)
		}
	}

	/**
	 * Which part of the service we are in - pre-service, warm-up, service or post-service
	 */
	get servicePart(): ServicePart | null {
		return this.#servicePart
	}

	set servicePart(value: ServicePart | null) {
		if (this.#servicePart !== value) {
			this.#servicePart = value
			this.emit('servicePart', value)
		}
	}

	get stageDirection(): string {
		return this.#stageDirection
	}

	set stageDirection(value: string) {
		if (this.#stageDirection !== value) {
			this.#stageDirection = value
			this.emit('stageDirection', value)
		}
	}

	initialize() {
		this.configured = false
		this.configValid = false
		this.connected = false
		this.appCommandAPIAuthenticated = false
		this.onAir = false

		this.sessionId = ''
		this.appCommandAPIAuthToken = ''
		this.localWiFiAPIAuthenticated = false
		this.localWiFiAPIConnectionId = ''
		this.localWifiAPIAuthToken = ''

		this.presentation = null
		this.itemCount = 0
		this.songCount = 0
		this.presentationLocalRevision = 0
		this.step = 0

		this.itemId = ''
		this.slideIndex = -1
		this.itemIndex = -1
		this.itemTitle = ''
		this.itemKind = null
		this.itemSlideCount = 0
		this.quickScreenKind = QuickScreenKind.None
		this.mediaState = MediaState.Playing
		this.servicePart = null
		this.#stageDirection = ''
	}
}
