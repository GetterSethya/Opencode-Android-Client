package com.termux.terminal;

import android.os.Handler;
import android.os.Looper;
import android.os.Message;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * A remote terminal session coupled to a {@link TerminalEmulator}.
 * I/O is routed over the network (e.g. WebSocket) via {@link TerminalSessionClient}.
 */
public final class TerminalSession extends TerminalOutput {

    private static final int MSG_NEW_INPUT = 1;

    public final String mHandle = UUID.randomUUID().toString();
    public String mSessionName;

    TerminalEmulator mEmulator;
    final ByteQueue mProcessToTerminalIOQueue = new ByteQueue(128 * 1024);
    private final byte[] mUtf8InputBuffer = new byte[5];

    TerminalSessionClient mClient;
    private final Integer mTranscriptRows;
    private boolean mIsRunning = true;

    final Handler mMainThreadHandler = new Handler(Looper.getMainLooper()) {
        final byte[] mReceiveBuffer = new byte[64 * 1024];

        @Override
        public void handleMessage(Message msg) {
            if (msg.what == MSG_NEW_INPUT && mEmulator != null) {
                int bytesRead = mProcessToTerminalIOQueue.read(mReceiveBuffer, false);
                if (bytesRead > 0) {
                    mEmulator.append(mReceiveBuffer, bytesRead);
                    notifyScreenUpdate();
                }
            }
        }
    };

    public TerminalSession(Integer transcriptRows, TerminalSessionClient client) {
        this.mTranscriptRows = transcriptRows;
        this.mClient = client;
    }

    public void updateTerminalSessionClient(TerminalSessionClient client) {
        this.mClient = client;
        if (mEmulator != null) {
            mEmulator.updateTerminalSessionClient(client);
        }
    }

    public void updateSize(int columns, int rows) {
        if (mEmulator == null) {
            initializeEmulator(columns, rows);
        } else {
            mEmulator.resize(columns, rows);
            if (mClient != null) {
                mClient.onSessionSizeChanged(this, columns, rows);
            }
        }
    }

    public void updateSize(int columns, int rows, int cellWidthPixels, int cellHeightPixels) {
        updateSize(columns, rows);
    }

    public void initializeEmulator(int columns, int rows) {
        mEmulator = new TerminalEmulator(this, columns, rows, mTranscriptRows, mClient);
        if (mClient != null) {
            mClient.onSessionSizeChanged(this, columns, rows);
        }
    }

    public void initializeEmulator(int columns, int rows, int cellWidthPixels, int cellHeightPixels) {
        initializeEmulator(columns, rows);
    }

    public TerminalEmulator getEmulator() {
        return mEmulator;
    }

    public String getTitle() {
        return (mEmulator == null) ? null : mEmulator.getTitle();
    }

    /**
     * Feed incoming raw VT/terminal data (e.g. from WebSocket) into the emulator.
     */
    public void writeToTerminal(byte[] data, int offset, int count) {
        if (data == null || count <= 0) return;
        mProcessToTerminalIOQueue.write(data, offset, count);
        mMainThreadHandler.sendEmptyMessage(MSG_NEW_INPUT);
    }

    public void writeToTerminal(String text) {
        if (text == null || text.isEmpty()) return;
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        writeToTerminal(bytes, 0, bytes.length);
    }

    /**
     * User/keyboard output from emulator to send to the remote process.
     */
    @Override
    public void write(byte[] data, int offset, int count) {
        if (mClient != null && data != null && count > 0) {
            mClient.onSessionDataOutput(this, data, offset, count);
        }
    }

    public void writeCodePoint(boolean prependEscape, int codePoint) {
        int bufferPosition = 0;
        if (prependEscape) {
            mUtf8InputBuffer[bufferPosition++] = 27; // ESC
        }
        if (codePoint <= 0x7F) {
            mUtf8InputBuffer[bufferPosition++] = (byte) codePoint;
        } else if (codePoint <= 0x7FF) {
            mUtf8InputBuffer[bufferPosition++] = (byte) (0xC0 | (codePoint >> 6));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0x80 | (codePoint & 0x3F));
        } else if (codePoint <= 0xFFFF) {
            mUtf8InputBuffer[bufferPosition++] = (byte) (0xE0 | (codePoint >> 12));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0x80 | ((codePoint >> 6) & 0x3F));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0x80 | (codePoint & 0x3F));
        } else {
            mUtf8InputBuffer[bufferPosition++] = (byte) (0xF0 | (codePoint >> 18));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0x80 | ((codePoint >> 12) & 0x3F));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0x80 | ((codePoint >> 6) & 0x3F));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0x80 | (codePoint & 0x3F));
        }
        write(mUtf8InputBuffer, 0, bufferPosition);
    }

    protected void notifyScreenUpdate() {
        if (mClient != null) {
            mClient.onTextChanged(this);
        }
    }

    public void reset() {
        if (mEmulator != null) {
            mEmulator.reset();
            notifyScreenUpdate();
        }
    }

    public void finishIfRunning() {
        mIsRunning = false;
        if (mClient != null) {
            mClient.onSessionFinished(this);
        }
    }

    @Override
    public void titleChanged(String oldTitle, String newTitle) {
        if (mClient != null) {
            mClient.onTitleChanged(this);
        }
    }

    public synchronized boolean isRunning() {
        return mIsRunning;
    }

    public synchronized int getExitStatus() {
        return 0;
    }

    @Override
    public void onCopyTextToClipboard(String text) {
        if (mClient != null) {
            mClient.onCopyTextToClipboard(this, text);
        }
    }

    @Override
    public void onPasteTextFromClipboard() {
        if (mClient != null) {
            mClient.onPasteTextFromClipboard(this);
        }
    }

    @Override
    public void onBell() {
        if (mClient != null) {
            mClient.onBell(this);
        }
    }

    @Override
    public void onColorsChanged() {
        if (mClient != null) {
            mClient.onColorsChanged(this);
        }
    }

    public int getPid() {
        return 0;
    }

    public String getCwd() {
        return "";
    }
}
