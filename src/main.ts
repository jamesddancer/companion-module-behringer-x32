import { GetActionsList } from './actions/main.js'
import { X32Config, GetConfigFields } from './config.js'
import { FeedbackId, GetFeedbacksList } from './feedback.js'
import { GetPresetsList } from './presets.js'
import { IStoredChannelObserver, X32State, X32Subscriptions } from './state.js'
import osc from 'osc'
import {
	BooleanFeedbackUpgradeMap,
	upgradeChannelOrFaderValuesFromOscPaths,
	upgradeToBuiltinFeedbackInverted,
	upgradeToBuiltinVariableParsing,
	upgradeSetFadeDurationDefaults,
} from './upgrades.js'
import debounceFn from 'debounce-fn'
import PQueue from 'p-queue'
import { X32Transitions } from './transitions.js'
import { X32DeviceDetectorInstance } from './device-detector.js'
import {
	CompanionStaticUpgradeScript,
	InstanceBase,
	SomeCompanionConfigField,
	CreateConvertToBooleanFeedbackUpgradeScript,
	EmptyUpgradeScript,
	InstanceStatus,
	OSCSomeArguments,
} from '@companion-module/base'
import { padNumber, type InstanceBaseExt, type X32Types } from './util.js'
import {
	METER_DB_CHANGE_THRESHOLD,
	METER_SOURCES,
	METER_TIME_FACTOR,
	meterLinearToDb,
	meterStatePath,
	parseMetersBlob,
} from './meters.js'
import { SHOW_VARIABLE_IDS, STORED_CHANNEL_ID, VariableDefinitions } from './variables/main.js'
import { GetCompanionVariableDefinitions, GetCompanionVariableValues } from './variables/init.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<X32Config>[] = [
	EmptyUpgradeScript, // Previous version had a script
	EmptyUpgradeScript, // This script was for Companion 2.x to 3.0, and was not worth the effort to fixup for the newer api
	CreateConvertToBooleanFeedbackUpgradeScript(BooleanFeedbackUpgradeMap),
	upgradeToBuiltinFeedbackInverted,
	upgradeChannelOrFaderValuesFromOscPaths, // 4.0.0
	upgradeToBuiltinVariableParsing, // 4.0.1
	upgradeChannelOrFaderValuesFromOscPaths, // 4.0.2 - run it again, as some bugs mean some stuff was missed
	upgradeSetFadeDurationDefaults, // 4.0.3
]

/**
 * Companion instance class for the Behringer X32 Mixers.
 */
export default class X32Instance extends InstanceBase<X32Types> implements InstanceBaseExt, IStoredChannelObserver {
	private osc: osc.UDPPort
	private x32State: X32State
	private x32Subscriptions: X32Subscriptions
	private transitions: X32Transitions
	public config: X32Config = {}

	/** Ping the x32 at a regular interval to tell it to keep sending us info, and for us to check it is still there */
	private heartbeat: NodeJS.Timeout | undefined
	/** Delay a reconnect a few seconds after an error, or monitor the ping for lack of response */
	private reconnectTimer: NodeJS.Timeout | undefined
	/** Once we have an osc socket ready, we send /xinfo on repeat until we get a response */
	private syncInterval: NodeJS.Timeout | undefined
	/** subscribe interval, we need to resubscribe atleast every 10 seconds to keep the subscription going
	 * we are using 5 seconds to be safe */
	private subscribeInterval: NodeJS.Timeout | undefined

	/** Last status passed to Companion, so heartbeat /xinfo replies do not spam the log */
	private lastInstanceStatus: InstanceStatus | undefined
	private lastInstanceStatusMessage: string | undefined

	private readonly debounceUpdateCompanionBits: () => void
	private readonly requestQueue: PQueue = new PQueue({
		concurrency: 20,
		timeout: 500,
	})
	private inFlightRequests: { [path: string]: () => void } = {}

	private readonly messageFeedbacks = new Set<FeedbackId>()
	private readonly debounceMessageFeedbacks: () => void

	private readonly invalidatedVariables = new Set<string>()
	private readonly debounceUpdateVariables: () => void
	private readonly variableInvalidationMap = new Map<string, string[]>()
	private readonly tapTimes = new Map<string, number>()
	private readonly lastMeterDb = new Map<string, number>()

