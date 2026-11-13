import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      type="button"
      className={cn("ui-switch", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
