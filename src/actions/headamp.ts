import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ActionsProps } from './main.js'
import { actionSubscriptionWrapper, getResolveOnOffMute } from './util.js'
import {
	CHOICES_ON_OFF,
	MUTE_TOGGLE,
	convertChoices,
	GetHeadampChoices,
	GetLevelsChoiceConfigs,
	HeadampGainChoice,
} from '../choices.js'
import { parseHeadampRef, parseRefToPaths } from '../paths.js'
import { clamp, floatToHeadampGain, floatToTrim, headampGainToFloat, trimToFloat } from '../util.js'

export type HeadAmpActionsSchema = {
	input_trim: {
		options: {
			input: string
			trim: number
		}
	}
	headamp_gain: {
		options: {
			headamp: string
			gain: number
		}
	}
	headamp_gain_delta: {
		options: {
			headamp: string
			delta: number
		}
	}
	input_trim_delta: {
		options: {
			input: string
			delta: number
		}
	}
	headamp_phantom: {
		options: {
			headamp: string
			on: number
		}
	}
}

export function getHeadAmpActions(props: ActionsProps): CompanionActionDefinitions<HeadAmpActionsSchema> {
	const levelsChoices = GetLevelsChoiceConfigs(props.state)

	return {
		input_trim: {
			name: 'Set input trim',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					...convertChoices(levelsChoices.allSources),
					allowInvalidValues: true,
				},
				{
					type: 'number',
					label: 'Trim',
					id: 'trim',
					range: true,
					default: 0,
					step: 0.1,
					min: -18,
					max: 18,
				},
			],
			callback: async (action): Promise<void> => {
				const inputRef = parseRefToPaths(action.options.input, levelsChoices.allSourcesParseOptions)
				if (!inputRef?.trim) return

				props.sendOsc(inputRef.trim.path, {
					type: 'f',
					value: trimToFloat(action.options.trim),
				})
			},
		},
		headamp_gain: {
			name: 'Set Headamp gain',
			options: [
				{
					type: 'dropdown',
					label: 'Headamp',
					id: 'headamp',
					...convertChoices(GetHeadampChoices()),
					expressionDescription: `eg 'local1', 'aes-a1', 'aes-b1'`,
				},
				HeadampGainChoice,
			],
			callback: async (action): Promise<void> => {
				const refPath = parseHeadampRef(action.options.headamp)
				if (!refPath) return

				props.sendOsc(`${refPath}/gain`, {
					type: 'f',
					value: headampGainToFloat(action.options.gain),
				})
			},
		},
		headamp_gain_delta: {
			name: 'Adjust Headamp gain',
			description: 'Nudge analogue headamp gain in dB. Range is -12 to +60 dB (linear OSC 0-1).',
			options: [
				{
					type: 'dropdown',
					label: 'Headamp',
					id: 'headamp',
					...convertChoices(GetHeadampChoices()),
					expressionDescription: `eg 'local1', 'aes-a1', 'aes-b1'`,
				},
				{
					type: 'number',
					label: 'Adjust by (dB)',
					id: 'delta',
					default: 1,
					step: 0.5,
					min: -72,
					max: 72,
				},
			],
			...actionSubscriptionWrapper(props, {
				getPath: (options) => {
					const refPath = parseHeadampRef(options.headamp)
					return refPath ? `${refPath}/gain` : null
				},
				execute: (action, cachedData) => {
					const current = cachedData && cachedData[0]?.type === 'f' ? floatToHeadampGain(cachedData[0].value) : 0
					const next = clamp(current + action.options.delta, -12, 60)
					return { type: 'f', value: headampGainToFloat(next) }
				},
				shouldSubscribe: true,
				optionsToMonitorForSubscribe: ['headamp'],
			}),
		},
		input_trim_delta: {
			name: 'Adjust input trim',
			description: 'Nudge digital preamp trim in dB. Range is -18 to +18 dB (linear OSC 0-1).',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					...convertChoices(levelsChoices.allSources),
					allowInvalidValues: true,
				},
				{
					type: 'number',
					label: 'Adjust by (dB)',
					id: 'delta',
					default: 0.25,
					step: 0.25,
					min: -36,
					max: 36,
				},
			],
			...actionSubscriptionWrapper(props, {
				getPath: (options) => parseRefToPaths(options.input, levelsChoices.allSourcesParseOptions)?.trim?.path ?? null,
				execute: (action, cachedData) => {
					const current = cachedData && cachedData[0]?.type === 'f' ? floatToTrim(cachedData[0].value) : 0
					const next = clamp(current + action.options.delta, -18, 18)
					return { type: 'f', value: trimToFloat(next) }
				},
				shouldSubscribe: true,
				optionsToMonitorForSubscribe: ['input'],
			}),
		},
		headamp_phantom: {
			name: 'Headamp phantom power',
			description:
				'48V phantom on/off/toggle for a headamp (/headamp/NNN/phantom). This is not /ch/NN/preamp/hpon, which is the high-pass filter.',
			options: [
				{
					type: 'dropdown',
					label: 'Headamp',
					id: 'headamp',
					...convertChoices(GetHeadampChoices()),
					expressionDescription: `eg 'local1', 'aes-a1', 'aes-b1'`,
				},
				{
					type: 'dropdown',
					label: 'On / Off',
					id: 'on',
					...convertChoices(CHOICES_ON_OFF),
					disableAutoExpression: true,
				},
			],
			...actionSubscriptionWrapper(props, {
				getPath: (options) => {
					const refPath = parseHeadampRef(options.headamp)
					return refPath ? `${refPath}/phantom` : null
				},
				execute: (action, cachedData) => ({
					type: 'i',
					value: getResolveOnOffMute(cachedData, true, action.options.on),
				}),
				shouldSubscribe: (options) => options.on === MUTE_TOGGLE,
				optionsToMonitorForSubscribe: ['headamp', 'on'],
			}),
		},
	}
}
