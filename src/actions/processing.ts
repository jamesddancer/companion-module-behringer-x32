import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ActionsProps } from './main.js'
import { actionSubscriptionWrapper, getResolveOnOffMute } from './util.js'
import { CHOICES_HPF_SLOPE, CHOICES_ON_OFF, MUTE_TOGGLE, convertChoices, GetTargetChoices } from '../choices.js'
import { ParseRefOptions, parseRefToPaths } from '../paths.js'
import { clamp, HPF_FREQ_MAX, HPF_FREQ_MIN, floatToHpfHz, hpfHzToFloat } from '../util.js'

const hpfParseOptions: ParseRefOptions = { allowChannel: true }
const invertParseOptions: ParseRefOptions = { allowChannel: true, allowAuxIn: true }
const eqParseOptions: ParseRefOptions = {
	allowChannel: true,
	allowAuxIn: true,
	allowFx: true,
	allowBus: true,
	allowMatrix: true,
	allowStereo: true,
	allowMono: true,
}
const gateParseOptions: ParseRefOptions = { allowChannel: true }
const dynParseOptions: ParseRefOptions = {
	allowChannel: true,
	allowBus: true,
	allowMatrix: true,
	allowStereo: true,
	allowMono: true,
}

export type ProcessingActionsSchema = {
	hpf_on: { options: { target: string; on: number } }
	hpf_freq: { options: { target: string; freq: number } }
	hpf_freq_delta: { options: { target: string; delta: number } }
	hpf_slope: { options: { target: string; slope: number } }
	eq_on: { options: { target: string; on: number } }
	gate_on: { options: { target: string; on: number } }
	dyn_on: { options: { target: string; on: number } }
	invert: { options: { target: string; on: number } }
}

