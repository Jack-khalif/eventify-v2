export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Images shown inside the message; the HTML refers to them as `cid:{contentId}`. */
  inlineImages?: { contentId: string; filename: string; content: Buffer }[];
  /** Sending twice with the same key delivers once, so a retry can't double up. */
  idempotencyKey?: string;
};

/** Rejects when the message could not be handed over. */
export type Mailer = (email: Email) => Promise<void>;

/** Send through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export const resendMailer =
  (apiKey: string, from: string): Mailer =>
  async (email) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(email.idempotencyKey && { 'Idempotency-Key': email.idempotencyKey }),
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.inlineImages?.map((image) => ({
          filename: image.filename,
          content: image.content.toString('base64'),
          content_id: image.contentId,
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
  };

/** Development without a Resend key: show what would have been sent. */
export const consoleMailer: Mailer = async (email) => {
  console.log(
    `\n── Email (not sent: RESEND_API_KEY is not set) ──\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`,
  );
};
