/** Rejects when the message could not be handed over. */
export type SmsSender = (to: string, message: string) => Promise<void>;

/**
 * Send through Africa's Talking (https://developers.africastalking.com/docs/sms/sending/bulk).
 * `senderId` is the name messages come from, once Africa's Talking has approved one.
 */
export const africasTalkingSms =
  (username: string, apiKey: string, senderId: string | null): SmsSender =>
  async (to, message) => {
    const host =
      username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ username, to, message, ...(senderId && { from: senderId }) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Africa's Talking answered ${res.status}: ${await res.text()}`);
    // A 201 can still carry a per-number failure (bad number, no balance).
    const body = (await res.json().catch(() => null)) as {
      SMSMessageData?: { Recipients?: { status?: string }[] };
    } | null;
    const status = body?.SMSMessageData?.Recipients?.[0]?.status;
    if (status !== 'Success')
      throw new Error(`Africa's Talking did not send: ${status ?? 'no recipient'}`);
  };

/** Development without an SMS account: show what would have been sent. */
export const consoleSms: SmsSender = async (to, message) => {
  console.log(`\n── SMS (not sent: no SMS account is set up) ──\nTo: ${to}\n${message}\n`);
};