export function getProcessingActions(props: ActionsProps): CompanionActionDefinitions<ProcessingActionsSchema> {
	const hpfChoices = GetTargetChoices(props.state, hpfParseOptions)
	const invertChoices = GetTargetChoices(props.state, invertParseOptions)
	const eqChoices = GetTargetChoices(props.state, eqParseOptions)
	const gateChoices = GetTargetChoices(props.state, gateParseOptions)
	const dynChoices = GetTargetChoices(props.state, dynParseOptions)

	return {
		hpf_on: {
			name: 'Channel HPF on/off',
			description: 'High-pass filter on/off for a channel (/ch/NN/preamp/hpon). Aux inputs have no HPF.',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(hpfChoices),
					allowInvalidValues: true,
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
				getPath: (options) => parseRefToPaths(options.target, hpfParseOptions)?.hpf?.on ?? null,
				execute: (action, cachedData) => ({
					type: 'i',
					value: getResolveOnOffMute(cachedData, true, action.options.on),
				}),
				shouldSubscribe: (options) => options.on === MUTE_TOGGLE,
				optionsToMonitorForSubscribe: ['target', 'on'],
			}),
		},
		hpf_freq: {
			name: 'Set channel HPF frequency',
			description:
				'Set high-pass frequency in Hz for a channel. OSC uses a log scale over 20-400 Hz (/ch/NN/preamp/hpf).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(hpfChoices),
					allowInvalidValues: true,
				},
				{
					type: 'number',
					label: 'Frequency (Hz)',
					id: 'freq',
					range: true,
					default: 80,
					step: 1,
					min: HPF_FREQ_MIN,
					max: HPF_FREQ_MAX,
				},
			],
			callback: (action): void => {
				const path = parseRefToPaths(action.options.target, hpfParseOptions)?.hpf?.freq
				if (!path) return
				props.sendOsc(path, { type: 'f', value: hpfHzToFloat(action.options.freq) })
			},
		},
		hpf_freq_delta: {
			name: 'Adjust channel HPF frequency',
			description:
				'Nudge the channel high-pass frequency by a number of Hz (clamped to 20-400 Hz, log scale on the wire).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(hpfChoices),
					allowInvalidValues: true,
				},
				{
					type: 'number',
					label: 'Adjust by (Hz)',
					id: 'delta',
					default: 10,
					step: 1,
					min: -400,
					max: 400,
				},
			],
			...actionSubscriptionWrapper(props, {
				getPath: (options) => parseRefToPaths(options.target, hpfParseOptions)?.hpf?.freq ?? null,
				execute: (_action, cachedData) => {
					const current = cachedData && cachedData[0]?.type === 'f' ? floatToHpfHz(cachedData[0].value) : HPF_FREQ_MIN
					const next = clamp(current + _action.options.delta, HPF_FREQ_MIN, HPF_FREQ_MAX)
					return { type: 'f', value: hpfHzToFloat(next) }
				},
				shouldSubscribe: true,
				optionsToMonitorForSubscribe: ['target'],
			}),
		},
		hpf_slope: {
			name: 'Set channel HPF slope',
			description: 'Set /ch/NN/preamp/hpslope: 0 = 12 dB/oct, 1 = 18 dB/oct, 2 = 24 dB/oct.',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(hpfChoices),
					allowInvalidValues: true,
				},
				{
					type: 'dropdown',
					label: 'Slope',
					id: 'slope',
					...convertChoices(CHOICES_HPF_SLOPE),
					disableAutoExpression: true,
				},
			],
			callback: (action): void => {
				const path = parseRefToPaths(action.options.target, hpfParseOptions)?.hpf?.slope
				if (!path) return
				props.sendOsc(path, { type: 'i', value: action.options.slope })
			},
		},
		eq_on: {
			name: 'EQ on/off',
			description: 'EQ on/off/toggle for a channel, aux, FX return, bus, matrix, or main (/…/eq/on).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(eqChoices),
					allowInvalidValues: true,
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
				getPath: (options) => parseRefToPaths(options.target, eqParseOptions)?.eqOn?.path ?? null,
				execute: (action, cachedData) => ({
					type: 'i',
					value: getResolveOnOffMute(cachedData, true, action.options.on),
				}),
				shouldSubscribe: (options) => options.on === MUTE_TOGGLE,
				optionsToMonitorForSubscribe: ['target', 'on'],
			}),
		},
		gate_on: {
			name: 'Gate on/off',
			description: 'Gate on/off/toggle for a channel (/ch/NN/gate/on). Only input channels have a gate.',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(gateChoices),
					allowInvalidValues: true,
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
				getPath: (options) => parseRefToPaths(options.target, gateParseOptions)?.gateOn?.path ?? null,
				execute: (action, cachedData) => ({
					type: 'i',
					value: getResolveOnOffMute(cachedData, true, action.options.on),
				}),
				shouldSubscribe: (options) => options.on === MUTE_TOGGLE,
				optionsToMonitorForSubscribe: ['target', 'on'],
			}),
		},
		dyn_on: {
			name: 'Compressor/dynamics on/off',
			description: 'Dynamics on/off/toggle for a channel, bus, matrix, or main (/…/dyn/on).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(dynChoices),
					allowInvalidValues: true,
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
				getPath: (options) => parseRefToPaths(options.target, dynParseOptions)?.dynOn?.path ?? null,
				execute: (action, cachedData) => ({
					type: 'i',
					value: getResolveOnOffMute(cachedData, true, action.options.on),
				}),
				shouldSubscribe: (options) => options.on === MUTE_TOGGLE,
				optionsToMonitorForSubscribe: ['target', 'on'],
			}),
		},
		invert: {
			name: 'Polarity invert',
			description: 'Polarity invert on/off/toggle for a channel or aux input (/…/preamp/invert).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(invertChoices),
					allowInvalidValues: true,
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
				getPath: (options) => parseRefToPaths(options.target, invertParseOptions)?.invert?.path ?? null,
				execute: (action, cachedData) => ({
					type: 'i',
					value: getResolveOnOffMute(cachedData, true, action.options.on),
				}),
				shouldSubscribe: (options) => options.on === MUTE_TOGGLE,
				optionsToMonitorForSubscribe: ['target', 'on'],
			}),
		},
	}
}
