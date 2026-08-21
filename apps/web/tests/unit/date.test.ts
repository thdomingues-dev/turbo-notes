import { describe, expect, it } from "vitest";

import {
  formatLastEdited,
  formatNoteDate,
} from "@/entities/note/ui/dateFormatters";

describe("note date formatting", () => {
  const saoPaulo = { timeZone: "America/Sao_Paulo" } as const;
  const now = new Date("2004-08-17T12:00:00-03:00");

  it("formats calendar labels in the browser timezone and rejects bad input", () => {
    const localCases = [
      ["2004-08-17T08:00:00-03:00", "today"],
      ["2004-08-16T23:59:00-03:00", "yesterday"],
      ["2004-06-11T10:00:00-03:00", "June 11"],
      ["2003-12-28T10:00:00-03:00", "December 28"],
    ] as const;
    for (const [timestamp, expected] of localCases) {
      expect(formatNoteDate(timestamp, now, saoPaulo)).toBe(expected);
    }

    const instant = "2004-01-01T01:30:00Z";
    const comparison = new Date("2004-01-01T12:00:00Z");

    expect(formatNoteDate(instant, comparison, { timeZone: "UTC" })).toBe(
      "today",
    );
    expect(
      formatNoteDate(instant, comparison, { timeZone: "America/New_York" }),
    ).toBe("yesterday");

    for (const [timestamp, comparisonDate] of [
      ["2020-03-08T00:30:00-05:00", "2020-03-09T00:30:00-04:00"],
      ["2020-11-01T00:30:00-04:00", "2020-11-02T00:30:00-05:00"],
    ] as const) {
      expect(
        formatNoteDate(timestamp, new Date(comparisonDate), {
          timeZone: "America/New_York",
        }),
      ).toBe("yesterday");
    }

    expect(formatLastEdited("2004-08-17T11:39:00Z", saoPaulo)).toBe(
      "August 17, 2004 at 8:39am",
    );
    expect(() => formatNoteDate("not-a-date", now, saoPaulo)).toThrow(
      RangeError,
    );
    expect(() => formatLastEdited("not-a-date", saoPaulo)).toThrow(RangeError);
  });
});
