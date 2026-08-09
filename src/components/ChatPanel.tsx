import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Square,
  Sparkles,
  AlertTriangle,
  Trash2,
  Minimize2,
} from 'lucide-react';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from './ui/message-scroller';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { streamChat, ChatStreamError } from '../services/chat';
import type { Instrument, Timeframe } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

interface ChatPanelProps {
  instrument: Instrument | null;
  timeframe: Timeframe;
  aiAvailable: boolean;
}

const STORAGE_KEY = 'tradepilot_chat';

/** Prompts that make the assistant immediately useful to a beginner. */
const SUGGESTIONS = [
  'Is now a good time to buy?',
  'Explain the current signal simply',
  'What is RSI telling me here?',
  'How much should I risk per trade?',
];

/**
 * Minimal markdown renderer for assistant replies.
 *
 * Deliberately hand-rolled and escape-first: chat output is model-generated, so
 * it is treated as untrusted and never passed to dangerouslySetInnerHTML.
 * Supports the small subset the system prompt actually asks for.
 */
function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split('\n');

  return blocks.map((line, i) => {
    const key = `l${i}`;

    if (line.trim() === '') return <div key={key} className="h-2" />;

    // ### heading
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      return (
        <p key={key} className="font-bold text-foreground mt-2 mb-1">
          {inline(heading[1])}
        </p>
      );
    }

    // - bullet  /  * bullet
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      return (
        <div key={key} className="flex gap-2 my-0.5">
          <span className="text-primary shrink-0">•</span>
          <span className="min-w-0">{inline(bullet[1])}</span>
        </div>
      );
    }

    // 1. numbered
    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (numbered) {
      return (
        <div key={key} className="flex gap-2 my-0.5">
          <span className="text-primary shrink-0 font-mono text-xs">{numbered[1]}.</span>
          <span className="min-w-0">{inline(numbered[2])}</span>
        </div>
      );
    }

    return (
      <p key={key} className="my-0.5">
        {inline(line)}
      </p>
    );
  });
}

/** Handles **bold**, *italic* and `code` within a line. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="font-mono text-[0.85em] bg-muted px-1 py-0.5 rounded border border-border"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ instrument, timeframe, aiAvailable }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [unread, setUnread] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist for the tab session only — chat history is not sensitive but does
  // not belong in long-term storage either.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {
      /* quota or private mode; not worth surfacing */
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      // Defer focus until the panel has actually mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close on Escape, and cancel any in-flight reply.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isStreaming) abortRef.current?.abort();
        else setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isStreaming]);

  // Abort any active stream when the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      const assistantId = `a_${Date.now()}`;

      // Snapshot the transcript for the request before appending the empty
      // assistant row, so the model never receives a blank final turn.
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: 'assistant', content: '' },
      ]);
      setInput('');
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat({
          messages: history,
          instrumentId: instrument?.id ?? null,
          timeframe,
          signal: controller.signal,
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
            );
          },
        });
      } catch (err) {
        const message =
          err instanceof ChatStreamError ? err.message : 'Something went wrong. Please try again.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || message, error: !m.content }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;

        // Drop an assistant turn that produced nothing at all (e.g. cancelled
        // immediately), so the transcript has no empty bubbles.
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && m.content.trim() === ''))
        );
      }
    },
    [messages, instrument?.id, timeframe, isStreaming]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // ------------------------------------------------------------ launcher

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 h-13 px-4 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 border border-border transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open the AI assistant"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-semibold hidden sm:inline">Ask AI</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    );
  }

  // --------------------------------------------------------------- panel

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col w-[min(26rem,calc(100vw-2.5rem))] h-[min(38rem,calc(100vh-6rem))] rounded-2xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
      role="dialog"
      aria-label="AI assistant"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card/95 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate">Ask AI</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {instrument ? `Discussing ${instrument.displaySymbol} · ${timeframe}` : 'No market selected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="h-7 w-7 text-muted-foreground hover:text-rose-500"
              title="Clear conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="h-7 w-7 text-muted-foreground"
            title="Minimise"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              abortRef.current?.abort();
              setIsOpen(false);
            }}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 min-h-0 relative">
        <MessageScrollerProvider
          autoScroll
          defaultScrollPosition="last-anchor"
          scrollPreviousItemPeek={56}
        >
          <MessageScroller className="h-full">
            <MessageScrollerViewport className="px-4 py-4">
              <MessageScrollerContent
                className="gap-4"
                aria-busy={isStreaming}
              >
                {messages.length === 0 ? (
                  <MessageScrollerItem messageId="empty">
                    <div className="text-center py-6 space-y-4">
                      <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">How can I help?</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[16rem] mx-auto leading-relaxed">
                          Ask about the market you are viewing, a signal you were given, or anything
                          about trading.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 pt-1">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void send(s)}
                            disabled={!aiAvailable}
                            className="text-xs text-left px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </MessageScrollerItem>
                ) : (
                  messages.map((m) => (
                    <MessageScrollerItem
                      key={m.id}
                      messageId={m.id}
                      // Anchor on the user's turn so a new exchange starts near
                      // the top with the reply streaming in below it.
                      scrollAnchor={m.role === 'user'}
                    >
                      {m.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {m.content}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-start">
                          <div
                            className={`max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed break-words border ${
                              m.error
                                ? 'bg-rose-500/10 border-rose-500/30 text-foreground'
                                : 'bg-muted/60 border-border'
                            }`}
                          >
                            {m.error && (
                              <div className="flex items-center gap-1.5 text-rose-500 font-semibold text-xs mb-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Error
                              </div>
                            )}
                            {m.content ? (
                              <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                {renderMarkdown(m.content)}
                              </div>
                            ) : (
                              // Typing indicator while the first token is pending.
                              <div className="flex gap-1 py-1" aria-label="Assistant is typing">
                                {[0, 150, 300].map((delay) => (
                                  <span
                                    key={delay}
                                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                                    style={{ animationDelay: `${delay}ms` }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </MessageScrollerItem>
                  ))
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>

            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 bg-card/95 backdrop-blur-sm shrink-0 space-y-2"
      >
        {!aiAvailable && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-500">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>The AI service is not configured on this server.</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!aiAvailable}
            rows={1}
            placeholder={aiAvailable ? 'Ask anything…' : 'Chat unavailable'}
            className="flex-1 min-h-9 max-h-32 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 scrollbar-subtle"
            // Grow with content up to the max height.
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
          />

          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => abortRef.current?.abort()}
              className="h-9 w-9 shrink-0 border-border"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || !aiAvailable}
              className="h-9 w-9 shrink-0 bg-primary text-primary-foreground disabled:opacity-40"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center leading-tight">
          AI can make mistakes. This is not financial advice.
        </p>
      </form>
    </div>
  );
};
