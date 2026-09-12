import {
  ChecklistIncompleteError,
  InvalidCloseTransitionError,
  PeriodLockedError,
  PeriodSoftClosedError,
  ReopenRequiresReasonError,
  assertCanPostToPeriod,
  assertCanReopen,
  assertChecklistComplete,
  assertHardLock,
  assertReopenReason,
  assertSoftClose,
} from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("period close controls", () => {
  it("blocks posts to a hard-locked period", () => {
    expect(() => assertCanPostToPeriod("CLOSED")).toThrow(PeriodLockedError);
  });

  it("blocks operating posts to a soft-closed period", () => {
    expect(() => assertCanPostToPeriod("SOFT_CLOSED")).toThrow(PeriodSoftClosedError);
    expect(() => assertCanPostToPeriod("SOFT_CLOSED", { allowControllerAdjustment: true })).not.toThrow();
    expect(() => assertCanPostToPeriod("OPEN")).not.toThrow();
  });

  it("requires reason and ticket to reopen", () => {
    expect(() => assertReopenReason("", "TICK-1")).toThrow(ReopenRequiresReasonError);
    expect(() => assertReopenReason("books correction", "")).toThrow(ReopenRequiresReasonError);
    expect(() => assertReopenReason("books correction", "TICK-1")).not.toThrow();
  });

  it("enforces soft close → checklist → hard lock", () => {
    expect(() => assertSoftClose("CLOSED")).toThrow(InvalidCloseTransitionError);
    expect(() => assertHardLock("OPEN")).toThrow(InvalidCloseTransitionError);
    expect(() => assertCanReopen("OPEN")).toThrow(InvalidCloseTransitionError);
    expect(() => assertChecklistComplete([])).toThrow(ChecklistIncompleteError);
    expect(() => assertChecklistComplete([{ status: "PENDING" }])).toThrow(ChecklistIncompleteError);
    expect(() => assertChecklistComplete([{ status: "DONE" }, { status: "NA" }])).not.toThrow();
    expect(() => assertHardLock("SOFT_CLOSED")).not.toThrow();
  });
});
