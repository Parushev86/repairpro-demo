import { useState, useEffect, useRef, useCallback } from "react";
import { getSupabase } from "./lib/supabase.js";

const CLOUD_NAME = "f4an70mn";
const UPLOAD_PRESET = "y0qi2jge";

const EMOJIS = [
  "😀","😁","😂","🤣","😃","😄","😅","😆","😇","😈","😉","😊","😋","😌","😍","😎",
  "😏","😐","😑","😒","😓","😔","😕","😖","😗","😘","😙","😚","😛","😜","😝","😞",
  "😟","😠","😡","😢","😣","😤","😥","😦","😧","😨","😩","😪","😫","😬","😭","😮",
  "😯","😰","😱","😲","😳","😴","😵","😶","😷","🤔","🤗","🤐","🤑","🤒","🤓","🤕",
  "🤢","🤧","🤩","🤪","🤫","🤬","🤭","🤯","🤮","🥰","🥱","🥲","🥳","🥴","🥵","🥶",
  "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👋","🤚","🖐️","✋","🖖","👏","🙌","🤲",
  "🙏","💪","🦾","🦿","👀","👁️","👂","👃","🫀","🫁","🧠","🦷","🦴","👄","👅",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
  "💘","💝","💟","☮️","✝️","☪️","🕉️","☯️","✡️","🔯","🕎","☦️","🛐","⛎","♈","♉",
  "🔥","⭐","🌟","✨","💫","⚡","🌈","❄️","🌊","💧","🌀","🌪️","⚠️","✅","❌","❓",
  "🎉","🎊","🎈","🎁","🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎫","🎟️","🎪","🎭","🎨",
  "🔧","🔨","⚙️","🛠️","🔩","🪛","🔑","🗝️","🔒","🔓","🔏","📱","💻","🖥️","🖨️","⌨️",
  "📦","📫","📬","📭","📮","📯","📰","📄","📃","📑","📊","📈","📉","📋","📌","📍",
  "💰","💵","💴","💶","💷","💸","💳","🏧","💹","💱","💲","🤑","💎","👑","🏰","🏯",
  "🙏","👨‍💻","👩‍💻","🧑‍💻","👨‍🔧","👩‍🔧","🧑‍🔧","👨‍🏭","👩‍🏭","🧑‍🏭","🤝","👫","👬","👭","👪","👨‍👩‍👧",
];

