import React, { useState, useRef, useEffect } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';
const WS_BASE = 'ws://localhost:8000/ws';

function App() {
  // 1. 상태 변수 (VIEW 단계: AUTH -> LOBBY -> CREATE_ROOM -> ROOM)
  const [view, setView] = useState("AUTH");
  const [authMode, setAuthMode] = useState("LOGIN");
  const [user, setUser] = useState({ userId: "", nickname: "", password: "" });
  const [token, setToken] = useState("");
  
  const [roomInfo, setRoomInfo] = useState({ 
    id: "", 
    title: "", 
    password: "", 
    maxParticipants: 2 
  });
  
  const [messages, setMessages] = useState([]); 
  const [isRecording, setIsRecording] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [participants, setParticipants] = useState([]);
  const wsRef = useRef(null);
  const speakerHeartbeatRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStopPromiseRef = useRef(null);

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // --- 비즈니스 로직 ---

  const fetchJson = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      let errorMessage = `요청 실패 (${response.status})`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody === 'string') errorMessage = errorBody;
        if (errorBody?.message) errorMessage = errorBody.message;
      } catch {
        // ignore json parsing errors
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) return null;
    return response.json();
  };

  const uploadAudio = async (roomId, audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, `stt-${Date.now()}.webm`);

    const response = await fetch(`${API_BASE}/rooms/${roomId}/stt`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!response.ok) {
      let errorMessage = `STT 요청 실패 (${response.status})`;
      try {
        const errorBody = await response.json();
        if (typeof errorBody === 'string') errorMessage = errorBody;
        if (errorBody?.message) errorMessage = errorBody.message;
      } catch {
        // ignore json parsing errors
      }
      throw new Error(errorMessage);
    }

    return response.json();
  };

  const addMessage = (message) => {
    if (!message) return;
    setMessages(prev => {
      if (message.id && prev.some(m => m.id === message.id)) return prev;
      return [...prev, message];
    });
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data?.size) audioChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0 && roomInfo.id) {
          const result = await uploadAudio(roomInfo.id, audioBlob);
          addMessage({
            id: result.message_id || `${Date.now()}`,
            sender: user.userId,
            time: formatTime(new Date().toISOString()),
            text: result.text || ''
          });
        }
        if (recordingStopPromiseRef.current) {
          recordingStopPromiseRef.current.resolve();
          recordingStopPromiseRef.current = null;
        }
      } catch (error) {
        if (recordingStopPromiseRef.current) {
          recordingStopPromiseRef.current.reject(error);
          recordingStopPromiseRef.current = null;
        }
        alert(error.message || 'STT 전송 실패');
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve();
    }

    const stopPromise = new Promise((resolve, reject) => {
      recordingStopPromiseRef.current = { resolve, reject };
    });

    recorder.stop();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    return stopPromise;
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const getSenderName = (senderUserId) => {
    if (!senderUserId) return 'Unknown';
    const matched = participants.find(p => p.userId === senderUserId);
    if (matched?.name) return matched.name;
    return senderUserId;
  };

  const loadParticipants = async (roomId) => {
    const participantList = await fetchJson(`/rooms/${roomId}/participants`);
    setParticipants(participantList.map(p => ({ userId: p.user_id, name: p.email })));
  };

  const loadMessages = async (roomId) => {
    const history = await fetchJson(`/rooms/${roomId}/messages?limit=100&offset=0`);
    const mapped = history.map(m => ({
      id: m.id,
      sender: getSenderName(m.sender_user_id),
      time: formatTime(m.created_at),
      text: m.content_text
    }));
    setMessages(mapped);
  };

  const handleAuth = async () => {
    if (!user.userId || !user.password) return alert("아이디와 비밀번호를 입력하세요.");
    try {
      const endpoint = authMode === "LOGIN" ? '/auth/login' : '/auth/signup';
      const result = await fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email: user.userId, password: user.password })
      });

      setToken(result.access_token);
      setUser(prev => ({ ...prev, userId: result.user.email }));
      setView("LOBBY");
    } catch (error) {
      alert(error.message || '로그인 실패');
    }
  };

  const handleCreateRoomFinal = async () => {
    if (!roomInfo.title) return alert("방 제목을 입력하세요.");
    if (roomInfo.password && roomInfo.password.length < 4) return alert("비밀번호는 4자리 이상이어야 합니다.");

    try {
      const payload = {
        title: roomInfo.title,
        ...(roomInfo.password ? { password: roomInfo.password } : {})
      };
      const created = await fetchJson('/rooms', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setRoomInfo(prev => ({
        ...prev,
        id: created.id,
        title: created.title,
        maxParticipants: created.capacity
      }));

      await fetchJson(`/rooms/${created.id}/join`, {
        method: 'POST',
        body: JSON.stringify(roomInfo.password ? { password: roomInfo.password } : {})
      });

      await loadParticipants(created.id);
      await loadMessages(created.id);
      setCurrentSpeaker(null);
      setView("ROOM");
    } catch (error) {
      alert(error.message || '방 생성 실패');
    }
  };

  const handleJoinRoom = async () => {
    const code = prompt("입장할 방 코드를 입력하세요.");
    if (!code) return;
    const pass = prompt("방 비밀번호를 입력하세요.");
    if (pass === null) return;

    try {
      await fetchJson(`/rooms/${code}/join`, {
        method: 'POST',
        body: JSON.stringify(pass ? { password: pass } : {})
      });

      const info = await fetchJson(`/rooms/${code}`);

      setRoomInfo({
        id: info.id,
        title: info.title,
        password: pass,
        maxParticipants: info.capacity
      });

      await loadParticipants(info.id);
      await loadMessages(info.id);
      setCurrentSpeaker(null);
      setView("ROOM");
    } catch (error) {
      alert(error.message || '방 참여 실패');
    }
  };

  const handleLeaveRoom = async () => {
    if (!roomInfo.id) return;
    try {
      await fetchJson(`/rooms/${roomInfo.id}/leave`, { method: 'POST' });
    } catch {
      // ignore leave errors
    }

    setMessages([]);
    setParticipants([]);
    setCurrentSpeaker(null);
    setRoomInfo({ id: "", title: "", password: "", maxParticipants: 2 });
    setView("LOBBY");
  };

  const startSpeakerHeartbeat = async (roomId) => {
    if (speakerHeartbeatRef.current) return;
    speakerHeartbeatRef.current = setInterval(async () => {
      try {
        const heartbeat = await fetchJson(`/rooms/${roomId}/speaker/heartbeat`, { method: 'POST' });
        const name = getSenderName(heartbeat.current_speaker_user_id);
        if (name) setCurrentSpeaker(name);
      } catch {
        // ignore heartbeat errors
      }
    }, 15000);
  };

  const stopSpeakerHeartbeat = () => {
    if (speakerHeartbeatRef.current) {
      clearInterval(speakerHeartbeatRef.current);
      speakerHeartbeatRef.current = null;
    }
  };

  const handleRecordingToggle = async () => {
    if (!roomInfo.id) return;

    if (isRecording) {
      try {
        await stopRecording();
      } catch {
        // ignore upload errors here
      }
      try {
        await fetchJson(`/rooms/${roomInfo.id}/speaker/release`, { method: 'POST' });
      } catch {
        // ignore release errors
      }
      stopSpeakerHeartbeat();
      setIsRecording(false);
      setCurrentSpeaker(null);
      return;
    }

    try {
      const acquired = await fetchJson(`/rooms/${roomInfo.id}/speaker/acquire`, { method: 'POST' });
      const name = getSenderName(acquired.current_speaker_user_id) || user.userId;
      setCurrentSpeaker(name);
      await startSpeakerHeartbeat(roomInfo.id);
      await startRecording();
      setIsRecording(true);
    } catch (error) {
      alert(error.message || '발언 권한을 얻을 수 없습니다.');
    }
  };

  useEffect(() => {
    if (view !== 'ROOM' || !roomInfo.id || !token) return;

    const socket = new WebSocket(`${WS_BASE}/rooms/${roomInfo.id}?token=${token}`);
    wsRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'message.created') {
          const messagePayload = payload.payload || {};
          addMessage({
            id: messagePayload.message_id || `${Date.now()}`,
            sender: getSenderName(messagePayload.sender_user_id),
            time: formatTime(messagePayload.created_at || payload.ts),
            text: messagePayload.text
          });
        }

        if (payload.type === 'speaker.changed') {
          const speakerId = payload.payload?.current_speaker_user_id;
          setCurrentSpeaker(speakerId ? getSenderName(speakerId) : null);
        }
      } catch {
        // ignore websocket parse errors
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      socket.close();
    };
  }, [view, roomInfo.id, token, participants]);

  useEffect(() => {
    return () => {
      stopRecording();
      stopSpeakerHeartbeat();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // 공통 스타일
  const primaryBtn = { padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };
  const inputStyle = { width: '100%', padding: '14px', marginBottom: '15px', borderRadius: '12px', border: '1px solid #ddd', boxSizing: 'border-box', fontSize: '14px' };
  const cardStyle = { background: '#fff', padding: '40px', borderRadius: '24px', width: '380px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center' };

  // --- View Rendering ---

  // 1. 로그인 / 회원가입
  if (view === "AUTH") {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={cardStyle}>
          <h2 style={{ marginBottom: '30px' }}>{authMode === "LOGIN" ? "로그인" : "회원가입"}</h2>
          <input style={inputStyle} placeholder="User ID" onChange={e => setUser({...user, userId: e.target.value})} />
          <input style={inputStyle} type="password" placeholder="Password" onChange={e => setUser({...user, password: e.target.value})} />
          {authMode === "SIGNUP" && <input style={inputStyle} placeholder="Nickname" onChange={e => setUser({...user, nickname: e.target.value})} />}
          <button style={{ ...primaryBtn, width: '100%' }} onClick={handleAuth}>{authMode === "LOGIN" ? "로그인" : "가입하기"}</button>
          <p style={{ marginTop: '20px', fontSize: '13px', color: '#666', cursor: 'pointer' }} onClick={() => setAuthMode(authMode === "LOGIN" ? "SIGNUP" : "LOGIN")}>
            {authMode === "LOGIN" ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}
          </p>
        </div>
      </div>
    );
  }

  // 2. 로비 (방 선택 화면)
  if (view === "LOBBY") {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          <div onClick={() => setView("CREATE_ROOM")} style={{ ...cardStyle, width: '220px', cursor: 'pointer' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>➕</div>
            <h3>방 만들기</h3>
          </div>
          <div onClick={handleJoinRoom} style={{ ...cardStyle, width: '220px', cursor: 'pointer' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>🔑</div>
            <h3>방 참여하기</h3>
          </div>
        </div>
      </div>
    );
  }

  // 3. 방 생성 상세 설정 페이지 (추가된 부분)
  if (view === "CREATE_ROOM") {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '25px' }}>방 설정</h3>
          <input style={inputStyle} placeholder="방 제목 입력" onChange={e => setRoomInfo({...roomInfo, title: e.target.value})} />
          <input style={inputStyle} type="password" placeholder="비밀번호 (4자리 이상)" onChange={e => setRoomInfo({...roomInfo, password: e.target.value})} />
          <div style={{ textAlign: 'left', marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: '#999', marginLeft: '5px' }}>최대 인원</label>
            <input style={{ ...inputStyle, background: '#f9fafb', color: '#ccc', marginTop: '5px' }} value="2명 (MVP 고정)" disabled />
          </div>
          <button style={{ ...primaryBtn, width: '100%' }} onClick={handleCreateRoomFinal}>방 생성 및 입장</button>
          <button style={{ background: 'none', border: 'none', color: '#999', marginTop: '15px', cursor: 'pointer' }} onClick={() => setView("LOBBY")}>취소</button>
        </div>
      </div>
    );
  }

  // 4. 메인 미팅룸 (헤더에 제목 반영)
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: 'sans-serif' }}>
      <aside style={{ width: '240px', background: '#fff', borderRight: '1px solid #e5e7eb', padding: '20px' }}>
        <h4 style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '20px' }}>PARTICIPANTS ({participants.length}/{roomInfo.maxParticipants || 2})</h4>
        {participants.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>{p.name[0]}</div>
            <span style={{ fontSize: '14px', fontWeight: '500' }}>{p.name}</span>
          </div>
        ))}
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 25px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ color: '#4f46e5', fontWeight: 'bold', fontSize: '13px' }}>#{roomInfo.id}</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827' }}>{roomInfo.title}</div>
          <button onClick={handleLeaveRoom} style={{ color: '#ef4444', border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer' }}>나가기</button>
        </div>
        
        {/* ... (이하 자막 영역 및 푸터는 이전과 동일) ... */}
        <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {currentSpeaker && <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '13px' }}>📢 {currentSpeaker} 발언 중...</span>}
        </div>

        <div ref={scrollRef} style={{ flex: 1, padding: '10px 40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ background: '#fff', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e5e7eb', maxWidth: '90%', alignSelf: 'flex-start', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold', color: '#4f46e5', fontSize: '12px' }}>{m.sender}</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>{m.time}</span>
              </div>
              <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>{m.text}</p>
            </div>
          ))}
        </div>

        <footer style={{ padding: '20px', background: '#fff', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button onClick={handleRecordingToggle} style={{ ...primaryBtn, width: '180px', background: isRecording ? '#ef4444' : '#4f46e5' }}>
              {isRecording ? "⏹️ 녹음 중단" : "🎙️ 녹음 시작 (STT)"}
            </button>
            <button style={{ ...primaryBtn, background: '#1f2937', width: '180px' }}>📹 녹화 시작</button>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;