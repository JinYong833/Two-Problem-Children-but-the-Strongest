# Copilot Instructions — STT Room (MVP) + Phase 2 Sign Upload (Whisper/Transformers)
목표: 2명이 방에 들어가서 **한 사람만 발화권(마이크 토큰)을 획득**할 수 있고, 음성을 말한 뒤(또는 업로드) STT 결과가 상대 화면에 **준실시간으로 표시**된다.  
Phase 2: 수화 영상은 업로드/저장 + “번역 대기중” 표시까지. (번역 모델은 후순위)

---

## 0) 핵심 원칙 (중요)
- **UI 비활성화는 편의**이고, **동시성 보장은 서버가 강제**한다.
- 발화권(마이크 토큰)은 방에 1명만 존재한다: `current_speaker_user_id`
- 발화권은 TTL을 가진다(예: 20초). 비정상 종료 시 자동 해제.
- 발화권 보유자만 STT 업로드/전송이 가능하다.
- MVP에서는 “실시간 스트리밍”이 아니라 **“말하고 완료 → 업로드 → 확정 텍스트 브로드캐스트”**를 기본으로 구현한다.
- 실시간 통신은 **WebSocket 우선**, 대안으로 SSE 가능.

---
## 0.5) 구현 순서 (Implementation Order) — 필수 참고

### Phase 1: Backend MVP (이 순서대로 진행)
1. **Dependencies** — requirements.txt에 필수 패키지 추가
2. **Config** — 환경변수/설정 확장 (DB URL, JWT Secret, Model Name 등)
3. **Database Setup** — SQLAlchemy async + PostgreSQL 설정
4. **Models** — users, rooms, room_participants, messages 테이블
5. **Auth Service** — JWT 발급/검증, 비밀번호 해싱
6. **Auth Endpoints** — POST /auth/signup, /auth/login, GET /me
7. **Room Service** — CRUD, join/leave, 발화권(speaker lock) 로직
8. **Room Endpoints** — 방 생성/목록/입장/퇴장/참여자 조회
9. **Speaker Endpoints** — acquire/release/heartbeat
10. **STT Integration** — 기존 STT 서비스를 room context + speaker lock과 연동
11. **Message Service** — 메시지 저장/조회
12. **WebSocket** — 실시간 이벤트 브로드캐스트

### Python 필수 의존성
```
# Database
sqlalchemy[asyncio]>=2.0
asyncpg
alembic

# Auth  
python-jose[cryptography]
passlib[bcrypt]
bcrypt

# WebSocket
websockets

# 기존
fastapi
uvicorn[standard]
python-multipart
pydantic-settings
torch
transformers>=4.40
soundfile
numpy
librosa
```

