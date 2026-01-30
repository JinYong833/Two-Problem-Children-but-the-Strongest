# STT Room API Specification

## Base
- Base URL: `/api/v1`
- Auth: Bearer JWT
- Content-Type: `application/json` (except file uploads)

---

## Auth
### POST /auth/signup
Create a new user.

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**Response 201**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2026-01-29T00:00:00Z"
  },
  "access_token": "jwt",
  "token_type": "bearer"
}
```

---

### POST /auth/login
Login with email/password.

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**Response 200**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2026-01-29T00:00:00Z"
  },
  "access_token": "jwt",
  "token_type": "bearer"
}
```

---

### GET /auth/me
Get current user.

**Response 200**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "created_at": "2026-01-29T00:00:00Z"
}
```

---

## Rooms
### POST /rooms
Create a room.

**Request Body**
```json
{
  "title": "Room Title",
  "password": "optional"
}
```

**Response 201**
```json
{
  "id": "uuid",
  "title": "Room Title",
  "has_password": true,
  "capacity": 2,
  "created_by": "uuid",
  "created_at": "2026-01-29T00:00:00Z",
  "current_speaker_user_id": null,
  "speaker_expires_at": null
}
```

---

### GET /rooms
List rooms.

**Query Params**
- `limit` (default 50)
- `offset` (default 0)

**Response 200**
```json
[
  {
    "id": "uuid",
    "title": "Room Title",
    "has_password": true,
    "participant_count": 1,
    "capacity": 2,
    "created_at": "2026-01-29T00:00:00Z"
  }
]
```

---

### GET /rooms/{room_id}
Get room info.

**Response 200**
```json
{
  "id": "uuid",
  "title": "Room Title",
  "has_password": true,
  "capacity": 2,
  "created_by": "uuid",
  "created_at": "2026-01-29T00:00:00Z",
  "current_speaker_user_id": null,
  "speaker_expires_at": null
}
```

---

### POST /rooms/{room_id}/join
Join a room (capacity 2, optional password).

**Request Body**
```json
{
  "password": "optional"
}
```

**Response 200**
```json
{ "joined": true }
```

Errors:
- 404 `Room not found`
- 409 `Room is full`
- 403 `Invalid password`

---

### POST /rooms/{room_id}/leave
Leave a room.

**Response 200**
```json
{ "left": true }
```

---

### GET /rooms/{room_id}/participants
Get online participants.

**Response 200**
```json
[
  {
    "user_id": "uuid",
    "email": "user@example.com",
    "status": "online",
    "joined_at": "2026-01-29T00:00:00Z"
  }
]
```

---

## Speaker Lock
### POST /rooms/{room_id}/speaker/acquire
Acquire speaker lock.

**Response 200**
```json
{
  "acquired": true,
  "current_speaker_user_id": "uuid",
  "expires_at": "2026-01-29T00:00:20Z"
}
```

Errors:
- 409 `SPEAKER_TAKEN`

---

### POST /rooms/{room_id}/speaker/release
Release speaker lock.

**Response 200**
```json
{ "released": true }
```

Errors:
- 403 `NOT_SPEAKER`

---

### POST /rooms/{room_id}/speaker/heartbeat
Extend speaker TTL.

**Response 200**
```json
{
  "acquired": true,
  "current_speaker_user_id": "uuid",
  "expires_at": "2026-01-29T00:00:20Z"
}
```

Errors:
- 403 `NOT_SPEAKER`

---

## STT
### POST /rooms/{room_id}/stt
Upload audio for STT (speaker only).

**Content-Type**: `multipart/form-data`
- `file`: audio file

**Response 200**
```json
{
  "message_id": "uuid",
  "text": "transcribed text",
  "status": "final",
  "processing_time_ms": 1234.56
}
```

Errors:
- 403 `NOT_SPEAKER`
- 404 `Room not found`

---

## Messages
### GET /rooms/{room_id}/messages
Get message history.

**Query Params**
- `limit` (default 100)
- `offset` (default 0)

**Response 200**
```json
[
  {
    "id": "uuid",
    "room_id": "uuid",
    "sender_user_id": "uuid",
    "sender_email": "user@example.com",
    "type": "stt",
    "content_text": "text",
    "meta_json": {"processing_time_ms": 1234.56},
    "status": "final",
    "created_at": "2026-01-29T00:00:00Z"
  }
]
```

---

## WebSocket
### GET /ws/rooms/{room_id}?token=JWT
WebSocket for real-time events.

**Events**
- `speaker.changed`
- `message.created`

**Event format**
```json
{
  "type": "message.created",
  "payload": {
    "message_id": "uuid",
    "room_id": "uuid",
    "sender_user_id": "uuid",
    "sender_email": "user@example.com",
    "type": "stt",
    "text": "...",
    "status": "final",
    "created_at": "2026-01-29T00:00:00Z"
  },
  "ts": "2026-01-29T00:00:00Z"
}
```
