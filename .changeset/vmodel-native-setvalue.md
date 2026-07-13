---
"vue-lynx": patch
---

fix(v-model): apply programmatic value changes to native `<input>`/`<textarea>`

`vModelText` pushed value updates to the Main Thread via `OP.SET_PROP` →
`__SetAttribute(el, 'value', …)`. Native (iOS/Android) treats an input's `value`
prop as the *initial* value only — a post-mount attribute write is ignored once
the control is live — so programmatic model changes (a reset/clear button, or
any code that reassigns the bound ref) never updated the on-screen field. Typing
still worked, and web was unaffected because web-core reflects the `value`
attribute live, which masked the gap.

On a programmatic change `vModelText` now also invokes the platform's `setValue`
UI method on the element, which is the supported way to set input text
imperatively across iOS/Android/Harmony/Web. User keystrokes are unaffected
(that path already no-ops the value push to avoid clobbering the caret), and the
`SET_PROP` attribute write is retained for web and the initial value.
