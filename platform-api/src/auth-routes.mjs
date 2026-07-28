import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProduction } from "./config.mjs";
import {
  hashPassword,
  verifyPassword,
  issueCoachToken,
  issueMemberToken,
  verifyJwt,
  parseBearer
} from "./auth-crypto.mjs";
import { getDb, linkMembershipToUser, membershipForUser, unclaimedMembershipForEmail } from "./db.mjs";
import { linkBookingsToAccount } from "./bookings-db.mjs";
import { listBookingsForMember } from "./bookings-db.mjs";
import { getOffering } from "./schedule.mjs";
import { verifyAppleIdentityToken } from "./apple.mjs";
import { verifyGoogleIdToken } from "./google.mjs";
import { hit, reset, clientKey } from "./rate-limit.mjs";

/** Apple's Hide My Email relay — never the address the studio took payment against. */
const APPLE_RELAY_DOMAIN = "@privaterelay.appleid.com";

function isRelayEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN);
}

/**
 * Membership state for a freshly signed-in user, and — when we could not prove they
 * own the address — a hint that a purchase is sitting there waiting to be claimed.
 */
function membershipStateFor(database, userId, email) {
  const membership = membershipForUser(database, userId);
  if (membership) return { membership, membershipPending: false };
  const waiting = unclaimedMembershipForEmail(database, email);
  return { membership: null, membershipPending: Boolean(waiting) };
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function ensureCoachAccount(database) {
  const email = config.coachEmail.toLowerCase();
  const hash = hashPassword(config.coachPassword);
  const existing = database.prepare("SELECT * FROM coaches WHERE lower(email) = lower(?)").get(email);
  if (existing) {
    database.prepare("UPDATE coaches SET password_hash = ? WHERE id = ?").run(hash, existing.id);
    return existing.id;
  }
  const all = database.prepare("SELECT * FROM coaches").all();
  if (all.length === 1 && all[0].email.toLowerCase() !== email) {
    database.prepare("UPDATE coaches SET email = ?, password_hash = ? WHERE id = ?").run(email, hash, all[0].id);
    return all[0].id;
  }
  const id = `coach_${randomUUID().slice(0, 8)}`;
  database
    .prepare("INSERT INTO coaches (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(id, email, hash, new Date().toISOString());
  return id;
}

export function purgeDemoMemberships(database) {
  const result = database
    .prepare(
      `DELETE FROM memberships WHERE lower(email) LIKE '%@example.com' OR lower(email) LIKE '%@example.net'`
    )
    .run();
  if (result.changes > 0) {
    console.log(`[platform-api] removed ${result.changes} demo membership row(s)`);
  }
  return result.changes;
}

export function seedMembersIfEmpty(database) {
  purgeDemoMemberships(database);
  if (isProduction()) return;
  if (process.env.KK_SEED_DEMO_MEMBERS !== "true") return;
  const count = database.prepare("SELECT COUNT(*) AS c FROM memberships").get().c;
  if (count > 0) return;
  const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const demoPath = join(apiRoot, "seed/members.demo.json");
  const payload = JSON.parse(readFileSync(demoPath, "utf8"));
  for (const m of payload.members) {
    database
      .prepare(
        `INSERT INTO memberships (
          member_id, user_id, name, email, phone, plan, plan_type, status,
          renewal_date, auto_renew, last_payment_status, last_payment_at,
          mrr_contribution, pack_credits, pack_expires_at, joined_at, last_class_at,
          notes, contacted_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        m.id,
        null,
        m.name,
        m.email,
        m.phone || null,
        m.plan,
        m.planType,
        m.status,
        m.renewalDate || null,
        m.autoRenew ? 1 : 0,
        m.lastPaymentStatus || "succeeded",
        m.lastPaymentAt || null,
        m.mrrContribution ?? 0,
        m.packCredits ?? null,
        m.packExpiresAt || null,
        m.joinedAt || null,
        m.lastClassAt || null,
        m.notes || "",
        null,
        new Date().toISOString()
      );
  }
}

export function authMiddleware(requiredRole) {
  return (req) => {
    const token = parseBearer(req);
    if (!token) return { error: "Unauthorized", status: 401 };
    const payload = verifyJwt(token, config.jwtSecret);
    if (!payload?.sub || !payload?.role) return { error: "Invalid session", status: 401 };
    if (requiredRole && payload.role !== requiredRole) return { error: "Forbidden", status: 403 };
    return { payload };
  };
}

export async function handleAuthRoutes(method, path, body, req) {
  // ensureCoachAccount() used to run here, on every authenticated request: a ~60ms
  // scrypt hash plus a write, before any routing. It belongs in bootstrap(), which
  // already calls it once at startup.
  const database = getDb();

  if (method === "POST" && path === "/v1/auth/coach/login") {
    const gate = hit(`coach-login:${clientKey(req)}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!gate.allowed) {
      return {
        status: 429,
        json: { error: "Too many sign-in attempts. Try again shortly.", retryAfterSec: gate.retryAfterSec }
      };
    }
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const coach = database.prepare("SELECT * FROM coaches WHERE lower(email) = lower(?)").get(email);
    if (!coach || !verifyPassword(password, coach.password_hash)) {
      return { status: 401, json: { error: "Invalid email or password" } };
    }
    reset(`coach-login:${clientKey(req)}`);
    const token = issueCoachToken(coach.id, config.jwtSecret);
    return {
      status: 200,
      json: { token, role: "coach", email: coach.email }
    };
  }

  if (method === "POST" && path === "/v1/auth/member/register") {
    const gate = hit(`member-register:${clientKey(req)}`, { limit: 10, windowMs: 60 * 60 * 1000 });
    if (!gate.allowed) {
      return {
        status: 429,
        json: { error: "Too many accounts created from here. Try again later.", retryAfterSec: gate.retryAfterSec }
      };
    }
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const name = (body.name || "").trim();
    if (!email || password.length < 8) {
      return { status: 400, json: { error: "Email and password (8+ chars) required" } };
    }
    const exists = database.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
    if (exists) return { status: 409, json: { error: "Account already exists" } };
    const id = `usr_${randomUUID().slice(0, 12)}`;
    database
      .prepare(
        "INSERT INTO users (id, email, password_hash, name, forge_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, email, hashPassword(password), name || null, body.forgeUserId || null, new Date().toISOString());
    // No link here. Typing an address is not owning it — see linkMembershipToUser.
    linkBookingsToAccount(database, { email, memberId: null });
    const state = membershipStateFor(database, id, email);
    const token = issueMemberToken(id, config.jwtSecret);
    return {
      status: 201,
      json: { token, userId: id, email, role: "member", membershipPending: state.membershipPending }
    };
  }

  if (method === "POST" && path === "/v1/auth/member/login") {
    const gate = hit(`member-login:${clientKey(req)}`, { limit: 20, windowMs: 15 * 60 * 1000 });
    if (!gate.allowed) {
      return {
        status: 429,
        json: { error: "Too many sign-in attempts. Try again shortly.", retryAfterSec: gate.retryAfterSec }
      };
    }
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const user = database.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
    if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
      return { status: 401, json: { error: "Invalid email or password" } };
    }
    reset(`member-login:${clientKey(req)}`);
    if (body.forgeUserId) {
      database.prepare("UPDATE users SET forge_user_id = ? WHERE id = ?").run(body.forgeUserId, user.id);
    }
    const state = membershipStateFor(database, user.id, user.email);
    const membership = membershipForUser(database, user.id);
    linkBookingsToAccount(database, { email: user.email, memberId: membership?.id || null });
    const token = issueMemberToken(user.id, config.jwtSecret);
    return {
      status: 200,
      json: {
        token,
        userId: user.id,
        email: user.email,
        role: "member",
        membershipPending: state.membershipPending
      }
    };
  }

  if (method === "POST" && path === "/v1/auth/apple") {
    const idToken = body.idToken || body.identityToken;
    if (!idToken) return { status: 400, json: { error: "idToken required" } };

    let apple;
    try {
      if (config.allowDevAuth && idToken === "dev-apple-mock") {
        apple = { sub: "apple_dev_mock", email: body.email || "dev.member@example.com", emailVerified: true };
      } else if (!config.appleClientId) {
        return {
          status: 503,
          json: {
            error: "Sign in with Apple is not configured yet. Set APPLE_CLIENT_ID on the server."
          }
        };
      } else {
        apple = await verifyAppleIdentityToken(idToken);
      }
    } catch (e) {
      return { status: 401, json: { error: e.message || "Apple sign-in failed" } };
    }

    // Adopting an existing account by email address is a takeover unless Apple
    // asserts the address is verified.
    let user = database.prepare("SELECT * FROM users WHERE apple_sub = ?").get(apple.sub);
    if (!user && apple.email && apple.emailVerified) {
      user = database.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(apple.email);
      if (user) {
        database.prepare("UPDATE users SET apple_sub = ? WHERE id = ?").run(apple.sub, user.id);
      }
    }
    if (!user) {
      const id = `usr_${randomUUID().slice(0, 12)}`;
      database
        .prepare(
          "INSERT INTO users (id, email, apple_sub, name, forge_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          apple.email,
          apple.sub,
          body.name || null,
          body.forgeUserId || null,
          new Date().toISOString()
        );
      user = database.prepare("SELECT * FROM users WHERE id = ?").get(id);
    }
    // Hide My Email gives us a relay address that will never match the address the
    // studio took payment against, so there is nothing to link and the member needs
    // the claim flow instead.
    const relay = isRelayEmail(apple.email);
    if (apple.email && apple.emailVerified && !relay) {
      linkMembershipToUser(database, user.id, apple.email, "apple_verified_email");
    }
    const state = membershipStateFor(database, user.id, relay ? null : apple.email);
    const token = issueMemberToken(user.id, config.jwtSecret);
    return {
      status: 200,
      json: {
        token,
        userId: user.id,
        email: user.email,
        role: "member",
        provider: "apple",
        privateRelayEmail: relay,
        membershipPending: state.membershipPending
      }
    };
  }

  if (method === "POST" && path === "/v1/auth/google") {
    const idToken = body.credential || body.idToken;
    if (!idToken) return { status: 400, json: { error: "credential required" } };

    let google;
    try {
      if (config.allowDevAuth && idToken === "dev-google-mock") {
        google = {
          sub: "google_dev_mock",
          email: body.email || "dev.member@example.com",
          emailVerified: true,
          name: body.name || "Dev Member"
        };
      } else if (!config.googleClientId) {
        return {
          status: 503,
          json: {
            error: "Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID on the server."
          }
        };
      } else {
        google = await verifyGoogleIdToken(idToken);
      }
    } catch (e) {
      return { status: 401, json: { error: e.message || "Google sign-in failed" } };
    }

    if (!google.email) {
      return {
        status: 400,
        json: { error: "Google did not share an email. Use email and password instead." }
      };
    }

    let user = database.prepare("SELECT * FROM users WHERE google_sub = ?").get(google.sub);
    if (!user && google.emailVerified) {
      user = database.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(google.email);
      if (user) {
        database.prepare("UPDATE users SET google_sub = ? WHERE id = ?").run(google.sub, user.id);
      }
    }
    if (!user) {
      const id = `usr_${randomUUID().slice(0, 12)}`;
      database
        .prepare(
          "INSERT INTO users (id, email, google_sub, name, forge_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          google.email.toLowerCase(),
          google.sub,
          body.name || google.name || null,
          body.forgeUserId || null,
          new Date().toISOString()
        );
      user = database.prepare("SELECT * FROM users WHERE id = ?").get(id);
    }
    if (google.emailVerified) {
      linkMembershipToUser(database, user.id, google.email, "google_verified_email");
    }
    const state = membershipStateFor(database, user.id, google.email);
    const token = issueMemberToken(user.id, config.jwtSecret);
    return {
      status: 200,
      json: {
        token,
        userId: user.id,
        email: user.email,
        role: "member",
        provider: "google",
        membershipPending: state.membershipPending
      }
    };
  }

  if (method === "POST" && path === "/v1/auth/member/sync") {
    const auth = authMiddleware("member")(req);
    if (auth.error) return { status: auth.status, json: { error: auth.error } };
    // The email branch that used to live here let any signed-in member rewrite their
    // own address to someone else's and inherit that person's membership. Changing
    // the address on an account now goes through the coach.
    if (body.forgeUserId) {
      database.prepare("UPDATE users SET forge_user_id = ? WHERE id = ?").run(body.forgeUserId, auth.payload.sub);
    }
    return { status: 200, json: { ok: true } };
  }

  // Proof of purchase: the Checkout Session id lands on the success URL, and only
  // someone who completed that checkout has it. Stripe is the source of truth for
  // which email paid, so this claims the membership without an email round-trip.
  if (method === "POST" && path === "/v1/auth/member/claim") {
    const auth = authMiddleware("member")(req);
    if (auth.error) return { status: auth.status, json: { error: auth.error } };
    const gate = hit(`member-claim:${clientKey(req)}`, { limit: 20, windowMs: 60 * 60 * 1000 });
    if (!gate.allowed) {
      return { status: 429, json: { error: "Too many claim attempts.", retryAfterSec: gate.retryAfterSec } };
    }
    const sessionId = (body.sessionId || body.session_id || "").trim();
    if (!sessionId) return { status: 400, json: { error: "sessionId required" } };

    const { getStripe } = await import("./stripe-client.mjs");
    const stripe = getStripe();
    if (!stripe) return { status: 503, json: { error: "Stripe is not configured on the server." } };

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return { status: 404, json: { error: "That checkout could not be found." } };
    }
    if (session.payment_status !== "paid") {
      return { status: 402, json: { error: "That checkout has not been paid." } };
    }
    const paidEmail = (session.customer_details?.email || session.customer_email || "")
      .trim()
      .toLowerCase();
    if (!paidEmail) return { status: 422, json: { error: "That checkout has no email on it." } };

    const result = linkMembershipToUser(database, auth.payload.sub, paidEmail, "stripe_checkout_session");
    const membership = membershipForUser(database, auth.payload.sub);
    if (!result.linked && !membership) {
      return {
        status: 409,
        json: { error: "That membership is already linked to another account. Ask the studio to move it." }
      };
    }
    return { status: 200, json: { ok: true, membership } };
  }

  if (method === "GET" && path === "/v1/auth/session") {
    const auth = authMiddleware()(req);
    if (auth.error) return { status: auth.status, json: { error: auth.error } };
    return { status: 200, json: { role: auth.payload.role, sub: auth.payload.sub } };
  }

  return null;
}

export function getMemberProfile(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const user = database.prepare("SELECT id, email, name, apple_sub, google_sub, forge_user_id FROM users WHERE id = ?").get(
    auth.payload.sub
  );
  if (!user) return { status: 404, json: { error: "User not found" } };
  const state = membershipStateFor(database, user.id, user.email);
  return {
    status: 200,
    json: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        hasApple: !!user.apple_sub,
        hasGoogle: !!user.google_sub,
        forgeUserId: user.forge_user_id
      },
      membership: state.membership,
      membershipPending: state.membershipPending
    }
  };
}

export function getMemberBookings(req) {
  const auth = authMiddleware("member")(req);
  if (auth.error) return { status: auth.status, json: { error: auth.error } };
  const database = getDb();
  const user = database
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .get(auth.payload.sub);
  if (!user) return { status: 404, json: { error: "User not found" } };
  const membership = membershipForUser(database, user.id);
  const today = new Date().toISOString().slice(0, 10);
  // Match on the linked membership only. Matching on the account's own email would
  // show one person's class history to anyone who signed up with their address.
  const rows = listBookingsForMember(database, {
    email: user.email,
    memberId: membership?.id || null
  });
  const bookings = rows.map((b) => {
    const offering = getOffering(b.offeringId);
    return {
      id: b.id,
      offeringId: b.offeringId,
      slotDate: b.slotDate,
      status: b.status,
      priceLabel: b.priceLabel,
      classTitle: offering?.title || "Kettlebell class",
      classTime: offering?.time || "",
      classDay: offering?.day || "",
      isUpcoming: b.slotDate >= today
    };
  });
  const upcoming = bookings.filter((b) => b.isUpcoming);
  const past = bookings.filter((b) => !b.isUpcoming).reverse();
  return { status: 200, json: { upcoming, past, bookings } };
}

