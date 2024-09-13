import { z } from "zod";
import * as newMedicaidSubmission from "./new-medicaid-submission";
import * as newChipSubmission from "./new-chip-submission";
import * as capitatedIntial from "./capitated-initial";
export * from "./toggle-withdraw-rai-enabled";
export * from "./issue-rai";
export * from "./respond-to-rai";
export * from "./withdraw-rai";
export * from "./withdraw-package";
export * as capitatedWaivers from "./capitated-waivers";
export * as contractingWaivers from "./contracting-waivers";
export * from "./app-k";
export * from "./legacy-event";
export * from "./legacy-package-view";
export * from "./legacy-admin-change";
export * from "./seatool";
export * from "./remove-appk-child";
export * from "./update-id";
export * from "./complete-intake";
export * from "./temporary-extension";

export const events = {
  "capitated-initial": capitatedIntial,
  "new-chip-submission": newChipSubmission,
  "new-medicaid-submission": newMedicaidSubmission,
};

export type BaseSchemas = z.infer<typeof newMedicaidSubmission.baseSchema>;
