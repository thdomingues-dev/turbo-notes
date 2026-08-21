import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "@/features/auth/ui/AuthForm";

describe("AuthForm", () => {
  it("associates signup field errors with the relevant controls", async () => {
    const user = userEvent.setup();
    render(
      <AuthForm
        mode="signup"
        onSubmit={vi.fn().mockResolvedValue({
          email: "Enter a valid email address.",
          password: "This password is too common.",
          form: null,
        })}
      />,
    );

    await user.type(screen.getByLabelText("Email address"), "invalid");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    const email = screen.getByLabelText("Email address");
    const password = screen.getByLabelText("Password");
    expect(email).toHaveAccessibleDescription("Enter a valid email address.");
    expect(password).toHaveAccessibleDescription(
      "This password is too common.",
    );
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-invalid", "true");
  });
});
