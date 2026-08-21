import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CategorySelect } from "@/app/notes/[noteId]/_ui/CategorySelect";

describe("category controls", () => {
  it("supports keyboard navigation and selection in the editor", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CategorySelect value="random-thoughts" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Random Thoughts" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menu", { name: "Change note category" }),
    ).toBeVisible();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("drama");
    expect(trigger).toHaveFocus();
  });
});
