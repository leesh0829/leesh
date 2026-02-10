type SendMailArgs = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail({ to, subject, text }: SendMailArgs) {
  // SMTP 설정이 없으면 개발 편의상 콘솔로만 출력
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;

  if (!host || !user || !pass || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP env is missing in production");
    }
    console.log("[EMAIL:FALLBACK]");
    console.log("to:", to);
    console.log("subject:", subject);
    console.log(text);
    return;
  }

  // nodemailer는 의존성 추가 필요 (아래 참고)
  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
  });
}
