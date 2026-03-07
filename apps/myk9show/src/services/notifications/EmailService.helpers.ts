import type { EmailTemplate, EntryTemplateVariables } from './EmailService.types';

/**
 * Replace template variables with actual values
 */
export function replaceVariables(content: string, variables: EntryTemplateVariables): string {
  let result = content;

  // Replace simple variables
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value || ''));
  }

  // Handle each loops (basic implementation)
  if (variables.entries && Array.isArray(variables.entries)) {
    const eachRegex = /{{#each entries}}(.*?){{\/each}}/gs;
    result = result.replace(eachRegex, (_match, content) => {
      return variables
        .entries!.map((entry: Record<string, string | number>) => {
          let entryContent = content;
          for (const [key, value] of Object.entries(entry)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            entryContent = entryContent.replace(regex, String(value || ''));
          }
          return entryContent;
        })
        .join('');
    });
  }

  if (variables.results && Array.isArray(variables.results)) {
    const eachRegex = /{{#each results}}(.*?){{\/each}}/gs;
    result = result.replace(eachRegex, (_match, content) => {
      return variables
        .results!.map((result: Record<string, string | number>) => {
          let resultContent = content;
          for (const [key, value] of Object.entries(result)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            resultContent = resultContent.replace(regex, String(value || ''));
          }
          return resultContent;
        })
        .join('');
    });
  }

  // Handle conditional blocks (basic implementation)
  const ifRegex = /{{#if (\w+)}}(.*?){{\/if}}/gs;
  result = result.replace(ifRegex, (_match, condition, content) => {
    return variables[condition] ? content : '';
  });

  return result;
}

/**
 * Convert HTML content to plain text
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Initialize default email templates and return a Map keyed by template id.
 */
export function createDefaultTemplates(): Map<string, EmailTemplate> {
  const templates = new Map<string, EmailTemplate>();

  // Entry Confirmation Template
  templates.set('entry_confirmation', {
    id: 'entry_confirmation',
    name: 'Entry Confirmation',
    subject: 'Entry Confirmation - {{showName}}',
    variables: [
      'ownerName',
      'dogName',
      'showName',
      'showDate',
      'className',
      'entryNumber',
      'confirmationCode',
      'venue',
      'entryFee',
    ],
    htmlContent:
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Entry Confirmation</h2>

          <p>Dear {{ownerName}},</p>

          <p>Your entry has been successfully confirmed for the following show:</p>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Show Details</h3>
            <p><strong>Show Name:</strong> {{showName}}</p>
            <p><strong>Date:</strong> {{showDate}}</p>
            <p><strong>Venue:</strong> {{venue}}</p>
          </div>

          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Entry Information</h3>
            <p><strong>Dog Name:</strong> {{dogName}}</p>
            <p><strong>Class:</strong> {{className}}</p>
            <p><strong>Entry Number:</strong> {{entryNumber}}</p>
            <p><strong>Confirmation Code:</strong> <code style="background-color: #dbeafe; padding: 2px 6px; border-radius: 4px;">{{confirmationCode}}</code></p>
            <p><strong>Entry Fee:</strong> $` +
      '{{entryFee}}' +
      `</p>
          </div>

          <p><strong>Important:</strong> Please bring this confirmation and your dog's registration papers to the show.</p>

          <p>Thank you for entering our show!</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This email was sent by myK9Show. Please do not reply to this email.</p>
        </div>
      `,
    textContent:
      `
Entry Confirmation

Dear {{ownerName}},

Your entry has been successfully confirmed for the following show:

Show Details:
- Show Name: {{showName}}
- Date: {{showDate}}
- Venue: {{venue}}

Entry Information:
- Dog Name: {{dogName}}
- Class: {{className}}
- Entry Number: {{entryNumber}}
- Confirmation Code: {{confirmationCode}}
- Entry Fee: $` +
      '{{entryFee}}' +
      `

Important: Please bring this confirmation and your dog's registration papers to the show.

Thank you for entering our show!

---
This email was sent by myK9Show. Please do not reply to this email.
      `,
  });

  // Show Reminder Template
  templates.set('show_reminder', {
    id: 'show_reminder',
    name: 'Show Reminder',
    subject: 'Show Reminder - {{showName}} Tomorrow',
    variables: [
      'ownerName',
      'showName',
      'showDate',
      'venue',
      'address',
      'checkInTime',
      'judgingTime',
      'entries',
    ],
    htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Show Reminder</h2>

          <p>Dear {{ownerName}},</p>

          <p>This is a friendly reminder that you have entries in tomorrow's dog show:</p>

          <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="margin-top: 0; color: #991b1b;">{{showName}}</h3>
            <p><strong>Date:</strong> {{showDate}}</p>
            <p><strong>Venue:</strong> {{venue}}</p>
            <p><strong>Address:</strong> {{address}}</p>
            <p><strong>Check-in Time:</strong> {{checkInTime}}</p>
            {{#if judgingTime}}<p><strong>Judging Starts:</strong> {{judgingTime}}</p>{{/if}}
          </div>

          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Your Entries</h3>
            {{#each entries}}
            <div style="margin-bottom: 10px;">
              <p><strong>{{dogName}}</strong> in {{className}}{{#if ringNumber}} (Ring {{ringNumber}}){{/if}}</p>
            </div>
            {{/each}}
          </div>

          <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #92400e;">Checklist:</h4>
            <ul style="color: #92400e;">
              <li>Registration papers</li>
              <li>Vaccination records (if required)</li>
              <li>Grooming supplies</li>
              <li>Food and water for your dog</li>
              <li>This confirmation email</li>
            </ul>
          </div>

          <p>Good luck at the show!</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This email was sent by myK9Show. Please do not reply to this email.</p>
        </div>
      `,
    textContent: `
Show Reminder

Dear {{ownerName}},

This is a friendly reminder that you have entries in tomorrow's dog show:

{{showName}}
Date: {{showDate}}
Venue: {{venue}}
Address: {{address}}
Check-in Time: {{checkInTime}}
{{#if judgingTime}}Judging Starts: {{judgingTime}}{{/if}}

Your Entries:
{{#each entries}}
- {{dogName}} in {{className}}{{#if ringNumber}} (Ring {{ringNumber}}){{/if}}
{{/each}}

Checklist:
- Registration papers
- Vaccination records (if required)
- Grooming supplies
- Food and water for your dog
- This confirmation email

Good luck at the show!

---
This email was sent by myK9Show. Please do not reply to this email.
      `,
  });

  // Results Template
  templates.set('results_notification', {
    id: 'results_notification',
    name: 'Results Notification',
    subject: 'Show Results - {{showName}}',
    variables: ['ownerName', 'showName', 'showDate', 'results'],
    htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669;">Show Results</h2>

          <p>Dear {{ownerName}},</p>

          <p>The results from {{showName}} are now available:</p>

          <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #047857;">{{showName}} - {{showDate}}</h3>

            {{#each results}}
            <div style="background-color: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #10b981;">
              <h4 style="margin-top: 0; color: #065f46;">{{dogName}} - {{className}}</h4>
              {{#if placement}}
                <p><strong>Placement:</strong> {{placement}}{{#if points}} ({{points}} points){{/if}}</p>
              {{else}}
                <p>No placement awarded</p>
              {{/if}}
              {{#if award}}
                <p style="color: #059669;"><strong>Special Award:</strong> {{award}}</p>
              {{/if}}
            </div>
            {{/each}}
          </div>

          <p>Congratulations on participating in the show!</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">This email was sent by myK9Show. Please do not reply to this email.</p>
        </div>
      `,
    textContent: `
Show Results

Dear {{ownerName}},

The results from {{showName}} are now available:

{{showName}} - {{showDate}}

{{#each results}}
{{dogName}} - {{className}}
{{#if placement}}
Placement: {{placement}}{{#if points}} ({{points}} points){{/if}}
{{else}}
No placement awarded
{{/if}}
{{#if award}}
Special Award: {{award}}
{{/if}}

{{/each}}

Congratulations on participating in the show!

---
This email was sent by myK9Show. Please do not reply to this email.
      `,
  });

  return templates;
}
