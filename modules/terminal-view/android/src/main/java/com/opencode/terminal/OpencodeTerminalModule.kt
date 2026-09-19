package com.opencode.terminal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OpencodeTerminalModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("OpencodeTerminal")

        View(OpencodeTerminalView::class) {
            Events("onInput", "onResize", "onTitleChanged", "onBell")

            Prop("fontSize") { view: OpencodeTerminalView, fontSize: Float ->
                view.setTerminalFontSize(fontSize)
            }

            Prop("fontFamily") { view: OpencodeTerminalView, fontFamily: String? ->
                view.setTerminalFontFamily(fontFamily)
            }

            Prop("theme") { view: OpencodeTerminalView, theme: Map<String, String>? ->
                view.setTerminalTheme(theme)
            }

            Prop("cursorBlink") { view: OpencodeTerminalView, blink: Boolean ->
                view.setCursorBlink(blink)
            }

            AsyncFunction("write") { view: OpencodeTerminalView, data: String ->
                view.writeToEmulator(data)
            }

            AsyncFunction("clear") { view: OpencodeTerminalView ->
                view.clearEmulator()
            }

            AsyncFunction("focus") { view: OpencodeTerminalView ->
                view.focusTerminal()
            }

            AsyncFunction("blur") { view: OpencodeTerminalView ->
                view.blurTerminal()
            }

            AsyncFunction("sendKey") { view: OpencodeTerminalView, key: String ->
                view.sendKey(key)
            }
        }
    }
}
