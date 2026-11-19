import type { OSCMetaArgument, StringKeys } from '@companion-module/base'
import { getStringArg } from './util.js'
import type { X32State } from '../state.js'
import {
	getColorChoiceFromId,
	GetHeadampChoices,
	GetNameFromState,
	GetTargetPaths,
	getDcaSpillLabel,
} from '../choices.js'
import { floatToDB, floatToHeadampGain, floatToHpfHz, floatToTrim, padNumber } from '../util.js'
import { parseHeadampRef } from '../paths.js'
import { formatMeterDb, meterLinearToDb, meterStatePath, METER_SOURCES } from '../meters.js'
import { VariablesSchema } from './schema.js'

export type MyVariableDefinition<K extends keyof VariablesSchema> = {
	// variableId: K
	name: string
	oscPath: string | null
	additionalPaths?: string[]
	getValue: (args: OSCMetaArgument[] | undefined, state: X32State) => VariablesSchema[K] | undefined
}

/**
 * The definition of a variable
 */
export type MyVariableDefinitions = {
	[variableId in StringKeys<VariablesSchema>]: MyVariableDefinition<variableId>
}

const allSources = GetTargetPaths({
	allowStereo: true,
	allowMono: true,
	allowChannel: true,
	allowAuxIn: true,
	allowFx: true,
	allowBus: true,
	allowMatrix: true,
	allowDca: true,
})
const busSources = GetTargetPaths({ allowBus: true })
const matrixSendSources = GetTargetPaths({ allowStereo: true, allowMono: true, allowBus: true })
const matrixSources = GetTargetPaths({ allowMatrix: true })

const sendToBusSources = GetTargetPaths({
	allowChannel: true,
	allowAuxIn: true,
	allowFx: true,
})

export const STORED_CHANNEL_ID = 'stored_channel'

