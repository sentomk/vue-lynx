<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue-lynx';
import type { ShadowElement } from 'vue-lynx';
import { useRoute } from 'vue-router';

import ChatTitle from '../components/chat/ChatTitle.vue';
import FilePreview from '../components/chat/FilePreview.vue';
import Indicator from '../components/chat/Indicator.vue';
import MessageActions from '../components/chat/message/MessageActions.vue';
import MessageContent from '../components/chat/message/MessageContent.vue';
import PromptBox from '../components/chat/PromptBox.vue';
import Navbar from '../components/Navbar.vue';
import Icon from '../components/ui/Icon.vue';
import { useAttachments } from '../composables/useAttachments';
import { useChat } from '../composables/useChat';
import { useChats } from '../composables/useChats';
import { useKeyboardAvoidance } from '../composables/useKeyboardAvoidance';
import { useModels } from '../composables/useModels';
import { useOverlay } from '../composables/useOverlay';
import { useToast } from '../composables/useToast';
import { useViewport } from '../composables/useViewport';
import { apiFetch } from '../lib/api';
import { calculateBottomSpacer, isNearBottom } from '../lib/chat-viewport';
import type { UIMessage } from '../types/ai';

/** Port of app/pages/chat/[id].vue. */
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();
const { model } = useModels();
const { chats, fetchChats } = useChats();
const { isMobile } = useViewport();

const chatId = String(route.params.id);

interface ChatData {
  id: string;
  title: string | null;
  visibility: 'public' | 'private';
  isOwner: boolean;
  messages: UIMessage[];
}

const data = ref<ChatData | null>(null);
const loaded = ref(false);

const isOwner = computed(() => data.value?.isOwner ?? false);
const visibility = ref<'public' | 'private'>('private');
const title = ref<string | null>(null);

interface Vote {
  messageId: string;
  isUpvoted: boolean;
}
const votes = ref<Vote[]>([]);

const input = ref('');
const editingMessageId = ref<string | null>(null);

const { files, open, removeFile, clearFiles, uploading, uploadedFiles } = useAttachments();

const scrollRef = useTemplateRef<ShadowElement>('scrollRef');
const promptRef = useTemplateRef<ShadowElement>('promptRef');

interface LayoutEvent {
  detail?: { height?: number };
}

interface ScrollEvent {
  detail?: {
    scrollTop?: number;
    scrollHeight?: number;
  };
}

const systemInfo = (
  globalThis as {
    SystemInfo?: { pixelHeight?: number; pixelRatio?: number };
  }
).SystemInfo;
const initialViewportHeight = Math.max(
  0,
  (systemInfo?.pixelHeight ?? 720) / (systemInfo?.pixelRatio || 1) - 56,
);
const viewportHeight = ref(initialViewportHeight);
const composerHeight = ref(112);
const keyboardHeight = ref(0);
const anchoredMessageId = ref<string | null>(null);
const anchoredTurnHeight = ref(0);
const followsOutput = ref(true);
const messageHeights = new Map<string, number>();
let scrollTop = 0;
let scrollHeight = 0;

useKeyboardAvoidance(promptRef, (height) => {
  keyboardHeight.value = height;
  if (followsOutput.value) void scrollToBottom();
});

const chat = useChat({
  id: chatId,
  model: () => model.value,
  onError(error) {
    let message = error.message;
    if (typeof message === 'string' && message[0] === '{') {
      try {
        message = JSON.parse(message).message || message;
      } catch {
        // keep original message on malformed JSON
      }
    }
    toast.add({
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0,
    });
  },
});

const { messages, status, error, sendMessage, regenerate, stop } = chat;

onUnmounted(stop);

async function scrollToBottom(smooth = false) {
  // nextTick waits for the main thread to apply pending ops so the
  // scroll-view ref is resolvable by selector.
  await nextTick();
  scrollRef.value
    ?.invoke({
      method: 'scrollTo',
      params: { offset: 1e6, smooth },
    })
    .exec();
}