const EMOJI_CATEGORIES = [
  { label: "😀 Лица", start: 0, end: 80 },
  { label: "👍 Жестове", start: 80, end: 96 },
  { label: "❤️ Сърца", start: 112, end: 128 },
  { label: "🔥 Символи", start: 128, end: 160 },
  { label: "🎉 Дейности", start: 160, end: 176 },
  { label: "🔧 Работа", start: 176, end: 208 },
  { label: "🙏 Хора", start: 208, end: EMOJIS.length },
];

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
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Грешка при качване на файл");
  const data = await res.json();
  return { url: data.secure_url, type: file.type, name: file.name };
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, isMe, msg, onClose, onReply, onEdit, onDelete, onCopy, onPin, isPinned }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items = [
    { icon: "↩️", label: "Отговори", action: onReply },
    msg.message && { icon: "📋", label: "Копирай", action: () => { navigator.clipboard.writeText(msg.message); onClose(); } },
    { icon: isPinned ? "📌 Откачи" : "📌 Закачи", label: isPinned ? "Откачи" : "Закачи", action: onPin },
    isMe && msg.message && { icon: "✏️", label: "Редактирай", action: onEdit },
    isMe && { icon: "🗑️", label: "Изтрий", action: onDelete, danger: true },
  ].filter(Boolean);

  // Adjust position to stay in viewport
  const menuStyle = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 40 - 10),
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "6px 0",
    zIndex: 9999,
    minWidth: 170,
    boxShadow: "0 8px 32px rgba(0,0,0,.5)",
  };

  return (
    <div ref={ref} style={menuStyle}>
      {items.map((item, i) => (
        <button key={i} onClick={() => { item.action(); onClose(); }}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "9px 16px", background: "none", border: "none",
            color: item.danger ? "#ef4444" : "#e2e8f0", fontSize: 13, cursor: "pointer",
            textAlign: "left", fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.background = item.danger ? "#450a0a" : "#334155"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function ChatTab({ currentUser, onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, msg }
  const [replyTo, setReplyTo] = useState(null); // msg being replied to
  const [editingMsg, setEditingMsg] = useState(null); // msg being edited
  const [pinnedMsgs, setPinnedMsgs] = useState([]); // pinned message ids
  const [showPinned, setShowPinned] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => {
    try { return Number(localStorage.getItem("chat_last_seen") || 0); } catch { return 0; }
  });
  const [unread, setUnread] = useState(0);

  const bottomRef = useRef();
  const fileRef = useRef();
  const inputRef = useRef();
  const subRef = useRef(null);
  const messagesRef = useRef([]);

  const userName = currentUser?.username || "Анонимен";
  const userColor = currentUser?.color || "#38bdf8";

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const markAsRead = useCallback(() => {
    const now = Date.now();
    localStorage.setItem("chat_last_seen", String(now));
    setLastSeen(now);
    setUnread(0);
    if (onUnreadChange) onUnreadChange(0);
  }, [onUnreadChange]);

  // Count unread from messages
  useEffect(() => {
    const count = messages.filter(m =>
      m.user_name !== userName &&
      new Date(m.created_at).getTime() > lastSeen
    ).length;
    setUnread(count);
    if (onUnreadChange) onUnreadChange(count);
  }, [messages, lastSeen]);

  // Load messages + realtime
  useEffect(() => {
    const sb = getSupabase();
    console.log("CHAT: getSupabase result:", sb ? "OK" : "NULL");
    if (!sb) return;
    const load = async () => {
      setLoading(true);
      const { data, error: loadError } = await sb.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200);
      console.log("CHAT LOAD data count:", data?.length);
      console.log("CHAT LOAD error:", loadError);
      setMessages(data || []);
      messagesRef.current = data || [];
      setLoading(false);
      scrollToBottom();
      markAsRead();
    };
    load();

    // Load pinned
    try {
      const saved = JSON.parse(localStorage.getItem("chat_pinned") || "[]");
      setPinnedMsgs(saved);
    } catch { }

    if (Notification.permission === "default") Notification.requestPermission();

    subRef.current = sb.channel("chat_room", {
      config: { broadcast: { self: true }, presence: { key: userName } }
    })
      .on("broadcast", { event: "new_message" }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.payload.id)) return prev;
          const updated = [...prev, payload.payload];
          messagesRef.current = updated;
          return updated;
        });
        scrollToBottom();
        if (payload.payload.user_name !== userName) {
          if (Notification.permission === "granted") {
            new Notification(`💬 ${payload.payload.user_name}`, {
              body: payload.payload.message || "📎 Изпрати файл",
              icon: "/favicon.ico",
            });
          }
        }
      })
      .on("broadcast", { event: "edit_message" }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.payload.id ? { ...m, message: payload.payload.message, edited: true } : m));
      })
      .on("broadcast", { event: "delete_message" }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.payload.id));
      })
      .on("presence", { event: "sync" }, () => {
        const state = subRef.current.presenceState();
        setOnlineUsers(Object.values(state).flat());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await subRef.current.track({ username: userName, color: userColor, online_at: new Date().toISOString() });
        }
      });

    return () => { subRef.current?.unsubscribe(); };
  }, []);

  // Mark as read when tab is visible
  useEffect(() => {
    markAsRead();
  }, []);

  const sendMessage = async (text = input, fileData = null) => {
    const sb = getSupabase();
    if (!sb) return;

    // EDIT mode
    if (editingMsg) {
      if (!text?.trim()) return;
      setSending(true);
      try {
        await sb.from("chat_messages").update({ message: text.trim() }).eq("id", editingMsg.id);
        await subRef.current.send({ type: "broadcast", event: "edit_message", payload: { id: editingMsg.id, message: text.trim() } });
        setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, message: text.trim(), edited: true } : m));
        setEditingMsg(null);
        setInput("");
      } catch (e) { console.error(e); }
      setSending(false);
      inputRef.current?.focus();
      return;
    }

    if (!text?.trim() && !fileData) return;
    setSending(true);
    try {
      const payload = {
        user_name: userName,
        user_color: userColor,
        message: text?.trim() || null,
        file_url: fileData?.url || null,
        file_type: fileData?.type || null,
        file_name: fileData?.name || null,
        reply_to_id: replyTo?.id || null,
        reply_to_user: replyTo?.user_name || null,
        reply_to_text: replyTo?.message ? replyTo.message.slice(0, 80) : (replyTo?.file_name || null),
      };
      const { data, error } = await sb.from("chat_messages").insert(payload).select().single();
      console.log("CHAT INSERT payload:", payload);
      console.log("CHAT INSERT data:", data);
      console.log("CHAT INSERT error:", error);
      if (!error && data) {
        await subRef.current.send({ type: "broadcast", event: "new_message", payload: data });
      }
      setInput("");
      setReplyTo(null);
      setShowEmoji(false);
    } catch (e) { console.error(e); }
    setSending(false);
    inputRef.current?.focus();
  };

  const deleteMessage = async (msg) => {
    const sb = getSupabase();
    if (!sb) return;
    if (!confirm("Изтрий съобщението?")) return;
    try {
      await sb.from("chat_messages").delete().eq("id", msg.id);
      await subRef.current.send({ type: "broadcast", event: "delete_message", payload: { id: msg.id } });
      setMessages(prev => prev.filter(m => m.id !== msg.id));
    } catch (e) { console.error(e); }
  };

  const togglePin = (msg) => {
    setPinnedMsgs(prev => {
      const exists = prev.find(p => p.id === msg.id);
      const updated = exists ? prev.filter(p => p.id !== msg.id) : [...prev, { id: msg.id, message: msg.message, user_name: msg.user_name, created_at: msg.created_at }];
      localStorage.setItem("chat_pinned", JSON.stringify(updated));
      return updated;
    });
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fileData = await uploadToCloudinary(file);
      await sendMessage("", fileData);
    } catch (err) { alert("Грешка при качване: " + err.message); }
    setUploading(false);
    e.target.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") { setEditingMsg(null); setReplyTo(null); setInput(""); }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  };

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) { grouped.push({ type: "date", date: new Date(msg.created_at) }); lastDate = d; }
    grouped.push({ type: "msg", msg });
  });

  const isImage = (type) => type && type.startsWith("image/");
  const isVideo = (type) => type && type.startsWith("video/");
  const pinnedIds = new Set(pinnedMsgs.map(p => p.id));

  const visibleEmojis = EMOJIS.slice(
    EMOJI_CATEGORIES[emojiCategory]?.start || 0,
    EMOJI_CATEGORIES[emojiCategory]?.end || EMOJIS.length
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxHeight: 860, background: "#0f172a", borderRadius: 16, overflow: "hidden", border: "1px solid #1e293b" }}
      onClick={() => { markAsRead(); setContextMenu(null); }}>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          isMe={contextMenu.msg.user_name === userName}
          msg={contextMenu.msg}
          isPinned={pinnedIds.has(contextMenu.msg.id)}
          onClose={() => setContextMenu(null)}
          onReply={() => { setReplyTo(contextMenu.msg); inputRef.current?.focus(); }}
          onEdit={() => { setEditingMsg(contextMenu.msg); setInput(contextMenu.msg.message || ""); inputRef.current?.focus(); }}
          onDelete={() => deleteMessage(contextMenu.msg)}
          onCopy={() => { navigator.clipboard.writeText(contextMenu.msg.message || ""); }}
          onPin={() => togglePin(contextMenu.msg)}
        />
      )}

      {/* Header */}
      <div style={{ padding: "12px 20px", background: "#1e293b", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>💬 Вътрешен чат</span>
            {pinnedMsgs.length > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setShowPinned(p => !p); }} style={{
                background: showPinned ? "#38bdf822" : "#0f172a", border: "1px solid #334155",
                color: "#38bdf8", borderRadius: 8, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700,
              }}>📌 {pinnedMsgs.length}</button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {onlineUsers.length > 0
              ? <span style={{ color: "#10b981" }}>● {onlineUsers.length} онлайн: {onlineUsers.map(u => u.username).join(", ")}</span>
              : <span>Само ти си онлайн</span>
            }
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: userColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>
            {userName[0]?.toUpperCase()}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{userName}</span>
        </div>
      </div>

      {/* Pinned messages panel */}
      {showPinned && pinnedMsgs.length > 0 && (
        <div style={{ background: "#0f2a3d", borderBottom: "1px solid #334155", padding: "10px 16px", maxHeight: 160, overflow: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: .5 }}>📌 Закачени съобщения</div>
          {pinnedMsgs.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "#1e293b", borderRadius: 8, marginBottom: 4 }}>
              <div>
                <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>{p.user_name}: </span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.message?.slice(0, 80) || "📎 Файл"}</span>
              </div>
              <button onClick={() => togglePin(p)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}

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
          const isPinned = pinnedIds.has(msg.id);
          const isUnread = msg.user_name !== userName && new Date(msg.created_at).getTime() > lastSeen;

          return (
            <div key={msg.id}
              style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, marginTop: sameUser ? 2 : 10, opacity: 1 }}
              onContextMenu={(e) => handleContextMenu(e, msg)}>

              {/* Avatar */}
              {!isMe && !sameUser && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.user_color || "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                  {msg.user_name[0]?.toUpperCase()}
                </div>
              )}
              {!isMe && sameUser && <div style={{ width: 28, flexShrink: 0 }} />}

              <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                {!isMe && !sameUser && (
                  <span style={{ fontSize: 11, color: msg.user_color || "#38bdf8", fontWeight: 700, marginBottom: 3, marginLeft: 4 }}>{msg.user_name}</span>
                )}

                {/* Reply preview */}
                {msg.reply_to_id && (
                  <div style={{
                    background: isMe ? "rgba(255,255,255,.15)" : "#0f172a",
                    borderLeft: "3px solid #38bdf8", borderRadius: "8px 8px 0 0",
                    padding: "5px 10px", maxWidth: "100%", marginBottom: -4,
                  }}>
                    <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700 }}>↩️ {msg.reply_to_user}</div>
                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {msg.reply_to_text || "📎 Файл"}
                    </div>
                  </div>
                )}

                <div style={{
                  background: isMe ? "linear-gradient(135deg,#38bdf8,#0ea5e9)" : "#1e293b",
                  borderRadius: msg.reply_to_id
                    ? (isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px")
                    : (isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px"),
                  padding: msg.file_url && !msg.message ? "6px" : "10px 14px",
                  maxWidth: "100%",
                  boxShadow: isPinned ? "0 0 0 2px #38bdf8" : "0 2px 8px rgba(0,0,0,.3)",
                  position: "relative",
                }}>
                  {isPinned && <span style={{ position: "absolute", top: -8, right: 4, fontSize: 12 }}>📌</span>}
                  {isUnread && <span style={{ position: "absolute", top: -6, left: isMe ? "auto" : 8, right: isMe ? 8 : "auto", width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "block" }} />}

                  {/* File/Image */}
                  {msg.file_url && (
                    <div style={{ marginBottom: msg.message ? 8 : 0 }}>
                      {isImage(msg.file_type) ? (
                        <img src={msg.file_url} alt={msg.file_name}
                          style={{ maxWidth: 280, maxHeight: 280, borderRadius: 10, cursor: "pointer", display: "block" }}
                          onClick={() => window.open(msg.file_url, "_blank")} />
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

                  {/* Text */}
                  {msg.message && (
                    <div style={{ fontSize: 14, color: isMe ? "#fff" : "#e2e8f0", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {msg.message}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, padding: "0 4px" }}>
                  <span style={{ fontSize: 10, color: "#475569" }}>{fmtTime(msg.created_at)}</span>
                  {msg.edited && <span style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>редактирано</span>}
                </div>
              </div>

              {/* Quick actions on hover */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, opacity: 0, transition: "opacity .15s" }}
                className="msg-actions"
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div style={{ padding: "8px 16px", background: "#0f2a3d", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>↩️ Отговаряш на {replyTo.user_name}</div>
            <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
              {replyTo.message?.slice(0, 100) || "📎 Файл"}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
      )}

      {/* Edit bar */}
      {editingMsg && (
        <div style={{ padding: "8px 16px", background: "#0f172a", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>✏️ Редактираш съобщение</div>
          <button onClick={() => { setEditingMsg(null); setInput(""); }} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "12px 16px", background: "#1e293b", borderTop: "1px solid #334155", flexShrink: 0 }}>

        {/* Emoji panel */}
        {showEmoji && (
          <div style={{ background: "#0f172a", borderRadius: 12, marginBottom: 10, border: "1px solid #334155", overflow: "hidden" }}>
            {/* Category tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #334155", overflowX: "auto" }}>
              {EMOJI_CATEGORIES.map((cat, ci) => (
                <button key={ci} onClick={() => setEmojiCategory(ci)} style={{
                  padding: "7px 12px", background: emojiCategory === ci ? "#1e293b" : "transparent",
                  border: "none", color: emojiCategory === ci ? "#38bdf8" : "#64748b",
                  fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontWeight: emojiCategory === ci ? 700 : 400,
                  borderBottom: emojiCategory === ci ? "2px solid #38bdf8" : "2px solid transparent",
                }}>{cat.label}</button>
              ))}
            </div>
            {/* Emojis */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: "10px 12px", maxHeight: 140, overflow: "auto" }}>
              {visibleEmojis.map((e, ei) => (
                <button key={ei} onClick={() => { setInput(p => p + e); inputRef.current?.focus(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: "3px 5px", borderRadius: 6 }}
                  onMouseEnter={ev => ev.currentTarget.style.background = "#1e293b"}
                  onMouseLeave={ev => ev.currentTarget.style.background = "none"}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="file" ref={fileRef} onChange={handleFile} style={{ display: "none" }} accept="image/*,video/*,.pdf,.doc,.docx,.xlsx,.xls,.txt" />

          <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Прикачи файл"
            style={{ background: uploading ? "#334155" : "#0f172a", border: "1px solid #334155", color: uploading ? "#475569" : "#64748b", borderRadius: 10, width: 38, height: 38, cursor: uploading ? "not-allowed" : "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {uploading ? "⏳" : "📎"}
          </button>

          <button onClick={() => setShowEmoji(p => !p)} title="Емотикони"
            style={{ background: showEmoji ? "#38bdf822" : "#0f172a", border: showEmoji ? "1px solid #38bdf8" : "1px solid #334155", color: showEmoji ? "#38bdf8" : "#64748b", borderRadius: 10, width: 38, height: 38, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            😊
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={editingMsg ? "Редактирай съобщението..." : "Напиши съобщение... (Enter — изпрати, Shift+Enter — нов ред, Esc — отказ)"}
            rows={1}
            style={{
              flex: 1, background: "#0f172a", border: editingMsg ? "1px solid #f59e0b" : "1px solid #334155",
              color: "#e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 14, resize: "none",
              outline: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120, overflow: "auto",
            }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          />

          <button onClick={() => sendMessage()} disabled={sending || (!input.trim() && !editingMsg)}
            style={{
              background: input.trim() ? (editingMsg ? "linear-gradient(135deg,#f59e0b,#d97706)" : "linear-gradient(135deg,#38bdf8,#0ea5e9)") : "#1e293b",
              border: "none", color: input.trim() ? "#fff" : "#475569",
              borderRadius: 10, width: 38, height: 38, cursor: input.trim() ? "pointer" : "not-allowed",
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s",
            }}>
            {sending ? "⏳" : editingMsg ? "✅" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}
