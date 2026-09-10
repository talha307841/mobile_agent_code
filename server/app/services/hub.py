from __future__ import annotations

import asyncio
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket

from agentdeck_protocol import Envelope


class ConnectionHub:
    def __init__(self) -> None:
        self._devices: dict[UUID, WebSocket] = {}
        self._users: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect_device(self, device_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            old = self._devices.get(device_id)
            self._devices[device_id] = websocket
        if old and old is not websocket:
            await old.close(code=4001, reason="Device reconnected")

    async def disconnect_device(self, device_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            if self._devices.get(device_id) is websocket:
                self._devices.pop(device_id, None)

    async def connect_user(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._users[user_id].add(websocket)

    async def disconnect_user(self, user_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            self._users[user_id].discard(websocket)

    def device_online(self, device_id: UUID) -> bool:
        return device_id in self._devices

    async def send_device(self, device_id: UUID, message: Envelope) -> bool:
        socket = self._devices.get(device_id)
        if socket is None:
            return False
        try:
            await socket.send_text(message.model_dump_json())
            return True
        except Exception:
            await self.disconnect_device(device_id, socket)
            return False

    async def notify_user(self, user_id: UUID, message: Envelope) -> None:
        dead: list[WebSocket] = []
        for socket in list(self._users[user_id]):
            try:
                await socket.send_text(message.model_dump_json())
            except Exception:
                dead.append(socket)
        for socket in dead:
            await self.disconnect_user(user_id, socket)


hub = ConnectionHub()