async function scrollMessageToTop(messageId: string) {
  await nextTick();
  if (typeof lynx === 'undefined') return;
  lynx
    .createSelectorQuery()
    .select(`#chat-message-${messageId}`)
    .invoke({
      method: 'scrollIntoView',
      params: {
        scrollIntoViewOptions: {
          block: 'start',
          inline: 'start',
          behavior: 'smooth',
        },
      },
    })
    .exec();
}

function updateAnchoredTurnHeight() {
  const anchorId = anchoredMessageId.value;
  const anchorIndex = messages.value.findIndex((message) => message.id === anchorId);
  if (!anchorId || anchorIndex < 0) {
    anchoredTurnHeight.value = 0;
    return;
  }

  const anchoredMessages = messages.value.slice(anchorIndex);
  let height = anchoredMessages.reduce(
    (total, message) => total + (messageHeights.get(message.id) ?? 0),
    0,
  );
  height += Math.max(0, anchoredMessages.length - 1) * 24;
  if (showIndicator.value) height += 48;
  anchoredTurnHeight.value = Math.max(84, height);
}

function beginAnchoredTurn(message: UIMessage | undefined) {
  if (!message || message.role !== 'user') return;
  anchoredMessageId.value = message.id;
  followsOutput.value = true;
  updateAnchoredTurnHeight();
  void scrollMessageToTop(message.id);
}

function handleScroll(event: ScrollEvent) {
  const nextTop = Number(event.detail?.scrollTop);
  const nextHeight = Number(event.detail?.scrollHeight);
  if (Number.isFinite(nextTop)) scrollTop = nextTop;
  if (Number.isFinite(nextHeight) && nextHeight >= 0) scrollHeight = nextHeight;
  followsOutput.value = isNearBottom({
    scrollTop,
    scrollHeight,
    viewportHeight: viewportHeight.value,
  });
}

function handleContentSizeChanged(event: ScrollEvent) {
  const nextHeight = Number(event.detail?.scrollHeight);
  if (Number.isFinite(nextHeight) && nextHeight >= 0) scrollHeight = nextHeight;
  if (followsOutput.value) void scrollToBottom();
}

function handleViewportLayout(event: LayoutEvent) {
  const height = Number(event.detail?.height);
  if (!Number.isFinite(height) || height <= 0 || height === viewportHeight.value) return;
  viewportHeight.value = height;
  if (followsOutput.value) void scrollToBottom();
}

function handleComposerLayout(event: LayoutEvent) {
  const height = Number(event.detail?.height);
  if (!Number.isFinite(height) || height <= 0 || height === composerHeight.value) return;
  composerHeight.value = height;
  if (followsOutput.value) void scrollToBottom();
}

function handleMessageLayout(messageId: string, event: LayoutEvent) {
  const height = Number(event.detail?.height);
  if (!Number.isFinite(height) || height <= 0 || messageHeights.get(messageId) === height) return;
  messageHeights.set(messageId, height);
  updateAnchoredTurnHeight();
}

// The title is generated server-side before streaming starts on the first
// message; refresh the sidebar/title as soon as the response streams.
watch(status, async (value) => {
  if (value !== 'streaming' || title.value || !isOwner.value) return;
  await fetchChats();
  const updated = chats.value.find((c) => c.id === chatId);
  if (updated && updated.label !== 'Untitled') {
    title.value = updated.label;
  }
});

onMounted(async () => {
  try {
    data.value = await apiFetch<ChatData | null>(`/api/chats/${chatId}`);
  } catch {
    data.value = null;
  }
  loaded.value = true;
  if (!data.value) return;

  visibility.value = data.value.visibility;
  title.value = data.value.title;
  messages.value = data.value.messages;

  if (data.value.isOwner) {
    try {
      votes.value = await apiFetch<Vote[]>(`/api/chats/${chatId}/votes`);
    } catch {
      votes.value = [];
    }
  }

  // Arriving from the home page with only the first user message: generate.
  if (data.value.isOwner && data.value.messages.length === 1) {
    const generation = regenerate();
    beginAnchoredTurn(messages.value[0]);
    void generation;
  } else {
    void scrollToBottom();
  }
});

