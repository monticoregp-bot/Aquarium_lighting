"""time entities: sunrise/sunset start and end for each channel."""
from __future__ import annotations

from datetime import time

from homeassistant.components.time import TimeEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import ChannelEntity, async_setup_channel_entities
from .light_controller import parse_hhmm

_TIMES = (
    ("sunrise_start", "Sunrise start", "mdi:weather-sunset-up"),
    ("sunrise_end", "Sunrise end", "mdi:white-balance-sunny"),
    ("sunset_start", "Sunset start", "mdi:weather-sunset"),
    ("sunset_end", "Sunset end", "mdi:weather-sunset-down"),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_setup_channel_entities(
        hass,
        entry,
        async_add_entities,
        lambda coord, e, ch: [ChannelTime(coord, e, ch, k, n, i) for k, n, i in _TIMES],
    )


class ChannelTime(ChannelEntity, TimeEntity):
    @property
    def native_value(self) -> time | None:
        schedule = self._schedule
        if schedule is None:
            return None
        minutes = parse_hhmm(getattr(schedule, self._key))
        return time(minutes // 60, minutes % 60)

    async def async_set_value(self, value: time) -> None:
        await self._async_change(**{self._key: f"{value.hour:02d}:{value.minute:02d}"})
