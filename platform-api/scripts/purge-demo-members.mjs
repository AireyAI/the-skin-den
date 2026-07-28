#!/usr/bin/env node
/** Remove seeded demo members (@example.com) from the studio SQLite DB. Safe to run anytime. */
import { getDb } from "../src/db.mjs";
import { purgeDemoMemberships } from "../src/auth-routes.mjs";

const db = getDb();
const n = purgeDemoMemberships(db);
console.log(n ? `Purged ${n} demo row(s).` : "No demo members found.");
