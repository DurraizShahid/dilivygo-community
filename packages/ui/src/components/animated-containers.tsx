"use client";

import type { HTMLAttributes } from "react";
import * as React from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

export { useAutoAnimate } from "@formkit/auto-animate/react";

type DivRest = Omit<HTMLAttributes<HTMLDivElement>, "ref">;
type TbodyRest = Omit<HTMLAttributes<HTMLTableSectionElement>, "ref">;
type UlRest = Omit<HTMLAttributes<HTMLUListElement>, "ref">;

/** Table body rows animate when the row list changes (sort, filter, pagination). */
export function AnimatedTbody({ children, ...rest }: TbodyRest) {
  const [ref] = useAutoAnimate<HTMLTableSectionElement>();
  return (
    <tbody ref={ref} {...rest}>
      {children}
    </tbody>
  );
}

/** Generic list/stack container (`space-y-*`, `gap-*` grids) for keyed `children`. */
export function AnimatedList({ children, ...rest }: DivRest) {
  const [ref] = useAutoAnimate<HTMLDivElement>();
  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}

export function AnimatedUl({ children, ...rest }: UlRest) {
  const [ref] = useAutoAnimate<HTMLUListElement>();
  return (
    <ul ref={ref} {...rest}>
      {children}
    </ul>
  );
}
