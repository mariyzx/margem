import { Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailerService } from "./mailer.service";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: "msg-1" }));
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMailMock: sendMail, createTransportMock: createTransport };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

describe("MailerService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgresql://margem:margem@localhost:5432/margem",
      REDIS_URL: "redis://localhost:6379",
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      MAIL_FROM: "Margem <no-reply@margem.local>",
    };
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("creates transport without auth when SMTP_USER and SMTP_PASSWORD are not set", async () => {
    const service = new MailerService();
    await service.sendMagicLink(
      "user@margem.local",
      "http://localhost:3000/entrar/verificar?token=abc",
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "localhost",
      port: 1025,
      secure: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it("creates transport with auth when SMTP_USER and SMTP_PASSWORD are set", async () => {
    process.env.SMTP_HOST = "smtp.resend.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "resend";
    process.env.SMTP_PASSWORD = "dummy-test-password";

    const service = new MailerService();
    await service.sendMagicLink(
      "user@margem.local",
      "https://margem.app/entrar/verificar?token=abc",
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: {
        user: "resend",
        pass: "dummy-test-password",
      },
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it("logs safe SMTP diagnostics without leaking password or email on failure", async () => {
    process.env.SMTP_HOST = "smtp.resend.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "resend";
    process.env.SMTP_PASSWORD = "super-secret-password";

    const errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const smtpError = Object.assign(
      new Error("Invalid login: 535 Authentication credentials invalid"),
      {
        code: "EAUTH",
        responseCode: 535,
        command: "AUTH PLAIN",
      },
    );
    sendMailMock.mockRejectedValueOnce(smtpError);

    const service = new MailerService();
    await expect(
      service.sendMagicLink("victim@margem.local", "https://margem.app/entrar/verificar?token=tok"),
    ).rejects.toThrow("535");

    expect(errorSpy).toHaveBeenCalledWith(
      {
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        hasAuth: true,
        code: "EAUTH",
        responseCode: 535,
        command: "AUTH PLAIN",
        err: "Invalid login: 535 Authentication credentials invalid",
      },
      "auth.magic_link_failed",
    );
    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain("super-secret-password");
    expect(serialized).not.toContain("victim@margem.local");
  });
});
