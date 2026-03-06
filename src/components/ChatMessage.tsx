/**
 * ChatMessage — renders a single message bubble.
 *
 * User messages: right-aligned indigo bubble, plain text.
 * Assistant messages: left-aligned, rendered as Markdown with:
 * - Fenced code blocks with a "Copy" button
 * - Inline code, bold, italic, lists, links, etc.
 * - Dark/light theme-aware styling
 *
 * Streaming indicator: blinking cursor appended while streaming.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  useColorScheme,
} from "react-native";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import type { MessageRole } from "@/src/providers/types";

interface ChatMessageProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
}

export const ChatMessage = React.memo(function ChatMessage({
  role,
  content,
  isStreaming,
}: ChatMessageProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isUser = role === "user";

  // Memoize styles and rules so they only recompute when theme changes
  const markdownStyles = useMemo(() => getMarkdownStyles(isDark), [isDark]);
  const rules = useMemo(() => getMarkdownRules(isDark), [isDark]);

  if (isUser) {
    return (
      <View className="px-4 py-1.5 items-end">
        <View className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-500 px-4 py-3">
          <Text className="text-base leading-6 text-white">
            {content}
          </Text>
        </View>
      </View>
    );
  }

  // Assistant message — render with Markdown
  const displayContent = isStreaming ? content + " \u2588" : content;

  return (
    <View className="px-4 py-1.5 items-start">
      <View className="max-w-[95%]">
        <Markdown style={markdownStyles} rules={rules}>
          {displayContent}
        </Markdown>
      </View>
    </View>
  );
});

// ─── Code block copy button ──────────────────────────────────────────────────

function CodeBlockCopyButton({
  content,
  isDark,
}: {
  content: string;
  isDark: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <Pressable
      onPress={handleCopy}
      style={[
        styles.copyButton,
        { backgroundColor: isDark ? "#374151" : "#E5E7EB" },
      ]}
      hitSlop={8}
    >
      <Ionicons
        name={copied ? "checkmark" : "copy-outline"}
        size={14}
        color={isDark ? "#9CA3AF" : "#6B7280"}
      />
      <Text
        style={[
          styles.copyButtonText,
          { color: isDark ? "#9CA3AF" : "#6B7280" },
        ]}
      >
        {copied ? "Copied" : "Copy"}
      </Text>
    </Pressable>
  );
}

// ─── Custom render rules (for code blocks with copy) ─────────────────────────

function getMarkdownRules(isDark: boolean) {
  return {
    fence: (
      node: any,
      _children: any,
      _parent: any,
      _styles: any,
      _inheritedStyles: any,
    ) => {
      let { content } = node;
      if (
        typeof content === "string" &&
        content.charAt(content.length - 1) === "\n"
      ) {
        content = content.substring(0, content.length - 1);
      }

      const language = node.sourceInfo || "";

      return (
        <View
          key={node.key}
          style={[
            styles.codeBlockContainer,
            {
              backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
              borderColor: isDark ? "#334155" : "#E2E8F0",
            },
          ]}
        >
          <View
            style={[
              styles.codeBlockHeader,
              {
                borderBottomColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
          >
            <Text
              style={[
                styles.codeBlockLanguage,
                { color: isDark ? "#94A3B8" : "#64748B" },
              ]}
            >
              {language}
            </Text>
            <CodeBlockCopyButton content={content} isDark={isDark} />
          </View>
          <Text
            style={[
              styles.codeBlockText,
              {
                color: isDark ? "#E2E8F0" : "#1E293B",
              },
            ]}
            selectable
          >
            {content}
          </Text>
        </View>
      );
    },
    code_block: (
      node: any,
      _children: any,
      _parent: any,
      _styles: any,
      _inheritedStyles: any,
    ) => {
      let { content } = node;
      if (
        typeof content === "string" &&
        content.charAt(content.length - 1) === "\n"
      ) {
        content = content.substring(0, content.length - 1);
      }

      return (
        <View
          key={node.key}
          style={[
            styles.codeBlockContainer,
            {
              backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
              borderColor: isDark ? "#334155" : "#E2E8F0",
            },
          ]}
        >
          <View
            style={[
              styles.codeBlockHeader,
              {
                borderBottomColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
          >
            <Text
              style={[
                styles.codeBlockLanguage,
                { color: isDark ? "#94A3B8" : "#64748B" },
              ]}
            />
            <CodeBlockCopyButton content={content} isDark={isDark} />
          </View>
          <Text
            style={[
              styles.codeBlockText,
              {
                color: isDark ? "#E2E8F0" : "#1E293B",
              },
            ]}
            selectable
          >
            {content}
          </Text>
        </View>
      );
    },
  };
}

// ─── Markdown styles (theme-aware) ──────────────────────────────────────────

function getMarkdownStyles(isDark: boolean) {
  const textColor = isDark ? "#F1F5F9" : "#1E293B";
  const secondaryTextColor = isDark ? "#94A3B8" : "#64748B";
  const codeBg = isDark ? "#1E293B" : "#F1F5F9";
  const codeBorder = isDark ? "#334155" : "#E2E8F0";
  const blockquoteBg = isDark ? "#1E293B" : "#F8FAFC";
  const blockquoteBorder = isDark ? "#4F46E5" : "#818CF8";
  const linkColor = isDark ? "#818CF8" : "#4F46E5";
  const tableBorder = isDark ? "#334155" : "#E2E8F0";

  return {
    body: {
      color: textColor,
      fontSize: 16,
      lineHeight: 24,
    },
    heading1: {
      fontSize: 24,
      fontWeight: "700" as const,
      marginTop: 16,
      marginBottom: 8,
      color: textColor,
      flexDirection: "row" as const,
    },
    heading2: {
      fontSize: 20,
      fontWeight: "700" as const,
      marginTop: 14,
      marginBottom: 6,
      color: textColor,
      flexDirection: "row" as const,
    },
    heading3: {
      fontSize: 18,
      fontWeight: "600" as const,
      marginTop: 12,
      marginBottom: 4,
      color: textColor,
      flexDirection: "row" as const,
    },
    heading4: {
      fontSize: 16,
      fontWeight: "600" as const,
      marginTop: 10,
      marginBottom: 4,
      color: textColor,
      flexDirection: "row" as const,
    },
    heading5: {
      fontSize: 14,
      fontWeight: "600" as const,
      marginTop: 8,
      marginBottom: 2,
      color: textColor,
      flexDirection: "row" as const,
    },
    heading6: {
      fontSize: 13,
      fontWeight: "600" as const,
      marginTop: 8,
      marginBottom: 2,
      color: secondaryTextColor,
      flexDirection: "row" as const,
    },
    paragraph: {
      marginTop: 4,
      marginBottom: 4,
      flexWrap: "wrap" as const,
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      justifyContent: "flex-start" as const,
      width: "100%" as const,
    },
    text: {
      color: textColor,
    },
    strong: {
      fontWeight: "700" as const,
      color: textColor,
    },
    em: {
      fontStyle: "italic" as const,
      color: textColor,
    },
    s: {
      textDecorationLine: "line-through" as const,
      color: textColor,
    },
    link: {
      color: linkColor,
      textDecorationLine: "underline" as const,
    },
    blockquote: {
      backgroundColor: blockquoteBg,
      borderLeftWidth: 3,
      borderColor: blockquoteBorder,
      paddingHorizontal: 12,
      paddingVertical: 4,
      marginVertical: 4,
    },
    code_inline: {
      backgroundColor: codeBg,
      borderColor: codeBorder,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 14,
      color: textColor,
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }),
    },
    // fence and code_block are handled by custom rules, but we still
    // need entries here so the library doesn't apply defaults
    fence: {
      fontSize: 14,
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }),
    },
    code_block: {
      fontSize: 14,
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }),
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      flexDirection: "row" as const,
      justifyContent: "flex-start" as const,
      color: textColor,
    },
    bullet_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: textColor,
    },
    bullet_list_content: {
      flex: 1,
    },
    ordered_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: textColor,
    },
    ordered_list_content: {
      flex: 1,
    },
    hr: {
      backgroundColor: codeBorder,
      height: 1,
      marginVertical: 12,
    },
    table: {
      borderWidth: 1,
      borderColor: tableBorder,
      borderRadius: 6,
      marginVertical: 8,
    },
    thead: {},
    tbody: {},
    th: {
      flex: 1,
      padding: 8,
      fontWeight: "600" as const,
      color: textColor,
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: tableBorder,
      flexDirection: "row" as const,
    },
    td: {
      flex: 1,
      padding: 8,
      color: textColor,
    },
    textgroup: {
      color: textColor,
    },
    hardbreak: {
      width: "100%" as const,
      height: 1,
    },
    softbreak: {},
    pre: {},
    inline: {
      color: textColor,
    },
    span: {
      color: textColor,
    },
  };
}

// ─── Component styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  codeBlockContainer: {
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
    overflow: "hidden",
    width: "100%",
  },
  codeBlockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  codeBlockLanguage: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "lowercase",
  },
  codeBlockText: {
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
