import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ActionsProps } from './main.js'
import { actionSubscriptionWrapper } from './util.js'
import {
	CHOICES_ASSIGN_MODE,
	CHOICES_DCA_GROUPS,
	convertChoices,
	GetMuteGroupChoices,
	GetTargetChoices,
} from '../choices.js'
import { ParseRefOptions, parseRefToPaths } from '../paths.js'

const grpParseOptions: ParseRefOptions = {
	allowChannel: true,
	allowAuxIn: true,
	allowFx: true,
	allowBus: true,
	allowMatrix: true,
	allowStereo: true,
	allowMono: true,
}

export type GroupActionsSchema = {
	dca_assign: {
		options: {
			target: string
			dca: number
			mode: string
		}
	}
	mute_grp_assign: {
		options: {
			target: string
			mutegrp: number
			mode: string
		}
	}
}

function applyBit(current: number, bitIndex: number, mode: string): number {
	const mask = 1 << bitIndex
	if (mode === 'clear') return current & ~mask
	if (mode === 'toggle') return current ^ mask
	return current | mask
}

export function getGroupActions(props: ActionsProps): CompanionActionDefinitions<GroupActionsSchema> {
	const targets = GetTargetChoices(props.state, grpParseOptions)
	const muteGroups = GetMuteGroupChoices(props.state)

	return {
		dca_assign: {
			name: 'Assign target to DCA',
			description: 'Set, clear, or toggle a bit in /…/grp/dca. Bit 0 is DCA 1, bit 7 is DCA 8 (bitmap 0-255).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(targets),
					allowInvalidValues: true,
				},
				{
					type: 'dropdown',
					label: 'DCA',
					id: 'dca',
					...convertChoices(CHOICES_DCA_GROUPS),
					disableAutoExpression: true,
				},
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'mode',
					...convertChoices(CHOICES_ASSIGN_MODE),
					disableAutoExpression: true,
				},
			],
			...actionSubscriptionWrapper(props, {
				getPath: (options) => parseRefToPaths(options.target, grpParseOptions)?.grp?.dca ?? null,
				execute: (action, cachedData) => {
					const current = cachedData && cachedData[0]?.type === 'i' ? cachedData[0].value : 0
					const bit = action.options.dca - 1
					if (bit < 0 || bit > 7) return
					return { type: 'i', value: applyBit(current, bit, action.options.mode) }
				},
				shouldSubscribe: true,
				optionsToMonitorForSubscribe: ['target'],
			}),
		},
		mute_grp_assign: {
			name: 'Assign target to mute group',
			description:
				'Set, clear, or toggle a bit in /…/grp/mute. Bit 0 is mute group 1, bit 5 is mute group 6 (bitmap 0-63).',
			options: [
				{
					type: 'dropdown',
					label: 'Target',
					id: 'target',
					...convertChoices(targets),
					allowInvalidValues: true,
				},
				{
					type: 'dropdown',
					label: 'Mute group',
					id: 'mutegrp',
					...convertChoices(muteGroups),
					disableAutoExpression: true,
				},
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'mode',
					...convertChoices(CHOICES_ASSIGN_MODE),
					disableAutoExpression: true,
				},
			],
			...actionSubscriptionWrapper(props, {
				getPath: (options) => parseRefToPaths(options.target, grpParseOptions)?.grp?.mute ?? null,
				execute: (action, cachedData) => {
					const current = cachedData && cachedData[0]?.type === 'i' ? cachedData[0].value : 0
					const bit = action.options.mutegrp - 1
					if (bit < 0 || bit > 5) return
					return { type: 'i', value: applyBit(current, bit, action.options.mode) }
				},
				shouldSubscribe: true,
				optionsToMonitorForSubscribe: ['target'],
			}),
		},
	}
}
