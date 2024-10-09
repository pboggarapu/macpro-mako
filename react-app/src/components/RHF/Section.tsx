import { Control, FieldValues } from "react-hook-form";
import { Section } from "shared-types";
import { FormLabel } from "../Inputs";
import { DependencyWrapper, RHFFormGroup } from ".";
import { cn } from "@/utils";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

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
            <div className="flex flex-row justify-between items-center">
              <FormLabel className="font-bold">{props.section.title}</FormLabel>
              <div
                onClick={toggleCollapse}
                className="text-sm cursor-pointer font-bold"
              >
                {isCollapsed ? (
                  <div className="flex flex-row items-center gap-2">
                    <p>Expand</p>
                    <ChevronUpIcon
                      className="h-6"
                      width={"100%"}
                    ></ChevronUpIcon>
                  </div>
                ) : (
                  <div className="flex flex-row items-center gap-2">
                    <p>Collapse</p>
                    <ChevronDownIcon
                      className="h-6"
                      width={"100%"}
                    ></ChevronDownIcon>
                  </div>
                )}
              </div>
            </div>
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
