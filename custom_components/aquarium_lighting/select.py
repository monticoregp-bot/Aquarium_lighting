"""select entity: curve type for each channel."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import ChannelEntity, async_setup_channel_entities
from .light_controller import CURVES


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_setup_channel_entities(
        hass,
        entry,
        async_add_entities,
        lambda coord, e, ch: [ChannelCurve(coord, e, ch, "curve", "Curve", "mdi:chart-bell-curve-cumulative")],
    )


class ChannelCurve(ChannelEntity, SelectEntity):
    _attr_options = list(CURVES)

    @property
    def current_option(self) -> str | None:
        schedule = self._schedule
        return None if schedule is None else schedule.curve

    async def async_select_option(self, option: str) -> None:
        await self._async_change(curve=option)
