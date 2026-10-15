"""Websocket API for the Lovelace cards.

Every command takes an optional ``auto_entity``: the input_boolean that
identifies which aquarium (config entry) you mean. With a single aquarium it
can be omitted.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .coordinator import AquariumLightingCoordinator
from .light_controller import ChannelSchedule, preview_curve

_AUTO = {vol.Optional("auto_entity"): str}


def _resolve(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> AquariumLightingCoordinator | None:
    """Find the aquarium a command is for, or send an error and return None."""
    coordinators: list[AquariumLightingCoordinator] = list(hass.data.get(DOMAIN, {}).values())
    wanted = msg.get("auto_entity")
    if wanted:
        for coordinator in coordinators:
            if coordinator.auto_entity == wanted:
                return coordinator
        connection.send_error(
            msg["id"], "not_found",
            f"No Aquarium Lighting entry uses {wanted}. Check auto_entity in the card config.",
        )
        return None
    if len(coordinators) == 1:
        return coordinators[0]
    if not coordinators:
        connection.send_error(msg["id"], "not_configured", "Aquarium Lighting is not set up")
    else:
        connection.send_error(
            msg["id"], "ambiguous",
            "Several aquariums are configured; set auto_entity in the card config.",
        )
    return None


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_preview)
    websocket_api.async_register_command(hass, ws_set_channel)
    websocket_api.async_register_command(hass, ws_delete_channel)


@websocket_api.websocket_command({vol.Required("type"): "aquarium_lighting/get", **_AUTO})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    coordinator = _resolve(hass, connection, msg)
    if coordinator is not None:
        connection.send_result(msg["id"], coordinator.snapshot())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "aquarium_lighting/preview",
        vol.Required("schedule"): dict,
        vol.Optional("step", default=10): vol.All(int, vol.Range(min=1, max=120)),
    }
)
@callback
def ws_preview(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Evaluate an UNSAVED draft with the same engine that drives the lights."""
    try:
        schedule = ChannelSchedule.from_dict(msg["schedule"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_schedule", str(err))
        return
    connection.send_result(
        msg["id"], {"step": msg["step"], "values": preview_curve(schedule, msg["step"])}
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "aquarium_lighting/set_channel",
        vol.Required("name"): str,
        vol.Required("schedule"): dict,
        **_AUTO,
    }
)
@websocket_api.async_response
async def ws_set_channel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    coordinator = _resolve(hass, connection, msg)
    if coordinator is None:
        return
    try:
        await coordinator.async_set_channel(msg["name"], msg["schedule"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_schedule", str(err))
        return
    connection.send_result(msg["id"], coordinator.snapshot())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "aquarium_lighting/delete_channel", vol.Required("name"): str, **_AUTO}
)
@websocket_api.async_response
async def ws_delete_channel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    coordinator = _resolve(hass, connection, msg)
    if coordinator is None:
        return
    try:
        await coordinator.async_delete_channel(msg["name"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], coordinator.snapshot())
