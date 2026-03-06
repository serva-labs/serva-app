/**
 * Chat store — manages the active chat session state.
 *
 * Tracks current messages, streaming state, and the active conversation.
 * Does NOT persist to SQLite directly — that's handled by the conversations store.
 */

import { create } from "zustand";
import type { Message } from "@/src/providers/types";

interface ChatState {
  /** Messages in the active conversation */
  messages: Message[];
  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;
  /** Partial text being streamed (appended token by token) */
  streamingContent: string;
  /** ID of the active conversation (null = new chat) */
  activeConversationId: string | null;

  // Actions
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setStreaming: (isStreaming: boolean) => void;
  appendStreamingContent: (token: string) => void;
  clearStreamingContent: () => void;
  setActiveConversationId: (id: string | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  streamingContent: "",
  activeConversationId: null,

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setStreaming: (isStreaming) => set({ isStreaming }),

  appendStreamingContent: (token) =>
    set((state) => ({ streamingContent: state.streamingContent + token })),

  clearStreamingContent: () => set({ streamingContent: "" }),

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  reset: () =>
    set({
      messages: [],
      isStreaming: false,
      streamingContent: "",
      activeConversationId: null,
    }),
}));
