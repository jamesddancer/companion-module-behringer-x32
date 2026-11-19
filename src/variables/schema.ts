export type VariablesSchema = {
	m_name: string
	m_model: string
	m_fw: string
	tape_time_ms: string
	tape_time_hms: string
	urec_etime_ms: string
	urec_etime_hms: string
	urec_rtime_ms: string
	urec_rtime_hms: string
	stored_channel: number
	selected_channel: string
	selected_name: string
	undo_time: string
	dca_spill: string
	show_control: string
	show_current: number
	show_current_name: string
	cue_name: string
	scene_name: string
	snippet_name: string
	snap_name: string
	snap_index: number
	tap_tempo_ms: number
	tap_tempo_bpm: number
	[key: `name_${string}`]: string
	[key: `color_${string}`]: string
	[key: `fader_${string}`]: number
	[key: `mute_${string}`]: string
	[key: `trim_${string}`]: number
	[key: `gain_${string}`]: number
	[key: `hpf_freq_${string}`]: number
	[key: `meter_${string}`]: string
}