	/**
	 * Create an instance of an X32 module.
	 */
	constructor(internal: unknown) {
		super(internal)

		this.osc = new osc.UDPPort({})
		this.x32State = new X32State()
		this.x32Subscriptions = new X32Subscriptions()
		this.transitions = new X32Transitions(this)
		this.x32State.attach(this)

		this.debounceUpdateCompanionBits = debounceFn(this.updateCompanionBits.bind(this), {
			wait: 100,
			maxWait: 500,
			before: false,
			after: true,
		})

		this.debounceMessageFeedbacks = debounceFn(
			() => {
				console.log('fire feedbacks')
				const feedbacks = Array.from(this.messageFeedbacks)
				this.messageFeedbacks.clear()
				if (feedbacks.length > 0) {
					this.checkFeedbacks(feedbacks[0], ...feedbacks.slice(1))
				}
			},
			{
				wait: 100,
				maxWait: 500,
				before: true,
				after: true,
			},
		)
		this.debounceUpdateVariables = debounceFn(
			() => {
				// console.log('fire variables')
				const variables = new Set(this.invalidatedVariables.values())
				this.invalidatedVariables.clear()

				this.setVariableValues(GetCompanionVariableValues(this.x32State, variables))
			},
			{
				wait: 100,
				maxWait: 500,
				before: true,
				after: true,
			},
		)

		// Build a map of osc paths to variableIds, so we can easily invalidate variables when we get an update for an osc path
		for (const [variableId, variableDef] of Object.entries(VariableDefinitions)) {
			if (variableDef.oscPath) {
				const existing = this.variableInvalidationMap.get(variableDef.oscPath) ?? []
				existing.push(variableId)
				this.variableInvalidationMap.set(variableDef.oscPath, existing)
			}
			if (variableDef.additionalPaths) {
				for (const additionalPath of variableDef.additionalPaths) {
					const existing = this.variableInvalidationMap.get(additionalPath) ?? []
					existing.push(variableId)
					this.variableInvalidationMap.set(additionalPath, existing)
				}
			}
		}
	}

	// IStoredChannelObserver
	storedChannelChanged(): void {
		this.invalidatedVariables.add(STORED_CHANNEL_ID)
		this.debounceUpdateVariables()

		this.messageFeedbacks.add('stored-channel')
		this.messageFeedbacks.add('route-user-in')
		this.messageFeedbacks.add('route-user-out')
		this.debounceMessageFeedbacks()
	}

	/**
	 * Update Companion instance status only when the status or message actually changes.
	 * The OSC heartbeat sends /xinfo every 1.5s; repeating InstanceStatus.Ok each time
	 * was logged as "Status: ok - null".
	 */
	private setInstanceStatus(status: InstanceStatus, message?: string): void {
		if (this.lastInstanceStatus === status && this.lastInstanceStatusMessage === message) {
			return
		}
		this.lastInstanceStatus = status
		this.lastInstanceStatusMessage = message
		this.updateStatus(status, message)
	}

	/**
	 * Main initialization function called once the module
	 * is OK to start doing things.
	 */
	public async init(config: X32Config): Promise<void> {
		this.config = config

		this.setInstanceStatus(InstanceStatus.Connecting)
		this.setupOscSocket()

		X32DeviceDetectorInstance.subscribe(this.id)

		this.updateCompanionBits()
	}

	/**
	 * Process an updated configuration array.
	 */
	public async configUpdated(config: X32Config): Promise<void> {
		this.config = config
		this.x32State.detach(this)
		this.x32State = new X32State()
		this.x32State.attach(this)
		this.lastMeterDb.clear()
		this.tapTimes.clear()

		this.x32Subscriptions = new X32Subscriptions()

		this.transitions.stopAll()
		this.transitions = new X32Transitions(this)

		if (this.config.host !== undefined) {
			this.setInstanceStatus(InstanceStatus.Connecting)
			this.setupOscSocket()
			this.updateCompanionBits()
		}
	}