export const VariableDefinitions: MyVariableDefinitions = {
	m_name: {
		name: 'Device name',
		oscPath: '/xinfo',
		getValue: (args) => getStringArg(args, 1),
	},
	m_model: {
		name: 'Device model',
		oscPath: '/xinfo',
		getValue: (args) => getStringArg(args, 2),
	},
	m_fw: {
		name: 'Device firmware',
		oscPath: '/xinfo',
		getValue: (args) => getStringArg(args, 3),
	},
	tape_time_ms: {
		name: 'Tape Timestamp mm:ss',
		oscPath: '/-stat/tape/etime',
		getValue: (args) => {
			const time = args && args[0]?.type === 'i' ? args[0].value : 0
			const mm = `${Math.floor(time / 60) % 60}`.padStart(2, '0')
			const ss = `${time % 60}`.padStart(2, '0')
			return `${mm}:${ss}`
		},
	},
	tape_time_hms: {
		name: 'Tape Timestamp hh:mm:ss',
		oscPath: '/-stat/tape/etime',
		getValue: (args) => {
			const time = args && args[0]?.type === 'i' ? args[0].value : 0
			const hh = `${Math.floor(time / 3600)}`.padStart(2, '0')
			const mm = `${Math.floor(time / 60) % 60}`.padStart(2, '0')
			const ss = `${time % 60}`.padStart(2, '0')
			return `${hh}:${mm}:${ss}`
		},
	},
	urec_etime_ms: {
		name: 'Urec Timestamp mm:ss',
		oscPath: '/-stat/urec/etime',
		getValue: (args) => {
			const time = args && args[0]?.type === 'i' ? args[0].value : 0
			const mm = `${Math.floor(time / 1000 / 60) % 60}`.padStart(2, '0')
			const ss = `${Math.floor(time / 1000) % 60}`.padStart(2, '0')
			return `${mm}:${ss}`
		},
	},
	urec_etime_hms: {
		name: 'Urec Timestamp hh:mm:ss',
		oscPath: '/-stat/urec/etime',
		getValue: (args) => {
			const time = args && args[0]?.type === 'i' ? args[0].value : 0
			const mm = `${Math.floor(time / 1000 / 60) % 60}`.padStart(2, '0')
			const ss = `${Math.floor(time / 1000) % 60}`.padStart(2, '0')
			const hh = `${Math.floor(time / 1000 / 60 / 60) % 60}`.padStart(2, '0')
			return `${hh}:${mm}:${ss}`
		},
	},
	urec_rtime_ms: {
		name: 'Urec remaining mm:ss',
		oscPath: '/-stat/urec/rtime',
		getValue: (args) => {
			const time = args && args[0]?.type === 'i' ? args[0].value : 0
			const mm = `${Math.floor(time / 1000 / 60) % 60}`.padStart(2, '0')
			const ss = `${Math.floor(time / 1000) % 60}`.padStart(2, '0')
			return `${mm}:${ss}`
		},
	},
	urec_rtime_hms: {
		name: 'Urec remaining hh:mm:ss',
		oscPath: '/-stat/urec/rtime',
		getValue: (args) => {
			const time = args && args[0]?.type === 'i' ? args[0].value : 0
			const mm = `${Math.floor(time / 1000 / 60) % 60}`.padStart(2, '0')
			const ss = `${Math.floor(time / 1000) % 60}`.padStart(2, '0')
			const hh = `${Math.floor(time / 1000 / 60 / 60) % 60}`.padStart(2, '0')
			return `${hh}:${mm}:${ss}`
		},
	},
	[STORED_CHANNEL_ID]: {
		name: 'Stored channel',
		oscPath: null,
		getValue: (_args, state) => state.getStoredChannel(),
	},
	selected_channel: {
		name: 'Selected channel number',
		oscPath: '/-stat/selidx',
		getValue: (args) => {
			const index = args && args[0]?.type === 'i' ? args[0].value : 0
			const selectedChannel = allSources.find((s) => s.selectNumber === index)

			return selectedChannel?.defaultRef ?? allSources[0].defaultRef
		},
	},
	selected_name: {
		name: 'Selected channel name',
		oscPath: '/-stat/selidx',
		// This can be affected by any channel's name, so we listen to them all. It's a bit inefficient but it works well enough
		additionalPaths: allSources.map((s) => s.config?.name).filter((n): n is string => !!n),
		getValue: (args, state) => {
			const index = args && args[0]?.type === 'i' ? args[0].value : 0
			const selectedChannel = allSources.find((s) => s.selectNumber === index)
			if (!selectedChannel) return allSources[0].defaultName

			return GetNameFromState(state, selectedChannel) ?? selectedChannel.defaultName
		},
	},
	undo_time: {
		name: 'Undo Time',
		oscPath: '/-undo/time',
		getValue: (args) => {
			return args && args[0]?.type === 's' ? args[0].value : '--:--:--'
		},
	},
	dca_spill: {
		name: 'Current DCA Spill',
		oscPath: '/-stat/dcaspill',
		getValue: (args) => {
			const value = args && args[0]?.type === 'i' ? args[0].value : 0
			return getDcaSpillLabel(value)
		},
	},
	show_control: {
		name: 'Show control mode (Cue / Scene / Snippet)',
		oscPath: '/-prefs/show_control',
		getValue: (args) => {
			const value = args && args[0]?.type === 'i' ? args[0].value : 0
			return value === 1 ? 'Scene' : value === 2 ? 'Snippet' : 'Cue'
		},
	},
	show_current: {
		name: 'Highlighted cue/scene/snippet number',
		oscPath: '/-show/prepos/current',
		getValue: (args) => (args && args[0]?.type === 'i' ? args[0].value : 0),
	},
	show_current_name: {
		name: 'Highlighted cue/scene/snippet name',
		oscPath: '/-show/prepos/current',
		additionalPaths: ['/-prefs/show_control'],
		getValue: (args, state) => getCurrentShowName(state, args),
	},
	cue_name: {
		name: 'Name of the highlighted cue',
		oscPath: '/-show/prepos/current',
		getValue: (args, state) => getShowSlotName(state, 'cue', args),
	},
	scene_name: {
		name: 'Name of the highlighted scene',
		oscPath: '/-show/prepos/current',
		getValue: (args, state) => getShowSlotName(state, 'scene', args),
	},
	snippet_name: {
		name: 'Name of the highlighted snippet',
		oscPath: '/-show/prepos/current',
		getValue: (args, state) => getShowSlotName(state, 'snippet', args),
	},
	snap_name: {
		name: 'Snapshot name (/-snap/name, if the console reports it)',
		oscPath: '/-snap/name',
		getValue: (args) => (args && args[0]?.type === 's' ? args[0].value : ''),
	},
	snap_index: {
		name: 'Snapshot index (/-snap/index, if the console reports it)',
		oscPath: '/-snap/index',
		getValue: (args) => (args && args[0]?.type === 'i' ? args[0].value : 0),
	},
	tap_tempo_ms: {
		name: 'Last tap-tempo interval (ms)',
		oscPath: null,
		getValue: (_args, state) => {
			const args = state.get('/tap/tempo')
			return args && args[0]?.type === 'i' ? args[0].value : 0
		},
	},
	tap_tempo_bpm: {
		name: 'Last tap-tempo (BPM)',
		oscPath: null,
		getValue: (_args, state) => {
			const args = state.get('/tap/tempo')
			const ms = args && args[0]?.type === 'i' ? args[0].value : 0
			if (!ms) return 0
			return Math.round((60000 / ms) * 10) / 10
		},
	},
}

