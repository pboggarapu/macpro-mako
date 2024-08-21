import { Link } from "react-router-dom";
import {
  FormControl,
  FormField,
  FormLabel,
  FormItem,
  RequiredIndicator,
  DatePicker,
  FormMessage,
  Input,
  FAQ_TAB,
  SpaIdFormattingDesc,
  FAQFooter,
} from "@/components";
import { newSubmission } from "shared-types";
import { ActionForm } from "@/components/ActionForm";

export const MedicaidForm = () => {
  return (
    <ActionForm
      schema={newSubmission.feSchema}
      title="Medicaid SPA Details"
      fields={({ control }) => [
        <FormField
          control={control}
          name="id"
          render={({ field }) => (
            <FormItem>
              <div className="flex gap-4">
                <FormLabel className="font-semibold">
                  SPA ID <RequiredIndicator />
                </FormLabel>
                <Link
                  to="/faq/spa-id-format"
                  target={FAQ_TAB}
                  rel="noopener noreferrer"
                  className="text-blue-900 underline"
                >
                  What is my SPA ID?
                </Link>
              </div>
              <SpaIdFormattingDesc />
              <FormControl>
                <Input
                  className="max-w-sm"
                  {...field}
                  onInput={(e) => {
                    if (e.target instanceof HTMLInputElement) {
                      e.target.value = e.target.value.toUpperCase();
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />,
        <FormField
          control={control}
          name="proposedEffectiveDate"
          render={({ field }) => (
            <FormItem className="max-w-md">
              <FormLabel className="text-lg font-semibold block">
                Proposed Effective Date of Medicaid SPA <RequiredIndicator />
              </FormLabel>
              <FormControl>
                <DatePicker
                  onChange={(date) => field.onChange(date.getTime())}
                  date={field.value ? new Date(field.value) : undefined}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />,
      ]}
      documentPollerArgs={{
        property: "id",
        documentChecker: (check) => check.recordExists,
      }}
      bannerPostSubmission={{
        header: "Package submitted",
        body: "Your submission has been received.",
        variant: "success",
      }}
      promptOnLeavingForm={{
        header: "Stop form submission?",
        body: "All information you've entered on this form will be lost if you leave this page.",
        acceptButtonText: "Yes, leave form",
        cancelButtonText: "Return to form",
        areButtonsReversed: true,
      }}
      footer={FAQFooter}
    />
  );
};