	/**
	 * Creates the configuration fields for web config.
	 */
	public getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/**
	 * Clean up the instance before it is destroyed.
	 */
	public async destroy(): Promise<void> {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
		if (this.syncInterval) {
			clearInterval(this.syncInterval)
			this.syncInterval = undefined
		}

		if (this.heartbeat) {
			clearInterval(this.heartbeat)
			this.heartbeat = undefined
		}

		if (this.subscribeInterval) {
			clearInterval(this.subscribeInterval)
			this.subscribeInterval = undefined
		}
		X32DeviceDetectorInstance.unsubscribe(this.id)

		this.transitions.stopAll()
		this.x32State.detach(this)

		if (this.osc) {
			try {
				this.osc.close()
			} catch (_e) {
				// Ignore
			}
			// delete this.osc
		}

		this.log('debug', 'destroy')
	}

	private updateCompanionBits(): void {
		this.setVariableDefinitions(GetCompanionVariableDefinitions())
		this.setVariableValues(GetCompanionVariableValues(this.x32State))

		this.setFeedbackDefinitions(GetFeedbacksList(this, this.x32State, this.x32Subscriptions, this.queueEnsureLoaded))
		this.setActionDefinitions(
			GetActionsList({
				transitions: this.transitions,
				state: this.x32State,
				ensureLoaded: this.queueEnsureLoaded,
				recordTapTempo: this.recordTapTempo,
				sendOsc: (cmd: string, args: OSCSomeArguments): void => {
					// HACK: We send commands on a different port than we run /xremote on, so that we get change events for what we send.
					// Otherwise we can have no confirmation that a command was accepted
					// console.log(`osc command: ${cmd} ${JSON.stringify(args)}`)

					if (this.config.host) {
						this.oscSend(this.config.host, 10023, cmd, args)
					}
				},
			}),
		)

		this.setPresetDefinitions(...GetPresetsList(this, this.x32State))

		this.checkAllFeedbacks()

		// Ensure all feedbacks & actions have an initial value, if we are connected
		if (this.heartbeat) {
			this.subscribeActions()
		}
	}

	private pulse(): void {
		try {
			this.osc.send({
				address: '/xremote',
				args: [],
			})

			if (!this.syncInterval) {
				// Once handshaked, poll something with a response
				this.osc.send({ address: '/xinfo', args: [] })
				if (!this.reconnectTimer) {
					this.reconnectTimer = setTimeout(() => {
						// Timed out
						this.reconnectTimer = undefined
						this.setupOscSocket()
					}, 5000)
				}
			}
		} catch (_e) {
			// Ignore
		}
	}

	private setupOscSocket(): void {
		this.setInstanceStatus(InstanceStatus.Connecting)

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
		if (this.syncInterval) {
			clearInterval(this.syncInterval)
			this.syncInterval = undefined
		}

		if (this.osc) {
			try {
				this.osc.close()
			} catch (_e) {
				// Ignore
			}
		}

		this.osc = new osc.UDPPort({
			localAddress: '0.0.0.0',
			localPort: 0,
			broadcast: true,
			metadata: true,
			remoteAddress: this.config.host,
			remotePort: 10023,
		})

		this.osc.on('error', (err: Error): void => {
			this.log('error', `Error: ${err.message}`)
			this.setInstanceStatus(InstanceStatus.ConnectionFailure, err.message)
			this.requestQueue.clear()
			this.inFlightRequests = {}

			if (this.heartbeat) {
				clearInterval(this.heartbeat)
				this.heartbeat = undefined
			}

			if (this.subscribeInterval) {
				clearInterval(this.subscribeInterval)
				this.subscribeInterval = undefined
			}

			if (!this.reconnectTimer) {
				this.reconnectTimer = setTimeout(() => {
					if (this.syncInterval) {
						clearInterval(this.syncInterval)
						this.syncInterval = undefined
					}

					this.reconnectTimer = undefined
					this.setupOscSocket()
				}, 2000)
			}
		})
		this.osc.on('ready', () => {
			this.pulse()
			this.heartbeat = setInterval(() => {
				this.pulse()
			}, 1500)

			this.subscribeForUpdates()
			this.subscribeInterval = setInterval(() => {
				this.subscribeForUpdates()
			}, 5000)

			this.requestQueue.clear()
			this.inFlightRequests = {}

			const doSync = (): void => {
				if (this.osc) {
					try {
						this.osc.send({ address: '/xinfo', args: [] })
						this.osc.send({ address: '/-snap/name', args: [] })
						this.osc.send({ address: '/-snap/index', args: [] })
					} catch (_e) {
						// Ignore
					}
				}
			}
			if (!this.syncInterval) {
				this.syncInterval = setInterval(doSync, 2000)
			}
			doSync()

			this.setInstanceStatus(InstanceStatus.Connecting, 'Syncing')
		})

		this.osc.on('close' as any, () => {
			if (this.heartbeat !== undefined) {
				clearInterval(this.heartbeat)
				this.heartbeat = undefined
			}

			if (this.subscribeInterval) {
				clearInterval(this.subscribeInterval)
				this.subscribeInterval = undefined
			}
		})

		this.osc.on('message', (message): void => {
			// console.log('Message', message)
			const args = message.args as osc.MetaArgument[]
			this.x32State.set(message.address, args)

			if (message.address === '/meters/0' || message.address === '/meters/2') {
				this.handleMeters(message.address, args)
				return
			}

			if (this.inFlightRequests[message.address]) {
				this.inFlightRequests[message.address]()
				delete this.inFlightRequests[message.address]
			}

			this.triggerInvalidationsFromOsc(message)

			switch (message.address) {
				case '/xinfo':
					this.setInstanceStatus(InstanceStatus.Ok)

					if (this.reconnectTimer) {
						// Clear the timer, as it is alive
						clearTimeout(this.reconnectTimer)
						this.reconnectTimer = undefined
					}

					if (this.syncInterval) {
						// Sync success, stop the interval
						clearInterval(this.syncInterval)
						this.syncInterval = undefined

						// Load the initial data
						this.loadVariablesData()
						this.loadPresetData()
						this.ensureCurrentShowNames()
					}
					break
			}
		})

		this.osc.open()
	}

