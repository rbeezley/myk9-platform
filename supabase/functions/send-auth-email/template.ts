export type AuthEmailActionType = 'signup' | 'recovery' | 'magiclink';

const BRAND_COLOR = '#a8472d';
const LOGO_URL = 'https://myk9show.com/pwa-192x192.png';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAuthEmailHtml(
  type: AuthEmailActionType,
  firstName: string,
  actionUrl: string
): { subject: string; html: string } {
  const safeFirstName = escapeHtml(firstName);
  const safeActionUrl = escapeHtml(actionUrl);

  const layout = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background-color: ${BRAND_COLOR}; padding: 16px 24px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right: 12px;">
            <img src="${LOGO_URL}" alt="" width="44" height="44" style="display: block; width: 44px; height: 44px; border: 0; border-radius: 10px;">
          </td>
          <td>
            <p style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">myK9Show</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="padding: 32px 24px;">
      <h1 style="font-size: 24px; margin: 0 0 16px; color: #1a1a1e;">${title}</h1>
      ${body}
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const button = (text: string) =>
    `<div style="text-align: center; margin: 32px 0;">
      <a href="${safeActionUrl}" style="background-color: ${BRAND_COLOR}; color: #fff; padding: 12px 32px; border-radius: 6px; font-weight: 600; text-decoration: none; display: inline-block;">${text}</a>
    </div>`;

  if (type === 'recovery') {
    return {
      subject: 'Reset your myK9Show password',
      html: layout(
        'Reset your password',
        `
        <p style="color: #1a1a1e; font-size: 16px;">Hi ${safeFirstName}, we received a request to reset your password. Click the button below to choose a new one.</p>
        ${button('Reset Password')}
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email. The link expires in 24 hours.</p>
      `
      ),
    };
  }

  const isSignup = type === 'signup';
  return {
    subject: isSignup ? 'Confirm your myK9Show email' : 'Sign in to myK9Show',
    html: layout(
      isSignup ? 'Confirm your email' : 'Sign in to myK9Show',
      `<p style="color: #1a1a1e; font-size: 16px;">Hi ${safeFirstName}, ${
        isSignup
          ? 'thanks for signing up for myK9Show. Please confirm your email address to get started.'
          : 'click the button below to sign in.'
      }</p>
      ${button(isSignup ? 'Confirm Email' : 'Sign In')}
      <p style="color: #6b7280; font-size: 14px;">${
        isSignup
          ? "If you didn't create an account, you can safely ignore this email."
          : "If you didn't request this, you can safely ignore this email."
      }</p>`
    ),
  };
}
