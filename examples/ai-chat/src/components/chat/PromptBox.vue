<script setup lang="ts">
import { computed } from 'vue-lynx';

import { inputEventValue } from '../../lib/input-event';
import type { ChatStatus } from '../../types/ai';
import ModelSelect from '../ModelSelect.vue';
import Icon from '../ui/Icon.vue';

/**
 * Port of UChatPrompt + UChatPromptSubmit: textarea with a footer row
 * (attach, model select, submit). Submit morphs send → stop → reload with
 * the chat status like the original. Enter-to-send maps to the keyboard's
 * confirm action (no hardware Enter on Lynx).
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    status?: ChatStatus;
    disabled?: boolean;
    error?: string | null;
    placeholder?: string;
  }>(),
  { status: 'ready', placeholder: 'Type your message here...' },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  stop: [];
  reload: [];
  attach: [];
}>();

const isWeb = (globalThis as { SystemInfo?: { platform?: string } }).SystemInfo?.platform === 'web';

const submitState = computed(() => {
  if (props.status === 'submitted' || props.status === 'streaming') return 'stop';
  if (props.status === 'error') return 'reload';
  return 'send';
});

function onInput(event: { detail?: unknown; target?: unknown }) {
  emit('update:modelValue', inputEventValue(event));
}

function onSubmitTap() {
  if (props.disabled) return;
  if (submitState.value === 'stop') emit('stop');
  else if (submitState.value === 'reload') emit('reload');
  else if (props.modelValue.trim()) emit('submit');
}
</script>

<template>
  <view
    class="flex flex-col rounded-lg prompt-surface border border-default px-1.5 pt-1.5 pb-1.5 shadow-sm"
  >
    <view v-if="error" class="flex flex-row items-center gap-2 px-2.5 pt-1.5 pb-1">
      <Icon name="i-lucide-alert-circle" tone="error" :size="16" />
      <text class="text-sm text-error flex-1" text-maxline="2">{{ error }}</text>
    </view>

    <slot name="header" />

    <view class="prompt-input-stack">
      <!-- The mirror participates in layout on both renderers. The textarea
           overlays it, so wrapped text grows the composer without measuring
           text through the background thread. -->
      <text class="prompt-input-mirror text-base px-2.5 py-2">{{ modelValue || ' ' }}</text>
      <!-- Web core currently maps `x-textarea` to the custom element that
           emits Lynx-shaped input events; Native uses the built-in tag. -->
      <view v-if="isWeb" class="prompt-input-web px-2.5 py-2">
        <x-textarea
          :value="modelValue"
          :placeholder="placeholder"
          :maxlines="5"
          :maxlength="4000"
          :bounces="false"
          :enable-scroll-bar="false"
          confirm-type="send"
          class="prompt-input-web-control text-base text-highlighted"
          @input="onInput"
          @confirm="onSubmitTap"
        />
      </view>
      <textarea
        v-else
        :value="modelValue"
        :placeholder="placeholder"
        :maxlines="5"
        :maxlength="4000"
        :bounces="false"
        :enable-scroll-bar="false"
        confirm-type="send"
        class="prompt-input text-base text-highlighted px-2.5 py-2"
        @input="onInput"
        @confirm="onSubmitTap"
      />
    </view>

    <view class="flex flex-row items-center justify-between px-1 pt-1">
      <view class="flex flex-row items-center gap-1">
        <view class="p-1.5 rounded-md" @tap="emit('attach')">
          <Icon name="i-lucide-paperclip" tone="muted" :size="16" />
        </view>

        <ModelSelect />
      </view>

      <view
        class="rounded-full p-1.5 bg-inverted items-center justify-center"
        :class="disabled ? 'opacity-50' : ''"
        @tap="onSubmitTap"
      >
        <Icon
          :name="
            submitState === 'stop'
              ? 'i-lucide-square'
              : submitState === 'reload'
              ? 'i-lucide-rotate-cw'
              : 'i-lucide-arrow-up'
          "
          tone="inverted"
          :size="16"
        />
      </view>
    </view>
  </view>
</template>

<style>
.prompt-surface {
  /* the original uses bg-elevated/50; alpha doesn't composite on Lynx web,
     so the halfway blend is precomputed per theme */
  background-color: var(--ui-bg-elevated-half);
}
.prompt-input-stack {
  position: relative;
  width: 100%;
  min-height: 40px;
  max-height: 112px;
  overflow: hidden;
}
.prompt-input-mirror {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  max-height: 112px;
  overflow: hidden;
  color: transparent;
  line-height: 24px;
  white-space: pre-wrap;
  word-break: break-word;
}
.prompt-input-web {
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.prompt-input-web-control {
  height: 100%;
  width: 100%;
  background-color: transparent;
  border: none;
  color: var(--ui-text-highlighted);
  caret-color: var(--ui-primary);
  line-height: 24px;
  --placeholder-color: var(--ui-text-dimmed);
}
.prompt-input {
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  background-color: transparent;
  border: none;
  color: var(--ui-text-highlighted);
  caret-color: var(--ui-primary);
  line-height: 24px;
  --placeholder-color: var(--ui-text-dimmed);
}
</style>
