export * from "./toggle-withdraw-rai-enabled";
export * from "./issue-rai";
export * from "./respond-to-rai";
export * from "./withdraw-rai";
export * from "./withdraw-package";
export * as newChipSubmission from "./new-chip-submission";
export * from "./legacy-event";
export * from "./legacy-package-view";
export * from "./legacy-admin-change";
export * from "./seatool";
export * from "./remove-appk-child";
export * from "./update-id";
export * from "./complete-intake";
export * as capitatedWaivers from "./capitated-waivers";

export const events: Record<string, any> = {};

const eventModules = {
  "new-medicaid-submission": "./new-medicaid-submission",
};

for (const [eventName, modulePath] of Object.entries(eventModules)) {
  events[eventName] = import(modulePath);
}