### 환경변수 (.env)
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/stt_room
SECRET_KEY=your-super-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=1440
MODEL_NAME=openai/whisper-small
DEVICE=cuda
MAX_NEW_TOKENS=512
SPEAKER_TTL_SECONDS=20
DEBUG=false
```

---
## 1) MVP 범위
### MUST (Phase 1)
- Auth: 회원가입/로그인(JWT)
- Room: 생성/입장/퇴장 (제목 필수, 비번 옵션, 인원 2명 제한)
- Participants: 참여자 목록/상태 표시
- Speaker Lock: acquire/release + TTL
- STT: 음성 업로드 → STT → 메시지 발행(WS/SSE)
- FE: 마이크 버튼 상태머신 + 상대가 말하는 동안 버튼 비활성화

### SHOULD (Nice)
- partial/final 구분 (partial은 선택)
- message history 조회

### LATER (Phase 2)
- 수화 영상 업로드 + 저장 + “번역 대기중” 상태
- (추후) 수화→텍스트(SLT) 번역 작업/결과 발행

---

# =========================
# BACKEND (BE) INSTRUCTIONS
# =========================

## 2) 기술/구조 가이드
- API는 REST + WebSocket(또는 SSE) 혼합
- 인증은 Bearer JWT
- 인원 제한(2명)과 발화권 제어는 서버에서 강제
- 동시성은 아래 중 하나로 원자성 보장:
  1) DB 조건부 업데이트(권장 MVP)
  2) Redis 분산 락(스케일 필요할 때)
- STT는 동기(간단) 또는 비동기(확장). MVP는 동기 처리 후 브로드캐스트 OK.

---

## 3) STT 엔진 / 모델 정책 (Whisper 계열, Transformers 기반)
### 기술 스택
- Python 3.12
- FastAPI
- huggingface-hub
- transformers

### 모델 선택 기본값
- Whisper 계열 모델 사용 (예: `openai/whisper-large-v3`, `openai/whisper-medium`)
- 언어: `ko` 우선 (필요 시 auto)
- 태스크: `transcribe` (번역이 아니라 받아쓰기)

### 다운로드/캐시 정책 (중요)
- huggingface-hub 캐시를 사용한다.
- 서버 부팅 시 모델을 1회 로드하여 재사용한다(요청마다 로드 금지).
- 환경변수로 모델명을 바꿀 수 있게 한다:
  - `MODEL_NAME` (default: `openai/whisper-large-v3`)
- GPU가 있으면 `cuda`, 없으면 `cpu`로 degrade
- dtype:
  - cuda: fp16
  - cpu: fp32

### 추론 정책 (MVP)
- MVP는 “녹음 완료 후 업로드 → STT → 최종 텍스트(final)만 브로드캐스트”가 기본.
- partial/streaming은 Phase 1.5 또는 이후로 미룬다.

### 구현 방식 표준 (Transformers)
- `WhisperProcessor` + `WhisperForConditionalGeneration` 사용
- 입력 오디오는 반드시 **16kHz mono**로 맞춘다.
- `forced_decoder_ids`로 `language="ko"`, `task="transcribe"`를 설정한다.
- 장문 오디오는 chunk(예: 20~30s) 분할 처리 고려(선택).

### 성능/UX 권장
- 응답이 5~20초까지 늘어날 수 있으므로:
  - FE에는 uploading/processing 상태를 표시한다.
  - BE는 요청당 처리시간(ms)을 로깅한다.

### 금지 규칙 (필수)
- 요청마다 모델 load 금지 (메모리/지연 폭발)
- 전역 모델 객체의 설정을 요청 스코프에서 변경 금지(스레드/동시성 위험)
- speaker lock 없는 STT 요청 허용 금지

---

## 4) 데이터 모델 (MVP 최소)
### users
- id (uuid)
- email or username (unique)
- password_hash
- created_at

### rooms
- id (uuid)
- title (required)
- password_hash (nullable)
- capacity (default=2, fixed)
- created_by (user_id)
- created_at
- current_speaker_user_id (nullable)
- speaker_expires_at (nullable)

### room_participants
- id
- room_id
- user_id
- joined_at
- left_at (nullable)
- status: online/offline

### messages
- id
- room_id
- sender_user_id
- type: "stt" | "sign"
- content_text (nullable for sign pending)
- meta_json (optional: confidence, lang, duration, etc.)
- created_at

---

## 5) REST API (MVP)
### Auth
- POST /auth/signup
  - body: { email, password }
  - resp: { user, token }
- POST /auth/login
  - body: { email, password }
  - resp: { token }
- GET /me
  - resp: { user }

### Room
- POST /rooms
  - body: { title, password? }
  - resp: { room_id, title, has_password }
- GET /rooms/{room_id}
  - resp: { room info + current speaker }
- POST /rooms/{room_id}/join
  - body: { password? }
  - rules:
    - capacity=2 제한 (online participant 기준)
  - resp: { joined: true }
- POST /rooms/{room_id}/leave
  - resp: { left: true }

### Participants
- GET /rooms/{room_id}/participants
  - resp: [{ user_id, status }]

### Speaker Lock
- POST /rooms/{room_id}/speaker/acquire
  - rules:
    - if current_speaker_user_id is null OR speaker_expires_at < now → acquire 성공
    - else 실패(409)
    - set speaker_expires_at = now + TTL(20s)
  - resp: { acquired: true, expires_at }
- POST /rooms/{room_id}/speaker/release
  - rules:
    - only if current_speaker_user_id == me → release
  - resp: { released: true }
- (옵션) POST /rooms/{room_id}/speaker/heartbeat
  - rules:
    - only speaker can extend TTL
  - resp: { expires_at }

### STT
- POST /rooms/{room_id}/stt
  - multipart: audio_file
  - rules:
    - only speaker can call
  - resp: { message_id, text, status:"final" }
  - side-effect:
    - publish WS event message.created (final)

### Messages (optional)
- GET /messages?room_id=...
  - resp: [{...}]

### Sign Upload (Phase 2)
- POST /rooms/{room_id}/sign/upload
  - multipart: video_file
  - resp: { job_id, status:"pending" }
  - side-effect:
    - publish message.created with type="sign" and pending state

---

## 6) WebSocket 이벤트 스키마 (권장)
- WS endpoint: /ws/rooms/{room_id}
- server sends events as:
  - { "type": "<event_type>", "payload": {...}, "ts": "<iso>" }

### Event Types
- room.participant.joined
  - payload: { user_id }
- room.participant.left
  - payload: { user_id }
- speaker.changed
  - payload: { current_speaker_user_id, expires_at }
- message.created
  - payload: { message_id, room_id, sender_user_id, type, text?, status:"final|partial|pending", created_at }

---

## 7) 동시성 구현 가이드 (DB 조건부 업데이트 MVP)
- acquire는 단일 UPDATE로 원자성 보장:
  - UPDATE rooms
    SET current_speaker_user_id = :me,
        speaker_expires_at = :now + TTL
    WHERE id = :room_id
      AND (current_speaker_user_id IS NULL OR speaker_expires_at < :now);
- affected_rows == 1 이면 성공, 0이면 실패(409)
- release:
  - UPDATE rooms SET current_speaker_user_id=NULL, speaker_expires_at=NULL
    WHERE id=:room_id AND current_speaker_user_id=:me;

---

## 8) 에러 규칙
- join capacity 초과 → 409 (ROOM_FULL)
- speaker acquire 실패 → 409 (SPEAKER_TAKEN)
- stt 호출 시 speaker 아님 → 403 (NOT_SPEAKER)
- password 필요/불일치 → 403 (INVALID_PASSWORD) 로 통일

---

# =========================
# FRONTEND (FE) INSTRUCTIONS
# =========================

## 9) 화면(페이지) 구성 (MVP)
- /login
- /signup
- /rooms (방 목록 + 만들기)
- /rooms/:roomId (대화 화면)
  - participants list
  - speaker indicator (누가 말하는지)
  - mic button (acquire/record/upload/release)
  - chat/messages area (final 텍스트 표시)

---

## 10) 마이크 버튼 상태 머신 (필수)
상태:
- idle: 아무도 발화권 없음 / 나는 발화권 없음
- requesting: acquire 요청 중
- holding: 발화권 있음, 녹음 시작 전
- recording: 녹음 중
- uploading: 업로드/STT 처리 중
- disabled: 다른 사용자가 발화권 보유 중

전이:
- idle -> requesting -> holding (acquire 성공)
- requesting -> idle (acquire 실패)
- holding -> recording (record start)
- recording -> uploading (record stop + upload)
- uploading -> holding (업로드 성공, 계속 발화권 유지 가능)
- holding -> idle (release)
- any -> disabled (speaker.changed에서 다른 user로 변경되면)
- disabled -> idle (speaker changed to null or expires)

UI 규칙:
- disabled 상태에서는 mic 버튼 비활성화 + “누가 말하는 중” 표시
- holding/recording/uploading 동안에는 상대방 mic는 서버 이벤트로 disabled 처리

---

## 11) 실시간 동기화
- 방 입장 시 WS 연결
- WS 이벤트 처리:
  - speaker.changed → 상태 업데이트(내가 speaker면 holding 유지, 아니면 disabled)
  - message.created → 채팅창 append
  - participant joined/left → 참가자 UI 갱신
- 초기 진입 시 REST로 participants + room 상태를 한번 fetch 후 WS로 최신 유지

---

## 12) 음성 업로드 방식 (MVP 기본)
- 브라우저:
  - MediaRecorder로 녹음 → Blob 생성 → multipart로 `POST /rooms/{room_id}/stt`
- 앱(Flutter 등):
  - native record → file upload

---

## 13) FE 에러 핸들링 UX
- speaker acquire 실패(409):
  - “상대가 말하는 중” 안내 + 버튼 disabled 전환
- stt 업로드 실패:
  - “전송 실패” 안내 + 재시도 버튼
- WS 끊김:
  - 재연결 시도 + room 상태 재fetch

---

## 14) 코딩 스타일/산출물 요구
- BE: 엔드포인트/스키마/에러코드/원자성 로직을 먼저 구현하고, WS 이벤트 브로드캐스트를 붙인다.
- FE: 화면은 단순하게 시작하고, 상태 머신 + WS 이벤트 핸들러를 최우선으로 완성한다.
- “2명 제한 + 발화권 1명” 불변조건이 깨지지 않도록 테스트 케이스를 꼭 만든다.

---

## 15) 테스트 체크리스트 (MVP)
- [ ] 두 명이 같은 방에 입장 가능
- [ ] 세 번째가 join 시 409 (ROOM_FULL)
- [ ] 동시에 acquire 요청 2개 → 하나만 성공
- [ ] speaker가 아닌 사용자가 stt 호출 → 403 (NOT_SPEAKER)
- [ ] speaker TTL 만료 후 다른 사람이 acquire 가능
- [ ] message.created가 상대 UI에 즉시 반영
- [ ] 요청마다 모델 로드하지 않음(부팅 1회 로드)
