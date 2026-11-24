import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { loadEnv } from "../config/env";
import { renderMagicLinkEmail } from "./magic-link.template";

interface SmtpErrorDetails {
  code?: string;
  responseCode?: number;
  command?: string;
}

const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
} as const;

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly meta: { host: string; port: number; secure: boolean; hasAuth: boolean };

  constructor() {
    const env = loadEnv();
    const secure = env.SMTP_PORT === 465;
    const hasAuth = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);

    this.from = env.MAIL_FROM;
    this.meta = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      hasAuth,
    };

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      ...SMTP_TIMEOUTS,
      ...(env.SMTP_USER && env.SMTP_PASSWORD
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
        : {}),
    });
  }

  async sendMagicLink(email: string, magicUrl: string): Promise<void> {
    try {
      const info = (await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: "Seu link de entrada no Margem",
        text: `Entre no Margem usando este link (válido por 15 minutos, uso único):\n\n${magicUrl}\n`,
        html: renderMagicLinkEmail(magicUrl),
      })) as { messageId?: string } | undefined;

      this.logger.log({ ...this.meta, messageId: info?.messageId }, "auth.magic_link_sent");
    } catch (error) {
      const smtpError = error as SmtpErrorDetails;
      this.logger.error(
        {
          ...this.meta,
          code: smtpError?.code,
          responseCode: smtpError?.responseCode,
          command: smtpError?.command,
          err: error instanceof Error ? error.message : "unknown",
        },
        "auth.magic_link_failed",
      );
      throw error;
    }
  }
}
