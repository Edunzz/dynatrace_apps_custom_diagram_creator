import { describe, expect, it } from "vitest";
import { resolveTimeExpression, resolveTimeframe } from "./time";

const now = new Date(2026, 9, 4, 10, 37, 45, 500); // 2026-10-04 10:37:45.500 local time (Sunday)

describe("resolveTimeExpression", () => {
  it("now() and offsets", () => {
    expect(resolveTimeExpression("now()", now)?.getTime()).toBe(now.getTime());
    expect(resolveTimeExpression("now()-2h", now)?.getTime()).toBe(now.getTime() - 2 * 3600_000);
    expect(resolveTimeExpression("now()-30m", now)?.getTime()).toBe(now.getTime() - 30 * 60_000);
    expect(resolveTimeExpression("now()-7d", now)?.getDate()).toBe(27);
    expect(resolveTimeExpression("now-1h", now)?.getTime()).toBe(now.getTime() - 3600_000);
  });

  it("alignment with @", () => {
    const d = resolveTimeExpression("now()@d", now)!;
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    const h = resolveTimeExpression("now()-2h@h", now)!;
    expect([h.getHours(), h.getMinutes()]).toEqual([8, 0]);
    const w = resolveTimeExpression("now()@w", now)!;
    expect(w.getDay()).toBe(1); // Monday
    expect(w.getDate()).toBe(28);
    const M = resolveTimeExpression("now()@M", now)!;
    expect([M.getMonth(), M.getDate()]).toEqual([9, 1]);
  });

  it("ISO 8601 and invalid expressions", () => {
    expect(resolveTimeExpression("2026-10-04T06:00:00Z", now)?.toISOString()).toBe("2026-10-04T06:00:00.000Z");
    expect(resolveTimeExpression("ayer", now)).toBeNull();
  });
});

describe("resolveTimeframe", () => {
  it("returns absolute ISO values", () => {
    const tf = resolveTimeframe({ from: "now()-2h", to: "now()" }, now);
    expect(new Date(tf.to).getTime() - new Date(tf.from).getTime()).toBe(2 * 3600_000);
  });
  it("falls back to the last 2 h if the range is invalid", () => {
    const tf = resolveTimeframe({ from: "now()", to: "now()-1h" }, now);
    expect(new Date(tf.to).getTime() - new Date(tf.from).getTime()).toBe(2 * 3600_000);
  });
});
