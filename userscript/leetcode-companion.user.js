// ==UserScript==
// @name         Career Hunter — LeetCode Companion
// @namespace    https://github.com/pradeepreddyvv/career-hunter
// @version      2.1
// @description  Captures live code from LeetCode/NeetCode, sends to Career Hunter, and provides an AI interviewer with voice interaction
// @author       Career Hunter Contributors
// @match        https://leetcode.com/problems/*
// @match        https://neetcode.io/solutions/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      generativelanguage.googleapis.com
// @connect      preview.tts.speechmatics.com
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // ==================== CONFIG (user-configurable via Tampermonkey menu) ====================
    const WEBHOOK_URL = GM_getValue('webhook_url', 'http://localhost:3000/api/leetcode');
    const GEMINI_KEY = GM_getValue('gemini_key', '');
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`;
    const GEMINI_FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
    const SM_TTS_KEY = GM_getValue('sm_tts_key', '');
    const SM_TTS_URL = 'https://preview.tts.speechmatics.com/generate';

    // Settings UI — accessible via Tampermonkey menu
    GM_registerMenuCommand('Configure Career Hunter', () => {
        const currentWebhook = GM_getValue('webhook_url', 'http://localhost:3000/api/leetcode');
        const currentGemini = GM_getValue('gemini_key', '');
        const currentTTS = GM_getValue('sm_tts_key', '');

        const newWebhook = prompt('Career Hunter API URL:', currentWebhook);
        if (newWebhook !== null) GM_setValue('webhook_url', newWebhook);

        const newGemini = prompt('Gemini API Key (get free at aistudio.google.com/apikey):', currentGemini);
        if (newGemini !== null) GM_setValue('gemini_key', newGemini);

        const newTTS = prompt('Speechmatics TTS Key (optional, for voice):', currentTTS);
        if (newTTS !== null) GM_setValue('sm_tts_key', newTTS);

        alert('Settings saved! Reload the page for changes to take effect.');
    });

    if (!GEMINI_KEY) {
        console.warn('[Career Hunter] No Gemini API key configured. Use Tampermonkey menu > "Configure Career Hunter" to set it up.');
    }
    const SEND_INTERVAL = 5000;
    const DEBOUNCE_MS = 1500;
    const IS_NEETCODE = window.location.hostname.includes('neetcode.io');

    // ==================== STATE ====================
    let lastSentCode = '';
    let lastSentTime = 0;
    let debounceTimer = null;
    let sessionId = 'lc_' + Date.now();
    let sending = false;
    let autoInterval;
    let paused = false;

    // Chat state
    let chatHistory = [];
    let chatOpen = false;
    let isListening = false;
    let recognition = null;
    let voiceFinal = '';
    let autoSpeak = true;
    let aiThinking = false;
    let aiMode = 'interviewer'; // 'teacher' or 'interviewer'
    let ttsVoice = 'jack'; // 'jack' (US male) or 'theo' (UK male)
    let currentAudio = null; // for stop functionality

    // ==================== CROSS-TAB SYNC (BroadcastChannel) ====================
    const SYNC_SOURCE = 'popup'; // this side's identity
    const syncChannel = new BroadcastChannel('lc-interview-sync');
    let ttsSpeaker = null; // which side currently owns TTS: 'popup' | 'portal' | null

    function syncBroadcast(msg) {
        syncChannel.postMessage({ ...msg, source: SYNC_SOURCE, ts: Date.now() });
    }

    syncChannel.onmessage = (ev) => {
        const d = ev.data;
        if (!d || d.source === SYNC_SOURCE) return;

        if (d.type === 'live-listen-on') {
            // Portal turned on Live Listen → start ours (popup owns mic)
            if (!activeListening) {
                console.log('[SYNC] Portal started Live Listen → starting on popup (mic owner)');
                _startActiveListenLocal();
            }
        } else if (d.type === 'live-listen-off') {
            if (activeListening) {
                console.log('[SYNC] Portal stopped Live Listen → syncing');
                _stopActiveListenLocal();
            }
        } else if (d.type === 'tts-start') {
            ttsSpeaker = d.source;
        } else if (d.type === 'tts-end') {
            if (ttsSpeaker === d.source) ttsSpeaker = null;
        }
        // Portal sends transcript from its own mic? Feed it into our engine.
        // (Normally popup owns mic, but handle both directions)
        if (d.type === 'transcript' && activeEngine) {
            // Only use if we don't own the mic ourselves
            if (!SharedMic.isOwnedBy('active-listen')) {
                activeEngine.feed(d.finalText || '', d.interimText || '');
            }
        }
    };

    // ==================== NEETCODE: EXTRACT INFO & SOLUTIONS ====================
    function getNeetcodeProblemInfo() {
        const pathParts = window.location.pathname.split('/');
        const slug = pathParts[pathParts.length - 1] || '';
        const h1 = document.querySelector('h1');
        const title = (h1 ? h1.textContent.trim() : '')
            || document.title.replace(/[-–|].*$/, '').trim()
            || slug.replace(/-/g, ' ');
        let difficulty = '';
        for (const el of document.querySelectorAll('span, div, a')) {
            const t = el.textContent.trim();
            if (['Easy', 'Medium', 'Hard'].includes(t) && el.children.length === 0) {
                difficulty = t; break;
            }
        }
        let description = '';
        const descEl = document.querySelector('[class*="description"]') ||
                       document.querySelector('[class*="problem-desc"]') ||
                       document.querySelector('p');
        if (descEl) description = descEl.innerText.substring(0, 2000);
        return { title, slug, difficulty, description, language: 'python', url: window.location.href };
    }

    function getNeetcodeSolutions() {
        const sections = [];
        const main = document.querySelector('main') ||
                     document.querySelector('[class*="content"]') ||
                     document.querySelector('[class*="solution"]') ||
                     document.body;
        const headings = main.querySelectorAll('h2, h3, h4');
        for (const h of headings) {
            const headingText = h.textContent.trim();
            if (!/^\d+\.\s/.test(headingText)) continue;
            let explanation = '', code = '';
            let node = h.nextElementSibling;
            while (node && !['H2','H3','H4'].includes(node.tagName)) {
                if (node.tagName === 'PRE' || node.querySelector('pre')) {
                    const codeEl = node.tagName === 'PRE' ? node : node.querySelector('pre');
                    code += (codeEl.textContent || '').trim() + '\n';
                } else {
                    explanation += (node.innerText || node.textContent || '').trim() + '\n';
                }
                node = node.nextElementSibling;
            }
            sections.push({ heading: headingText, explanation: explanation.trim(), code: code.trim() });
        }
        if (sections.length === 0) {
            main.querySelectorAll('pre code, pre').forEach((el, i) => {
                const text = el.textContent.trim();
                if (text && (text.includes('def ') || text.includes('class '))) {
                    sections.push({ heading: 'Solution ' + (i + 1), explanation: '', code: text });
                }
            });
        }
        return { sections, fullText: main.innerText.substring(0, 8000) };
    }

    function getNeetcodeCode() {
        const codes = [];
        document.querySelectorAll('pre code, pre').forEach(el => {
            const text = el.textContent.trim();
            if (text && text.length > 30 && (text.includes('def ') || text.includes('class ') || text.includes('return '))) {
                codes.push(text);
            }
        });
        return codes.length > 0 ? codes.join('\n\n# --- next approach ---\n\n') : '(no code found on page)';
    }

    // ==================== EXTRACT PROBLEM INFO ====================
    function getProblemInfo() {
        if (IS_NEETCODE) return getNeetcodeProblemInfo();
        const pathParts = window.location.pathname.split('/');
        const slug = pathParts[2] || '';

        const titleEl = document.querySelector('[data-cy="question-title"]') ||
                        document.querySelector('.text-title-large') ||
                        document.querySelector('div[class*="title"]>a') ||
                        document.querySelector('h4[class*="title"]');
        const title = titleEl ? titleEl.textContent.trim() : slug.replace(/-/g, ' ');

        let difficulty = '';
        const spans = document.querySelectorAll('span');
        for (const s of spans) {
            const t = s.textContent.trim().toLowerCase();
            if (['easy', 'medium', 'hard'].includes(t)) { difficulty = s.textContent.trim(); break; }
        }

        const descEl = document.querySelector('[data-track-load="description_content"]') ||
                       document.querySelector('div[class*="description"]') ||
                       document.querySelector('.elfjS');
        const description = descEl ? descEl.innerText.substring(0, 3000) : '';

        let language = '';
        try {
            const models = window.monaco?.editor?.getModels();
            if (models && models[0]) language = models[0].getLanguageId() || '';
        } catch(e) {}

        return { title, slug, difficulty, description, language, url: window.location.href };
    }

    // ==================== EXTRACT CODE ====================
    function getEditorCode() {
        if (IS_NEETCODE) return getNeetcodeCode();
        // Try Monaco editors first (most reliable — returns code in correct order)
        try {
            const editors = window.monaco?.editor?.getEditors();
            if (editors && editors.length > 0) {
                // Find the editor that's inside the code area (not the output/test panel)
                for (const ed of editors) {
                    const el = ed.getDomNode();
                    if (el && el.closest('[data-track-load="description_content"]') === null) {
                        const val = ed.getValue();
                        if (val && val.trim()) return val;
                    }
                }
                // Fallback: just use the first editor with content
                for (const ed of editors) {
                    const val = ed.getValue();
                    if (val && val.trim()) return val;
                }
            }
        } catch(e) {}
        try {
            const models = window.monaco?.editor?.getModels();
            if (models && models.length > 0) {
                for (const m of models) {
                    const val = m.getValue();
                    if (val && val.trim() && (val.includes('def ') || val.includes('class ') || val.includes('function'))) return val;
                }
                return models[0].getValue();
            }
        } catch(e) {}
        // DOM fallback: .view-line elements are absolutely positioned, sort by top offset
        try {
            const lines = document.querySelectorAll('.view-line');
            if (lines.length > 0) {
                const sorted = Array.from(lines).sort((a, b) => {
                    const topA = parseFloat(a.style.top) || 0;
                    const topB = parseFloat(b.style.top) || 0;
                    return topA - topB;
                });
                return sorted.map(l => l.textContent).join('\n');
            }
        } catch(e) {}
        return null;
    }

    // ==================== VISIBLE RANGE ====================
    function getVisibleRange() {
        try {
            const editors = window.monaco?.editor?.getEditors();
            if (editors && editors.length > 0) {
                for (const ed of editors) {
                    const range = ed.getVisibleRanges();
                    if (range && range.length > 0) {
                        return { startLine: range[0].startLineNumber, endLine: range[range.length - 1].endLineNumber };
                    }
                }
            }
        } catch(e) {}
        return null;
    }

    // ==================== SEND TO WEBHOOK ====================
    function sendCode(force = false) {
        if (sending) return;
        const code = getEditorCode();
        if (!code) return;
        if (!force && code === lastSentCode) return;
        const now = Date.now();
        if (!force && (now - lastSentTime) < DEBOUNCE_MS) return;

        sending = true;
        lastSentCode = code;
        lastSentTime = now;

        GM_xmlhttpRequest({
            method: 'POST',
            url: WEBHOOK_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                sessionId,
                timestamp: new Date().toISOString(),
                code,
                problem: getProblemInfo(),
                visibleRange: getVisibleRange(),
                event: force ? 'manual' : 'auto'
            }),
            onload: () => { sending = false; flashDot('#06b6d4'); },
            onerror: () => { sending = false; flashDot('#ef4444'); }
        });
    }

    function flashDot(color) {
        const dot = document.getElementById('lc-status-dot');
        if (!dot) return;
        dot.style.background = color;
        setTimeout(() => { dot.style.background = paused ? '#f59e0b' : '#22c55e'; }, 500);
    }

    // ==================== GEMINI AI ====================
    const PERSONA_INTERVIEWER = `You are a real human interviewer at a top tech company (Google/Amazon level). This is a live coding interview happening right now.

