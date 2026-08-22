export interface SmsSendInput {
  to: string;
  body: string;
}

export interface SmsSendResult {
  messageId: string;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
}