async function handleSubmit() {
  if (input.value.trim() && !uploading.value) {
    const generation = sendMessage({
      text: input.value,
      files: uploadedFiles.value.length > 0 ? uploadedFiles.value : undefined,
    });
    beginAnchoredTurn(messages.value[messages.value.length - 1]);
    input.value = '';
    clearFiles();
    void generation;
  }
}

function startEdit(message: UIMessage) {
  if (editingMessageId.value) return;
  editingMessageId.value = message.id;
}

async function saveEdit(message: UIMessage, text: string) {
  try {
    await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'DELETE',
      body: { messageId: message.id, type: 'edit' },
    });
  } catch {
    toast.add({
      description: 'Failed to save edit.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    });
    return;
  }
  editingMessageId.value = null;
  const generation = sendMessage({ text, messageId: message.id });
  beginAnchoredTurn(messages.value[messages.value.length - 1]);
  void generation;
}

async function regenerateMessage(message: UIMessage) {
  try {
    await apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'DELETE',
      body: { messageId: message.id, type: 'regenerate' },
    });
  } catch {
    toast.add({
      description: 'Failed to regenerate.',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    });
    return;
  }
  const generation = regenerate({ messageId: message.id });
  beginAnchoredTurn([...messages.value].reverse().find((item) => item.role === 'user'));
  void generation;
}

function handleRegenerate() {
  const generation = regenerate();
  beginAnchoredTurn([...messages.value].reverse().find((message) => message.role === 'user'));
  void generation;
}

function getVote(messageId: string): boolean | null {
  const vote = votes.value.find((v) => v.messageId === messageId);
  if (!vote) return null;
  return Boolean(vote.isUpvoted);
}

async function vote(message: UIMessage, isUpvoted: boolean) {
  const snapshot = votes.value.map((v) => ({ ...v }));
  const toggling = getVote(message.id) === isUpvoted;
  const next = toggling ? null : isUpvoted;

  votes.value =
    next === null
      ? votes.value.filter((v) => v.messageId !== message.id)
      : [
          ...votes.value.filter((v) => v.messageId !== message.id),
          { messageId: message.id, isUpvoted: next },
        ];

  try {
    await apiFetch(`/api/chats/${chatId}/votes`, {
      method: 'POST',
      body: next === null ? { messageId: message.id } : { messageId: message.id, isUpvoted: next },
    });
  } catch {
    votes.value = snapshot;
    toast.add({
      description: 'Failed to save vote',
      icon: 'i-lucide-alert-circle',
      color: 'error',
    });
  }
}

async function openShare() {
  const instance = overlay.open<'public' | 'private'>('share', {
    chatId,
    visibility: visibility.value,
  });
  visibility.value = await instance.result;
}

const lastMessage = computed(() => messages.value[messages.value.length - 1]);

const showIndicator = computed(
  () =>
    status.value === 'submitted' ||
    (status.value === 'streaming' &&
      lastMessage.value?.role === 'assistant' &&
      lastMessage.value.parts.length === 0),
);

watch(showIndicator, () => {
  void nextTick().then(updateAnchoredTurnHeight);
});

const bottomSpacerHeight = computed(() =>
  calculateBottomSpacer({
    composerHeight: isOwner.value ? composerHeight.value : 0,
    keyboardHeight: isOwner.value ? keyboardHeight.value : 0,
    viewportHeight: viewportHeight.value,
    anchoredTurnHeight: anchoredMessageId.value ? anchoredTurnHeight.value : undefined,
  }),
);
</script>