	// called every 5 seconds while there is an osc connection to keep subscriptions open
	private subscribeForUpdates(): void {
		if (this.osc) {
			try {
				this.osc.send({
					address: '/subscribe',
					args: [
						{ type: 's', value: '/-stat/tape/etime' },
						{ type: 'i', value: 20 },
					],
				})
				if (this.config.enableMeters) {
					for (const meter of ['/meters/0', '/meters/2']) {
						this.osc.send({
							address: '/meters',
							args: [
								{ type: 's', value: meter },
								{ type: 'i', value: METER_TIME_FACTOR },
							],
						})
					}
				}
			} catch (_e) {
				// Ignore
			}
		}
	}

	public recordTapTempo = (key: string, maxIntervalMs: number): number | null => {
		const now = Date.now()
		const previous = this.tapTimes.get(key)
		this.tapTimes.set(key, now)
		if (previous === undefined) return null

		const delta = now - previous
		if (delta < 50 || delta > maxIntervalMs) return null

		this.x32State.set('/tap/tempo', [{ type: 'i', value: Math.round(delta) }])
		this.invalidatedVariables.add('tap_tempo_ms')
		this.invalidatedVariables.add('tap_tempo_bpm')
		this.debounceUpdateVariables()
		return delta
	}

	private ensureCurrentShowNames(): void {
		const indexArgs = this.x32State.get('/-show/prepos/current')
		const index = indexArgs && indexArgs[0]?.type === 'i' ? indexArgs[0].value : 0
		const padded = padNumber(index, 3)
		for (const kind of ['cue', 'scene', 'snippet'] as const) {
			const path = `/-show/showfile/${kind}/${padded}/name`
			const existing = this.variableInvalidationMap.get(path) ?? []
			for (const id of SHOW_VARIABLE_IDS) {
				if (!existing.includes(id)) existing.push(id)
			}
			this.variableInvalidationMap.set(path, existing)
			this.queueEnsureLoaded(path)
		}
	}

