"""Aquarium Lighting - schedule-driven, multi-channel aquarium light control."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from . import api
from .const import DOMAIN, FRONTEND_URL, VERSION
from .coordinator import AquariumLightingCoordinator

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.NUMBER, Platform.SELECT, Platform.TIME]
_GLOBAL_KEY = f"{DOMAIN}_global_setup_done"


async def _async_setup_global(hass: HomeAssistant) -> None:
    """Register the websocket API and the Lovelace cards once per HA run."""
    if hass.data.get(_GLOBAL_KEY):
        return
    api.async_register(hass)
    card = Path(__file__).parent / "frontend" / "aquarium-lighting-card.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(card), cache_headers=False)]
    )
    # Some HA versions do not load this automatically; if the cards are
    # missing, add FRONTEND_URL as a dashboard resource (see README).
    add_extra_js_url(hass, f"{FRONTEND_URL}?v={VERSION}")
    hass.data[_GLOBAL_KEY] = True


def _remove_legacy_switch(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """v0.1 created switch.aquarium_auto_mode; auto mode is now an input_boolean."""
    ent_reg = er.async_get(hass)
    entity_id = ent_reg.async_get_entity_id("switch", DOMAIN, f"{entry.entry_id}_auto_mode")
    if entity_id:
        ent_reg.async_remove(entity_id)
    dev_reg = dr.async_get(hass)
    device = dev_reg.async_get_device(identifiers={(DOMAIN, entry.entry_id)})
    if device:
        dev_reg.async_remove_device(device.id)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await _async_setup_global(hass)
    _remove_legacy_switch(hass, entry)

    coordinator = AquariumLightingCoordinator(hass, entry)
    await coordinator.async_load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    coordinator.async_start()
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator: AquariumLightingCoordinator = hass.data[DOMAIN][entry.entry_id]
    await coordinator.async_stop()
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
