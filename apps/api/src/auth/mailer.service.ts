import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { loadEnv } from "../config/env";

@Injectable()
export class MailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const env = loadEnv();
    this.from = env.MAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
    });
  }

  async sendMagicLink(email: string, magicUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: "Seu link de entrada no Margem",
      text: `Entre no Margem usando este link (válido por 15 minutos, uso único):\n\n${magicUrl}\n`,
    });
  }
}
