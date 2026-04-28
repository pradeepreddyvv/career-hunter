import { Resend } from "resend";

interface JobAlert {
  title: string;
  company: string;
  score?: number;
  url?: string;
  location?: string;
}

export async function sendJobAlert(jobs: JobAlert[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFICATION_EMAIL;

  if (!apiKey || !toEmail) return false;
  if (jobs.length === 0) return false;

  const resend = new Resend(apiKey);

  const jobRows = jobs
    .map(
      (j) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #333">${j.title}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333">${j.company}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333;text-align:center">${j.score ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333">${j.location || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333">
            ${j.url ? `<a href="${j.url}" style="color:#3b82f6">View</a>` : "—"}
          </td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e7eb;padding:32px;max-width:700px;margin:0 auto">
      <h1 style="color:#3b82f6;font-size:24px;margin-bottom:4px">Career Hunter — New Jobs</h1>
      <p style="color:#9ca3af;margin-bottom:24px">${jobs.length} new job${jobs.length > 1 ? "s" : ""} found</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="color:#9ca3af;text-align:left">
            <th style="padding:8px 12px;border-bottom:2px solid #333">Title</th>
            <th style="padding:8px 12px;border-bottom:2px solid #333">Company</th>
            <th style="padding:8px 12px;border-bottom:2px solid #333;text-align:center">Score</th>
            <th style="padding:8px 12px;border-bottom:2px solid #333">Location</th>
            <th style="padding:8px 12px;border-bottom:2px solid #333">Link</th>
          </tr>
        </thead>
        <tbody>${jobRows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent by Career Hunter</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "Career Hunter <onboarding@resend.dev>",
      to: [toEmail],
      subject: `${jobs.length} new job${jobs.length > 1 ? "s" : ""} — Career Hunter`,
      html,
    });
    return true;
  } catch (error) {
    console.error("[email] Failed to send:", error);
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL);
}
