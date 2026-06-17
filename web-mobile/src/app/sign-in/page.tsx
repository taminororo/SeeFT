"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MdVisibility, MdVisibilityOff } from "react-icons/md";
import { signIn as apiSignIn } from "@/lib/api/auth";
import { useAuth } from "@/hooks/use-auth";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";

// Flutter 版 `sign_in_page.dart` の移植。

const schema = z.object({
  studentNumber: z.string().min(1, "学籍番号を入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});
type FormValues = z.infer<typeof schema>;

const AUTH_ERROR = "学籍番号もしくはパスワードが違います";

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setFormError("");
    try {
      const user = await apiSignIn(values.studentNumber, values.password);
      if (!user) {
        setFormError(AUTH_ERROR);
        return;
      }
      signIn(user.id, user.roleID);
      router.replace("/shifts");
    } catch {
      setFormError(AUTH_ERROR);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="ログイン" />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-1 flex-col justify-center gap-6 p-8"
      >
        <TextField
          label="学籍番号"
          placeholder="例) 12345678"
          inputMode="numeric"
          autoComplete="username"
          error={errors.studentNumber?.message}
          {...register("studentNumber")}
        />
        <TextField
          label="パスワード"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          error={errors.password?.message}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="p-2 text-gray-dark"
              aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPassword ? (
                <MdVisibilityOff size={24} />
              ) : (
                <MdVisibility size={24} />
              )}
            </button>
          }
          {...register("password")}
        />
        <Button type="submit" isExpanded disabled={isSubmitting}>
          {isSubmitting ? "ログイン中..." : "ログイン"}
        </Button>
        {formError && (
          <p className="text-center text-sm text-error">{formError}</p>
        )}
      </form>
    </div>
  );
}
