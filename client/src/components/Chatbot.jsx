import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

export default function Chatbot({
  apiUrl = '/api/query',
  headerImage = null // not used in UI now but kept for compatibility
}) {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const idRef = useRef(1);
  const endRef = useRef(null);
  const typingTimer = useRef(null);
  const animateInterval = useRef(null);

  // for cancelling current request
  const controllerRef = useRef(null);
  // to know which bot message is the current "typing" one
  const currentBotIdRef = useRef(null);

  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (animateInterval.current) clearInterval(animateInterval.current);
    if (controllerRef.current) controllerRef.current.abort();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, typing]);

  const pushMsg = (from, text, status = 'delivered') => {
    const m = { id: idRef.current++, from, text, status };
    setMsgs((s) => [...s, m]);
    return m;
  };

  const animateType = (msgId, fullText) =>
    new Promise((resolve) => {
      let i = 0;
      if (animateInterval.current) clearInterval(animateInterval.current);
      const total = fullText.length;
      const speed = Math.max(
        6,
        Math.floor(20 - Math.log10(Math.max(1, total)) * 1.3)
      );
      animateInterval.current = setInterval(() => {
        i++;
        setMsgs((s) =>
          s.map((m) =>
            m.id === msgId ? { ...m, text: fullText.slice(0, i) } : m
          )
        );
        if (i >= total) {
          clearInterval(animateInterval.current);
          animateInterval.current = null;
          resolve();
        }
      }, speed);
    });

  const handleStop = () => {
    if (!loading) return;

    // cancel axios request
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }

    // stop typing animation
    if (animateInterval.current) {
      clearInterval(animateInterval.current);
      animateInterval.current = null;
    }

    const botId = currentBotIdRef.current;
    if (botId != null) {
      setMsgs((s) =>
        s.map((m) =>
          m.id === botId
            ? { ...m, text: 'Stopped.', status: 'stopped' }
            : m
        )
      );
    }

    setLoading(false);
    setTyping(false);
    setError('');
  };

  const clearChat = () => {
    // stop any ongoing typing / requests
    handleStop();
    setMsgs([]);
    setError('');
  };

  const send = async (e) => {
    e?.preventDefault();
    setError('');

    if (loading) {
      // if already loading, don't start another one
      return;
    }

    const txt = input.trim();
    if (!txt) return;

    pushMsg('user', txt);
    setInput('');
    setLoading(true);
    setTyping(true);

    const placeholder = pushMsg('bot', '', 'typing');
    currentBotIdRef.current = placeholder.id;

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const resp = await axios.post(
        apiUrl,
        { text: txt },
        { timeout: 30000, signal: controller.signal }
      );

      const reply =
        (resp?.data?.text || resp?.data?.reply || '').trim() ||
        'Sorry, I do not have an answer.';

      await animateType(placeholder.id, reply);

      setMsgs((s) =>
        s.map((m) =>
          m.id === placeholder.id ? { ...m, status: 'delivered' } : m
        )
      );
    } catch (err) {
      console.error(err);

      // if it was cancelled by Stop button, don't show error
      if (
        err?.code === 'ERR_CANCELED' ||
        err?.name === 'CanceledError' ||
        err?.name === 'AbortError'
      ) {
        console.log('Request cancelled');
      } else {
        setError(err?.response?.data || err.message || 'Network error');
        setMsgs((s) =>
          s.map((m) =>
            m.id === currentBotIdRef.current
              ? {
                  ...m,
                  text: 'Error: could not get reply',
                  status: 'error'
                }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
      setTyping(false);
      controllerRef.current = null;
      currentBotIdRef.current = null;
    }
  };

  const SUGGESTIONS = ['What is DI?', 'How to create campaign?', 'DI not working?'];

  const TypingDots = ({ size = 8 }) => (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#ddd',
          opacity: 0.45,
          animation: 'dot 1s 0ms infinite'
        }}
      />
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#ddd',
          opacity: 0.45,
          animation: 'dot 1s 160ms infinite'
        }}
      />
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#ddd',
          opacity: 0.45,
          animation: 'dot 1s 320ms infinite'
        }}
      />
      <style>{`@keyframes dot { 0%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-6px)}80%{opacity:.25;transform:translateY(0)}100%{opacity:.25;transform:translateY(0)} }`}</style>
    </span>
  );

  // ---------- COPY HELPER ----------
  const copyText = async (text, id) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('copy failed', e);
      setError('Copy failed');
      setTimeout(() => setError(''), 2000);
    }
  };

  const widgetWrap = {
    position: 'fixed',
    right: 14,
    bottom: 14,
    width: 360,
    maxWidth: '92vw',
    zIndex: 999999,
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial"
  };
  const toggleCircle = {
    position: 'fixed',
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    background: '#0f172a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 30px rgba(2,6,23,0.18)',
    cursor: 'pointer',
    border: 'none'
  };
  const panel = {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 30px 60px rgba(2,6,23,0.16)',
    border: '1px solid rgba(15,23,42,0.06)',
    background: '#fff',
    borderRadius: '15px',
    marginBottom: '15px'
  };
  const header = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    background: 'linear-gradient(91deg, rgb(0 29 99), rgb(55 149 255 / 97%))',
    color: '#fff'
  };
  const title = { fontSize: 14, fontWeight: 800 };

  const body = {
    padding: 14,
    height: 360,
    overflowY: 'auto',
    background: 'rgb(245 245 245)'
  };
  const footer = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderTop: '1px solid rgb(0 0 0 / 10%)',
    background: 'rgb(245 245 245)'
  };

  const inputStyle = {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 30,
    border: '1px solid #e6eef6',
    outline: 'none',
    borderColor: '#6b6b6b73'
  };

  const sendBtnCircle = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(91deg, rgb(0 29 99), rgb(55 149 255 / 97%))',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 18,
    boxShadow: '0 8px 20px rgba(2,6,23,0.12)'
  };

  const stopBtnSquare = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(91deg, rgb(0 29 99), rgb(55 149 255 / 97%))',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 18,
    boxShadow: '0 8px 20px rgba(2,6,23,0.12)'
  };

  const botBubble = {
    background: '#f7fafc',
    borderRadius: 12,
    padding: '14px 14px 28px 14px', // extra bottom padding for copy button
    maxWidth: '100%',
    border: '1px solid #f1f5f9',
    position: 'relative' // needed for absolute copy button inside
  };

  const userBubble = {
    background: 'linear-gradient(91deg, rgb(0 29 99), rgb(55 149 255 / 97%))',
    color: '#fff',
    borderRadius: 12,
    padding: '14px 14px 14px 14px',
    maxWidth: '84%',
    position: 'relative'
  };

  const copyBtnInside = {
    position: 'absolute',
    left: 8,               // left bottom corner inside bubble
    bottom: 6,
    width: 28,
    height: 22,
    borderRadius: 6,
    border: 'none',
    background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 4px 10px rgba(2,6,23,0.06)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13
  };

  const copiedBadgeStyle = {
    position: 'absolute',
    left: 40,
    bottom: 6,
    fontSize: 12,
    color: '#059669' // green
  };

  return (
    <div>
      <button
        aria-label={open ? 'Close chat' : 'Open chat'}
        onClick={() => setOpen((o) => !o)}
        style={toggleCircle}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* panel */}
      <div
        style={{
          ...widgetWrap,
          transform: open ? 'translateY(0) scale(1)' : 'translateY(12px) scale(.98)',
          opacity: open ? 1 : 0.0,
          pointerEvents: open ? 'auto' : 'none'
        }}
      >
        <div style={panel}>
          <div style={header}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={title}>GURU</div>
            </div>

            {/* CLEAR CHAT BUTTON */}
            <button
              onClick={clearChat}
              style={{
                marginLeft: 'auto',
                marginRight: 8,
                background: 'rgba(255,255,255,0.14)',
                border: 'none',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                color: '#e5e7eb',
                cursor: 'pointer'
              }}
            >
              Clear chat
            </button>

            {/* CLOSE BUTTON  */}
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 15,
                fontWeight: 'bold',
                color: '#d0000099',
                cursor: 'pointer',
                lineHeight: 1
              }}
            >
              ✕
            </button>
          </div>

          <div style={body}>
            {msgs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={botBubble}>
                  <div style={{ fontWeight: 700 }}>👋 Hi! I am GURU, ask me anything about DI!</div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s);
                        setTimeout(() => send(), 120);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        border: '1px solid #eef2f6',
                        background: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* message list */}
            {msgs.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
                  {m.from === 'bot' ? (
                    <div style={{ ...botBubble }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text || (m.status === 'typing' ? <TypingDots /> : '')}</div>

                      {/* copy button inside bottom-left of bot bubble (only for bot replies) */}
                      <button
                        onClick={() => copyText(m.text, m.id)}
                        title="Copy response"
                        style={copyBtnInside}
                      >
                        📋
                      </button>

                      {copiedId === m.id && <div style={copiedBadgeStyle}>Copied</div>}
                    </div>
                  ) : (
                    <div style={{ ...userBubble }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={endRef} />
          </div>

          {/* footer with input */}
          <form style={footer} onSubmit={send}>
            <input
              aria-label="Write a message"
              placeholder="Message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
              style={inputStyle}
            />

            {/* Send / Stop button */}
            {loading ? (
              <button type="button" style={stopBtnSquare} onClick={handleStop}>■</button>
            ) : (
              <button type="submit" style={sendBtnCircle} disabled={!input.trim()}>↑</button>
            )}
          </form>

          {error && <div style={{ padding: 8, color: 'crimson', fontSize: 13 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
