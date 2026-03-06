/**
 * Conversations store — manages the list of past conversations.
 *
 * Handles CRUD operations backed by SQLite.
 * The store holds an in-memory cache; mutations write through to the DB.
 */

import { create } from "zustand";

export interface Conversation {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationsState {
  /** All conversations, ordered by updatedAt descending */
  conversations: Conversation[];
  /** Whether we're loading from the database */
  isLoading: boolean;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useConversationsStore = create<ConversationsState>((set) => ({
  conversations: [],
  isLoading: false,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    })),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}));
