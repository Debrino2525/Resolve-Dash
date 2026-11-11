import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ISmsProvider } from '../sms/sms.interface';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  PhoneVerificationService,
  PROOF_TTL_MS,
} from './phone-verification.service';

describe('PhoneVerificationService', () => {
  const USER = '11111111-1111-1111-1111-111111111111';
  const OTHER = '22222222-2222-2222-2222-222222222222';
  const PHONE = '+233241234567';
  const T0 = 1_800_000_000_000;

  let sms: jest.Mocked<ISmsProvider>;
  let service: PhoneVerificationService;

  /** The 6-digit code is only ever in the SMS text: read it back from the mock. */
  const sentCode = (): string => {
    const msg = sms.send.mock.calls.at(-1)?.[1] ?? '';
    return /(\d{6})/.exec(msg)?.[1] ?? '';
  };
  const wrong = (code: string): string => (code === '000000' ? '111111' : '000000');

  beforeEach(() => {
    process.env.PHONE_VERIFICATION_SECRET = 'test-secret';
    sms = { send: jest.fn().mockResolvedValue(undefined) };
    service = new PhoneVerificationService(sms);
  });

  afterAll(() => {
    delete process.env.PHONE_VERIFICATION_SECRET;
  });

  describe('sendCode', () => {
    it('texts a 6-digit OTP via the provider and returns a verification id', async () => {
      const res = await service.sendCode(USER, PHONE, T0);

      expect(sms.send).toHaveBeenCalledWith(PHONE, expect.stringMatching(/\b\d{6}\b/), {
        otp: true,
      });
      expect(res.verificationId).toMatch(/^[a-f0-9]{32}$/);
      expect(res.phoneNumber).toBe(PHONE);
      expect(new Date(res.expiresAt).getTime()).toBe(T0 + OTP_TTL_MS);
    });

    it.each(['0241234567', '+233141234567', '+2332412345', '+447700900123'])(
      'rejects %p as not a Ghana mobile in E.164',
      async (phone) => {
        await expect(service.sendCode(USER, phone, T0)).rejects.toThrow(BadRequestException);
        expect(sms.send).not.toHaveBeenCalled();
      },
    );

    it('refuses (without spending an SMS) a number owned by another account', async () => {
      const takenByOther = jest.fn().mockResolvedValue(true);
      await expect(service.sendCode(USER, PHONE, T0, takenByOther)).rejects.toThrow(
        ConflictException,
      );
      expect(takenByOther).toHaveBeenCalledWith(PHONE, USER);
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('sends when the ownership check passes', async () => {
      const takenByOther = jest.fn().mockResolvedValue(false);
      await expect(service.sendCode(USER, PHONE, T0, takenByOther)).resolves.toBeDefined();
    });

    it('enforces a resend cooldown per account', async () => {
      await service.sendCode(USER, PHONE, T0);
      const early = service.sendCode(USER, PHONE, T0 + OTP_RESEND_COOLDOWN_MS - 1000);
      await expect(early).rejects.toThrow(HttpException);
      await expect(early).rejects.toMatchObject({ status: 429 });
      await expect(
        service.sendCode(USER, PHONE, T0 + OTP_RESEND_COOLDOWN_MS),
      ).resolves.toBeDefined();
    });

    it('returns 503 and stores nothing when the SMS gateway fails', async () => {
      sms.send.mockRejectedValue(new Error('gateway down'));
      await expect(service.sendCode(USER, PHONE, T0)).rejects.toThrow(ServiceUnavailableException);
      // No cooldown was recorded, so the rider can retry immediately
      sms.send.mockResolvedValue(undefined);
      await expect(service.sendCode(USER, PHONE, T0 + 1000)).resolves.toBeDefined();
    });

    it('invalidates the previous code when a new one is sent', async () => {
      const first = await service.sendCode(USER, PHONE, T0);
      const firstCode = sentCode();
      await service.sendCode(USER, PHONE, T0 + OTP_RESEND_COOLDOWN_MS);
      expect(() =>
        service.verifyCode(USER, first.verificationId, firstCode, T0 + OTP_RESEND_COOLDOWN_MS),
      ).toThrow('expired');
    });
  });

  describe('verifyCode', () => {
    it('returns a proof that readProof accepts for the same user', async () => {
      const { verificationId } = await service.sendCode(USER, PHONE, T0);
      const res = service.verifyCode(USER, verificationId, sentCode(), T0 + 1000);

      expect(res.phoneNumber).toBe(PHONE);
      expect(service.readProof(USER, res.phoneVerificationToken, T0 + 2000)).toBe(PHONE);
    });

    it('is single-use', async () => {
      const { verificationId } = await service.sendCode(USER, PHONE, T0);
      const code = sentCode();
      service.verifyCode(USER, verificationId, code, T0 + 1000);
      expect(() => service.verifyCode(USER, verificationId, code, T0 + 2000)).toThrow('expired');
    });

    it('counts down wrong attempts and burns the code at the limit', async () => {
      const { verificationId } = await service.sendCode(USER, PHONE, T0);
      const code = sentCode();
      for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
        expect(() => service.verifyCode(USER, verificationId, wrong(code), T0)).toThrow(
          `${OTP_MAX_ATTEMPTS - i} attempt(s) left`,
        );
      }
      expect(() => service.verifyCode(USER, verificationId, wrong(code), T0)).toThrow(
        'Too many incorrect attempts',
      );
      // Even the right code no longer works
      expect(() => service.verifyCode(USER, verificationId, code, T0)).toThrow('expired');
    });

    it('rejects an expired code', async () => {
      const { verificationId } = await service.sendCode(USER, PHONE, T0);
      expect(() => service.verifyCode(USER, verificationId, sentCode(), T0 + OTP_TTL_MS)).toThrow(
        'expired',
      );
    });

    it("rejects another account using someone else's verification id", async () => {
      const { verificationId } = await service.sendCode(USER, PHONE, T0);
      expect(() => service.verifyCode(OTHER, verificationId, sentCode(), T0)).toThrow('expired');
    });
  });

  describe('readProof', () => {
    async function proof(): Promise<string> {
      const { verificationId } = await service.sendCode(USER, PHONE, T0);
      return service.verifyCode(USER, verificationId, sentCode(), T0).phoneVerificationToken;
    }

    it('rejects a proof issued to a different user', async () => {
      expect(service.readProof(OTHER, await proof(), T0)).toBeUndefined();
    });

    it('rejects an expired proof', async () => {
      expect(service.readProof(USER, await proof(), T0 + PROOF_TTL_MS)).toBeUndefined();
    });

    it('rejects a tampered proof (phone swapped)', async () => {
      const [, sig] = (await proof()).split('.');
      const forged = Buffer.from(
        JSON.stringify({ sub: USER, phone: '+233209999999', exp: T0 + PROOF_TTL_MS }),
      ).toString('base64url');
      expect(service.readProof(USER, `${forged}.${sig}`, T0)).toBeUndefined();
    });

    it('rejects a proof signed with a different secret', async () => {
      const token = await proof();
      process.env.PHONE_VERIFICATION_SECRET = 'another-secret';
      const otherInstance = new PhoneVerificationService(sms);
      expect(otherInstance.readProof(USER, token, T0)).toBeUndefined();
    });

    it.each([undefined, '', 'garbage', 'a.b.c'])('returns undefined for %p', (token) => {
      expect(service.readProof(USER, token, T0)).toBeUndefined();
    });
  });
});