<template>
  <view v-if="data?.id" class="flex-1 flex flex-col min-w-0 min-h-0 chat-page">
    <Navbar>
      <template #title>
        <ChatTitle
          :chat-id="data.id"
          :title="title"
          :is-owner="isOwner"
          @update:title="title = $event"
        />
      </template>

      <view v-if="isOwner" class="p-2 rounded-md" @tap="openShare">
        <Icon name="i-lucide-share" tone="muted" :size="18" />
      </view>
    </Navbar>

    <scroll-view
      ref="scrollRef"
      scroll-orientation="vertical"
      class="flex-1 min-h-0"
      @layoutchange="handleViewportLayout"
      @scroll="handleScroll"
      @contentsizechanged="handleContentSizeChanged"
    >
      <view class="flex flex-col pt-4 chat-container" :class="isMobile ? 'px-4' : 'px-6'">
        <view class="flex flex-col gap-6">
          <view
            v-for="message in messages"
            :id="`chat-message-${message.id}`"
            :key="message.id"
            :flatten="false"
            class="flex flex-col"
            :class="message.role === 'user' ? 'items-end' : 'items-start'"
            @layoutchange="(event) => handleMessageLayout(message.id, event)"
          >
            <!-- user bubble / assistant full width -->
            <view
              :class="
                message.role === 'user' ? 'bg-elevated rounded-lg px-4 py-3 user-bubble' : 'w-full'
              "
            >
              <MessageContent
                :message="message"
                :editing="isOwner && editingMessageId === message.id"
                @save="saveEdit"
                @cancel-edit="editingMessageId = null"
              />
            </view>

            <!-- actions -->
            <view v-if="isOwner" class="flex flex-row items-center mt-1.5 actions-row">
              <MessageActions
                :message="message"
                :streaming="status === 'streaming' && message.id === lastMessage?.id"
                :editing="editingMessageId === message.id"
                :vote="getVote(message.id)"
                @vote="(m, up) => vote(m, up)"
                @edit="startEdit"
                @regenerate="regenerateMessage"
              />
            </view>
          </view>

          <!-- thinking indicator -->
          <view v-if="showIndicator" class="flex flex-row items-center gap-1.5">
            <Indicator />
            <text class="text-sm text-muted shimmer-pulse">Thinking...</text>
          </view>
        </view>

        <view class="chat-bottom-spacer" :style="{ height: `${bottomSpacerHeight}px` }" />
      </view>
    </scroll-view>

    <view
      v-if="isOwner"
      ref="promptRef"
      :flatten="false"
      class="prompt-dock"
      @layoutchange="handleComposerLayout"
    >
      <view class="pb-4 pt-1 prompt-container" :class="isMobile ? 'px-4' : 'px-6'">
        <PromptBox
          v-model="input"
          :status="status"
          :error="error?.message"
          :disabled="uploading"
          @submit="handleSubmit"
          @stop="stop()"
          @reload="handleRegenerate"
          @attach="open"
        >
          <template v-if="files.length > 0" #header>
            <view class="flex flex-row flex-wrap gap-2 px-2 pt-2">
              <FilePreview
                v-for="file in files"
                :key="file.id"
                :name="file.name"
                :type="file.mediaType"
                :preview-url="file.url"
                :status="file.status"
                removable
                @remove="removeFile(file.id)"
              />
            </view>
          </template>
        </PromptBox>
      </view>
    </view>
  </view>

  <view v-else-if="loaded" class="flex-1 flex flex-col items-center justify-center gap-3">
    <text class="error-404 text-primary">404</text>
    <text class="text-2xl font-bold text-highlighted">Chat not found</text>
  </view>
</template>

<style>
.chat-page {
  position: relative;
}
.chat-bottom-spacer {
  width: 1px;
  flex-shrink: 0;
}
.prompt-dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background-color: var(--ui-bg);
}
.chat-container,
.prompt-container {
  max-width: 768px;
  width: 100%;
  align-self: center;
}
.user-bubble {
  max-width: 80%;
}
.error-404 {
  font-size: 56px;
  line-height: 60px;
  font-weight: 700;
}
</style>