for (const target of allSources) {
	if (!target.variablesPrefix) continue

	if (target.config?.name) {
		VariableDefinitions[`name_${target.variablesPrefix}`] = {
			name: `variableId: ${target.defaultName}`,
			oscPath: target.config.name,
			getValue: (_args, state) => GetNameFromState(state, target) ?? target.defaultName,
		}
	}
	if (target.config?.color) {
		VariableDefinitions[`color_${target.variablesPrefix}`] = {
			name: `Color: ${target.defaultName}`,
			oscPath: target.config.color,
			getValue: (args) => {
				const colorStr = getColorChoiceFromId(args && args[0]?.type === 'i' ? args[0].value : '')?.label
				return colorStr || 'unknown'
			},
		}
	}
	if (target.level?.path) {
		VariableDefinitions[`fader_${target.variablesPrefix}`] = {
			name: `Fader: ${target.defaultName}`,
			oscPath: target.level.path,
			getValue: (args) => {
				const faderNum = args && args[0]?.type === 'f' ? args[0].value : NaN
				return isNaN(faderNum) ? undefined : floatToDB(faderNum)
			},
		}
	}
}

for (const source of sendToBusSources) {
	if (!source.variablesPrefix || !source.sendTo) continue
	for (const dest of busSources) {
		if (!dest.variablesPrefix || !dest.sendToSink) continue

		VariableDefinitions[`fader_${source.variablesPrefix}_to_${dest.variablesPrefix}`] = {
			name: `Fader: ${source.defaultName} to ${dest.defaultName}`,
			oscPath: `${source.sendTo.path}/${dest.sendToSink.level}`,
			getValue: (args) => {
				const faderNum = args && args[0]?.type === 'f' ? args[0].value : NaN
				return isNaN(faderNum) ? undefined : floatToDB(faderNum)
			},
		}
	}
}

for (const source of matrixSendSources) {
	if (!source.variablesPrefix || !source.sendTo) continue
	for (const dest of matrixSources) {
		if (!dest.variablesPrefix || !dest.sendToSink) continue

		const varName = `fader_${source.variablesPrefix}_to_${dest.variablesPrefix.replace('mtx', 'matrix')}` as const // HACK: backwards compatibility
		VariableDefinitions[varName] = {
			name: `Fader: ${source.defaultName} to ${dest.defaultName}`,
			oscPath: `${source.sendTo.path}/${dest.sendToSink.level}`,
			getValue: (args) => {
				const faderNum = args && args[0]?.type === 'f' ? args[0].value : NaN
				return isNaN(faderNum) ? undefined : floatToDB(faderNum)
			},
		}
	}
}