OUTPUT RULES:
- 4-8 sentences. Enough to clearly explain the issue and WHY it's wrong, but don't write an essay.
- Talk like a real person -- conversational, not a textbook. No markdown headers (no ** or ##). Plain text only.
- You CAN briefly explain what's going wrong and why, but don't give the fix or write code.
- Reference specific lines and trace through with a concrete example so the candidate can see the bug.
- End with a question or nudge so they know what to work on next.
- NEVER give the full solution or write corrected code for them.
- Sound natural: "So looking at line 5..." / "The issue here is..." / "What happens when you pass in..."
`;

    const PERSONA_TEACHER = `You are a patient, brilliant coding teacher -- like the best DSA tutor who makes everything click. You're helping a student learn by working through a LeetCode problem together.

OUTPUT RULES:
- Be thorough and teach the concept. Explain the WHY behind everything -- why this data structure, why this approach, why this complexity.
- Walk through the logic step by step. Use small concrete examples to illustrate.
- If their code has a bug, explain exactly what's wrong, trace through it with an example showing the wrong output, and explain how to fix it.
- Share the optimal approach and explain the intuition behind it. Connect it to broader patterns (sliding window, two pointers, DFS/BFS, etc.).
- Use plain text, no markdown headers. Keep it conversational but informative.
- It's OK to show corrected code snippets or pseudocode when it helps learning.
- Mention time/space complexity with clear explanation of why.
- Think of yourself as a friend who's really good at DSA and genuinely wants them to understand, not just pass.
`;

    const PERSONA_NEETCODE = `You are a senior engineer at Google acting as a technical interviewer. The candidate is studying a NeetCode solutions page and will explain each approach to you out loud — from brute force to optimal — exactly as they'd have to in a real coding interview.

YOU already know all the solutions on the page (they are in your context). Your job is to test whether the candidate TRULY understands them, not just recites them.

WHAT TO PROBE:
- "Walk me through what happens when [specific example input]."
- "Why does using a hash map help here — what property are you exploiting?"
- "You said O(n) — why isn't the hash map lookup making this O(n²)?"
- "What's the key insight that gets you from brute force to optimal?"
- "What happens if there are duplicate values?"
- "Why can't you just sort the array and use two pointers for this specific problem?"
- If they skip an approach: "Hold on — you skipped the brute force. Tell me why it's too slow first."
- If they get something wrong: "Are you sure about that? Think about what happens when..." (never just give the answer).

OUTPUT RULES:
- 2-4 sentences. Sound like a real interviewer, not a textbook. Plain text, no markdown.
- Ask exactly ONE clear, focused question per response.
- Briefly acknowledge correct explanations before probing deeper.
- Be challenging but fair — this is interview practice, not a lecture.
`;

    function getPersona() {
        if (IS_NEETCODE) return PERSONA_NEETCODE;
        return aiMode === 'teacher' ? PERSONA_TEACHER : PERSONA_INTERVIEWER;
    }

    function buildContext() {
        const problem = getProblemInfo();
        let ctx = '';
        if (problem.title) ctx += `PROBLEM: ${problem.title}\n`;
        if (problem.difficulty) ctx += `DIFFICULTY: ${problem.difficulty}\n`;
        if (problem.description) ctx += `DESCRIPTION:\n${problem.description}\n\n`;

        if (IS_NEETCODE) {
            const sols = getNeetcodeSolutions();
            if (sols.fullText) {
                ctx += `NEETCODE SOLUTIONS PAGE — ALL APPROACHES:\n${sols.fullText.substring(0, 6000)}\n\n`;
            }
            ctx += `MODE: The candidate is studying these solutions and will explain each approach to you. They should cover brute force through optimal. Probe their understanding with one question at a time.\n\n`;
        } else {
            const code = getEditorCode() || '';
            if (code) {
                const lines = code.split('\n');
                const numbered = lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
                ctx += `FULL CODE (${lines.length} lines):\n\`\`\`${problem.language}\n${numbered}\n\`\`\`\n\n`;
                const vr = getVisibleRange();
                if (vr) {
                    ctx += `USER IS CURRENTLY VIEWING lines ${vr.startLine}-${vr.endLine}. Focus your feedback on this section but use full code for context.\n\n`;
                }
            }
        }

        const recent = chatHistory.slice(-6).map(m => `${m.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${m.text}`).join('\n');
        if (recent) ctx += `RECENT CONVERSATION:\n${recent}\n\n`;
        return ctx;
    }

    async function callGemini(prompt) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: GEMINI_URL,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7 }
                }),
                onload: function(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.error) {
                            console.error('[LC AI] Gemini error:', data.error);
                            resolve('Gemini error: ' + (data.error.message || 'Unknown error'));
                            return;
                        }
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text) {
                            const reason = data.candidates?.[0]?.finishReason || 'unknown';
                            console.warn('[LC AI] Empty response:', JSON.stringify(data).slice(0, 500));
                            resolve('Empty AI response (reason: ' + reason + '). Try again.');
                            return;
                        }
                        resolve(text);
                    } catch(e) {
                        console.error('[LC AI] Parse error:', e, res.responseText?.slice(0, 300));
                        resolve('Error parsing AI response.');
                    }
                },
                onerror: (err) => {
                    console.error('[LC AI] Request failed:', err);
                    resolve('AI request failed. Check your connection.');
                }
            });
        });
    }

    // Resilient caller: tries flash first (fast/cheap), falls back to pro, retries on 429/503.
    async function callGeminiResilient(prompt, temp = 0.7) {
        const urls = [GEMINI_FLASH_URL, GEMINI_URL];
        for (const url of urls) {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const text = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'POST', url,
                            headers: { 'Content-Type': 'application/json' },
                            data: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp } }),
                            onload: function(res) {
                                try {
                                    if (res.status === 429 || res.status === 503) { resolve(null); return; }
                                    const data = JSON.parse(res.responseText);
                                    if (data.error) { resolve(null); return; }
                                    resolve(data.candidates?.[0]?.content?.parts?.[0]?.text || null);
                                } catch(e) { resolve(null); }
                            },
                            onerror: () => resolve(null)
                        });
                    });
                    if (text) return text;
                    if (attempt < 2) await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 8000)));
                } catch(e) {
                    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
                }
            }
        }
        return null;
    }

    async function sendToAI(userMsg, systemSuffix) {
        if (aiThinking) return;
        aiThinking = true;
        if (userMsg) addChatMessage('user', userMsg);
        updateThinking(true);

        const prompt = getPersona() + buildContext() + (systemSuffix || `The candidate says: "${userMsg}"\n\nRespond naturally.`);
        const reply = await callGemini(prompt);
        aiThinking = false;
        updateThinking(false);
        addChatMessage('ai', reply);
        if (autoSpeak) speakText(reply);
    }

    // ==================== TTS ====================
    // Helper: convert GM_xmlhttpRequest response to a playable Blob
    function _responseToBlob(res) {
        // GM_xmlhttpRequest responseType:'blob' is unreliable across Tampermonkey versions.
        // Try multiple strategies to get a valid audio Blob.
        const mimeType = 'audio/mpeg';
        // 1. If response is already a Blob
        if (res.response instanceof Blob && res.response.size > 0) return res.response;
        // 2. If response is an ArrayBuffer
        if (res.response instanceof ArrayBuffer && res.response.byteLength > 0) return new Blob([res.response], { type: mimeType });
        // 3. If responseText exists and looks like binary (Tampermonkey may put binary in responseText)
        if (res.responseText && res.responseText.length > 100) {
            try {
                const bytes = new Uint8Array(res.responseText.length);
                for (let i = 0; i < res.responseText.length; i++) bytes[i] = res.responseText.charCodeAt(i) & 0xff;
                return new Blob([bytes], { type: mimeType });
            } catch(e) { console.warn('[LC TTS] Binary conversion failed:', e); }
        }
        return null;
    }

    // Fallback: use browser's built-in speechSynthesis
    function _browserTTSFallback(text) {
        if (!window.speechSynthesis) { syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null; return; }
        const utt = new SpeechSynthesisUtterance(text.slice(0, 500)); // browser TTS has limits
        utt.rate = 1.05;
        utt.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US') || v.name.includes('Daniel')) || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utt.voice = preferred;
        window.speechSynthesis.speak(utt);
        currentAudio = { pause() { window.speechSynthesis.cancel(); }, currentTime: 0 };
        utt.onend = () => {
            currentAudio = null;
            syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null;
            chatWindowChannel.postMessage({ source: 'main', type: 'stop-audio-ui', show: false });
        };
        utt.onerror = () => {
            currentAudio = null;
            syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null;
        };
    }

    function speakText(text) {
        // If the other side (portal) is already speaking, skip
        if (ttsSpeaker && ttsSpeaker !== SYNC_SOURCE) {
            console.log('[LC TTS] Skipping — portal is speaking');
            return;
        }
        stopAudio();
        syncBroadcast({ type: 'tts-start' });
        ttsSpeaker = SYNC_SOURCE;
        chatWindowChannel.postMessage({ source: 'main', type: 'stop-audio-ui', show: true });
        const clean = text.replace(/<[^>]*>/g, '').replace(/\*\*/g, '').replace(/`([^`]+)`/g, '$1').replace(/#{1,3}\s/g, '').trim();
        if (!clean) { syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null; return; }

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${SM_TTS_URL}/${ttsVoice}`,
            headers: {
                'Authorization': `Bearer ${SM_TTS_KEY}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ text: clean }),
            responseType: 'arraybuffer',
            overrideMimeType: 'application/octet-stream',
            onload: function(res) {
                if (res.status !== 200) {
                    console.error('[LC TTS] Speechmatics error:', res.status, '— falling back to browser TTS');
                    _browserTTSFallback(clean);
                    return;
                }
                const blob = _responseToBlob(res);
                if (!blob || blob.size === 0) {
                    console.warn('[LC TTS] Empty/invalid blob from Speechmatics — falling back to browser TTS');
                    _browserTTSFallback(clean);
                    return;
                }
                const url = URL.createObjectURL(blob);
                currentAudio = new Audio(url);
                currentAudio.onended = () => {
                    URL.revokeObjectURL(url);
                    currentAudio = null;
                    syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null;
                    if (stopBtn) stopBtn.style.display = 'none';
                };
                currentAudio.onerror = () => {
                    console.warn('[LC TTS] Audio playback error — falling back to browser TTS');
                    URL.revokeObjectURL(url);
                    currentAudio = null;
                    _browserTTSFallback(clean);
                };
                currentAudio.play().catch(() => {
                    console.warn('[LC TTS] play() rejected — falling back to browser TTS');
                    URL.revokeObjectURL(url);
                    currentAudio = null;
                    _browserTTSFallback(clean);
                });
            },
            onerror: function(err) {
                console.error('[LC TTS] Request failed — falling back to browser TTS:', err);
                _browserTTSFallback(clean);
            }
        });
    }

    function stopAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        window.speechSynthesis.cancel();
        if (ttsSpeaker === SYNC_SOURCE) { syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null; }
        chatWindowChannel.postMessage({ source: 'main', type: 'stop-audio-ui', show: false });
    }

    // ==================== STT (Voice Input via SharedMic) ====================
    async function startListening() {
        stopAudio();
        voiceFinal = '';
        isListening = true;
        chatWindowChannel.postMessage({ source: 'main', type: 'mic-ui', listening: true });
        chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: '🔴 Requesting mic...' });

        // Pre-check mic permission
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
        } catch(e) {
            chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: '⚠️ Mic denied — allow in address bar 🔒' });
            stopListeningUI();
            return;
        }

        chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: '🔴 Listening...' });
        SharedMic.acquire('click-to-talk', {
            onResult(finalText, interimText) {
                if (finalText) voiceFinal += finalText;
                const preview = (voiceFinal + interimText).trim().slice(-60);
                chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: '🔴 ' + preview });
            }
        });
    }

    function stopListening() {
        const text = voiceFinal.trim();
        SharedMic.release('click-to-talk');
        stopListeningUI();
        if (text) sendToAI(text);
    }

    function stopListeningUI() {
        isListening = false;
        chatWindowChannel.postMessage({ source: 'main', type: 'mic-ui', listening: false });
        chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: '' });
    }

    function toggleMic() {
        if (isListening) stopListening();
        else startListening();
    }

    // ==================== SYNC CHAT TO WEBHOOK ====================
    function syncChatToWebhook(role, text) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: WEBHOOK_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ type: 'chat', role, text, source: 'extension' }),
            onload: () => {},
            onerror: () => console.warn('[LC AI] Chat sync failed')
        });
    }

    // ==================== CHAT UI ====================
    function addChatMessage(role, text) {
        chatHistory.push({ role, text, time: Date.now() });
        // Sync to webhook so recorder portal sees it
        syncChatToWebhook(role, text);
        // Broadcast to popup window
        chatWindowChannel.postMessage({ source: 'main', type: 'chat-msg', role, text });
    }

    function updateThinking(on) {
        chatWindowChannel.postMessage({ source: 'main', type: 'thinking', on });
    }

    // ==================== POPUP WINDOW CHAT ====================
    let chatPopupWindow = null;
    const chatWindowChannel = new BroadcastChannel('lc-chat-window');

    // Listen for actions from popup window
    chatWindowChannel.onmessage = (ev) => {
        const d = ev.data;
        if (!d || d.source !== 'chat-popup') return;
        if (d.type === 'send-text') sendToAI(d.text);
        else if (d.type === 'send-ai') sendToAI(d.userMsg, d.systemHint);
        else if (d.type === 'toggle-mic') toggleMic();
        else if (d.type === 'toggle-mode') {
            aiMode = aiMode === 'teacher' ? 'interviewer' : 'teacher';
            const modeMsg = aiMode === 'teacher' ? "Switched to Teacher mode -- I'll explain everything in detail so you can learn." : "Switched to Interview mode -- I'll act like a real interviewer. No freebies.";
            addChatMessage('ai', modeMsg);
            chatWindowChannel.postMessage({ source: 'main', type: 'mode-changed', mode: aiMode });
        }
        else if (d.type === 'stop-audio') stopAudio();
        else if (d.type === 'set-auto-speak') autoSpeak = d.value;
        else if (d.type === 'set-voice') ttsVoice = d.value;
        else if (d.type === 'toggle-live-listen') toggleActiveListen();
        else if (d.type === 'talk-now') activeTalkNow();
        else if (d.type === 'clear-transcript') activeClearTranscript();
        else if (d.type === 'walkthrough') runFullWalkthrough();
        else if (d.type === 'approach') {
            addChatMessage('ai', "Before coding — walk me through your approach. What's the brute force? Can you optimize it? What data structure helps here?");
            if (autoSpeak) speakText("Before coding, walk me through your approach. What's the brute force? Can you optimize it? What data structure helps here?");
        }
        else if (d.type === 'clear-chat') { chatHistory = []; }
        else if (d.type === 'popup-ready') {
            // Send existing chat history to newly opened popup
            chatWindowChannel.postMessage({ source: 'main', type: 'init', history: chatHistory, mode: aiMode, autoSpeak, ttsVoice });
        }
        else if (d.type === 'popup-closed') { chatOpen = false; chatPopupWindow = null; }
    };

    function buildPopupHTML() {
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LC Interview Chat</title>
<style>
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0}
body{background:#0a0e17;color:#e2e8f0;display:flex;flex-direction:column;height:100vh;overflow:hidden}
button{cursor:pointer;border:none;outline:none;font-family:inherit}
@keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.header{padding:10px 14px;background:#131a2b;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.thinking{display:none;padding:6px 14px;font-size:11px;color:#94a3b8;flex-shrink:0}
.quick-btns{padding:6px 10px;border-top:1px solid #1e293b;display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0}
.quick-btns button{font-size:10px;padding:4px 8px;background:#1a2340;color:#94a3b8;border-radius:6px;border:1px solid #1e293b}
.quick-btns .walk{color:#c084fc;border-color:#8b5cf6;font-weight:700}
.mic-status{padding:0 14px;font-size:10px;color:#ef4444;min-height:16px;flex-shrink:0}
.input-bar{padding:8px 10px;border-top:1px solid #1e293b;display:flex;gap:6px;align-items:center;background:#131a2b;flex-shrink:0}
.input-bar input{flex:1;background:#0a0e17;border:1px solid #1e293b;border-radius:8px;padding:8px 10px;color:#e2e8f0;font-size:12px;outline:none}
.active-panel{display:none;padding:10px 12px;background:#0d1628;border-bottom:1px solid #22c55e;flex-shrink:0}
</style></head><body>
<div class="header">
    <span id="mode-label" style="font-weight:700;font-size:13px">🎯 Interview Mode</span>
    <div style="display:flex;align-items:center;gap:6px">
        <button id="mode-toggle" style="font-size:10px;color:#f59e0b;background:none;padding:2px 8px;border:1px solid #f59e0b;border-radius:4px;font-weight:600">Switch to Teacher</button>
        <button id="stop-audio" style="font-size:10px;color:#ef4444;background:none;padding:2px 6px;border:1px solid #ef4444;border-radius:4px;display:none;font-weight:600">⏹ Stop</button>
        <select id="voice-select" style="font-size:10px;background:#0a0e17;color:#94a3b8;border:1px solid #333;border-radius:4px;padding:1px 4px">
            <option value="jack">🇺🇸 Jack</option><option value="theo">🇬🇧 Theo</option>
        </select>
        <label style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:3px;cursor:pointer">
            <input type="checkbox" id="auto-speak-cb" checked style="width:12px;height:12px"> 🔊
        </label>
        <button id="clear-btn" style="font-size:10px;color:#64748b;background:none;padding:2px 6px;border:1px solid #333;border-radius:4px">Clear</button>
    </div>
</div>
<div class="active-panel" id="active-panel">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:700;color:#22c55e">🎙 Live Listen</span>
        <span id="active-state" style="font-size:10px;color:#94a3b8;padding:1px 6px;background:#0a0e17;border:1px solid #1e293b;border-radius:8px">idle</span>
        <span style="flex:1"></span>
        <button id="talk-now" style="font-size:10px;padding:3px 8px;background:#22c55e;color:#000;border-radius:5px;font-weight:700">💬 Talk Now</button>
        <button id="clear-transcript" style="font-size:10px;padding:3px 6px;background:transparent;color:#94a3b8;border:1px solid #333;border-radius:5px">✖</button>
    </div>
    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">What AI heard</div>
    <div id="active-transcript" style="min-height:54px;max-height:120px;overflow-y:auto;background:#0a0e17;border:1px solid #1e293b;border-radius:6px;padding:6px 8px;font-size:11px;line-height:1.5;color:#e2e8f0">
        <span style="color:#64748b">Start talking and your words will appear here.</span>
    </div>
</div>
<div class="messages" id="messages">
    <div style="align-self:flex-start;background:#1a2340;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.6">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;opacity:.6;margin-bottom:3px">Interviewer</div>
        Hey! I'm your coding interview partner. Start solving the problem — click 🎤 or type below to talk.
    </div>
</div>
<div class="thinking" id="thinking">⏳ Thinking...</div>
<div class="quick-btns">
    <button id="q-hint">💡 Hint</button>
    <button id="q-review">🔍 Review</button>
    <button id="q-complexity">⏱ Complexity</button>
    <button id="q-optimize">🚀 Optimize</button>
    <button id="q-edge">⚠ Edge Cases</button>
    <button id="q-approach">🤔 Approach</button>
    <button id="q-walkthrough" class="walk">📝 Full Walkthrough</button>
</div>
<div class="mic-status" id="mic-status"></div>
<div class="input-bar">
    <button id="mic-btn" style="width:36px;height:36px;border-radius:50%;background:#3b82f6;color:white;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0">🎤</button>
    <input id="chat-input" type="text" placeholder="Type or use mic...">
    <button id="chat-send" style="background:#3b82f6;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600">➤</button>
    <button id="live-btn" style="background:transparent;color:#22c55e;border:1px solid #22c55e;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700">🎙 Live</button>
</div>
<script>
const ch = new BroadcastChannel('lc-chat-window');
const SRC = 'chat-popup';
function send(msg) { ch.postMessage({...msg, source: SRC}); }

// Notify main tab we're ready
send({type:'popup-ready'});
window.addEventListener('beforeunload', () => send({type:'popup-closed'}));

const msgContainer = document.getElementById('messages');
function addBubble(role, text) {
    const div = document.createElement('div');
    const bg = role === 'ai' ? '#1a2340' : '#3b82f6';
    const align = role === 'ai' ? 'flex-start' : 'flex-end';
    const label = role === 'ai' ? 'Interviewer' : 'You';
    const formatted = text.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>').replace(/\`([^\`]+)\`/g,'<code style="background:#2d2d2d;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
    div.style.cssText = 'align-self:'+align+';background:'+bg+';padding:8px 12px;border-radius:10px;max-width:90%;font-size:12px;line-height:1.6;animation:slideIn .2s ease';
    div.innerHTML = '<div style="font-size:9px;font-weight:700;text-transform:uppercase;opacity:.6;margin-bottom:3px">'+label+'</div>'+formatted;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

function addFormattedBubble(html) {
    const div = document.createElement('div');
    div.style.cssText = 'align-self:flex-start;background:#1a2340;border-left:3px solid #8b5cf6;padding:10px 12px;border-radius:10px;max-width:96%;font-size:12px;line-height:1.6;color:#e2e8f0;animation:slideIn .2s ease';
    div.innerHTML = html;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

// Listen for messages from main tab
ch.onmessage = (ev) => {
    const d = ev.data;
    if (!d || d.source === SRC) return;
    if (d.type === 'chat-msg') addBubble(d.role, d.text);
    else if (d.type === 'chat-html') addFormattedBubble(d.html);
    else if (d.type === 'thinking') document.getElementById('thinking').style.display = d.on ? 'block' : 'none';
    else if (d.type === 'stop-audio-ui') document.getElementById('stop-audio').style.display = d.show ? 'inline-block' : 'none';
    else if (d.type === 'mic-status') document.getElementById('mic-status').textContent = d.text || '';
    else if (d.type === 'mic-ui') {
        const b = document.getElementById('mic-btn');
        if (d.listening) { b.style.background='#ef4444'; b.title='Listening...'; }
        else { b.style.background='#3b82f6'; b.title='Click to speak'; }
    }
    else if (d.type === 'active-panel-ui') {
        document.getElementById('active-panel').style.display = d.show ? 'block' : 'none';
        if (d.state) document.getElementById('active-state').textContent = d.state;
    }
    else if (d.type === 'active-transcript') document.getElementById('active-transcript').innerHTML = d.html;
    else if (d.type === 'active-last-decision') {
        // Could show last decision info if needed
    }
    else if (d.type === 'mode-changed') {
        const label = document.getElementById('mode-label');
        const btn = document.getElementById('mode-toggle');
        if (d.mode === 'teacher') { label.textContent='📚 Teacher Mode'; btn.textContent='Switch to Interviewer'; btn.style.color='#22c55e'; btn.style.borderColor='#22c55e'; }
        else { label.textContent='🎯 Interview Mode'; btn.textContent='Switch to Teacher'; btn.style.color='#f59e0b'; btn.style.borderColor='#f59e0b'; }
    }
    else if (d.type === 'init') {
        msgContainer.innerHTML = '';
        (d.history || []).forEach(h => addBubble(h.role, h.text));
        if (d.mode === 'teacher') { document.getElementById('mode-label').textContent='📚 Teacher Mode'; document.getElementById('mode-toggle').textContent='Switch to Interviewer'; }
        document.getElementById('auto-speak-cb').checked = d.autoSpeak;
        document.getElementById('voice-select').value = d.ttsVoice || 'jack';
    }
};

// Buttons
document.getElementById('chat-send').onclick = () => { const v=document.getElementById('chat-input').value.trim(); if(v){document.getElementById('chat-input').value=''; send({type:'send-text',text:v});} };
document.getElementById('chat-input').onkeydown = (e) => { if(e.key==='Enter'){e.preventDefault(); document.getElementById('chat-send').onclick();} };
document.getElementById('mic-btn').onclick = () => send({type:'toggle-mic'});
document.getElementById('mode-toggle').onclick = () => send({type:'toggle-mode'});
document.getElementById('stop-audio').onclick = () => send({type:'stop-audio'});
document.getElementById('auto-speak-cb').onchange = (e) => send({type:'set-auto-speak',value:e.target.checked});
document.getElementById('voice-select').onchange = (e) => send({type:'set-voice',value:e.target.value});
document.getElementById('clear-btn').onclick = () => { msgContainer.innerHTML=''; send({type:'clear-chat'}); };
document.getElementById('live-btn').onclick = () => send({type:'toggle-live-listen'});
document.getElementById('talk-now').onclick = () => send({type:'talk-now'});
document.getElementById('clear-transcript').onclick = () => send({type:'clear-transcript'});
document.getElementById('q-hint').onclick = () => send({type:'send-ai',userMsg:'[Hint requested]',systemHint:"Give a helpful hint — explain the key insight or data structure they should think about and WHY it helps here. 3-5 sentences. Don't give code, but make sure they understand the direction."});
document.getElementById('q-review').onclick = () => send({type:'send-ai',userMsg:'[Code review]',systemHint:"Review their code conversationally. Point out the top 1-2 issues with specific lines, briefly explain WHY each is a problem (trace with a small example if helpful), state time/space complexity, and say whether it would pass LeetCode. Keep it to 5-8 sentences, plain text, no markdown headers or numbered lists."});
document.getElementById('q-complexity').onclick = () => send({type:'send-ai',userMsg:'[Complexity check]',systemHint:"Explain the time and space complexity — walk through which operations dominate and why. If not optimal, mention what the optimal is and nudge them toward it. 4-6 sentences."});
document.getElementById('q-optimize').onclick = () => send({type:'send-ai',userMsg:'[Optimization]',systemHint:"Identify the bottleneck and explain why it's slow. Give a guiding hint about what approach or data structure could help and why. Don't write the solution but make sure they understand the insight. 4-6 sentences."});
document.getElementById('q-edge').onclick = () => send({type:'send-ai',userMsg:'[Edge cases]',systemHint:"Pick the top 2-3 edge cases their code would struggle with. For each, give the specific input and ask what their code returns. If it would fail, briefly say why. 4-6 sentences."});
document.getElementById('q-approach').onclick = () => send({type:'approach'});
document.getElementById('q-walkthrough').onclick = () => send({type:'walkthrough'});
<\/script></body></html>`;
    }

    function toggleChat() {
        // If popup window exists and is open, focus it
        if (chatPopupWindow && !chatPopupWindow.closed) {
            chatPopupWindow.focus();
            return;
        }
        // Open new popup window (same size as old inline panel)
        chatPopupWindow = window.open('', 'lc-interview-chat', 'width=400,height=560,top=100,left=' + (screen.width - 420));
        if (!chatPopupWindow) {
            // Popup blocked — fall back to inline
            alert('Popup blocked! Please allow popups for leetcode.com');
            return;
        }
        chatOpen = true;
        chatPopupWindow.document.open();
        chatPopupWindow.document.write(buildPopupHTML());
        chatPopupWindow.document.close();

        // Update button
        const btn = document.getElementById('lc-chat-toggle-btn');
        if (btn) btn.textContent = '💬✓';

        // Detect close
        const checkClosed = setInterval(() => {
            if (chatPopupWindow && chatPopupWindow.closed) {
                clearInterval(checkClosed);
                chatOpen = false;
                chatPopupWindow = null;
                const b = document.getElementById('lc-chat-toggle-btn');
                if (b) b.textContent = '💬';
            }
        }, 500);
    }

    // ==================== BUILD UI ====================
    function createUI() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes lcSlideIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
            @keyframes lcPulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
            #lc-ext-root * { box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
            #lc-ext-root button { cursor:pointer; border:none; outline:none; font-family:inherit; }
            #lc-drag-handle { cursor:grab; user-select:none; }
            #lc-drag-handle:active { cursor:grabbing; }
            #lc-control-bar.lc-dragging { opacity:0.85; transition:none !important; }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'lc-ext-root';
        root.innerHTML = `
        <!-- Bottom control bar -->
        <div id="lc-control-bar" style="position:fixed;bottom:16px;right:16px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;gap:8px">

            <!-- Bottom buttons row -->
            <div style="display:flex;align-items:center;gap:6px">
                <span id="lc-drag-handle" title="Drag to move" style="font-size:14px;color:#64748b;padding:2px 4px;line-height:1">⠿</span>
                <span id="lc-status-dot" style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0"></span>
                <span id="lc-status-text" style="font-size:11px;color:#94a3b8;min-width:60px">Live</span>
                <button id="lc-send-btn" style="background:#3b82f6;color:white;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600">Sync</button>
                <button id="lc-toggle-btn" style="background:transparent;color:#94a3b8;border:1px solid #333;border-radius:6px;padding:4px 8px;font-size:11px">Pause</button>
                <button id="lc-live-listen-btn" title="Active listen — interviewer interrupts when needed" style="background:transparent;color:#22c55e;border:1px solid #22c55e;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700">🎙 Live</button>
                <button id="lc-mic-float" title="Quick voice" style="width:32px;height:32px;border-radius:50%;background:#3b82f6;color:white;font-size:14px;display:flex;align-items:center;justify-content:center">🎤</button>
                <button id="lc-chat-toggle-btn" style="background:#8b5cf6;color:white;border-radius:8px;padding:4px 12px;font-size:13px;font-weight:700">💬</button>
            </div>
        </div>
        `;
        document.body.appendChild(root);

        // ==================== DRAG TO MOVE ====================
        (() => {
            const bar = document.getElementById('lc-control-bar');
            const handle = document.getElementById('lc-drag-handle');
            let dragging = false, startX, startY, startLeft, startTop;

            // Convert initial bottom/right positioning to top/left for drag
            function initPosition() {
                const rect = bar.getBoundingClientRect();
                bar.style.left = rect.left + 'px';
                bar.style.top = rect.top + 'px';
                bar.style.right = 'auto';
                bar.style.bottom = 'auto';
                // Persist position
                try {
                    const saved = localStorage.getItem('lc-panel-pos');
                    if (saved) {
                        const pos = JSON.parse(saved);
                        // Clamp to viewport
                        bar.style.left = Math.min(Math.max(0, pos.left), window.innerWidth - 60) + 'px';
                        bar.style.top = Math.min(Math.max(0, pos.top), window.innerHeight - 60) + 'px';
                    }
                } catch(e) {}
            }

            // Delay init so layout settles
            setTimeout(initPosition, 300);

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = bar.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                bar.classList.add('lc-dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const newLeft = Math.min(Math.max(0, startLeft + dx), window.innerWidth - 60);
                const newTop = Math.min(Math.max(0, startTop + dy), window.innerHeight - 60);
                bar.style.left = newLeft + 'px';
                bar.style.top = newTop + 'px';
                bar.style.right = 'auto';
                bar.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                bar.classList.remove('lc-dragging');
                // Save position
                try {
                    localStorage.setItem('lc-panel-pos', JSON.stringify({
                        left: parseInt(bar.style.left),
                        top: parseInt(bar.style.top)
                    }));
                } catch(e) {}
            });
        })();

        // ==================== EVENT HANDLERS ====================
        // Chat toggle — opens popup window
        document.getElementById('lc-chat-toggle-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleChat(); });

        // Send code
        document.getElementById('lc-send-btn').addEventListener('click', (e) => { e.stopPropagation(); sendCode(true); });

        // Pause/resume
        document.getElementById('lc-toggle-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            paused = !paused;
            document.getElementById('lc-toggle-btn').textContent = paused ? 'Resume' : 'Pause';
            document.getElementById('lc-status-dot').style.background = paused ? '#f59e0b' : '#22c55e';
            document.getElementById('lc-status-text').textContent = paused ? 'Paused' : 'Live';
            if (paused) clearInterval(autoInterval);
            else autoInterval = setInterval(() => sendCode(), SEND_INTERVAL);
        });

        // Floating mic button — opens chat popup then toggles mic
        document.getElementById('lc-mic-float').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!chatOpen) toggleChat();
            setTimeout(() => toggleMic(), 300);
        });

        // Live Listen toggle
        document.getElementById('lc-live-listen-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleActiveListen(); });

        // Keyboard shortcut: Ctrl+Shift+M to toggle mic
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                e.preventDefault();
                if (!chatOpen) toggleChat();
                setTimeout(() => toggleMic(), 300);
            }
        });
    }

    function sendChatText() {
        // Text input is now in the popup window — this is kept for legacy calls
        // Popup sends 'send-text' via BroadcastChannel instead
    }

    // ==================== FULL INTERVIEW WALKTHROUGH ====================
    // Use escHtmlSafe (defined below) for all HTML escaping
    function escHtmlStr(s) { return escHtmlSafe(s); }

    function renderWalkthroughHtml(text) {
        let html = escHtmlStr(text);
        // Triple-backtick code blocks
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code) {
            return '</p><pre style="background:#1e1e1e;color:#d4d4d4;padding:10px 12px;border-radius:6px;overflow-x:auto;font-size:11px;line-height:1.5;margin:8px 0;white-space:pre;font-family:\'Fira Code\',\'Cascadia Code\',monospace"><code>' + code + '</code></pre><p style="margin:0">';
        });
        // Inline backticks
        html = html.replace(/`([^`\n]+)`/g, '<code style="background:#2d2d2d;padding:1px 5px;border-radius:3px;font-size:11px">$1</code>');
        // Bold numbered section headers ("1. ..." through "13. ...")
        html = html.replace(/(^|\n)(\s*)(1[0-3]\.|[1-9]\.)\s+([^\n]+)/g, '$1$2<b style="color:#06b6d4;font-size:12px;display:inline-block;margin-top:8px">$3 $4</b>');
        // Bold special labels
        html = html.replace(/(^|\n)(Short polished summary|Optimal complexity|Brute force complexity)/gi, '$1<b style="color:#c084fc;font-size:12px;display:inline-block;margin-top:6px">$2</b>');
        // Paragraph + line breaks
        html = html.replace(/\n\n+/g, '</p><p style="margin:6px 0 0">');
        html = html.replace(/\n/g, '<br>');
        return '<p style="margin:0">' + html + '</p>';
    }

    function addWalkthroughMessage(text) {
        chatHistory.push({ role: 'ai', text: text, time: Date.now() });
        syncChatToWebhook('ai', text);
        // Broadcast formatted walkthrough to popup
        const wtHtml = '<div style="font-size:9px;font-weight:700;text-transform:uppercase;opacity:.7;margin-bottom:4px;color:#c084fc">Interviewer — Full Walkthrough</div>' + renderWalkthroughHtml(text);
        chatWindowChannel.postMessage({ source: 'main', type: 'chat-html', html: wtHtml });
    }

    async function runFullWalkthrough() {
        if (aiThinking) return;
        const problem = getProblemInfo();
        const code = getEditorCode() || '';
        if (!problem.title && !code) { addChatMessage('ai', 'Open a LeetCode problem first.'); return; }

        if (!chatOpen) toggleChat();
        addChatMessage('user', '[Requested full interview walkthrough]');
        aiThinking = true;
        updateThinking(true);

        const ctx =
            (problem.title ? 'PROBLEM TITLE: ' + problem.title + '\n' : '') +
            (problem.difficulty ? 'DIFFICULTY: ' + problem.difficulty + '\n' : '') +
            (problem.description ? 'DESCRIPTION:\n' + problem.description + '\n' : '') +
            (code ? '\nCANDIDATE CURRENT CODE:\n```\n' + code + '\n```\n' : '');

        const prompt =
            "You are a senior Amazon SDE interviewer producing a full interview-style walkthrough for this problem. " +
            "Output EXACTLY the 13 sections below, in order, using the exact numbered headers. Write in the CANDIDATE'S VOICE (\"I'll...\" / \"Let me...\" / \"My approach is...\") as if they were speaking the answer out loud in a live Amazon SDE internship interview.\n\n" +
            ctx + "\n\n" +
            "OUTPUT EXACTLY THESE 13 SECTIONS WITH THESE NUMBERED HEADERS:\n\n" +
            "1. Restate the problem\n(1 short paragraph in candidate's own words)\n\n" +
            "2. Clarifying questions\n(4-6 questions the candidate should ask, phrased as spoken questions starting with \"I'm assuming\" or \"Is it correct that\")\n\n" +
            "3. Assumptions, constraints, and edge cases\n(6-10 bullet points)\n\n" +
            "4. Brute force intuition\n(1 short paragraph, the first idea in their head)\n\n" +
            "5. Brute force approach plan with time/space\n(1 paragraph plan, then two lines: \"Time complexity: O(...)\" and \"Space complexity: O(...)\")\n\n" +
            "6. Optimal approach plan with time/space\n(1-2 paragraphs explaining the key insight, data structures, and WHY it works. End with \"Time complexity: O(...)\" and \"Space complexity: O(...)\")\n\n" +
            "7. Script while writing code\n(1 paragraph narrating what they say aloud as they type the optimal code — \"Now I'll write the optimal code. I'll import...\" etc.)\n\n" +
            "8. Optimal code\n(Python code block inside triple backticks — clean, runnable, with type hints where appropriate)\n\n" +
            "9. Dry run\n(Step-by-step trace through a concrete example from the problem, showing state at each step in the candidate's voice)\n\n" +
            "10. Complexity (time and space)\n(1 paragraph explaining final complexity in simple terms)\n\n" +
            "11. Edge cases\n(5-8 specific edge cases the candidate would call out)\n\n" +
            "12. Brute force code\n(Python code block inside triple backticks for the brute force version)\n\n" +
            "13. Probable follow-up questions and spoken answers\n(5-7 Q/A pairs: each starts with \"Follow-up N: <question>\" and the answer in first person)\n\n" +
            "RULES:\n" +
            "- Use Python.\n" +
            "- Each section must be present with its numbered header EXACTLY as shown (e.g. \"1. Restate the problem\" on its own line).\n" +
            "- Speak in first person as the candidate.\n" +
            "- Use triple-backtick ```python fences ONLY for code blocks in sections 8 and 12.\n" +
            "- End with a one-paragraph summary labeled exactly \"Short polished summary\" that the candidate can memorize and speak in 15-20 seconds.\n" +
            "- Be interview-realistic, not textbook-ish. Reference specific lines, show trace states, name data structures and WHY you picked them.";

        try {
            const reply = await callGemini(prompt);
            aiThinking = false;
            updateThinking(false);
            addWalkthroughMessage(reply);
        } catch (e) {
            aiThinking = false;
            updateThinking(false);
            addChatMessage('ai', 'Walkthrough failed: ' + (e && e.message ? e.message : 'unknown error'));
        }
    }

    // ==================== LIVE ACTIVE LISTEN ====================
    let activeListening = false;
    let activeEngine = null;

    function escHtmlSafe(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ==================== SHARED MODULE: TTS (GM_xmlhttpRequest version) ====================
    function speakTextPromise(text) {
        // If the other side is speaking, skip entirely
        if (ttsSpeaker && ttsSpeaker !== SYNC_SOURCE) {
            console.log('[LC TTS Promise] Skipping — portal is speaking');
            return Promise.resolve();
        }
        const ttsPromise = new Promise((resolve) => {
            const clean = (text || '').replace(/<[^>]*>/g, '').replace(/\*\*/g, '').replace(/`([^`]+)`/g, '$1').replace(/```[\s\S]*?```/g, '').replace(/#{1,3}\s/g, '').trim();
            if (!clean) { resolve(); return; }
            try { stopAudio(); } catch(e) {}
            syncBroadcast({ type: 'tts-start' }); ttsSpeaker = SYNC_SOURCE;

            function _endTTS() { syncBroadcast({ type: 'tts-end' }); ttsSpeaker = null; }

            function _fallbackAndResolve() {
                if (!window.speechSynthesis) { _endTTS(); resolve(); return; }
                const utt = new SpeechSynthesisUtterance(clean.slice(0, 500));
                utt.rate = 1.05;
                const voices = window.speechSynthesis.getVoices();
                const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US') || v.name.includes('Daniel')) || voices.find(v => v.lang.startsWith('en'));
                if (preferred) utt.voice = preferred;
                utt.onend = () => { currentAudio = null; _endTTS(); resolve(); };
                utt.onerror = () => { currentAudio = null; _endTTS(); resolve(); };
                currentAudio = { pause() { window.speechSynthesis.cancel(); }, currentTime: 0 };
                window.speechSynthesis.speak(utt);
            }

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${SM_TTS_URL}/${ttsVoice}`,
                headers: { 'Authorization': `Bearer ${SM_TTS_KEY}`, 'Content-Type': 'application/json' },
                data: JSON.stringify({ text: clean }),
                responseType: 'arraybuffer',
                overrideMimeType: 'application/octet-stream',
                onload: function(res) {
                    if (res.status !== 200) { console.warn('[LC TTS] Speechmatics', res.status, '— browser fallback'); _fallbackAndResolve(); return; }
                    const blob = _responseToBlob(res);
                    if (!blob || blob.size === 0) { console.warn('[LC TTS] Bad blob — browser fallback'); _fallbackAndResolve(); return; }
                    const url = URL.createObjectURL(blob);
                    currentAudio = new Audio(url);
                    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; _endTTS(); resolve(); };
                    currentAudio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; _fallbackAndResolve(); };
                    currentAudio.play().catch(() => { URL.revokeObjectURL(url); currentAudio = null; _fallbackAndResolve(); });
                },
                onerror: function() { _fallbackAndResolve(); }
            });
        });
        return Promise.race([ttsPromise, new Promise((resolve) => setTimeout(resolve, 15000))]);
    }

    // ==================== SHARED MODULE: Mic Manager ====================
    const SharedMic = {
        rec: null, owner: null, _watchdog: null, _onResultCb: null, _config: null,
        _gotResult: false, _gotAudio: false, _startedAt: 0, _restartCount: 0, _noSpeechCount: 0,
        acquire(owner, { onResult, continuous = true } = {}) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) { this._showMicError('SpeechRecognition not available. Use Chrome.'); return false; }
            if (this.owner && this.owner !== owner) this.release(this.owner);
            if (this.rec) this._destroyRec();
            this.owner = owner; this._onResultCb = onResult || null; this._config = { continuous };
            this._gotResult = false; this._gotAudio = false; this._restartCount = 0; this._noSpeechCount = 0;
            return this._createAndStart();
        },
        release(owner) {
            if (owner && this.owner !== owner) return;
            this._destroyRec();
            if (this._watchdog) { clearInterval(this._watchdog); this._watchdog = null; }
            this.owner = null; this._onResultCb = null; this._config = null;
        },
        isOwnedBy(owner) { return this.owner === owner; },
        _createAndStart() {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) return false;
            if (this._restartCount > 50) {
                this._showMicError('Speech recognition restarted too many times. Reload the page.');
                return false;
            }
            const rec = new SR();
            rec.continuous = this._config?.continuous ?? true;
            rec.interimResults = true; rec.lang = 'en-US';
            rec.maxAlternatives = 1;

            rec.onresult = (ev) => {
                if (!this._onResultCb) return;
                this._gotResult = true;
                this._noSpeechCount = 0; // reset — mic is clearly working
                this._restartCount = 0;  // reset so normal use never hits the limit
                let finalText = '', interimText = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript + ' ';
                    else interimText += ev.results[i][0].transcript;
                }
                this._onResultCb(finalText, interimText);
                // Share transcript to other tab
                syncBroadcast({ type: 'transcript', finalText, interimText });
            };

            rec.onaudiostart = () => {
                this._gotAudio = true;
                console.log('[SharedMic] Audio capture started');
                activeSetState('listening', '#22c55e');
            };

            rec.onspeechstart = () => {
                console.log('[SharedMic] Speech detected');
                activeSetState('hearing speech…', '#22c55e');
            };

            rec.onerror = (e) => {
                const err = e.error || 'unknown';
                if (err === 'no-speech') {
                    this._noSpeechCount++;
                    // After many no-speech errors, show a hint but keep going
                    if (this._noSpeechCount === 5) {
                        console.warn('[SharedMic] 5 no-speech errors — mic may not be picking up audio');
                        activeSetState('no speech detected — speak louder?', '#f59e0b');
                    }
                    // Will auto-restart via onend — this is normal
                } else if (err === 'not-allowed' || err === 'service-not-allowed') {
                    this._showMicError('Mic permission denied. Click 🔒 in address bar → allow mic → reload.');
                    this.release(this.owner);
                    return;
                } else if (err === 'network') {
                    this._showMicError('Speech recognition network error. Chrome uses Google servers — check internet.');
                } else if (err === 'aborted') {
                    // Normal during release/restart
                } else {
                    console.warn('[SharedMic] Error:', err);
                }
            };

            rec.onend = () => {
                if (this.rec === rec) this.rec = null;
                if (this.owner && this._onResultCb) {
                    this._restartCount++;
                    // Restart quickly — SpeechRecognition dies often (no-speech, timeout, etc.)
                    const delay = this._noSpeechCount > 3 ? 500 : 150;
                    setTimeout(() => { if (this.owner && !this.rec) this._createAndStart(); }, delay);
                }
            };

            try {
                rec.start();
                this.rec = rec;
                this._startedAt = Date.now();
                if (this._watchdog) clearInterval(this._watchdog);
                // Watchdog: if rec dies without triggering onend, restart it
                this._watchdog = setInterval(() => {
                    if (!this.owner) return;
                    if (!this.rec) {
                        console.warn('[SharedMic] Watchdog: rec is null, restarting');
                        this._createAndStart();
                    }
                    // If we've been "listening" for 30s+ without any audio, something is wrong
                    if (!this._gotAudio && !this._gotResult && Date.now() - this._startedAt > 30000) {
                        console.warn('[SharedMic] Watchdog: 30s with no audio — restarting');
                        this._destroyRec();
                        this._createAndStart();
                    }
                }, 10000);
                return true;
            } catch(e) {
                console.error('[SharedMic] start() threw:', e.message);
                // Most common: "already started" or "not allowed"
                if (e.message && e.message.includes('already started')) {
                    this._destroyRec();
                }
                setTimeout(() => { if (this.owner && !this.rec) this._createAndStart(); }, 800);
                return false;
            }
        },
        _showMicError(msg) {
            console.error('[SharedMic]', msg);
            chatWindowChannel.postMessage({ source: 'main', type: 'active-transcript', html: '<span style="color:#ef4444;font-weight:600">⚠️ ' + escHtmlSafe(msg) + '</span>' });
            chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: '⚠️ ' + msg });
            activeSetState('mic error', '#ef4444');
            addChatMessage('ai', '⚠️ ' + msg);
        },
        _destroyRec() {
            if (this.rec) {
                const r = this.rec;
                this.rec = null;
                try { r.onend = null; } catch(e) {}
                try { r.onresult = null; } catch(e) {}
                try { r.onerror = null; } catch(e) {}
                try { r.abort(); } catch(e) {}
            }
        }
    };

    // ==================== SHARED MODULE: Listen Engine ====================
    function createListenEngine(config) {
        const state = {
            rolling: '', interim: '', lastCheckText: '', lastSpokeAt: 0,
            silenceTimer: null, heartbeatTimer: null, checkInProgress: false,
            speaking: false, running: false,
            autoMode: config.autoMode !== false, micOwner: config.micOwner || 'engine',
        };
        const engine = {
            feed(finalText, interimText) {
                if (state.speaking) return;
                if (finalText) state.rolling += finalText;
                state.interim = interimText || '';
                state.lastSpokeAt = Date.now();
                if (config.onTranscript) config.onTranscript(state.rolling, state.interim);
                _onTick();
            },
            forceSpeak() { if (!state.speaking && !state.checkInProgress && state.running) _maybeSpeak('manual'); },
            start() {
                state.rolling = ''; state.interim = ''; state.lastCheckText = '';
                state.lastSpokeAt = Date.now(); state.running = true;
                if (config.heartbeatMs) {
                    if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
                    state.heartbeatTimer = setInterval(() => {
                        if (!state.running || state.speaking || state.checkInProgress) return;
                        if (!state.autoMode) return; // heartbeat only in auto mode
                        const hasTranscript = state.rolling.trim().length > 0;
                        if (!hasTranscript) return;
                        if (Date.now() - state.lastSpokeAt > config.heartbeatMs) _maybeSpeak('heartbeat');
                    }, 4000);
                }
            },
            stop() {
                state.running = false;
                if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
                if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
                if (state.longStretchTimer) { clearTimeout(state.longStretchTimer); state.longStretchTimer = null; }
                if (state.directQTimer) { clearTimeout(state.directQTimer); state.directQTimer = null; }
            },
            setAuto(val) { state.autoMode = val; },
            getTranscript() { return (state.rolling + ' ' + state.interim).trim(); },
            clearTranscript() { state.rolling = ''; state.interim = ''; state.lastCheckText = ''; if (config.onTranscript) config.onTranscript('', ''); },
            isSpeaking() { return state.speaking; },
            isRunning() { return state.running; },
        };
        function _onTick() {
            if (state.silenceTimer) clearTimeout(state.silenceTimer);
            if (state.autoMode) {
                state.silenceTimer = setTimeout(() => _maybeSpeak('pause'), config.silenceMs || 1300);
                const cur = state.rolling.trim();
                const prevWords = state.lastCheckText ? state.lastCheckText.split(/\s+/).length : 0;
                const curWords = cur ? cur.split(/\s+/).length : 0;
                // Debounce long_stretch — wait for a brief pause instead of firing mid-word
                if (curWords - prevWords >= (config.wordThreshold || 22)) {
                    if (state.longStretchTimer) clearTimeout(state.longStretchTimer);
                    state.longStretchTimer = setTimeout(() => _maybeSpeak('long_stretch'), 600);
                }
                // Debounce direct_question — let user finish their sentence
                const tail = state.rolling.trim().slice(-220);
                if (/\?\s*$/.test(state.rolling.trim()) || /\b(can you|could you|what do you mean|i have a question|can i assume|is it okay|should i|am i allowed|is it correct|does that make sense|am i on the right track|am i missing|do i need to|help me|i'm stuck|not sure|confused)\b/i.test(tail)) {
                    if (state.directQTimer) clearTimeout(state.directQTimer);
                    state.directQTimer = setTimeout(() => _maybeSpeak('direct_question'), 800);
                }
            }
            // When auto is OFF: nothing triggers automatically. Only "manual" (Talk Now) works.
        }
        async function _maybeSpeak(reason) {
            if (state.checkInProgress || state.speaking || !state.running) return;
            // Only "manual" (Talk Now button) bypasses auto mode. Everything else requires auto ON.
            const isForced = reason === 'manual';
            if (!state.autoMode && !isForced) return;
            const current = state.rolling.trim();
            if (!current && reason !== 'heartbeat' && reason !== 'manual') return;
            if (current && current === state.lastCheckText && !isForced) return;
            // Post-speak cooldown: don't fire again within 3s of AI finishing TTS (unless forced)
            if (!isForced && Date.now() - state.lastSpokeAt < 3000) return;
            state.checkInProgress = true;
            // Lock lastCheckText NOW so concurrent ticks don't slip through while awaiting Gemini
            state.lastCheckText = current;
            if (config.onStateChange) config.onStateChange('thinking', reason);
            try {
                const prompt = config.buildPrompt(current || '(silence so far)', reason);
                const raw = await callGeminiResilient(prompt, config.geminiTemp || 0.7);
                const parsed = raw ? extractJsonLoose(raw) : null;
                // lastCheckText already set before the await — update to latest rolling after TTS if speaking
                let action = parsed?.action || 'silent';
                let msg = parsed?.message ? String(parsed.message).trim() : '';
                if (isForced && (!msg || action === 'silent')) {
                    action = 'interrupt';
                    msg = reason === 'direct_question'
                        ? "Good question — can you tell me a bit more about what you're trying to figure out there?"
                        : (reason === 'manual'
                            ? "Sure — walk me through where you are right now and what you're thinking next."
                            : "Take your time — talk me through what you're thinking right now, even if it's rough.");
                }
                if (config.onDecision) config.onDecision(action, reason, msg);
                if (action !== 'silent' && msg) {
                    state.speaking = true;
                    if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
                    if (config.onStateChange) config.onStateChange('speaking', reason);
                    SharedMic.release(state.micOwner);
                    await speakTextPromise(msg);
                    state.speaking = false;
                    state.lastCheckText = state.rolling.trim();
                    state.lastSpokeAt = Date.now();
                    if (state.running) {
                        if (config.onStateChange) config.onStateChange('listening', reason);
                        SharedMic.acquire(state.micOwner, { onResult: engine.feed });
                    }
                } else {
                    if (config.onStateChange) config.onStateChange('listening', reason);
                }
            } catch(e) {
                console.warn('[ListenEngine] error:', e);
                if (config.onStateChange) config.onStateChange('error', reason);
            } finally {
                state.checkInProgress = false;
            }
        }
        return engine;
    }

    function extractJsonLoose(text) {
        try {
            const cleaned = (text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch(e) { console.warn('[LC AI] JSON parse failed:', e.message); }
        return null;
    }

    // ==================== UI Helpers for Active Listen ====================
    function activeRenderTranscript(rolling, interim) {
        const full = (rolling + (interim ? ' ' + interim : '')).trim();
        let html;
        if (!full) {
            html = '<span style="color:#64748b">Start talking and your words will appear here. AI sees this same text.</span>';
        } else {
            const cut = Math.max(0, full.length - 60);
            html = '<span style="color:#94a3b8">' + escHtmlSafe(full.slice(0, cut)) + '</span>' +
                   '<span style="color:#22c55e;font-weight:600">' + escHtmlSafe(full.slice(cut)) + '</span>';
        }
        chatWindowChannel.postMessage({ source: 'main', type: 'active-transcript', html });
    }

    function activeSetState(label, color) {
        chatWindowChannel.postMessage({ source: 'main', type: 'active-panel-ui', show: true, state: label });
    }

    function activeSetLastDecision(action, reason) {
        // Broadcast to popup — decision display is in the popup window
        chatWindowChannel.postMessage({ source: 'main', type: 'active-last-decision', action, reason });
    }

    function activeClearTranscript() {
        if (activeEngine) activeEngine.clearTranscript();
        else activeRenderTranscript('', '');
    }

    function activeTalkNow() {
        if (!activeListening || !activeEngine) { addChatMessage('ai', 'Start Live Listen first (🎙 Live button).'); return; }
        // If no transcript yet, just nudge the user instead of calling Gemini with empty text
        const transcript = activeEngine.getTranscript();
        if (!transcript) {
            addChatMessage('ai', "I don't hear anything yet. Make sure your mic is working — try speaking and check if text appears in the transcript area above.");
            if (autoSpeak) speakText("I don't hear anything yet. Make sure your mic is working.");
            return;
        }
        activeEngine.forceSpeak();
    }

    function toggleActiveListen() {
        if (activeListening) {
            stopActiveListen();
            syncBroadcast({ type: 'live-listen-off' });
        } else {
            startActiveListen();
            syncBroadcast({ type: 'live-listen-on' });
        }
    }

    // Local-only versions (called by sync handler — no re-broadcast)
    function _startActiveListenLocal() { startActiveListen(); }
    function _stopActiveListenLocal() { stopActiveListen(); }

    async function startActiveListen() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { addChatMessage('ai', 'Chrome required for Live Listen. SpeechRecognition API not found.'); if (!chatOpen) toggleChat(); return; }
        const problem = getProblemInfo();
        const code = getEditorCode() || '';
        if (!problem.title && !IS_NEETCODE) { addChatMessage('ai', 'Open a LeetCode problem (or NeetCode solution page) first.'); if (!chatOpen) toggleChat(); return; }
        if (isListening) { try { stopListening(); } catch(e) {} }

        // Pre-check mic permission with getUserMedia before starting SpeechRecognition
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Got permission — stop the stream immediately (SpeechRecognition will manage its own)
            stream.getTracks().forEach(t => t.stop());
            console.log('[LC AI] Mic permission granted');
        } catch(micErr) {
            console.error('[LC AI] Mic permission check failed:', micErr);
            if (!chatOpen) toggleChat();
            addChatMessage('ai', '⚠️ Microphone access denied or unavailable. Click the 🔒 icon in your address bar → Site settings → Allow microphone, then reload the page and try again.');
            return;
        }

        activeListening = true;
        const btn = document.getElementById('lc-live-listen-btn');
        if (btn) {
            btn.innerHTML = '🔴 Stop';
            btn.style.color = '#ef4444';
            btn.style.borderColor = '#ef4444';
            btn.style.background = 'rgba(239,68,68,.12)';
        }
        if (!chatOpen) toggleChat();
        chatWindowChannel.postMessage({ source: 'main', type: 'active-panel-ui', show: true });
        activeRenderTranscript('', '');
        activeSetState('requesting mic…', '#f59e0b');

        const greeting = IS_NEETCODE
            ? "Active listen is on. I can see the NeetCode solution page you're on and I know all the approaches. Walk me through each one — start with the brute force: what's the idea, why does it work, and what's the complexity. Then move to the optimized solution. I'll ask questions the whole way, just like a real interview."
            : "Active listen is on. Go ahead — restate the problem in your own words, walk me through your approach, and narrate your code as you write it. I'll jump in when I have a question or when you seem stuck.";
        addChatMessage('ai', greeting);
        await speakTextPromise(greeting);
        if (!activeListening) return;

        activeEngine = createListenEngine({
            silenceMs: 1300,
            wordThreshold: 22,
            heartbeatMs: 12000,
            geminiTemp: 0.7,
            micOwner: 'active-listen',
            autoMode: true,
            buildPrompt(transcript, reason) {
                const baseCtx = getPersona() + buildContext();
                const stream = "CANDIDATE'S LIVE THOUGHT STREAM (in-progress, may have STT errors — be charitable):\n\"" + transcript.slice(-1500) + "\"\n\n";
                const trigger = "TRIGGER REASON: " + reason + "  (pause=went quiet; heartbeat=silent ~12s; long_stretch=talking a while; direct_question=asked you something; manual=Talk Now clicked)\n\n";
                const jsonOut = "OUTPUT JSON ONLY (no markdown, no prose):\n{\"action\":\"silent|interrupt|answer\",\"reason\":\"short phrase\",\"message\":\"plain text 1-2 sentences to say out loud (empty if silent)\"}";

                if (IS_NEETCODE) {
                    return baseCtx + stream + trigger +
                        "DECISION RULES (NeetCode explanation mode):\n" +
                        "- 'direct_question', 'heartbeat', 'manual' → ALWAYS respond. Never silent.\n" +
                        "- 'long_stretch' → probe the specific claim they just made (complexity? why does this data structure work? trace through an example?).\n" +
                        "- 'pause' → ask them to continue ('what's the complexity there?' / 'why does that approach fail?'). Silent only if mid-sentence.\n" +
                        "- If they finish explaining one approach → ask them to move to the next OR probe deeper before moving on.\n" +
                        "- If they say 'I don't know' / 'I'm not sure' → give a Socratic nudge, never the answer.\n" +
                        "- 1-2 sentences max. One focused question per response. Plain text.\n\n" +
                        jsonOut;
                }

                return baseCtx + stream + trigger +
                    "DECISION RULES:\n" +
                    "- 'direct_question', 'heartbeat', 'manual' → you MUST respond. Never silent.\n" +
                    "- 'long_stretch' → lean toward interrupt: acknowledge where they are, probe next step.\n" +
                    "- 'pause' → interrupt if mid-approach (ask 'what's your next step?' or 'what's the complexity?'). Silent if mid-thought.\n" +
                    "- ALWAYS respond when they ask a direct question, say 'I'm stuck/confused', or reach a handoff point (e.g. finished brute force).\n" +
                    "- 1-2 sentences max. No code. No full solutions. Plain text.\n\n" +
                    jsonOut;
            },
            onDecision(action, reason, msg) {
                activeSetLastDecision(action, reason);
                if (action !== 'silent' && msg) addChatMessage('ai', msg);
            },
            onStateChange(state, reason) {
                const map = { listening: '#22c55e', thinking: '#f59e0b', speaking: '#60a5fa', error: '#ef4444' };
                const label = state === 'thinking' ? 'thinking (' + reason + ')…' : state === 'speaking' ? 'speaking…' : state;
                activeSetState(label, map[state] || '#94a3b8');
            },
            onTranscript(rolling, interim) {
                activeRenderTranscript(rolling, interim);
                const full = (rolling + ' ' + interim).trim();
                const statusText = full ? '🟢 ' + full.slice(-140) : '🟢 Mic active — waiting for speech...';
                chatWindowChannel.postMessage({ source: 'main', type: 'mic-status', text: statusText });
            },
        });

        SharedMic.acquire('active-listen', { onResult: activeEngine.feed });
        activeEngine.start();
        activeSetState('listening', '#22c55e');
    }

    function stopActiveListen() {
        activeListening = false;
        // Capture full transcript BEFORE stopping engine
        const finalTranscriptCapture = activeEngine ? activeEngine.getTranscript() : '';
        if (finalTranscriptCapture) {
            syncBroadcast({ type: 'live-listen-transcript', transcript: finalTranscriptCapture });
        }
        if (activeEngine) { activeEngine.stop(); activeEngine = null; }
        SharedMic.release('active-listen');
        const btn = document.getElementById('lc-live-listen-btn');
        if (btn) {
            btn.innerHTML = '🎙 Live';
            btn.style.color = '#22c55e';
            btn.style.borderColor = '#22c55e';
            btn.style.background = 'transparent';
        }
        chatWindowChannel.postMessage({ source: 'main', type: 'active-panel-ui', show: false });
    }

    // ==================== INIT ====================
    function init() {
        if (IS_NEETCODE) {
            // NeetCode: no Monaco editor — initialize immediately
            console.log('[LC AI] NeetCode solutions page detected — starting AI explanation interviewer');
            createUI();
            sendCode(true); // send page info snapshot to webhook
            if (window.speechSynthesis) {
                window.speechSynthesis.getVoices();
                window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
            }
            return;
        }

        const waitForEditor = setInterval(() => {
            const code = getEditorCode();
            if (code !== null) {
                clearInterval(waitForEditor);
                console.log('[LC AI] Editor detected, starting live capture + AI');
                createUI();
                sendCode(true);
                autoInterval = setInterval(() => sendCode(), SEND_INTERVAL);

                // Monaco content change listener
                try {
                    const models = window.monaco?.editor?.getModels();
                    if (models && models[0]) {
                        models[0].onDidChangeContent(() => {
                            clearTimeout(debounceTimer);
                            debounceTimer = setTimeout(() => sendCode(), DEBOUNCE_MS);
                        });
                    }
                } catch(e) {}

                // Preload voices for TTS
                if (window.speechSynthesis) {
                    window.speechSynthesis.getVoices();
                    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
                }
            }
        }, 1000);

        setTimeout(() => clearInterval(waitForEditor), 30000);
    }

    // Expose chatHistory for clear button
    window._lcChatHistory = chatHistory;

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
