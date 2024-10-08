import { Control, FieldValues } from "react-hook-form";
import { Section } from "shared-types";
import { FormLabel } from "../Inputs";
import { DependencyWrapper, RHFFormGroup } from ".";
import { cn } from "@/utils";
import { useState } from "react";

export const RHFSection = <TFieldValues extends FieldValues>(props: {
  section: Section;
  formId: string;
  control: Control<TFieldValues>;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  function toggleCollapse() {
    setIsCollapsed(!isCollapsed);
  }

  return (
    <DependencyWrapper {...props.section}>
      <div>
        {props.section.title && (
          <div
            className={
              "py-3 px-8 w-full " +
              (props.section.subsection
                ? "bg-gray-300 text-2xl"
                : "bg-primary text-white text-3xl")
            }
          >
            <FormLabel className="font-bold">{props.section.title}</FormLabel>
            <span onClick={toggleCollapse}>
              Collapse button: {isCollapsed.toString()}
            </span>
          </div>
        )}
        {props.section.form?.length > 0 && (
          <div
            className={cn(
              props.section.sectionWrapperClassname,
              "px-8 py-6",
              isCollapsed ? "hidden" : "",
            )}
          >
            {props.section.form.map((FORM, index) => (
              <RHFFormGroup
                key={`rhf-form-${index}-${FORM.description}`}
                parentId={props.formId + "_" + props.section.sectionId + "_"}
                control={props.control}
                form={FORM}
              />
            ))}
          </div>
        )}
      </div>
    </DependencyWrapper>
  );
};
