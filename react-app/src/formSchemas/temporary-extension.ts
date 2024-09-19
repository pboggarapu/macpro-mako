import { events } from "shared-types/events";
import { isAuthorizedState } from "@/utils";
import { getItem, idIsApproved, itemExists } from "@/api";
import { z } from "zod";

// Base form schema
export const formSchema = events["temporary-extension"].baseSchema;

// Refinements without dependencies
export const independentRefinements = {
  id: async (value: any, ctx: z.RefinementCtx) => {
    // Check if the user is authorized to submit for the state
    if (!isAuthorizedState(value.id)) {
      ctx.addIssue({
        path: ["id"],
        code: z.ZodIssueCode.custom,
        message:
          "You can only submit for a state you have access to. If you need to add another state, visit your IDM user profile to request access.",
      });
    }

    // Check if the id already exists
    if (await itemExists(value.id)) {
      ctx.addIssue({
        path: ["id"],
        code: z.ZodIssueCode.custom,
        message:
          "According to our records, this Temporary Extension Request Number already exists. Please check the Temporary Extension Request Number and try entering it again.",
      });
    }
  },
};

// Refinements with dependencies
export const dependentRefinements = {
  id: {
    dependencies: ["waiverNumber"],
    refine: async (value: any, ctx: z.RefinementCtx) => {
      // Run logic for matching waiverNumber prefix with id prefix
      if (value.waiverNumber) {
        const waiverNumberPrefix = value.waiverNumber.substring(
          0,
          value.waiverNumber.lastIndexOf("."),
        );
        const idPrefix = value.id.substring(0, value.id.lastIndexOf("."));
        if (waiverNumberPrefix !== idPrefix) {
          ctx.addIssue({
            path: ["id"],
            code: z.ZodIssueCode.custom,
            message:
              "The Approved Initial or Renewal Waiver Number and the Temporary Extension Request Number must be identical until the last period.",
          });
        }
      }
    },
  },
  waiverNumber: {
    dependencies: [],
    refine: async (value: any, ctx: z.RefinementCtx) => {
      // Check if waiverNumber exists
      if (!(await itemExists(value.waiverNumber))) {
        ctx.addIssue({
          path: ["waiverNumber"],
          code: z.ZodIssueCode.custom,
          message:
            "According to our records, this Approved Initial or Renewal Waiver Number does not yet exist. Please check the Approved Initial or Renewal Waiver Number and try entering it again.",
        });
      }

      // Check if waiverNumber is approved
      if (!(await idIsApproved(value.waiverNumber))) {
        ctx.addIssue({
          path: ["waiverNumber"],
          code: z.ZodIssueCode.custom,
          message:
            "According to our records, this Approved Initial or Renewal Waiver Number is not approved. You must supply an approved Initial or Renewal Waiver Number.",
        });
      }
    },
  },
  authority: {
    dependencies: ["waiverNumber"],
    refine: async (value: any, ctx: z.RefinementCtx) => {
      try {
        const originalWaiverData = await getItem(value.waiverNumber);

        // Check if the authority matches
        if (originalWaiverData._source.authority !== value.authority) {
          ctx.addIssue({
            path: ["authority"],
            message:
              "The selected Temporary Extension Type does not match the Approved Initial or Renewal Waiver's type.",
            code: z.ZodIssueCode.custom,
            fatal: true,
          });
        }
      } catch (error) {
        console.error(error); // If error, the waiverNumber likely doesn't exist, and the other validation will handle it
      }
    },
  },
};
