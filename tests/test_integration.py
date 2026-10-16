"""Integration tests that run in a real Home Assistant (test harness).

    pip install pytest-homeassistant-custom-component
    pytest tests/
"""
import pytest
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAIN = "aquarium_lighting"


@pytest.fixture(autouse=True)
def _enable(enable_custom_integrations):
    yield


async def _setup(hass, **extra):
    assert await async_setup_component(hass, "input_boolean", {"input_boolean": {"aquarium_auto_mode": {}}})
    entry = MockConfigEntry(
        domain=DOMAIN,
        unique_id="input_boolean.aquarium_auto_mode",
        title="Aquarium Lighting (Reef)",
        data={
            "name": "Reef",
            "auto_entity": "input_boolean.aquarium_auto_mode",
            "output_mode": "ha_light",
            "transition_seconds": 60,
            "resume_transition_seconds": 15,
            "initial_channel": "blue",
            "initial_target": "light.reef_blue",
            **extra,
        },
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_entities_are_created(hass):
    await _setup(hass)
    ids = sorted(e for e in hass.states.async_entity_ids() if "blue" in e)
    print("ENTITIES:", ids)
    assert len(ids) == 7
    assert hass.states.get("time.reef_blue_sunrise_start").state == "08:00:00"
    assert hass.states.get("number.reef_blue_maximum_brightness").state == "255.0"
    assert hass.states.get("select.reef_blue_curve").state == "cosine"


async def _until(predicate, timeout=3.0):
    import asyncio

    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while loop.time() < end:
        if predicate():
            return True
        await asyncio.sleep(0.05)
    return predicate()


async def test_entity_edits_update_the_schedule(hass):
    from homeassistant.exceptions import ServiceValidationError

    entry = await _setup(hass)
    coordinator = hass.data[DOMAIN][entry.entry_id]

    await hass.services.async_call("time", "set_value", {"entity_id": "time.reef_blue_sunrise_start", "time": "07:30:00"}, blocking=True)
    assert coordinator.schedules["blue"].sunrise_start == "07:30"
    assert hass.states.get("time.reef_blue_sunrise_start").state == "07:30:00"

    await hass.services.async_call("number", "set_value", {"entity_id": "number.reef_blue_minimum_brightness", "value": 20}, blocking=True)
    assert coordinator.schedules["blue"].min == 20

    # invalid: minimum above maximum is refused with a readable error
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call("time", "set_value", {"entity_id": "time.reef_blue_sunrise_end", "time": "07:00:00"}, blocking=True)
    assert coordinator.schedules["blue"].sunrise_end == "11:00"  # unchanged

    # switching the curve to multi_segment seeds points from the current ramps
    await hass.services.async_call("select", "select_option", {"entity_id": "select.reef_blue_curve", "option": "multi_segment"}, blocking=True)
    assert coordinator.schedules["blue"].curve == "multi_segment"
    assert len(coordinator.schedules["blue"].points) >= 2


async def test_auto_mode_follows_the_helper_and_pushes_lights(hass):
    from pytest_homeassistant_custom_component.common import async_mock_service

    calls = async_mock_service(hass, "light", "turn_on")
    hass.states.async_set("light.reef_blue", "off")
    entry = await _setup(hass)
    coordinator = hass.data[DOMAIN][entry.entry_id]
    assert not coordinator.auto_enabled and not calls  # off: nothing is sent

    await hass.services.async_call("input_boolean", "turn_on", {"entity_id": "input_boolean.aquarium_auto_mode"}, blocking=True)
    assert await _until(lambda: calls), "turning the helper on should push immediately"
    assert calls[0].data["entity_id"] == "light.reef_blue"
    assert 10 <= calls[0].data["brightness"] <= 255
    assert calls[0].data["transition"] == 15  # resume transition

    await hass.services.async_call("input_boolean", "turn_off", {"entity_id": "input_boolean.aquarium_auto_mode"}, blocking=True)
    assert await _until(lambda: not coordinator.auto_enabled)


async def test_channels_added_and_deleted_via_websocket(hass, hass_ws_client):
    entry = await _setup(hass)
    client = await hass_ws_client(hass)
    sched = {"sunrise_start": "09:00", "sunrise_end": "12:00", "sunset_start": "16:00", "sunset_end": "19:00", "min": 0, "max": 200, "curve": "linear", "target": "light.reef_red", "color": "#ff0000"}

    await client.send_json({"id": 1, "type": "aquarium_lighting/set_channel", "name": "red", "schedule": sched})
    msg = await client.receive_json()
    assert msg["success"], msg
    await hass.async_block_till_done()
    assert hass.states.get("select.reef_red_curve").state == "linear"
    assert hass.states.get("number.reef_red_maximum_brightness").state == "200.0"
    assert msg["result"]["channels"]["red"]["color"] == "#ff0000"

    await client.send_json({"id": 2, "type": "aquarium_lighting/get"})
    snap = (await client.receive_json())["result"]
    assert snap["auto_entity"] == "input_boolean.aquarium_auto_mode" and set(snap["channels"]) == {"blue", "red"}

    await client.send_json({"id": 3, "type": "aquarium_lighting/delete_channel", "name": "red"})
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()
    assert hass.states.get("select.reef_red_curve") is None
    assert hass.states.get("select.reef_blue_curve") is not None

    # a bad schedule comes back as a readable error
    await client.send_json({"id": 4, "type": "aquarium_lighting/preview", "schedule": {**sched, "min": 300}})
    bad = await client.receive_json()
    assert not bad["success"] and bad["error"]["code"] == "invalid_schedule"
    assert entry.state.name == "LOADED"
