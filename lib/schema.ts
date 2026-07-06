import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// No accounts, no login: a player is an anonymous httpOnly cookie (lago_pid).
// Users only ever contribute a display name on the receipt screen.
export const runs = pgTable(
  "runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    playerId: text("player_id").notNull(),
    displayName: text("display_name").notNull().default(""),
    haulKg: doublePrecision("haul_kg").notNull(),
    euros: doublePrecision("euros").notNull(),
    islandIdx: integer("island_idx").notNull(),
    durationS: integer("duration_s").notNull(),
    daily: boolean("daily").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("runs_player_id_idx").on(table.playerId),
    index("runs_euros_idx").on(table.euros),
    index("runs_created_at_idx").on(table.createdAt),
  ]
);
