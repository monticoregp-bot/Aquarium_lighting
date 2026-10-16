# Changelog

## 0.3.1
- The card script is now registered as a dashboard resource automatically (storage
  mode), with a version-stamped URL so upgrades refresh the browser cache. A resource
  you added by hand is updated rather than duplicated, and it is removed again when the
  last entry is deleted. In YAML resource mode add the resource to your dashboard YAML.
- Cards are no longer listed twice in the card picker

## 0.3.0
- Every schedule parameter is now an editable entity per channel: sunrise/sunset
  start and end (`time`), minimum and maximum brightness (`number`), curve (`select`)
- Entities and the editor card stay in sync; channels added/removed in the card
  appear/disappear as entities

## 0.2.0
- Auto mode is now an `input_boolean` you create (one per aquarium); several aquariums supported
- Per-channel graph colours
- "Show all channels" toggle in the editor card
- New graph-only card (`aquarium-lighting-graph-card`)
- Removed `switch.aquarium_auto_mode` (cleaned up automatically)

## 0.1.0
- Initial release: schedule engine, background task, config flow, editor card, ESPHome example
