import { SomeCompanionConfigField } from '@companion-module/base'
import { X32DeviceDetectorInstance } from './device-detector.js'

export const fadeFpsDefault = 10

export type X32Config = {
	host?: string
	fadeFps?: number
	enableMeters?: boolean
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'dropdown',
			id: 'host',
			label: 'Target IP',
			width: 6,
			choices: X32DeviceDetectorInstance.listKnown().map((d) => ({
				id: d.address,
				label: `${d.address} (${d.deviceName})`,
			})),
			default: '',
			allowCustom: true,
			// regex: self.REGEX_IP, // TODO
		},
		{
			type: 'number',
			id: 'fadeFps',
			label: 'Framerate for fades',
			description: 'Higher is smoother, but has higher impact on system performance',
			width: 6,
			min: 5,
			max: 60,
			step: 1,
			default: fadeFpsDefault,
		},
		{
			type: 'checkbox',
			id: 'enableMeters',
			label: 'Enable signal meters',
			description:
				'Subscribe to /meters and expose level (dBFS) variables plus signal/clip feedbacks. Off by default because meter traffic can be heavy. Requires a reconnect or config save to apply.',
			width: 6,
			default: false,
		},
	]
}
