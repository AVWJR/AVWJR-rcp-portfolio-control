"use client";

import { centsToDollarsInput, dollarFieldOnBlur, dollarFieldOnChange } from "@/lib/waterfall-inputs";
import { useEffect, useState } from "react";

/** Dollar box that keeps the typed text, including a decimal point, until blur. */
export function DollarField({
  value,
  onValue,
  nullable = true,
  disabled,
  className,
  placeholder,
}: {
  value: bigint | null;
  onValue: (next: bigint | null) => void;
  nullable?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => centsToDollarsInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(centsToDollarsInput(value));
  }, [value, focused]);

  return (
    <input
      className={className}
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={focused ? text : centsToDollarsInput(value)}
      onFocus={() => {
        setFocused(true);
        setText(centsToDollarsInput(value));
      }}
      onChange={(event) => {
        const next = dollarFieldOnChange(event.target.value);
        setText(next.text);
        onValue(nullable ? next.cents : (next.cents ?? 0n));
      }}
      onBlur={() => {
        const next = dollarFieldOnBlur(text, { nullable });
        setText(next.text);
        setFocused(false);
        onValue(nullable ? next.cents : (next.cents ?? 0n));
      }}
    />
  );
}
