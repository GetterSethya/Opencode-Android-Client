package com.opencode.terminal

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import com.termux.terminal.TerminalColors
import com.termux.terminal.TerminalSession
import com.termux.terminal.TerminalSessionClient
import com.termux.view.TerminalView
import com.termux.view.TerminalViewClient
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.Properties

class OpencodeTerminalView(
    context: Context,
    appContext: AppContext
) : ExpoView(context, appContext) {

    val onInput by EventDispatcher<Map<String, Any>>()
    val onResize by EventDispatcher<Map<String, Any>>()
    val onTitleChanged by EventDispatcher<Map<String, Any>>()
    val onBell by EventDispatcher<Map<String, Any>>()

    val terminalView: TerminalView = TerminalView(context, null)
    private var terminalSession: TerminalSession
    private var currentFontSize: Int = 13

    private val sessionClient = object : TerminalSessionClient {
        override fun onTextChanged(changedSession: TerminalSession) {
            terminalView.onScreenUpdated()
        }

        override fun onTitleChanged(changedSession: TerminalSession) {
            val title = changedSession.title ?: ""
            onTitleChanged(mapOf("title" to title))
        }

        override fun onSessionFinished(finishedSession: TerminalSession) {}

        override fun onCopyTextToClipboard(session: TerminalSession, text: String) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.setPrimaryClip(ClipData.newPlainText("terminal", text))
        }

        override fun onPasteTextFromClipboard(session: TerminalSession?) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = clipboard?.primaryClip
            if (clip != null && clip.itemCount > 0 && session != null) {
                val item = clip.getItemAt(0)
                val text = item.coerceToText(context)?.toString() ?: ""
                if (text.isNotEmpty()) {
                    val bytes = text.toByteArray(Charsets.UTF_8)
                    session.write(bytes, 0, bytes.size)
                }
            }
        }

        override fun onBell(session: TerminalSession) {
            onBell(emptyMap())
        }

        override fun onColorsChanged(session: TerminalSession) {
            terminalView.invalidate()
        }

        override fun onTerminalCursorStateChange(state: Boolean) {}

        override fun onSessionDataOutput(session: TerminalSession, data: ByteArray, offset: Int, count: Int) {
            val text = String(data, offset, count, Charsets.UTF_8)
            onInput(mapOf("data" to text))
        }

        override fun onSessionSizeChanged(session: TerminalSession, cols: Int, rows: Int) {
            onResize(mapOf("cols" to cols, "rows" to rows))
        }

        override fun getTerminalCursorStyle(): Int? = null

        override fun logError(tag: String, message: String) {}
        override fun logWarn(tag: String, message: String) {}
        override fun logInfo(tag: String, message: String) {}
        override fun logDebug(tag: String, message: String) {}
        override fun logVerbose(tag: String, message: String) {}
        override fun logStackTraceWithMessage(tag: String, message: String, e: Exception) {}
        override fun logStackTrace(tag: String, e: Exception) {}
    }

    private val viewClient = object : TerminalViewClient {
        override fun onScale(scale: Float): Float {
            val density = context.resources.displayMetrics.scaledDensity
            val currentSize = terminalView.mRenderer?.mTextSize ?: currentFontSize
            val minPx = Math.round(8f * density)
            val maxPx = Math.round(40f * density)
            val newSize = Math.round(currentSize * scale).coerceIn(minPx, maxPx)
            if (newSize != currentSize) {
                currentFontSize = newSize
                terminalView.setTextSize(newSize)
            }
            return 1.0f
        }

        override fun onSingleTapUp(e: MotionEvent) {
            terminalView.requestFocus()
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(terminalView, InputMethodManager.SHOW_IMPLICIT)
        }

        override fun shouldBackButtonBeMappedToEscape(): Boolean = false

        override fun shouldEnforceCharBasedInput(): Boolean = true

        override fun shouldUseCtrlSpaceWorkaround(): Boolean = false

        override fun isTerminalViewSelected(): Boolean = true

        override fun copyModeChanged(copyMode: Boolean) {}

        override fun onKeyDown(keyCode: Int, e: KeyEvent, session: TerminalSession): Boolean = false

        override fun onKeyUp(keyCode: Int, e: KeyEvent): Boolean = false

        override fun onLongPress(event: MotionEvent): Boolean = false

        override fun readControlKey(): Boolean = false

        override fun readAltKey(): Boolean = false

        override fun readShiftKey(): Boolean = false

        override fun readFnKey(): Boolean = false

        override fun onCodePoint(codePoint: Int, ctrlDown: Boolean, session: TerminalSession): Boolean = false

        override fun onEmulatorSet() {}

        override fun logError(tag: String, message: String) {}
        override fun logWarn(tag: String, message: String) {}
        override fun logInfo(tag: String, message: String) {}
        override fun logDebug(tag: String, message: String) {}
        override fun logVerbose(tag: String, message: String) {}
        override fun logStackTraceWithMessage(tag: String, message: String, e: Exception) {}
        override fun logStackTrace(tag: String, e: Exception) {}
    }

    init {
        terminalSession = TerminalSession(10000, sessionClient)
        terminalView.isFocusable = true
        terminalView.isFocusableInTouchMode = true
        terminalView.isClickable = true
        terminalView.attachSession(terminalSession)
        terminalView.setTerminalViewClient(viewClient)

        val density = context.resources.displayMetrics.scaledDensity
        currentFontSize = Math.round(13f * density)
        terminalView.setTextSize(currentFontSize)
        terminalView.setTypeface(Typeface.MONOSPACE)

        val params = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        addView(terminalView, params)
    }

    fun writeToEmulator(data: String) {
        terminalSession.writeToTerminal(data)
    }

    fun clearEmulator() {
        terminalSession.reset()
    }

    fun focusTerminal() {
        post {
            terminalView.requestFocus()
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(terminalView, 0)
        }
    }

    fun blurTerminal() {
        post {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.hideSoftInputFromWindow(terminalView.windowToken, 0)
            terminalView.clearFocus()
        }
    }

    fun sendKey(key: String) {
        val bytes = key.toByteArray(Charsets.UTF_8)
        terminalSession.write(bytes, 0, bytes.size)
    }

    fun setTerminalFontSize(fontSize: Float) {
        val density = context.resources.displayMetrics.scaledDensity
        val minPx = Math.round(8f * density)
        val maxPx = Math.round(48f * density)
        val size = Math.round(fontSize * density).coerceIn(minPx, maxPx)
        currentFontSize = size
        terminalView.setTextSize(size)
    }

    fun setTerminalFontFamily(fontFamily: String?) {
        val typeface = if (!fontFamily.isNullOrBlank()) {
            try {
                Typeface.create(fontFamily, Typeface.NORMAL)
            } catch (_: Throwable) {
                Typeface.MONOSPACE
            }
        } else {
            Typeface.MONOSPACE
        }
        terminalView.setTypeface(typeface)
    }

    fun setTerminalTheme(theme: Map<String, String>?) {
        if (theme == null) return
        val props = Properties()
        for ((k, v) in theme) {
            props.setProperty(k, v)
        }
        try {
            TerminalColors.COLOR_SCHEME.updateWith(props)
            terminalSession.emulator?.mColors?.reset()
            terminalView.invalidate()
        } catch (_: Throwable) {}
    }

    fun setCursorBlink(blink: Boolean) {
        terminalView.setTerminalCursorBlinkerRate(if (blink) 500 else 0)
        terminalView.setTerminalCursorBlinkerState(blink, true)
    }
}
