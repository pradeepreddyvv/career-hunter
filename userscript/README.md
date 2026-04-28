# LeetCode Companion Userscript

Browser userscript that captures your live code from LeetCode/NeetCode and connects to Career Hunter for AI-powered coding interview practice.

## Features

- Real-time code capture from LeetCode and NeetCode editors
- AI interviewer (3 modes: Interviewer, Teacher, NeetCode-style)
- Voice interaction with speech-to-text and text-to-speech
- Code snapshots sent to Career Hunter's `/leetcode` page
- Cross-tab sync between LeetCode and Career Hunter

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
2. Click **Create a new script** in Tampermonkey dashboard
3. Paste the contents of `leetcode-companion.user.js`
4. Save (Ctrl+S)

## Configure

Click the Tampermonkey icon > **Configure Career Hunter** to set:

| Setting | Description | Default |
|---------|-------------|---------|
| **Career Hunter API URL** | Your Career Hunter instance | `http://localhost:3000/api/leetcode` |
| **Gemini API Key** | For AI interviewer ([get free key](https://aistudio.google.com/apikey)) | (none) |
| **Speechmatics TTS Key** | For voice output (optional) | (none) |

## Usage

1. Start Career Hunter (`npm run dev`)
2. Open any LeetCode problem (e.g., `leetcode.com/problems/two-sum`)
3. The userscript auto-captures your code as you type
4. Code snapshots appear on Career Hunter's `/leetcode` page
5. Use the AI chat panel on the LeetCode page for real-time help

## AI Modes

- **Interviewer**: Asks probing questions about your approach, time/space complexity, edge cases
- **Teacher**: Explains concepts, gives hints, guides you step-by-step
- **NeetCode**: Walks through the solution like a NeetCode video explanation
