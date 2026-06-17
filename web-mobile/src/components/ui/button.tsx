"use client";

import clsx from "clsx";

// Flutter 版 `custom_elevated_button.dart` の移植。
// pill 形（角丸 100）、main 背景・白文字、無効時は grayLight 背景・grayDark 文字。

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
  isExpanded?: boolean; // 横幅いっぱいに広げる
};

export function Button({
  variant = "primary",
  isExpanded = false,
  className,
  disabled = false,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-2.5 text-sm font-medium transition-opacity",
        isExpanded && "w-full",
        disabled && "cursor-not-allowed",
        variant === "primary" &&
          (disabled
            ? "bg-gray-light text-gray-dark"
            : "bg-main text-text-white hover:opacity-90"),
        variant === "outline" &&
          (disabled
            ? "border border-gray-light text-gray-dark"
            : "border border-main text-main hover:bg-main/5"),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
