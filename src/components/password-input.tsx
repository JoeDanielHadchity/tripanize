"use client";
import { useState, type ComponentProps } from "react";
import { Input } from "./ui";

/** A password field with a Show / Hide button, so people can check what they typed. */
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return <div className="relative">
    <Input {...props} type={shown ? "text" : "password"} className={`pr-20 ${props.className ?? ""}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <button type="button" onClick={() => setShown(s => !s)} aria-pressed={shown} aria-label={shown ? "Hide password" : "Show password"} aria-controls={props.id}
      className="absolute inset-y-0 right-1 my-auto h-9 rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink focus-visible:outline-2">{shown ? "Hide" : "Show"}</button>
  </div>;
}
