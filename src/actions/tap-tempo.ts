import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ActionsProps } from './main.js'
import { padNumber, clamp, FX_DELAY_MS_MAX, FX_DELAY_MS_MIN, delayMsToFloat } from '../util.js'

export type TapTempoActionsSchema = {
	tap_tempo: {
		options: {
			slot: number
			param: number
		}
	}
}

export function getTapTempoActions(props: ActionsProps): CompanionActionDefinitions<TapTempoActionsSchema> {
	return {
		tap_tempo: {
			name: 'Tap tempo (FX delay time)',
			description:
				'Tap repeatedly to set an FX slot delay time from the interval between presses. Default targets Stereo Delay (FX type DLY) parameter 2 (Time), which is a linear 1-3000 ms value sent as an OSC float 0-1. For 3-Tap, 4-Tap, Delay/Chamber, Delay/Chorus, Delay/Flanger and Modulation Delay, Time is usually parameter 1 — change the parameter number to match the FX type in the slot. Intervals shorter than 50 ms or longer than 3000 ms start a new tap sequence.',
			options: [
				{
					type: 'number',
					label: 'FX slot (1-8)',
					id: 'slot',
					default: 1,
					min: 1,
					max: 8,
					step: 1,
				},
				{
					type: 'number',
					label: 'Parameter number',
					id: 'param',
					default: 2,
					min: 1,
					max: 64,
					step: 1,
					tooltip: 'Stereo Delay Time is parameter 2. Most other delay FX use parameter 1 for Time.',
				},
			],
			callback: (action): void => {
				const slot = clamp(Math.round(action.options.slot), 1, 8)
				const param = clamp(Math.round(action.options.param), 1, 64)
				const interval = props.recordTapTempo(`fx${slot}:${param}`, FX_DELAY_MS_MAX)
				if (interval === null) return

				const ms = clamp(interval, FX_DELAY_MS_MIN, FX_DELAY_MS_MAX)
				props.sendOsc(`/fx/${slot}/par/${padNumber(param)}`, {
					type: 'f',
					value: delayMsToFloat(ms),
				})
			},
		},
	}
}