function getShowSlotName(
	state: X32State,
	kind: 'cue' | 'scene' | 'snippet',
	args: import('@companion-module/base').OSCMetaArgument[] | undefined,
): string {
	const index = args && args[0]?.type === 'i' ? args[0].value : 0
	const path = `/-show/showfile/${kind}/${padNumber(index, 3)}/name`
	const nameArgs = state.get(path)
	return nameArgs && nameArgs[0]?.type === 's' ? nameArgs[0].value : ''
}

function getCurrentShowName(
	state: X32State,
	args: import('@companion-module/base').OSCMetaArgument[] | undefined,
): string {
	const modeArgs = state.get('/-prefs/show_control')
	const mode = modeArgs && modeArgs[0]?.type === 'i' ? modeArgs[0].value : 0
	const kind = mode === 1 ? 'scene' : mode === 2 ? 'snippet' : 'cue'
	return getShowSlotName(state, kind, args)
}

export const SHOW_VARIABLE_IDS = [
	'show_control',
	'show_current',
	'show_current_name',
	'cue_name',
	'scene_name',
	'snippet_name',
] as const

function formatMute(args: import('@companion-module/base').OSCMetaArgument[] | undefined, isOn: boolean): string {
	const value = args && args[0]?.type === 'i' ? args[0].value : undefined
	if (value === undefined) return ''
	const on = isOn ? value !== 0 : value === 0
	return on ? 'On' : 'Muted'
}

for (const target of allSources) {
	if (!target.variablesPrefix || !target.muteOrOn) continue
	const prefix = target.variablesPrefix
	const isOn = target.muteOrOn.isOn
	VariableDefinitions[`mute_${prefix}`] = {
		name: `Mute: ${target.defaultName} (Muted or On)`,
		oscPath: target.muteOrOn.path,
		getValue: (args) => formatMute(args, isOn),
	}
	if (target.trim?.path) {
		VariableDefinitions[`trim_${prefix}`] = {
			name: `Trim dB: ${target.defaultName}`,
			oscPath: target.trim.path,
			getValue: (args) => {
				const f = args && args[0]?.type === 'f' ? args[0].value : undefined
				return f === undefined ? undefined : Math.round(floatToTrim(f) * 100) / 100
			},
		}
	}
	if (target.hpf?.freq) {
		VariableDefinitions[`hpf_freq_${prefix}`] = {
			name: `HPF frequency Hz: ${target.defaultName}`,
			oscPath: target.hpf.freq,
			getValue: (args) => {
				const f = args && args[0]?.type === 'f' ? args[0].value : undefined
				return f === undefined ? undefined : Math.round(floatToHpfHz(f) * 10) / 10
			},
		}
	}
}

for (let i = 1; i <= 6; i++) {
	VariableDefinitions[`mute_mutegrp_${i}`] = {
		name: `Mute group ${i} (Muted or Off)`,
		oscPath: `/config/mute/${i}`,
		getValue: (args) => {
			const value = args && args[0]?.type === 'i' ? args[0].value : undefined
			if (value === undefined) return ''
			return value !== 0 ? 'Muted' : 'Off'
		},
	}
}

for (const choice of GetHeadampChoices()) {
	const path = parseHeadampRef(choice.id)
	if (!path) continue
	const slug = String(choice.id).replace(/-/g, '_')
	VariableDefinitions[`gain_${slug}`] = {
		name: `Headamp gain dB: ${choice.label}`,
		oscPath: `${path}/gain`,
		getValue: (args) => {
			const f = args && args[0]?.type === 'f' ? args[0].value : undefined
			return f === undefined ? undefined : Math.round(floatToHeadampGain(f) * 10) / 10
		},
	}
}

for (const source of METER_SOURCES) {
	const variableId = source.variableId as `meter_${string}`
	VariableDefinitions[variableId] = {
		name: `Meter dBFS: ${source.label}`,
		oscPath: null,
		getValue: (_args, state) => {
			const args = state.get(meterStatePath(source.id))
			const linear = args && args[0]?.type === 'f' ? args[0].value : undefined
			if (linear === undefined) return ''
			return formatMeterDb(meterLinearToDb(linear))
		},
	}
}
