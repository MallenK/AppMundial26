import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  }),

  secret: process.env.BETTER_AUTH_SECRET,

  baseURL: process.env.BETTER_AUTH_URL ?? process.env.BACKEND_URL,

  trustedOrigins: [
    process.env.FRONTEND_URL ?? "http://localhost:5173",
  ],

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,   // 30 days
    updateAge: 60 * 60 * 24,          // refresh if accessed after 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-minute client cookie cache
    },
  },

  user: {
    additionalFields: {
      bio: { type: "string", required: false },
      total_points: { type: "number", required: false, defaultValue: 0 },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