	private handleMeters(address: string, args: osc.MetaArgument[]): void {
		const raw = args[0]
		const blob = raw && raw.type === 'b' ? raw.value : undefined
		const values = parseMetersBlob(blob)
		if (!values) return

		const changedVariableIds: string[] = []
		for (const source of METER_SOURCES) {
			let linear: number | undefined
			if (address === '/meters/0' && source.meters0Index >= 0) {
				linear = values[source.meters0Index]
			} else if (address === '/meters/2' && source.meters2Index !== undefined) {
				linear = values[source.meters2Index]
			}
			if (linear === undefined) continue

			const db = meterLinearToDb(linear)
			const previousDb = this.lastMeterDb.get(source.id)
			const previousArgs = this.x32State.get(meterStatePath(source.id))
			const previousLinear = previousArgs && previousArgs[0]?.type === 'f' ? previousArgs[0].value : undefined
			const clipChanged = previousLinear !== undefined && previousLinear >= 1 !== linear >= 1
			const previousSignal = previousLinear !== undefined && meterLinearToDb(previousLinear) >= -60
			const signalChanged = previousLinear !== undefined && previousSignal !== db >= -60
			const dbChanged =
				previousDb === undefined ||
				!Number.isFinite(previousDb) ||
				!Number.isFinite(db) ||
				Math.abs(db - previousDb) >= METER_DB_CHANGE_THRESHOLD

			if (!dbChanged && !clipChanged && !signalChanged) continue

			this.lastMeterDb.set(source.id, db)
			this.x32State.set(meterStatePath(source.id), [{ type: 'f', value: linear }])
			changedVariableIds.push(source.variableId)
			for (const feedbackId of this.x32Subscriptions.getFeedbacks(meterStatePath(source.id))) {
				this.messageFeedbacks.add(feedbackId)
			}
		}

		if (changedVariableIds.length > 0) {
			changedVariableIds.forEach((id) => this.invalidatedVariables.add(id))
			this.debounceUpdateVariables()
			this.debounceMessageFeedbacks()
		}
	}

	private loadVariablesData(): void {
		for (const definition of Object.values(VariableDefinitions)) {
			if (definition.oscPath) this.queueEnsureLoaded(definition.oscPath)
			if (definition.additionalPaths) {
				definition.additionalPaths.forEach(this.queueEnsureLoaded)
			}
		}
	}

	private loadPresetData(): void {
		// TODO: Is this still needed?
		const options = [...Array(100).keys()].map((x) => `${x + 1}`.padStart(3, '0'))
		options.forEach((option) => {
			;['ch', 'fx', 'r', 'mon'].forEach((lib) => {
				this.queueEnsureLoaded(`/-libs/${lib}/${option}/hasdata`)
				this.queueEnsureLoaded(`/-libs/${lib}/${option}/name`)
			})
		})
	}

	private queueEnsureLoaded = (path: string | undefined): void => {
		if (!path) return

		this.requestQueue
			.add(async () => {
				if (this.inFlightRequests[path]) {
					this.log('debug', `Ignoring request "${path}" as one in flight`)
					return
				}

				if (this.x32State.get(path)) {
					this.log('debug', `Ignoring request "${path}" as data is already loaded`)
					return
				}

				// console.log('starting request', path)

				const p = new Promise<void>((resolve) => {
					this.inFlightRequests[path] = resolve
				})

				this.osc.send({
					address: path,
					args: [],
				})

				await p
			})
			.catch((e: unknown) => {
				delete this.inFlightRequests[path]
				this.log('error', `Request failed for "${path}": (${e})`)

				// TODO If a timeout, can/should we retry it?
			})
	}

	private triggerInvalidationsFromOsc(msg: osc.OscMessage): void {
		// Check for any feedbacks to invalidate
		const toUpdate = this.x32Subscriptions.getFeedbacks(msg.address)
		if (toUpdate.length > 0) {
			toUpdate.forEach((f) => this.messageFeedbacks.add(f))
			this.debounceMessageFeedbacks()
		}

		// Check for any variables to invalidate
		const variableIds = this.variableInvalidationMap.get(msg.address)
		if (variableIds) {
			variableIds.forEach((id) => this.invalidatedVariables.add(id))
			this.debounceUpdateVariables()
		}

		// Name changes mean the actions&feedbacks need to be regenerated
		if (msg.address.match('/config/name$')) {
			this.debounceUpdateCompanionBits()
		}

		if (msg.address === '/-show/prepos/current' || msg.address === '/-prefs/show_control') {
			this.ensureCurrentShowNames()
			for (const id of SHOW_VARIABLE_IDS) this.invalidatedVariables.add(id)
			this.debounceUpdateVariables()
		}
	}
}
