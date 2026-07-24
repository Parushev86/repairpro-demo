import { useState, useEffect, useRef, useCallback } from "react";
import { getSupabase } from "./lib/supabase.js";

const CLOUD_NAME = "f4an70mn";
const UPLOAD_PRESET = "y0qi2jge";

const EMOJIS = ["😀","😂","😍","🔥","👍","👏","💪","🎉","😎","🤔","😅","❤️","✅","⚠️","🔧","📱","💻","📦","💰","🙏"];

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
}

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error("Грешка при качване на файл");
  const data = await res.json();
  return { url: data.secure_url, type: file.type, name: file.name };
}

export default function ChatTab({ currentUser }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const bottomRef = useRef();
  const fileRef = useRef();
  const inputRef = useRef();
  const subRef = useRef(null);

  const userName = currentUser?.username || "Анонимен";
  const userColor = currentUser?.color || "#38bdf8";

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Зареди съобщения
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const load = async () => {
      setLoading(true);
      const { data } = await sb.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200);
      setMessages(data || []);
      setLoading(false);
      scrollToBottom();
    };
    load();

    // Поискай разрешение за нотификации
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Realtime
    subRef.current = sb.channel("chat_room", {
      config: { broadcast: { self: true }, presence: { key: userName } }
    })
      .on("broadcast", { event: "new_message" }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.payload.id)) return prev;
          return [...prev, payload.payload];
        });
        scrollToBottom();
        // Пуш нотификация
        if (payload.payload.user_name !== userName) {
          if (Notification.permission === "granted") {
            new Notification(`💬 ${payload.payload.user_name}`, {
              body: payload.payload.message || "📎 Изпрати файл",
              icon: "/favicon.ico",
            });
          }
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = subRef.current.presenceState();
        const users = Object.values(state).flat();
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await subRef.current.track({ username: userName, color: userColor, online_at: new Date().toISOString() });
        }
      });

    return () => { subRef.current?.unsubscribe(); };
  }, []);

  const sendMessage = async (text = input, fileData = null) => {
    const sb = getSupabase();
    if (!sb) return;
    if (!text?.trim() && !fileData) return;
    setSending(true);
    try {
      const { data, error } = await sb.from("chat_messages").insert({
        user_name: userName,
        user_color: userColor,
        message: text?.trim() || null,
        file_url: fileData?.url || null,
        file_type: fileData?.type || null,
        file_name: fileData?.name || null,
      }).select().single();

      if (!error && data) {
        // Broadcast към всички веднага
        await subRef.current.send({
          type: "broadcast",
          event: "new_message",
          payload: data,
        });
      }
      setInput("");
      setShowEmoji(false);
    } catch (e) {
      console.error(e);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileData = await uploadToCloudinary(file);
      await sendMessage("", fileData);
    } catch (err) {
      alert("Грешка при качване: " + err.message);
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Групиране по дата
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) {
      grouped.push({ type: "date", date: new Date(msg.created_at) });
      lastDate = d;
    }
    grouped.push({ type: "msg", msg });
  });

  const isImage = (type) => type && type.startsWith("image/");
  const isVideo = (type) => type && type.startsWith("video/");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxHeight: 800, background: "#0f172a", borderRadius: 16, overflow: "hidden", border: "1px solid #1e293b" }}>

      {/* Header */}
      <div style={{ padding: "14px 20px", background: "#1e293b", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>💬 Вътрешен чат</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {onlineUsers.length > 0 ? (
              <span style={{ color: "#10b981" }}>● {onlineUsers.length} онлайн: {onlineUsers.map(u => u.username).join(", ")}</span>
            ) : (
              <span>Само ти си онлайн</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: userColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>
            {userName[0]?.toUpperCase()}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{userName}</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
        {loading && <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>Зареждане...</div>}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#475569", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div>Все още няма съобщения. Бъди първият!</div>
          </div>
        )}

        {grouped.map((item, i) => {
          if (item.type === "date") {
            const isToday = item.date.toDateString() === new Date().toDateString();
            const label = isToday ? "Днес" : item.date.toLocaleDateString("bg-BG", { weekday: "long", day: "2-digit", month: "long" });
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 8px" }}>
                <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
                <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
                <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
              </div>
            );
          }

          const { msg } = item;
          const isMe = msg.user_name === userName;
          const prevMsg = grouped[i - 1];
          const sameUser = prevMsg?.type === "msg" && prevMsg.msg.user_name === msg.user_name;

          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, marginTop: sameUser ? 2 : 10 }}>
              {/* Avatar */}
              {!isMe && !sameUser && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.user_color || "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                  {msg.user_name[0]?.toUpperCase()}
                </div>
              )}
              {!isMe && sameUser && <div style={{ width: 28, flexShrink: 0 }} />}

              <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                {!isMe && !sameUser && (
                  <span style={{ fontSize: 11, color: msg.user_color || "#38bdf8", fontWeight: 700, marginBottom: 3, marginLeft: 4 }}>{msg.user_name}</span>
                )}

                <div style={{
                  background: isMe ? "linear-gradient(135deg,#38bdf8,#0ea5e9)" : "#1e293b",
                  borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  padding: msg.file_url && !msg.message ? "6px" : "10px 14px",
                  maxWidth: "100%",
                  boxShadow: "0 2px 8px rgba(0,0,0,.3)",
                }}>
                  {/* Файл/Снимка */}
                  {msg.file_url && (
                    <div style={{ marginBottom: msg.message ? 8 : 0 }}>
                      {isImage(msg.file_type) ? (
                        <img
                          src={msg.file_url}
                          alt={msg.file_name}
                          style={{ maxWidth: 280, maxHeight: 280, borderRadius: 10, cursor: "pointer", display: "block" }}
                          onClick={() => window.open(msg.file_url, "_blank")}
                        />
                      ) : isVideo(msg.file_type) ? (
                        <video src={msg.file_url} controls style={{ maxWidth: 280, borderRadius: 10 }} />
                      ) : (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                          background: "rgba(0,0,0,.2)", borderRadius: 10, textDecoration: "none",
                          color: isMe ? "#fff" : "#38bdf8",
                        }}>
                          <span style={{ fontSize: 20 }}>📎</span>
                          <span style={{ fontSize: 12, fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.file_name}</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Текст */}
                  {msg.message && (
                    <div style={{
                      fontSize: 14, color: isMe ? "#fff" : "#e2e8f0",
                      lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {msg.message}
                    </div>
                  )}
                </div>

                <span style={{ fontSize: 10, color: "#475569", marginTop: 3, padding: "0 4px" }}>
                  {fmtTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", background: "#1e293b", borderTop: "1px solid #334155", flexShrink: 0 }}>
        {showEmoji && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "10px 12px", background: "#0f172a", borderRadius: 10, marginBottom: 10, maxHeight: 120, overflow: "auto" }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => { setInput(p => p + e); inputRef.current?.focus(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: "2px 4px", borderRadius: 6, transition: "background .15s" }}
                onMouseEnter={ev => ev.currentTarget.style.background = "#1e293b"}
                onMouseLeave={ev => ev.currentTarget.style.background = "none"}>
                {e}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="file" ref={fileRef} onChange={handleFile} style={{ display: "none" }} accept="image/*,video/*,.pdf,.doc,.docx,.xlsx,.xls,.txt" />

          <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Прикачи файл" style={{ background: uploading ? "#334155" : "#0f172a", border: "1px solid #334155", color: uploading ? "#475569" : "#64748b", borderRadius: 10, width: 38, height: 38, cursor: uploading ? "not-allowed" : "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {uploading ? "⏳" : "📎"}
          </button>

          <button onClick={() => setShowEmoji(p => !p)} title="Емотикони" style={{ background: showEmoji ? "#38bdf822" : "#0f172a", border: showEmoji ? "1px solid #38bdf8" : "1px solid #334155", color: showEmoji ? "#38bdf8" : "#64748b", borderRadius: 10, width: 38, height: 38, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            😊
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напиши съобщение... (Enter за изпращане, Shift+Enter за нов ред)"
            rows={1}
            style={{
              flex: 1, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0",
              borderRadius: 10, padding: "9px 14px", fontSize: 14, resize: "none",
              outline: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120, overflow: "auto",
            }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          />

          <button onClick={() => sendMessage()} disabled={sending || (!input.trim())} style={{
            background: input.trim() ? "linear-gradient(135deg,#38bdf8,#0ea5e9)" : "#1e293b",
            border: "none", color: input.trim() ? "#fff" : "#475569",
            borderRadius: 10, width: 38, height: 38, cursor: input.trim() ? "pointer" : "not-allowed",
            fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            transition: "all .2s",
          }}>
            {sending ? "⏳" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}
