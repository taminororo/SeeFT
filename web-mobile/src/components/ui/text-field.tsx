"use client";

import { forwardRef, useId } from "react";
import clsx from "clsx";

// Flutter 版 `custom_text_field.dart` の移植。
// outline 枠（gray-dark 1px）、focus 時 main 2px、error 時 error 色。
// react-hook-form の register をそのまま spread できるよう forwardRef にしている。

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  trailing?: React.ReactNode; // 右端アイコン（パスワード表示切替など）
  containerClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, error, trailing, containerClassName, className, id, ...rest },
    ref,
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className={clsx("flex flex-col gap-1", containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-sm text-gray-dark">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={clsx(
              "w-full rounded-normal border bg-white px-3 py-3 text-md text-text-black outline-none placeholder:text-gray-dark",
              error
                ? "border-error focus:border-error"
                : "border-gray-dark focus:border-main focus:border-2",
              trailing && "pr-11",
              className,
            )}
            {...rest}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              {trailing}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    );
  },
);
