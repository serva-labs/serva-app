/**
 * useChat — orchestrates the chat flow.
 *
 * Connects the UI to providers + SQLite + Zustand.
 *
 * Flow:
 * 1. User sends a message
 * 2. If new conversation, create it in SQLite
 * 3. Save user message to SQLite + Zustand
 * 4. Call provider.sendMessage with streaming callbacks
 * 5. Tokens stream into Zustand (streamingContent)
 * 6. On done, save assistant message to SQLite + Zustand
 *
 * Also handles: loading conversations from history, aborting streams,
 * starting new chats, and error states.
 */

import { useCallback, useRef } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { useChatStore } from "@/src/store/chat";
import { useProvidersStore } from "@/src/store/providers";
import {
  useConversationsStore,
  type Conversation,
} from "@/src/store/conversations";
import { getProvider } from "@/src/providers/registry";
import type { Message, StreamController } from "@/src/providers/types";

function generateId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 10)
  );
}

export function useChat() {
  const db = useSQLiteContext();
  const streamControllerRef = useRef<StreamController | null>(null);
  const abortedRef = useRef(false);

  // Zustand selectors (stable references)
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const activeProviderId = useProvidersStore((s) => s.activeProviderId);
  const activeModelId = useProvidersStore((s) => s.activeModelId);

  // ─── Send a message ──────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!activeProviderId || !activeModelId) {
        return { error: "No model selected. Pick a model first." };
      }

      // Snapshot provider/model IDs at call time so async callbacks
      // always reference the values that were active when the request started,
      // even if the user switches models mid-stream.
      const snapshotProviderId = activeProviderId;
      const snapshotModelId = activeModelId;

      const provider = getProvider(snapshotProviderId);
      if (!provider) {
        return {
          error: "Provider not available. Check your API key in Settings.",
        };
      }

      const chatStore = useChatStore.getState();
      const convoStore = useConversationsStore.getState();

      let conversationId = chatStore.activeConversationId;

      // Create conversation if this is the first message
      if (!conversationId) {
        conversationId = generateId();
        const now = Date.now();
        const title = text; // Full first message as title

        const conversation: Conversation = {
          id: conversationId,
          title,
          providerId: snapshotProviderId,
          modelId: snapshotModelId,
          createdAt: now,
          updatedAt: now,
        };

        // Write to SQLite
        await db.runAsync(
          `INSERT INTO conversations (id, title, provider_id, model_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          conversationId,
          title,
          snapshotProviderId,
          snapshotModelId,
          now,
          now,
        );

        // Update stores
        convoStore.addConversation(conversation);
        chatStore.setActiveConversationId(conversationId);
      }

      // Create user message
      const userMessage: Message = {
        id: generateId(),
        conversationId,
        role: "user",
        content: text,
        providerId: snapshotProviderId,
        modelId: snapshotModelId,
        createdAt: Date.now(),
      };

      // Save user message to SQLite
      await db.runAsync(
        `INSERT INTO messages (id, conversation_id, role, content, provider_id, model_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        userMessage.id,
        userMessage.conversationId,
        userMessage.role,
        userMessage.content,
        userMessage.providerId,
        userMessage.modelId,
        userMessage.createdAt,
      );

      // Add to Zustand
      chatStore.addMessage(userMessage);
      chatStore.setStreaming(true);
      chatStore.clearStreamingContent();
      abortedRef.current = false;

      // Build message history for the API (role + content only)
      const currentMessages = useChatStore.getState().messages;
      const apiMessages = currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Start streaming
      const finalConversationId = conversationId;
      const controller = provider.sendMessage(
        apiMessages,
        snapshotModelId,
        {
          onToken: (token: string) => {
            useChatStore.getState().appendStreamingContent(token);
          },
          onDone: async (fullText: string) => {
            // Guard: if the stream was aborted, stopStreaming already
            // saved the partial response — don't double-save.
            if (abortedRef.current) return;

            const store = useChatStore.getState();

            // Create assistant message
            const assistantMessage: Message = {
              id: generateId(),
              conversationId: finalConversationId,
              role: "assistant",
              content: fullText,
              providerId: snapshotProviderId,
              modelId: snapshotModelId,
              createdAt: Date.now(),
            };

            // Save to SQLite
            await db.runAsync(
              `INSERT INTO messages (id, conversation_id, role, content, provider_id, model_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              assistantMessage.id,
              assistantMessage.conversationId,
              assistantMessage.role,
              assistantMessage.content,
              assistantMessage.providerId,
              assistantMessage.modelId,
              assistantMessage.createdAt,
            );

            // Update conversation's updatedAt
            await db.runAsync(
              `UPDATE conversations SET updated_at = ? WHERE id = ?`,
              Date.now(),
              finalConversationId,
            );

            // Update conversation in Zustand
            useConversationsStore.getState().updateConversation(
              finalConversationId,
              { updatedAt: Date.now() },
            );

            // Add assistant message and clear streaming
            store.addMessage(assistantMessage);
            store.setStreaming(false);
            store.clearStreamingContent();
            streamControllerRef.current = null;
          },
          onError: (error: Error) => {
            // Guard: if the stream was aborted, ignore callback errors.
            if (abortedRef.current) return;

            const store = useChatStore.getState();
            store.setStreaming(false);
            store.clearStreamingContent();
            streamControllerRef.current = null;

            // Add an ephemeral error message so the user sees what went wrong.
            // NOT persisted to SQLite — errors are transient.
            store.addMessage({
              id: generateId(),
              conversationId: finalConversationId,
              role: "assistant",
              content: `Error: ${error.message}`,
              providerId: snapshotProviderId,
              modelId: snapshotModelId,
              createdAt: Date.now(),
            });
          },
        },
      );

      streamControllerRef.current = controller;
      return { error: null };
    },
    [db, activeProviderId, activeModelId],
  );

  // ─── Stop streaming ──────────────────────────────────────────────────────

  const stopStreaming = useCallback(() => {
    abortedRef.current = true;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;

    const store = useChatStore.getState();
    const currentContent = store.streamingContent;

    if (currentContent) {
      // Snapshot provider/model from store (not closure) for consistency
      const { activeProviderId: pid, activeModelId: mid } =
        useProvidersStore.getState();

      // Save the partial response as a message
      const conversationId = store.activeConversationId;
      if (conversationId && pid && mid) {
        const partialMessage: Message = {
          id: generateId(),
          conversationId,
          role: "assistant",
          content: currentContent,
          providerId: pid,
          modelId: mid,
          createdAt: Date.now(),
        };

        store.addMessage(partialMessage);

        // Save partial to SQLite (fire and forget)
        db.runAsync(
          `INSERT INTO messages (id, conversation_id, role, content, provider_id, model_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          partialMessage.id,
          partialMessage.conversationId,
          partialMessage.role,
          partialMessage.content,
          partialMessage.providerId,
          partialMessage.modelId,
          partialMessage.createdAt,
        ).catch(() => {
          // Best effort — don't crash if this fails
        });
      }
    }

    store.setStreaming(false);
    store.clearStreamingContent();
  }, [db]);

  // ─── Load a conversation from history ────────────────────────────────────

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const store = useChatStore.getState();

      // Abort any active stream
      if (store.isStreaming) {
        streamControllerRef.current?.abort();
        streamControllerRef.current = null;
      }

      // Load messages from SQLite
      const rows = await db.getAllAsync<{
        id: string;
        conversation_id: string;
        role: string;
        content: string;
        provider_id: string;
        model_id: string;
        created_at: number;
      }>(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
        conversationId,
      );

      const loadedMessages: Message[] = rows.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role as Message["role"],
        content: row.content,
        providerId: row.provider_id,
        modelId: row.model_id,
        createdAt: row.created_at,
      }));

      // Load conversation metadata to set the correct provider/model
      const convo = await db.getFirstAsync<{
        provider_id: string;
        model_id: string;
      }>(
        `SELECT provider_id, model_id FROM conversations WHERE id = ?`,
        conversationId,
      );

      store.setMessages(loadedMessages);
      store.setActiveConversationId(conversationId);
      store.setStreaming(false);
      store.clearStreamingContent();

      // Set the active provider/model to match the conversation
      if (convo) {
        useProvidersStore
          .getState()
          .setActiveProviderAndModel(convo.provider_id, convo.model_id);
      }
    },
    [db],
  );

  // ─── Start a new chat ────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    // Abort any active stream (read from store, not stale closure)
    if (useChatStore.getState().isStreaming) {
      abortedRef.current = true;
      streamControllerRef.current?.abort();
      streamControllerRef.current = null;
    }

    useChatStore.getState().reset();
  }, []);

  // ─── Load all conversations (for history screen) ─────────────────────────

  const loadConversations = useCallback(async () => {
    const convoStore = useConversationsStore.getState();
    convoStore.setLoading(true);

    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      provider_id: string;
      model_id: string;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM conversations ORDER BY updated_at DESC`,
    );

    const conversations: Conversation[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      providerId: row.provider_id,
      modelId: row.model_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    convoStore.setConversations(conversations);
    convoStore.setLoading(false);
  }, [db]);

  // ─── Delete a conversation ───────────────────────────────────────────────

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      // Delete from SQLite (cascade deletes messages)
      await db.runAsync(
        `DELETE FROM conversations WHERE id = ?`,
        conversationId,
      );

      // Remove from Zustand
      useConversationsStore.getState().removeConversation(conversationId);

      // If the deleted conversation is currently active, reset chat
      const chatState = useChatStore.getState();
      if (chatState.activeConversationId === conversationId) {
        chatState.reset();
      }
    },
    [db],
  );

  return {
    // State
    messages,
    isStreaming,
    streamingContent,
    activeConversationId,

    // Actions
    sendMessage,
    stopStreaming,
    loadConversation,
    newChat,
    loadConversations,
    deleteConversation,
  };
}
