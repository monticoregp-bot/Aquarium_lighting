"""number entities: minimum and maximum brightness (0-255) for each channel."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import ChannelEntity, async_setup_channel_entities

_NUMBERS = (
    ("min", "Minimum brightness", "mdi:brightness-3"),
    ("max", "Maximum brightness", "mdi:brightness-7"),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_setup_channel_entities(
        hass,
        entry,
        async_add_entities,
        lambda coord, e, ch: [ChannelNumber(coord, e, ch, k, n, i) for k, n, i in _NUMBERS],
    )


class ChannelNumber(ChannelEntity, NumberEntity):
    _attr_native_min_value = 0
    _attr_native_max_value = 255
    _attr_native_step = 1
    _attr_mode = NumberMode.SLIDER

    @property
    def native_value(self) -> float | None:
        schedule = self._schedule
        return None if schedule is None else float(getattr(schedule, self._key))

    async def async_set_native_value(self, value: float) -> None:
        await self._async_change(**{self._key: int(value)})
