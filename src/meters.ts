import { padNumber } from './util.js'

/** Linear audio level 1.0 = 0 dBFS; values can exceed 1.0 (up to ~8.0 / +18 dBFS). */
export function meterLinearToDb(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return Number.NEGATIVE_INFINITY
	return 20 * Math.log10(value)
}

export function formatMeterDb(db: number, digits = 1): string {
	if (!Number.isFinite(db)) return '-inf'
	return db.toFixed(digits)
}

export const METER_SIGNAL_THRESHOLD_DB = -60
export const METER_CLIP_THRESHOLD_LINEAR = 1

export type MeterSource = {
	id: string
	label: string
	variableId: string
	/** Index into /meters/0, or -1 if this comes from /meters/2 */
	meters0Index: number
	/** Index into /meters/2 for main only */
	meters2Index?: number
}

export const METER_SOURCES: MeterSource[] = []

for (let i = 1; i <= 32; i++) {
	METER_SOURCES.push({
		id: `ch${i}`,
		label: `Channel ${i}`,
		variableId: `meter_ch_${padNumber(i)}`,
		meters0Index: i - 1,
	})
}
for (let i = 1; i <= 8; i++) {
	METER_SOURCES.push({
		id: `aux${i}`,
		label: `Aux In ${i}`,
		variableId: `meter_auxin_${padNumber(i)}`,
		meters0Index: 32 + (i - 1),
	})
}
for (let i = 1; i <= 8; i++) {
	METER_SOURCES.push({
		id: `fx${i}`,
		label: `FX Return ${i}`,
		variableId: `meter_fxrtn_${padNumber(i)}`,
		meters0Index: 40 + (i - 1),
	})
}
for (let i = 1; i <= 16; i++) {
	METER_SOURCES.push({
		id: `bus${i}`,
		label: `MixBus ${i}`,
		variableId: `meter_bus_${padNumber(i)}`,
		meters0Index: 48 + (i - 1),
	})
}
for (let i = 1; i <= 6; i++) {
	METER_SOURCES.push({
		id: `mtx${i}`,
		label: `Matrix ${i}`,
		variableId: `meter_mtx_${padNumber(i)}`,
		meters0Index: 64 + (i - 1),
	})
}

// /meters/0 is 70 floats and does not include main. Main comes from /meters/2:
// 16 bus + 6 mtx + Main L + Main R + Mono
METER_SOURCES.push(
	{ id: 'mainl', label: 'Main L', variableId: 'meter_main_l', meters0Index: -1, meters2Index: 22 },
	{ id: 'mainr', label: 'Main R', variableId: 'meter_main_r', meters0Index: -1, meters2Index: 23 },
	{ id: 'mainm', label: 'Main M/C', variableId: 'meter_main_m', meters0Index: -1, meters2Index: 24 },
)

export const METER_STATE_PREFIX = '/meter/'

export function meterStatePath(sourceId: string): string {
	return `${METER_STATE_PREFIX}${sourceId}`
}

/**
 * Parse an X32 /meters OSC blob.
 * After osc.js unwraps the blob, the payload is:
 *   int32 LE count, then that many float32 LE values.
 */
export function parseMetersBlob(blob: Uint8Array | Buffer | ArrayBuffer | undefined): number[] | null {
	if (!blob) return null
	const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob instanceof ArrayBuffer ? new Uint8Array(blob) : blob)
	if (buf.length < 4) return null
	const count = buf.readInt32LE(0)
	if (count < 0 || count > 256) return null
	const needed = 4 + count * 4
	if (buf.length < needed) return null
	const values: number[] = []
	for (let i = 0; i < count; i++) {
		values.push(buf.readFloatLE(4 + i * 4))
	}
	return values
}

/** Interval used when sending /meters subscriptions (50ms * factor). 8 = 400ms. */
export const METER_TIME_FACTOR = 8
/** Ignore tiny level changes when publishing variables/feedbacks. */
export const METER_DB_CHANGE_THRESHOLD = 0.5
