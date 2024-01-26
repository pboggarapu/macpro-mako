import { FilterIcon } from "lucide-react";
import { opensearch } from "shared-types";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/Sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/Accordion";

import { FilterableSelect } from "./FilterableSelect";
import { FilterableDateRange } from "./FilterableDateRange";
import { FilterableMultiCheck } from "./FilterableMultiCheck";
import { useFilterDrawer } from "./useFilterDrawer";
import { Button } from "@/components/Inputs";
import { FilterableBoolean } from "./FilterableBoolean";

export const OsFilterDrawer = () => {
  const hook = useFilterDrawer();

  return (
    <Sheet open={hook.drawerOpen} onOpenChange={hook.setDrawerState}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="hover:bg-transparent self-center h-10 flex gap-2"
        >
          <FilterIcon className="w-4 h-4" />
          <span className="prose-sm">Filters</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-white overflow-scroll">
        <SheetHeader>
          <h4 className="prose-2xl">Filters</h4>
        </SheetHeader>
        <Button
          className="w-full my-2"
          variant="outline"
          disabled={!hook.filtersApplied}
          onClick={hook.onFilterReset}
        >
          Reset
        </Button>
        <Accordion
          value={hook.accordionValues}
          onValueChange={hook.onAccordionChange}
          type="multiple"
        >
          {Object.values(hook.filters).map((PK) => (
            <AccordionItem key={`filter-${PK.field}`} value={PK.field}>
              <AccordionTrigger className="underline">
                {PK.label}
              </AccordionTrigger>
              <AccordionContent>
                {PK.component === "multiSelect" && (
                  <FilterableSelect
                    value={hook.filters[PK.field]?.value as string[]}
                    onChange={hook.onFilterChange(PK.field)}
                    options={hook.aggs?.[PK.field]}
                  />
                )}
                {PK.component === "multiCheck" && (
                  <FilterableMultiCheck
                    value={hook.filters[PK.field]?.value as string[]}
                    onChange={hook.onFilterChange(PK.field)}
                    options={hook.aggs?.[PK.field]}
                  />
                )}
                {PK.component === "dateRange" && (
                  <FilterableDateRange
                    value={
                      hook.filters[PK.field]?.value as opensearch.RangeValue
                    }
                    onChange={hook.onFilterChange(PK.field)}
                  />
                )}
                {PK.component === "boolean" && (
                  <>
                    <FilterableBoolean
                      value={hook.filters[PK.field]?.value as boolean}
                      onChange={hook.onFilterChange(PK.field)}
                    />
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
};
