import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Field } from "./field";
import { Skeleton } from "./skeleton";
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";

describe("@margem/ui", () => {
  it("renders Button and marks aria-busy when loading", () => {
    render(<Button loading>Entrar</Button>);
    const button = screen.getByRole("button", { name: "Entrar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("renders Button with asChild without Slot multiple-children error", () => {
    render(
      <Button asChild>
        <a href="/entrar">Pedir novo link</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Pedir novo link" });
    expect(link).toHaveAttribute("href", "/entrar");
  });

  it("associates Field label with input and exposes error via aria-invalid", () => {
    render(<Field label="E-mail" error="Informe um e-mail válido" />);
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um e-mail válido");
  });

  it("renders Skeleton as decorative", () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders Toast inside ToastProvider", () => {
    render(
      <ToastProvider>
        <Toast open>
          <div>
            <ToastTitle>Link enviado</ToastTitle>
            <ToastDescription>Confira sua caixa de entrada.</ToastDescription>
          </div>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    expect(screen.getByText("Link enviado")).toBeInTheDocument();
  });
});
