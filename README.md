This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Security Checklist (Production)

Use HTTPS-only domain deployment and verify these before release:

1. Required environment variables
   - `APP_URL=https://your-domain`
   - `NEXTAUTH_URL=https://your-domain`
   - `NEXTAUTH_SECRET` (strong random secret)
   - `DATABASE_URL` (TLS-enabled)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
2. Cookie and auth safety
   - Production cookies must be `Secure` + `HttpOnly`
   - Do not expose admin routes to non-admin users
3. API abuse protection
   - Rate limiting is applied to signup, resend verification, email/name checks, and uploads
   - Monitor `429` logs and tune limits as needed
4. Upload hardening
   - Upload API requires login
   - Only verified image formats are accepted (`jpg/png/webp/gif`, max 5MB)
5. Security headers
   - Middleware sets `HSTS`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, etc.
6. Database timezone
   - DB session timezone is set to `Asia/Seoul`
7. Secrets hygiene
   - Never commit `.env` to git
   - Rotate secrets immediately if leaked
