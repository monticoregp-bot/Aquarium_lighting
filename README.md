Aquarium Lighting

A Home Assistant custom integration that gives your aquarium a natural, automatic day/night lighting cycle: smooth sunrise and sunset ramps, per-channel schedules, and two Lovelace cards for viewing and editing everything visually.

No automations to write, no database, no drift. Brightness is always calculated from your schedule and the current time, so restarts, pauses and manual overrides never leave the lights in the wrong state.

Features
Independent channels. Give each light channel (e.g. blue, white, red) its own schedule, brightness range, curve and graph colour.
Sunrise and sunset ramps. Four times per channel: sunrise start, sunrise end, sunset start, sunset end. Windows that cross midnight are supported.
Four brightness curves.
linear
cosine (smooth S-curve, the default)
parabolic (quadratic ease-in / ease-out)
multi_segment (your own ["HH:MM", level] points, interpolated linearly and cyclic over 24 h)
Three output modes. Drive lights through Home Assistant, straight to an ESPHome device over HTTP, or over MQTT.
Smooth fades. Each update looks one transition ahead and sends that transition time to the device, so fades finish exactly when the next update arrives, with no stair-stepping.
Auto mode switch. An input_boolean helper turns scheduling on or off. While it is off, the integration is idle and sends nothing, so you can freely control the lights by hand.
Two Lovelace cards. An Aquarium lighting graph card to view the day's curves, and an Aquarium Lighting schedule editor card to change them. Previews use the same code that drives the lights.
Multiple tanks. Add one integration entry per aquarium.
Schedules survive restarts. Only schedules are stored (in Home Assistant's .storage); brightness is never stored.
How it works

Once a minute (on the minute), while auto mode is on, the integration computes the brightness each channel should have one transition from now and pushes it to the channel's target. Levels use Home Assistant's 0-255 brightness scale. A level of 0 turns the light off.

When auto mode is switched on, Home Assistant starts, or you edit a schedule, the next push uses a shorter "resume" transition so the lights move smoothly to where the schedule says they should be right now.

Requirements
Home Assistant with the http, frontend and websocket_api integrations (all included in a standard install)
The mqtt integration, only if you use MQTT output mode
A dimmable light for each channel, controllable by one of the output modes below
Installation

The repository root currently holds the integration files directly, so they need to end up in a folder named aquarium_lighting inside custom_components.

In your Home Assistant config directory, create custom_components/aquarium_lighting/.
Copy the contents of this repository into that folder (__init__.py, manifest.json, frontend/, translations/, and so on).
Restart Home Assistant.

Your config directory should look like this:

config/
└── custom_components/
    └── aquarium_lighting/
        ├── __init__.py
        ├── manifest.json
        ├── light_controller.py
        └── ...
Setup
1. Create the auto-mode helper

Create a Toggle helper under Settings → Devices & services → Helpers. The default entity ID the integration looks for is:

input_boolean.aquarium_auto_mode

You can use a different helper (one per aquarium) and choose it during setup. Home Assistant restores the helper's state across restarts, and the integration simply follows it.

2. Add the integration
Go to Settings → Devices & services → Add integration and search for Aquarium Lighting.
Fill in the first step:
Name of the aquarium
Auto-mode helper (the input_boolean from step 1)
Output mode (see below)
Transition and resume transition, in seconds
Create your first channel: a name (lowercase letters, digits and underscores, up to 32 characters) and its target.

More channels and all schedule editing are done afterwards from the schedule editor card. Transition lengths and output mode can be changed later via the integration's Configure button.

Output modes
Mode	Target for each channel	Use when
Home Assistant light entities (ha_light)	A light.* entity ID	Your lights already exist in Home Assistant
ESPHome REST API (esphome_rest)	Base URL of the light, e.g. http://reef-light.local/light/blue	Talking directly to an ESP32 running the ESPHome web_server
MQTT (mqtt)	The light's command topic, e.g. reef-light/light/blue/command	ESPHome lights using the MQTT JSON light schema

For smooth fades, set a default_transition_length on ESPHome lights so the device interpolates between the levels it receives.

Defaults
Setting	Default
Transition between updates	60 s
Resume transition (after start, enabling auto, or editing a schedule)	15 s
Sunrise	08:00 - 11:00
Sunset	17:00 - 20:00
Minimum / maximum brightness	10 / 255
Curve	cosine

Schedule times must run in order within 24 hours: sunrise start, sunrise end, sunset start, sunset end, with each ramp at least one minute long.

Lovelace cards

The integration ships two dashboard cards, both served from a single JavaScript file:

/aquarium_lighting/aquarium-lighting-card.js
Card	What it does
Aquarium lighting graph	Shows each channel's 24-hour brightness curve, the current time marker and the current level, in each channel's colour.
Aquarium Lighting schedule editor	Add, edit and delete channels, and change sunrise and sunset times, minimum and maximum brightness, curve type, multi-segment points, target and colour. Curves are previewed as you edit.

Add either card from the dashboard card picker. If they do not appear, add the URL above under Settings → Dashboards → Resources as a JavaScript module.

The graph and the editor use the same brightness code that drives the lights, so what you see is what your lights will do. A common layout is the graph on your main dashboard and the editor on a separate admin view.

Entities

Each channel is a device with entities for adjusting its schedule from Home Assistant (numbers for levels, selects for the curve, and time entities for the sunrise and sunset times). Deleting a channel removes its device and entities.

Repository layout
Path	Purpose
light_controller.py	Pure brightness engine with no Home Assistant imports: schedules, curves, validation
coordinator.py	Per-minute background loop, schedule storage, auto-mode handling, output back-ends
config_flow.py	Setup and options UI
api.py	Websocket API used by the Lovelace cards
entity.py, number.py, select.py, time.py	Home Assistant entities
const.py, manifest.json, strings.json	Constants, integration metadata, UI strings
frontend/	Lovelace cards (graph and schedule editor)
translations/	Translations
brand/	Icons and branding
Troubleshooting
Lights never change. Check that the auto-mode helper exists and is on. If it does not exist, a warning is logged and nothing is controlled.
A channel does nothing. Make sure it has a target set. Channels without a target are skipped.
"Could not set brightness" warning. The target was unreachable or does not exist yet. It is logged once per outage and again as "recovered" when it works.
MQTT mode errors. The MQTT integration must be set up in Home Assistant.
Contributing

Issues and pull requests are welcome. The brightness engine in light_controller.py is deliberately free of Home Assistant imports so it can be tested on its own.
