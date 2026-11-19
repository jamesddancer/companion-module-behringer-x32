**Midas M32 / Behringer X32**

This Module controls the Midas M32 series and Behringer X32 series of consoles
go over to [Midas](http://www.musictri.be/Categories/Midas/Mixers/Digital/M32/p/P0B3I) or [Behringer](http://www.musictri.be/Categories/Behringer/Mixers/Digital/X32/p/P0ASF)
to get additional information about the consoles and their capabilities.

We support the following actions:

| Console Function                                               | What it does                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono mute  | Mutes or Unmutes the selected Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono                             |
| Channel, AuxIn, FxReturn, Bus, Matrix. Main Stereo, Mono fader | Sets the level of the selected Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono fader                      |
| Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono label | Sets the text label in the scribble strip of the selected Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono |
| Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono       | Sets the color of the scribble strip of the selected Channel, AuxIn, FxReturn, Bus, Matrix, Main Stereo, Mono      |
| Channel, AuxIn, FxReturn Send mute                             | Mutes or Unmutes the selected Channel, AuxIn, FxReturn to Bus or Main send                                         |
| Channel, AuxIn, FxReturn Send level                            | Sets the level of the selected Channel, AuxIn, FxReturn to Bus or Main send                                        |
| Bus, Main Send Stereo, Mono mute                               | Mutes or Unmutes the selected Bus or Main to Matrix send                                                           |
| Bus, Main Stereo, Mono Send level                              | Sets the level of the selected Bus or Main to Matrix send                                                          |
| Mute Group                                                     | Turns the selected mute group on or off                                                                            |
| Channel set trim                                               | Sets the trim of the selected channel                                                                              |
| Headamp set gain                                               | Sets the gain of the selected headamp                                                                              |
| Load Console Cue                                               | Loads the given cue from the consoles internal cue list 0-99                                                       |
| Load Console Scene                                             | Loads the given scene from the consoles internal scene list 0-99                                                   |
| Load Console Snippet                                           | Loads the given snippet from the consoles internal snippet list 0-99                                               |
| Tape Operation                                                 | Stop,Play,PlayPause,Record,RecordPause,Fast Forward,Rewind of the tape Deck                                        |
| Talkback Talk                                                  | Talkback talk on/off                                                                                               |
| DCA Spill                                                      | Spill a single DCA onto the channel fader bank, or turn spill off (firmware 4.04+, 0=Off, 1-8=DCA 1-8)             |
| Headamp phantom                                                | 48V on/off/toggle for a local or AES50 headamp (/headamp/NNN/phantom)                                              |
| Channel HPF                                                    | On/off, frequency (20-400 Hz log) and slope (12/18/24) for input channels                                          |
| EQ / Gate / Comp                                               | On/off/toggle for supported targets (/…/eq/on, /ch/NN/gate/on, /…/dyn/on)                                          |
| Polarity invert                                                | On/off/toggle for a channel or aux (/…/preamp/invert)                                                              |
| DCA / mute group assign                                        | Set, clear or toggle a target's membership in a DCA (bits 0-7) or mute group (bits 0-5)                            |
| Tap tempo                                                      | Sets an FX slot delay-time parameter from the interval between presses (default Stereo Delay par 2)                |
| Headamp gain / trim adjust                                     | Step analogue headamp gain (-12 to +60 dB) or digital trim (-18 to +18 dB)                                         |

Mute variables use the pattern `mute_ch_01`, `mute_auxin_01`, `mute_fxrtn_01`, `mute_bus_01`, `mute_mtx_01`, `mute_main_st`, `mute_main_m`, `mute_dca_1`. Values are `Muted` or `On` (unmuted). Mute groups are `mute_mutegrp_1` … `mute_mutegrp_6` with values `Muted` or `Off`.

Show variables: `show_control` (Cue / Scene / Snippet), `show_current` (highlighted slot 0-99), `show_current_name`, plus `cue_name`, `scene_name`, `snippet_name` for that slot. Headamp gain is `gain_local_01` (dB). Channel 1 trim is `trim_ch_01`. Channel 1 HPF frequency is `hpf_freq_ch_01`.

Signal meters are off by default. Enable **Enable signal meters** in the connection settings to subscribe to `/meters/0` and `/meters/2`. Variables such as `meter_ch_01` show dBFS; feedbacks **Signal present** (-60 dBFS) and **Meter clip** (0 dBFS) are available. `/ch/NN/preamp/hpon` is the high-pass filter, not phantom power (that typo appears in some OSC docs).

Tap tempo defaults to FX slot 1, parameter 2 (Stereo Delay _Time_, 1-3000 ms as OSC float 0-1). For 3-Tap, 4-Tap and most other delay FX, Time is usually parameter 1.

for additional actions please raise a feature request at [github](https://github.com/bitfocus/companion-module-behringer-x32)

If setting a fade duration, running another action for that value will cancel the first, and run the new one from the current level. If you wish to cancel a fade, run an 'Adjust fader level' with an offset of 0.
