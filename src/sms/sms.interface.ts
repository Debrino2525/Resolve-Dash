export const SMS_PROVIDER_TOKEN = Symbol('ISmsProvider');

export interface SendSmsOptions {
  /** Mark the message as an OTP (mNotify requires an approved OTP sender ID for these). */
  readonly otp?: boolean;
}

export interface ISmsProvider {
  /** Sends one SMS. `phoneE164` is e.g. +233241234567. Throws on any delivery failure. */
  send(phoneE164: string, message: string, options?: SendSmsOptions): Promise<void>;
}
