"""Config flow: choose output mode + transitions, then create the first channel.

More channels (and all schedule editing) are done from the Lovelace card.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

from .const import (
    CONF_AUTO_ENTITY,
    CONF_INITIAL_CHANNEL,
    CONF_INITIAL_TARGET,
    CONF_OUTPUT_MODE,
    CONF_RESUME_TRANSITION,
    CONF_TRANSITION,
    DEFAULT_AUTO_ENTITY,
    DEFAULT_RESUME_TRANSITION,
    DEFAULT_TRANSITION,
    DOMAIN,
    MODE_LIGHT,
    MODE_MQTT,
    MODE_REST,
)
from .light_controller import validate_channel_name

_MODE_OPTIONS = [
    SelectOptionDict(value=MODE_LIGHT, label="Home Assistant light entities"),
    SelectOptionDict(value=MODE_REST, label="ESPHome REST API (direct HTTP to ESP32)"),
    SelectOptionDict(value=MODE_MQTT, label="MQTT (ESPHome JSON light schema)"),
]


def _settings_schema(defaults: dict[str, Any], *, creating: bool = False) -> vol.Schema:
    seconds = NumberSelectorConfig(
        min=0, max=120, step=1, unit_of_measurement="s", mode=NumberSelectorMode.BOX
    )
    first: dict[Any, Any] = {}
    if creating:
        first[vol.Required(CONF_NAME, default="Aquarium")] = TextSelector()
        auto_key = vol.Required(CONF_AUTO_ENTITY)
    else:
        auto_key = vol.Required(
            CONF_AUTO_ENTITY, default=defaults.get(CONF_AUTO_ENTITY) or DEFAULT_AUTO_ENTITY
        )
    first[auto_key] = EntitySelector(EntitySelectorConfig(domain="input_boolean"))
    return vol.Schema(
        {
            **first,
            vol.Required(
                CONF_OUTPUT_MODE, default=defaults.get(CONF_OUTPUT_MODE, MODE_LIGHT)
            ): SelectSelector(
                SelectSelectorConfig(options=_MODE_OPTIONS, mode=SelectSelectorMode.DROPDOWN)
            ),
            vol.Required(
                CONF_TRANSITION, default=defaults.get(CONF_TRANSITION, DEFAULT_TRANSITION)
            ): NumberSelector(seconds),
            vol.Required(
                CONF_RESUME_TRANSITION,
                default=defaults.get(CONF_RESUME_TRANSITION, DEFAULT_RESUME_TRANSITION),
            ): NumberSelector(seconds),
        }
    )


class AquariumLightingConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    def __init__(self) -> None:
        self._settings: dict[str, Any] = {}

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            # one aquarium per auto-mode helper; create more entries for more tanks
            await self.async_set_unique_id(user_input[CONF_AUTO_ENTITY])
            self._abort_if_unique_id_configured()
            self._settings = user_input
            return await self.async_step_channel()
        return self.async_show_form(
            step_id="user", data_schema=_settings_schema({}, creating=True)
        )

    async def async_step_channel(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        mode = self._settings[CONF_OUTPUT_MODE]
        if user_input is not None:
            name = user_input["name"].strip().lower().replace(" ", "_")
            try:
                validate_channel_name(name)
            except ValueError:
                errors["name"] = "invalid_name"
            else:
                tank = self._settings.get(CONF_NAME, "Aquarium")
                return self.async_create_entry(
                    title=f"Aquarium Lighting ({tank})",
                    data={
                        **self._settings,
                        CONF_INITIAL_CHANNEL: name,
                        CONF_INITIAL_TARGET: user_input.get("target", ""),
                    },
                )

        target_selector = (
            EntitySelector(EntitySelectorConfig(domain="light"))
            if mode == MODE_LIGHT
            else TextSelector()
        )
        schema = vol.Schema(
            {
                vol.Required("name", default="blue"): TextSelector(),
                vol.Optional("target"): target_selector,
            }
        )
        return self.async_show_form(
            step_id="channel",
            data_schema=schema,
            errors=errors,
            description_placeholders={"target_help": _TARGET_HELP[mode]},
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return AquariumLightingOptionsFlow()


class AquariumLightingOptionsFlow(config_entries.OptionsFlow):
    """Change output mode / transition lengths. Reloads the entry on save."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(step_id="init", data_schema=_settings_schema(current))


_TARGET_HELP = {
    MODE_LIGHT: "Pick the light entity that powers this channel.",
    MODE_REST: "Base URL of the ESPHome light, e.g. http://reef-light.local/light/blue",
    MODE_MQTT: "The light's MQTT command topic, e.g. reef-light/light/blue/command",
}
