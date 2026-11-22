# companion-module-behringer-x32

## Getting started

Execute `yarn` command to install the dependencies.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

## Changes

### v99.0.1

- Stop logging `Status: ok` on every `/xinfo` heartbeat; Companion status is updated only when it changes.
- Document that writing `/-stat/dcaspill` does not trigger the console's surface DCA spill. The action still sends that status parameter (0 = Off, 1–8 = DCA 1–8). On an X32 Compact with firmware 4.13 this was observed to select the DCA without spilling member channels onto the left faders. Physical spill remains: Press SELECT on the DCA; press the DCA layer button to page; change the left fader layer or hold the DCA layer button to cancel. There is no documented console preference that enables spill (X32-Edit “DCA-Spill layer jump” is an editor GUI setting only), and no documented OSC command is known to start spill on the surface faders. Feedback and the `dca_spill` variable still follow `/-stat/dcaspill`.

### v99.0.0

Same features as v4.0.5. Version set high so official Bitfocus releases of `behringer-x32` will not supersede this personal fork.

### v4.0.5

Personal fork (not for upstream). Adds:

- Headamp phantom on/off/toggle and feedback (`headamp_phantom`)
- Channel HPF on/off, frequency (set and step, 20-400 Hz log scale), and slope
- EQ, gate, and compressor/dynamics on/off/toggle with feedback
- Polarity invert toggle and feedback
- Mute state variables (`mute_ch_01` = `Muted` or `On`; mute groups = `Muted` or `Off`)
- Current show cue/scene/snippet number and name variables
- Optional signal meters (config checkbox, default off): dBFS variables and signal/clip feedbacks
- Assign a channel (or other target) to a DCA or mute group, with feedback
- Tap tempo for an FX delay-time parameter (default: Stereo Delay slot 1, parameter 2)
- Headamp gain and digital trim up/down, plus gain/trim variables

DCA Spill from v4.0.4 is unchanged.

### v4.0.4

Personal fork of the official module (not for upstream). Adds DCA Spill control:

- Action `dca-spill` to spill a single DCA onto the channel fader bank, or turn spill off, with an optional toggle
- Feedback `dca-spill` when a given DCA (or Off) is the current spill
- Variable `dca_spill` for the current spill (`Off` or `DCA 1` ... `DCA 8`)
- Presets for Off and each DCA

Requires console firmware 4.04 or later. OSC mapping: `/-stat/dcaspill` integer `0` = Off, `1` = DCA 1, ... `8` = DCA 8.

### v4.0

- Update to 2.0 module api
- This supports expressions in most action/feedback fields

### v3.2

- Fix using mute group would not update individual channel feedbacks
- Update dependencies and build tooling

### v3.1

- Previous, Next, Go
- Channel Inserts
- Talkback
- Load Presets (Channel, FX and AES50. No Routing presets due to X32 bug)
- Undo
- Variable for send levels (Input to Bus and Bus to Matrix)
- Variables for colors
- Allow setting deltas, colors and labels from variables

### v3.0

- Compatibility updates for Companion 3.0

### v2.11

- Xlive functionality
- Updated fader curves
- Save scene
- Fix mute channel send to main mono

### v2.10

- Routing
- Lock/Shutdown

### v2.9.1

- Fix crash when disabling/deleting instance

### v2.9.0

- Channel and bus banks

- Bus send bank and user banks

- Screen pages

- Tape state feedback and elapsed time variable

- Solo mono

- Panning

### v2.8.0

- Sends on Fader/Fader Flip

- Solo and Clear Solo

- Solo Dim, Solo Dim Attenuation and Monitor Level

- Sync time

### v2.7.0

- fix typings for actions in triggers changes

- Discover and suggest devices found on the network

### v2.6.1

- Update for improved module api features

### v2.6.0

- Update for improved instance_skel.checkFeedbacks signature

### v2.5.0

- feedbacks updated to new format. allows more customisation of style

### v2.4.3

- Fix osc socket not being closed when reconnecting

### v2.4.2

- Fix state not loading on connect

### v2.4.1

- Fix state loading when there are many feedbacks or actions starting subscriptions

### v2.4.0

- Relative fader levels adjustments

- Fader level feedbacks

- Fader level fades

- Fix connection not opening when updating config

- Temporarily store and restore fader levels

### v2.3.2

- Fix bad send calls causing error dialog loop

### v2.3.1

- Fix connection management

### v2.3.0

- Oscillator enable & destination

### v2.2.0

- Set level of bus send to matrix

- Mute/unmute bus send to matrix

- Set level of channel send to bus

- Talkback on/off

- Set input trim

- Set headamp gain

### v2.1.0

- Fix initial state loading

- Fix mute toggle actions not always working on first use

- Mute/unmute channel send to buses

### v2.0.0

- Rewrite in Typescript with some linting and formatting rules.

- Added Mute feedback

- Added variables for channel names and fader levels

- Use slider inputs for fader levels

- Rework channel selection to use a proper list with current names
