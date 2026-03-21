import React from "react";
import { twMerge } from "tailwind-merge";

export default function MOB({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={twMerge("lg:hidden", className)}>{children}</div>;
}
