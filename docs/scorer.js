/**
 * Career Hunter — Client-Side Job Scorer
 *
 * Tier 1: Keyword match scoring (instant, no API key)
 * Tier 2: Gemini AI scoring (optional, user's own key)
 */

const CH_SCORER = (() => {
    const CACHE_PREFIX = 'ch_scores_';

    // ── Resume keyword extraction ────────────────────────────────────

    function extractSkills(resumeText) {
        if (!resumeText) return [];
        const text = resumeText.toLowerCase();
        const techTerms = [
            'python','java','javascript','typescript','react','node','node.js',
            'sql','aws','docker','kubernetes','go','rust','c++','c#','spring',
            'django','flask','fastapi','mongodb','postgresql','redis','kafka',
            'graphql','terraform','ci/cd','agile','ml','ai','llm','distributed',
            'microservices','rest','api','fullstack','frontend','backend','data',
            'devops','cloud','linux','git','testing','security','scala','ruby',
            'swift','kotlin','vue','angular','next.js','spring boot','hadoop',
            'spark','elasticsearch','rabbitmq','pytorch','tensorflow','numpy',
            'pandas','scikit-learn','opencv','nlp','deep learning',
            'machine learning','computer vision','rag','langchain',
            'azure','gcp','dynamodb','mysql','sqlite','cassandra',
            'nginx','grpc','websocket','oauth','jwt','s3','lambda',
            'ec2','celery','airflow','dbt','snowflake','bigquery',
            'figma','tailwind','css','html','sass','webpack','vite',
            'jest','pytest','selenium','cypress','playwright',
            'express','fastify','nest.js','remix','svelte','solidity',
            'objective-c','matlab','r','julia','perl','php','laravel',
            'rails','asp.net','.net','xamarin','flutter','react native',
            'swiftui','jetpack compose','android','ios'
        ];
        return techTerms.filter(t => text.includes(t));
    }

    // ── Tier 1: Keyword match scoring ────────────────────────────────

    const COMMON_SKILLS = new Set([
        'python','java','javascript','sql','git','linux','html','css',
        'react','node','node.js','aws','docker','api','rest','agile',
        'typescript','c++','c#','data','cloud','testing','frontend','backend'
    ]);

    function keywordScore(userSkills, jobKeywords, jobTitle) {
        if (!jobKeywords || jobKeywords.length === 0) return { score: 0, matched: [], missing: [] };
        if (!userSkills || userSkills.length === 0) return { score: 0, matched: [], missing: jobKeywords };

        const userSet = new Set(userSkills.map(s => s.toLowerCase()));
        const matched = jobKeywords.filter(k => userSet.has(k.toLowerCase()));
        const missing = jobKeywords.filter(k => !userSet.has(k.toLowerCase()));

        let weightedMatch = 0, weightedTotal = 0;
        for (const k of jobKeywords) {
            const w = COMMON_SKILLS.has(k.toLowerCase()) ? 0.6 : 1.0;
            weightedTotal += w;
            if (userSet.has(k.toLowerCase())) weightedMatch += w;
        }
        let score = Math.round((weightedMatch / weightedTotal) * 100);

        if (jobKeywords.length < 5) {
            score = Math.round(score * jobKeywords.length / 5);
        }

        score = Math.min(score, 78);
        return { score, matched, missing };
    }

    function scoreAllJobs(userSkills, jobs) {
        return jobs.map(job => {
            const keywords = job.keywords || [];
            const result = keywordScore(userSkills, keywords, job.title);
            return {
                job_id: job.id,
                job_key: job.job_key,
                score: result.score,
                matched: result.matched,
                missing: result.missing,
                method: 'keyword'
            };
        }).sort((a, b) => b.score - a.score);
    }

    // ── Tier 2: Gemini AI scoring ────────────────────────────────────

    async function aiScoreSingle(resumeText, jobDescription, jobTitle, company, geminiKey, userContext) {
        const contextBlock = userContext ? `\nCandidate Context:\n${userContext.substring(0, 500)}\n` : '';
        const prompt = `Score this resume against this job posting. Be strict and honest — only give high scores (80+) for genuinely strong matches where the candidate has most required skills and relevant experience. Return ONLY valid JSON.

Job: ${jobTitle} at ${company}
Job Description:
${jobDescription.substring(0, 3000)}

Resume:
${resumeText.substring(0, 4000)}
${contextBlock}
Scoring guide:
- 85-100: Near-perfect match. Has 90%+ of required skills AND directly relevant experience.
- 70-84: Strong match. Has most required skills AND some relevant experience.
- 50-69: Moderate match. Has some required skills but missing key requirements.
- 30-49: Weak match. Few skill overlaps or missing critical requirements.
- 0-29: Poor match. Wrong field or missing most requirements.

Return JSON: {"score": 0-100, "summary": "one line", "recommendation": "STRONG_APPLY|APPLY|MAYBE|SKIP", "matched_skills": [], "missing_skills": []}`;

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
                })
            }
        );

        if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
        const data = await resp.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in Gemini response');
        return JSON.parse(jsonMatch[0]);
    }

    async function aiScoreBatch(resumeText, jobs, geminiKey, fetchJobDetail, onProgress, userContext) {
        const results = [];
        const batchSize = 5;

        for (let i = 0; i < jobs.length; i += batchSize) {
            const batch = jobs.slice(i, i + batchSize);
            const promises = batch.map(async (job) => {
                try {
                    let description = job.description;
                    if (!description && fetchJobDetail) {
                        const detail = await fetchJobDetail(job.id);
                        description = detail?.description || '';
                    }
                    if (!description) return null;

                    const result = await aiScoreSingle(
                        resumeText, description, job.title, job.company, geminiKey, userContext
                    );
                    return {
                        job_id: job.id,
                        job_key: job.job_key,
                        score: result.score || 0,
                        score_summary: result.summary || '',
                        recommendation: result.recommendation || '',
                        matched: result.matched_skills || [],
                        missing: result.missing_skills || [],
                        method: 'ai'
                    };
                } catch (err) {
                    console.warn(`AI scoring failed for ${job.company} - ${job.title}:`, err.message);
                    return null;
                }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter(Boolean));

            if (onProgress) {
                onProgress(Math.min(i + batchSize, jobs.length), jobs.length);
            }

            if (i + batchSize < jobs.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }

    // ── Cache ────────────────────────────────────────────────────────

    function getResumeHash(resumeText) {
        let hash = 0;
        for (let i = 0; i < resumeText.length; i++) {
            const chr = resumeText.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    function getCachedScores(resumeHash) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + resumeHash);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function setCachedScores(resumeHash, scores) {
        try {
            localStorage.setItem(CACHE_PREFIX + resumeHash, JSON.stringify({
                timestamp: Date.now(),
                scores
            }));
        } catch (e) {
            console.warn('Failed to cache scores:', e.message);
        }
    }

    // ── Public API ───────────────────────────────────────────────────

    return {
        extractSkills,
        keywordScore,
        scoreAllJobs,
        aiScoreSingle,
        aiScoreBatch,
        getResumeHash,
        getCachedScores,
        setCachedScores
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CH_SCORER;
}
