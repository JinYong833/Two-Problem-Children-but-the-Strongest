import React, { useState, useRef, useEffect } from 'react';

function App() {
  // 1. 상태 변수 (VIEW 단계: AUTH -> LOBBY -> CREATE_ROOM -> ROOM)
  const [view, setView] = useState("AUTH");
  const [authMode, setAuthMode] = useState("LOGIN");
  const [user, setUser] = useState({ userId: "", nickname: "", password: "" });
  
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

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // --- 비즈니스 로직 ---

  const handleAuth = () => {
    if (!user.userId || !user.password) return alert("아이디와 비밀번호를 입력하세요.");
    setView("LOBBY");
  };

  const handleCreateRoomFinal = () => {
    if (!roomInfo.title) return alert("방 제목을 입력하세요.");
    if (roomInfo.password.length < 4) return alert("비밀번호는 4자리 이상이어야 합니다.");
    
    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomInfo(prev => ({ ...prev, id: generatedCode }));
    setParticipants([{ name: user.nickname || user.userId }]);
    setView("ROOM");
  };

  const handleJoinRoom = () => {
    const code = prompt("입장할 방 코드를 입력하세요.");
    if (!code) return;
    const pass = prompt("방 비밀번호를 입력하세요.");
    if (!pass) return;
    
    setRoomInfo({ id: code, title: "참여한 미팅룸", password: pass, maxParticipants: 2 });
    setParticipants([{ name: "방장" }, { name: user.nickname || user.userId }]);
    setView("ROOM");
  };

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
        <h4 style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '20px' }}>PARTICIPANTS ({participants.length}/2)</h4>
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
          <button onClick={() => window.location.reload()} style={{ color: '#ef4444', border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer' }}>나가기</button>
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
            <button onClick={() => setIsRecording(!isRecording)} style={{ ...primaryBtn, width: '180px', background: isRecording ? '#ef4444' : '#4f46e5' }}>
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